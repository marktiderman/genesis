/**
 * The Google Sheets destination: appends one row per submission to a sheet
 * shared with a Google service account. Config: `{ spreadsheetId,
 * sheetName? }` (`spreadsheet_id` and `sheet_name` are accepted too).
 *
 * The tab is created when missing, the header row is written from the row's
 * column keys and gains a column for any new key without moving the others,
 * and an `id` column holds the response id, so a redelivery is not appended
 * twice. Every write is `valueInputOption=RAW`, so Sheets stores text as
 * typed and never runs it as a formula: `@team thanks` stays exactly that.
 * Text is therefore not escaped by default (a `'` would be stored literally).
 * Set `escapeFormulas` only when the sheet's text is exported and opened in
 * another spreadsheet that might run it (see `escapeFormula`).
 *
 * Quota: Google allows a service account about 60 reads and 60 writes a
 * minute. So the tab id, header and last row are kept in the destination's
 * state, and a normal delivery is one write: the append. The tab and header
 * are read again only when a row has a key the cached header lacks, or when
 * an append is refused. The id column is read only on a redelivery, and then
 * only its recent rows. `deliverBatch` appends many rows in one request.
 */
import type { Json } from "../types";
import { googleAccessToken, type GoogleServiceAccount } from "./google-auth";
import { escapeFormula, responseRow, type RowOptions } from "./row";
import {
  configString,
  deliveryFailure,
  DeliveryError,
  discard,
  httpError,
  resolveOption,
  timedFetch,
  type Cell,
  type DeliveryItem,
  type DeliveryOptions,
  type DeliveryResult,
  type Destination,
  type DestinationConfig,
  type HttpDeps,
} from "./types";

export const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
export const DEFAULT_SHEET_NAME = "Responses";
/** How many of the latest rows a redelivery checks for its id. */
export const DEDUPE_WINDOW = 500;
/**
 * How many rows the header read looks at to find the columns in use: the
 * header row and the first responses under it. Bounded, so a tab with years
 * of responses is never read whole just to learn its header.
 */
export const HEADER_SCAN_ROWS = 100;
/** Header writes tried before a concurrent writer is reported as a retryable failure. */
const HEADER_WRITE_ATTEMPTS = 3;

/** What the sheet destination reads from a destination's config. */
export interface SheetConfig {
  spreadsheetId: string;
  /** Default `"Responses"`. */
  sheetName?: string;
}

export interface SheetsDestinationOptions extends HttpDeps {
  /** The service account, or a function that finds the one for a destination's config. */
  account: GoogleServiceAccount | ((config: DestinationConfig) => GoogleServiceAccount | Promise<GoogleServiceAccount>);
  /**
   * Prefix text a spreadsheet could run as a formula with `'` (see
   * `escapeFormula`), headers included. Default false: writes are RAW, so
   * Sheets never runs text as a formula, and the `'` would be stored as part
   * of the text. Turn it on only if the sheet is exported as CSV and opened
   * in another spreadsheet. Keep one setting per sheet: header keys are
   * escaped too, so switching it later adds new columns for escaped keys.
   */
  escapeFormulas?: boolean | undefined;
  /** Sensitive fields: `"include"` (default), `"mask"` or `"omit"`. */
  sensitive?: RowOptions["sensitive"];
  now?: (() => number) | undefined;
}

/**
 * The existing header plus any keys it does not have yet, in the order they
 * arrive. A blank header cell keeps its place (dropping it would shift every
 * later column away from the values stored under it), as do blank header
 * cells over the `width` columns that hold responses; only blanks beyond
 * those are trimmed.
 */
export function mergeHeader(existing: readonly unknown[], keys: readonly string[], width = 0): string[] {
  const header = existing.map((h) => (h == null ? "" : String(h)));
  while (header.length < width) header.push("");
  while (header.length > width && header[header.length - 1] === "") header.pop();
  for (const key of keys) if (key && !header.includes(key)) header.push(key);
  return header;
}

/** One cell per header column, blank where the row has no value; `escape` applies `escapeFormula` (default false). */
export function rowFor(header: readonly string[], row: Record<string, Cell>, escape = false): Cell[] {
  return header.map((h) => {
    const cell = Object.prototype.hasOwnProperty.call(row, h) ? (row[h] ?? "") : "";
    return escape ? escapeFormula(cell) : cell;
  });
}

/** A1 column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** What the destination keeps between deliveries. Opaque to the app: store and pass it back. */
export interface SheetState {
  spreadsheet_id: string;
  sheet_name: string;
  sheet_id: number;
  header: string[];
  columns: number;
  /** The last row an append wrote (1-based), 0 when unknown. */
  last_row: number;
}

function readState(raw: Record<string, Json> | undefined, spreadsheetId: string, sheetName: string): SheetState | null {
  if (!raw) return null;
  const header = raw["header"];
  if (
    raw["spreadsheet_id"] !== spreadsheetId ||
    raw["sheet_name"] !== sheetName ||
    typeof raw["sheet_id"] !== "number" ||
    !Array.isArray(header) ||
    !header.every((h) => typeof h === "string") ||
    !header.includes("id")
  ) {
    return null;
  }
  return {
    spreadsheet_id: spreadsheetId,
    sheet_name: sheetName,
    sheet_id: raw["sheet_id"],
    header: header as string[],
    columns: typeof raw["columns"] === "number" ? raw["columns"] : header.length,
    last_row: typeof raw["last_row"] === "number" ? raw["last_row"] : 0,
  };
}

/** An append Google refused for a reason a fresh look at the tab may fix (renamed, deleted or resized). */
class StaleSheetError extends DeliveryError {}

interface SheetProps {
  sheetId: number;
  title: string;
  gridProperties?: { columnCount?: number };
}

function configOf(config: DestinationConfig) {
  const spreadsheetId = configString(config, "spreadsheetId", "spreadsheet_id");
  if (!spreadsheetId) throw new DeliveryError("The sheet destination has no spreadsheetId");
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(spreadsheetId)) throw new DeliveryError("The sheet destination's spreadsheetId is invalid");
  const sheetName = configString(config, "sheetName", "sheet_name") || DEFAULT_SHEET_NAME;
  if (sheetName.length > 100) throw new DeliveryError("The sheet destination's sheetName is too long");
  return { spreadsheetId, sheetName };
}

export function sheetsDestination(options: SheetsDestinationOptions): Destination {
  async function run(
    items: readonly DeliveryItem[],
    config: DestinationConfig,
    deliveryOptions: Omit<DeliveryOptions, "deliveryId">,
  ): Promise<DeliveryResult> {
    if (!items.length) return { ok: true };
    const { spreadsheetId, sheetName } = configOf(config);
    const account = await resolveOption("The sheet destination's account", options.account, config);
    const signal = deliveryOptions.signal;
    const token = await googleAccessToken(account, { ...options, signal });
    const base = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`;
    const escape = options.escapeFormulas === true;

    const call = async <T>(what: string, url: string, init: RequestInit = {}): Promise<T> => {
      const response = await timedFetch(
        options,
        url,
        { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } },
        signal,
      );
      if (!response.ok) {
        discard(response);
        if (what === "append" && (response.status === 400 || response.status === 404)) {
          throw new StaleSheetError(`Google Sheets append answered ${response.status}`, { status: response.status });
        }
        if (response.status === 403 || response.status === 404) {
          throw new DeliveryError(
            `Google Sheets ${what} answered ${response.status}: is the sheet shared with ${account.clientEmail}?`,
            { status: response.status },
          );
        }
        throw httpError(`Google Sheets ${what}`, response);
      }
      return (await response.json()) as T;
    };
    const batchUpdate = (what: string, requests: unknown[]) =>
      call<{ replies?: { addSheet?: { properties?: SheetProps } }[] }>(what, `${base}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests }),
      });
    const range = (a1: string) => `${base}/values/${encodeURIComponent(`${quoteSheet(sheetName)}!${a1}`)}`;

    const sensitive = options.sensitive ?? "include";
    // Column keys are escaped like cells (a builder-made key could start with "="),
    // so the header as stored and read back matches the keys looked up in it.
    const columnKey = (key: string) => (escape ? String(escapeFormula(key)) : key);
    const rows = items.map((item) => {
      const { row, columns } = responseRow(item.submission, item.definition, { sensitive });
      const escaped: Record<string, Cell> = {};
      for (const key of columns) escaped[columnKey(key)] = row[key]!;
      return { row: escaped, columns: columns.map(columnKey) };
    });
    const keys = [...new Set(rows.flatMap((r) => r.columns))];

    /** Reads the tab and header, adds what is missing, and returns the fresh state. */
    async function setUp(previous: SheetState | null): Promise<SheetState> {
      const readTabs = async () => {
        const meta = await call<{ sheets?: { properties?: SheetProps }[] }>(
          "read",
          `${base}?fields=${encodeURIComponent("sheets.properties(sheetId,title,gridProperties.columnCount)")}`,
        );
        return meta.sheets?.map((s) => s.properties).find((p) => p?.title === sheetName);
      };
      let sheet = await readTabs();
      if (!sheet) {
        try {
          const added = await batchUpdate("add tab", [{ addSheet: { properties: { title: sheetName } } }]);
          sheet = added.replies?.[0]?.addSheet?.properties ?? { sheetId: 0, title: sheetName };
        } catch (error) {
          // Two first deliveries race: both saw no tab, and the loser's
          // addSheet answers 400 ("already exists"). Use the winner's tab.
          if (!(error instanceof DeliveryError) || error.status !== 400) throw error;
          sheet = await readTabs();
          if (!sheet) throw error;
        }
      }
      // Read by column: the values API drops trailing blank cells, so the header
      // row alone can look narrower than the responses under it (a column added
      // by hand). Column by column, the number returned is the width in use.
      const readHeader = async () => {
        const read = await call<{ values?: unknown[][] }>(
          "read header",
          `${range(`A1:ZZZ${HEADER_SCAN_ROWS}`)}?majorDimension=COLUMNS`,
        );
        const used = read.values ?? [];
        return { used: used.length, existing: used.map((column) => column[0] ?? "") };
      };
      let columns = sheet.gridProperties?.columnCount ?? 26;
      let { used, existing } = await readHeader();
      let header: string[] = [];
      // The header row is written whole, so two deliveries merging different
      // keys at once can overwrite each other. After a write, read it back: if
      // a key of ours is missing, merge onto what is there and write again.
      // The state keeps the header as read, so rows map onto the real columns.
      for (let attempt = 0; ; attempt++) {
        header = mergeHeader(existing, keys, used);
        // A new tab starts with the id column; one already in use gets it at the
        // end, so the columns already holding responses don't move.
        if (!header.includes("id")) {
          if (used) header.push("id");
          else header.unshift("id");
        }
        const changed = header.length !== existing.length || header.some((h, i) => h !== String(existing[i] ?? ""));
        if (!changed) break;
        if (attempt >= HEADER_WRITE_ATTEMPTS) {
          throw new DeliveryError("Google Sheets header kept changing while it was written", { retryable: true });
        }
        if (header.length > columns) {
          await batchUpdate("add columns", [
            { appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: header.length - columns } },
          ]);
          columns = header.length;
        }
        await call("write header", `${range("A1")}?valueInputOption=RAW`, {
          method: "PUT",
          body: JSON.stringify({ values: [header] }),
        });
        if (existing.length === 0) {
          await batchUpdate("freeze header", [
            {
              updateSheetProperties: {
                properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ]);
        }
        ({ used, existing } = await readHeader());
      }
      return {
        spreadsheet_id: spreadsheetId,
        sheet_name: sheetName,
        sheet_id: sheet.sheetId,
        header,
        columns,
        last_row: previous?.last_row ?? 0,
      };
    }

    let skipped: string[] = [];
    async function append(state: SheetState): Promise<SheetState> {
      // A redelivery may find its row already there: an earlier append went
      // through even though Google answered 5xx or the request timed out.
      let pending = items.map((item, i) => ({ id: item.submission.id, row: rows[i]!.row }));
      if (deliveryOptions.redelivery) {
        const column = columnLetter(state.header.indexOf("id"));
        const from = state.last_row > 0 ? Math.max(2, state.last_row - DEDUPE_WINDOW) : 2;
        const ids = await call<{ values?: unknown[][] }>("read ids", range(`${column}${from}:${column}`));
        const present = new Set((ids.values ?? []).map((r) => String(r?.[0] ?? "")));
        skipped = pending.filter((p) => present.has(p.id)).map((p) => p.id);
        pending = pending.filter((p) => !present.has(p.id));
      }
      if (!pending.length) return state;
      const result = await call<{ updates?: { updatedRange?: string } }>(
        "append",
        `${range("A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: pending.map((p) => rowFor(state.header, p.row, escape)) }) },
      );
      const last = /![A-Z]+\d+:[A-Z]+(\d+)$/.exec(result.updates?.updatedRange ?? "")?.[1];
      return { ...state, last_row: last ? Number(last) : state.last_row + pending.length };
    }

    const cached = readState(deliveryOptions.state, spreadsheetId, sheetName);
    const fresh = !cached || keys.some((k) => !cached.header.includes(k));
    let state = fresh ? await setUp(cached) : cached;
    try {
      state = await append(state);
    } catch (error) {
      if (!(error instanceof StaleSheetError) || fresh) throw error;
      state = await append(await setUp(cached));
    }
    return {
      ok: true,
      state: state as unknown as Record<string, Json>,
      ...(skipped.length ? { skipped } : {}),
    };
  }

  const guarded = async (...args: Parameters<typeof run>): Promise<DeliveryResult> => {
    try {
      return await run(...args);
    } catch (error) {
      return deliveryFailure(error);
    }
  };

  return {
    kind: "sheet",
    deliver: (submission, definition, config, deliveryOptions = {}) =>
      guarded([{ submission, definition, deliveryId: deliveryOptions.deliveryId }], config, deliveryOptions),
    deliverBatch: (items, config, deliveryOptions = {}) => guarded(items, config, deliveryOptions),
  };
}
