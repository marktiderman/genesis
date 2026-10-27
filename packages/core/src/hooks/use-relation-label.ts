// A link's words: the linked row's name in place of its id (docs/RESOURCE-VIEW.md, "Relation
// labels"). Every cell asks for its own id, and the ids asked for in the same moment go out as
// one `in` query per linked resource, so a page of 50 rows costs one request, never 50.

import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { DataProvider, Identifier } from "../provider/types";
import type { FieldReference } from "../schema/types";

export interface UseRelationLabelOptions {
  /** The linked row's field that names it. Default: the linked resource's `labelField` (`describe`). */
  labelField?: string;
  /** Default `true`. */
  enabled?: boolean;
}

// Ids per request: an `in` list stays well inside a URL.
const CHUNK = 100;
// Field names only go into `select`, so nothing else rides along in the request.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
// What names a row when nothing says (as `defineView` guesses a contract's labelField).
const NAMING = /^(name|title|label|full_name|display_name)$/;

type Waiter = { resolve: (label: string | null) => void; reject: (error: unknown) => void };
// Keyed by the id as text (so 1 and "1" share a request), keeping the id as the cell gave it:
// a provider that compares strictly (the mock's `in`) must get a number back as a number.
type Asked = { id: Identifier; waiters: Waiter[] };
type Batch = { reference: FieldReference; labelField: string | undefined; ids: Map<string, Asked> };

// Per provider, so two providers (two apps, a test each) never share a batch or a guess.
const batches = new WeakMap<DataProvider, Map<string, Batch>>();
const namers = new WeakMap<DataProvider, Map<string, Promise<string | undefined>>>();
// How long a label waits on `describe` or `capabilities` before going on without them.
const SETTLE_MS = 10_000;

/** A promise's value, or `fallback` when it fails, throws or takes longer than SETTLE_MS. */
function within<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), SETTLE_MS);
    const done = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    try {
      work().then(done, () => done(fallback));
    } catch {
      done(fallback);
    }
  });
}

/**
 * The linked resource's naming field, from `describe` once per resource; undefined when it can't
 * say. A failed `describe` isn't remembered, so the next page asks again.
 */
function namingField(provider: DataProvider, resource: string): Promise<string | undefined> {
  let known = namers.get(provider);
  if (!known) namers.set(provider, (known = new Map()));
  let found = known.get(resource);
  if (!found) {
    const describe = provider.describe?.bind(provider);
    const table = known;
    found = describe
      ? within(
          () =>
            describe(resource).then((schema) => schema.labelField ?? schema.fields.find((f) => NAMING.test(f.name))?.name ?? null),
          undefined as string | null | undefined,
        ).then((field) => {
          // undefined: describe failed. null: it answered, with no naming field.
          if (field === undefined) table.delete(resource);
          return field ?? undefined;
        })
      : Promise.resolve(undefined);
    known.set(resource, found);
  }
  return found;
}

/** Ids per request: the provider's page limit, at most CHUNK. */
async function chunkSize(provider: DataProvider, resource: string): Promise<number> {
  const capabilities = provider.capabilities?.bind(provider);
  const max = capabilities ? await within(() => capabilities(resource).then((c) => c.maxPerPage), undefined) : undefined;
  return typeof max === "number" && max >= 1 ? Math.min(CHUNK, Math.floor(max)) : CHUNK;
}

/** A value as words, or null when it has none. */
function words(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

async function flush(provider: DataProvider, batch: Batch): Promise<void> {
  const { reference, ids } = batch;
  const fail = (keys: readonly string[], error: unknown) => keys.forEach((k) => ids.get(k)?.waiters.forEach((w) => w.reject(error)));
  const all = [...ids.keys()];
  let labelField: string | undefined;
  let size: number;
  try {
    labelField = batch.labelField ?? (await namingField(provider, reference.resource));
    if (labelField !== undefined && !IDENTIFIER.test(labelField)) labelField = undefined;
    size = await chunkSize(provider, reference.resource);
  } catch (error) {
    // Every waiter settles, whatever went wrong.
    fail(all, error);
    return;
  }
  const select = labelField && IDENTIFIER.test(reference.field) ? `${reference.field},${labelField}` : undefined;
  for (let i = 0; i < all.length; i += size) {
    const chunk = all.slice(i, i + size);
    try {
      const { data } = await provider.getList(reference.resource, {
        // The whole page: a link to a field that isn't unique can match more rows than ids.
        pagination: { page: 1, perPage: size },
        filters: [{ field: reference.field, operator: "in", value: chunk.map((k) => ids.get(k)!.id) as string[] | number[] }],
        count: "none",
        ...(select ? { select } : {}),
      });
      const found = new Map<string, string | null>();
      for (const row of data as Record<string, unknown>[]) {
        const key = String(row[reference.field]);
        if (found.get(key)) continue;
        const name = labelField ? row[labelField] : row[Object.keys(row).find((k) => NAMING.test(k)) ?? ""];
        found.set(key, words(name));
      }
      // An id the viewer can't see, or one that's gone, has no words.
      for (const k of chunk) ids.get(k)?.waiters.forEach((w) => w.resolve(found.get(k) ?? null));
    } catch (error) {
      fail(chunk, error);
    }
  }
}

/**
 * The words for one linked id, batched with every other id asked for in the same tick: one
 * `getList(resource, { filters: [{ field, operator: "in" }] })` per linked resource and naming
 * field. Resolves null when the row has no words or isn't visible to this viewer.
 */
export function loadRelationLabel(
  provider: DataProvider,
  reference: FieldReference,
  id: Identifier,
  labelField?: string,
): Promise<string | null> {
  let pending = batches.get(provider);
  if (!pending) batches.set(provider, (pending = new Map()));
  const key = `${reference.resource}\u0000${reference.field}\u0000${labelField ?? ""}`;
  let batch = pending.get(key);
  if (!batch) {
    const created: Batch = { reference, labelField, ids: new Map() };
    pending.set(key, (batch = created));
    // A macrotask, not a microtask: every cell's effect in a commit has asked by then.
    setTimeout(() => {
      pending!.delete(key);
      void flush(provider, created);
    }, 0);
  }
  return new Promise((resolve, reject) => {
    const asked = batch!.ids.get(String(id)) ?? { id, waiters: [] };
    asked.waiters.push({ resolve, reject });
    batch!.ids.set(String(id), asked);
  });
}

/**
 * A linked row's words for a `relation` cell: `undefined` while they load, `null` when there are
 * none (the row is hidden from this viewer, gone, unnamed, or the read failed), so a screen shows
 * its own words then, never the raw id. Cached per id for a minute and refreshed when the linked
 * resource changes (its writes invalidate `[resource]`).
 */
export function useRelationLabel(
  reference: FieldReference | undefined,
  id: unknown,
  options: UseRelationLabelOptions = {},
): string | null | undefined {
  const provider = useDataProvider();
  const { labelField, enabled = true } = options;
  const linked: Identifier | null = typeof id === "string" || (typeof id === "number" && Number.isFinite(id)) ? id : null;
  const key = linked === null ? null : String(linked);
  const query = useQuery({
    queryKey: [reference?.resource, "relation-label", { field: reference?.field, labelField: labelField ?? null, id: key }],
    enabled: enabled && Boolean(reference && key),
    staleTime: 60_000,
    retry: false,
    queryFn: () => loadRelationLabel(provider, reference!, linked!, labelField),
  });
  if (query.isError) return null;
  return query.data;
}
