// @feat:native-components
/**
 * NativeResourceView: a genesis-core view on native list pieces.
 * - summary → NativeListItem (its subtitle only, never a raw column);
 * - the peek draws view.columns() like the cells: `when`-false and sensitive values never show;
 * - groupBy → sections;
 * - guards → swipe actions, each refusal with its reason; delete wording follows the bin;
 * - form(mode) + writable(mode) → the form sheet; read-only columns are never inputs or sent;
 * - url and image values go through isSafeUrl (`javascript:` is text);
 * - a calendar day is the same day west of UTC;
 * - a refused delete comes back and says why, inline;
 * - cursor paging and the 300 ms search.
 */
// West of UTC, where `new Date("2026-01-02")` is the 1st. Before any import builds a formatter.
vi.hoisted(() => {
  (globalThis as unknown as { process: { env: Record<string, string> } }).process.env.TZ = "America/Los_Angeles";
});

import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, Linking } from "react-native";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DataWriteError,
  defineResource,
  GenesisProvider,
  type DataProvider,
  type ListParams,
} from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import {
  dateToDay,
  dayToDate,
  defaultNativeResourceViewMessages as messages,
  formFieldsFor,
  formatDay,
  NativeResourceView,
  openableUrl,
  rowItem,
  screenValues,
  sectionsFor,
  swipeActionsFor,
  useNativeResourceView,
  validateValues,
  writableValues,
} from "..";

type Brand = {
  id: string;
  practice_id: string;
  name: string;
  status: "active" | "archived" | "draft" | null;
  is_default: boolean;
  website: string | null;
  launched_on: string | null;
  secret: string | null;
  secret_visible: boolean;
  updated_at: string;
};

const brands = defineResource<Brand>()({
  name: "brands",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "practice_id", type: "string" },
    { name: "name", type: "string" },
    { name: "status", type: "string", enumValues: ["active", "archived", "draft"], nullable: true },
    { name: "is_default", type: "boolean", hasDefault: true },
    { name: "website", type: "string", widget: "url", nullable: true },
    { name: "launched_on", type: "datetime", dbType: "date", nullable: true },
    { name: "secret", type: "string", nullable: true },
    { name: "secret_visible", type: "boolean", hasDefault: true },
    { name: "updated_at", type: "datetime", hasDefault: true, readOnly: true },
  ],
});

// The same rows with a sensitive note, a link and a JSON blob: derived forms and the peek leave them out.
const notedBrands = defineResource<Brand & { notes: string | null; owner_id: string | null; meta: unknown }>()({
  name: "brands",
  key: "id",
  labelField: "name",
  fields: [
    ...brands.fields.filter((f) => f.name !== "secret" && f.name !== "secret_visible" && f.name !== "updated_at"),
    { name: "secret", type: "string", nullable: true },
    { name: "secret_visible", type: "boolean", hasDefault: true, readOnly: true },
    { name: "updated_at", type: "datetime", hasDefault: true, readOnly: true },
    { name: "notes", type: "string", nullable: true, sensitive: true },
    { name: "owner_id", type: "string", nullable: true, references: { resource: "people", field: "id" } },
    { name: "meta", type: "json", nullable: true },
  ],
});

// A plain view: no summary, so the row falls back to labelField plus two columns.
const plainView = defineView(brands, {
  scope: ["practice_id"],
  fields: {
    status: { tones: { active: "success" } },
    secret: { label: "Secret", when: (r) => r.secret_visible },
    name: { max: 10 },
  },
  columns: { default: ["name", "secret", "launched_on", "status", "website"], compact: ["name"] },
  form: ["name", { section: "details", title: "Details", fields: ["status", "website", "launched_on", "updated_at"] }],
  groupBy: "status",
  orderBy: { field: "name" },
  can: { delete: (r) => (r.is_default ? "The default brand stays." : true) },
});

// A view with its own summary.
const summaryView = defineView(brands, {
  summary: (r) => ({ title: r.name, subtitle: `Since ${r.launched_on ?? "never"}`, chips: [{ label: "Live", tone: "success" }] }),
});

const ROWS: Brand[] = [
  {
    id: "b1",
    practice_id: "p1",
    name: "Northwind",
    status: "active",
    is_default: true,
    website: "javascript:alert(1)",
    launched_on: "2026-01-02",
    secret: "hidden",
    secret_visible: false,
    updated_at: "2026-01-02T10:00:00Z",
  },
  {
    id: "b2",
    practice_id: "p1",
    name: "Contoso",
    status: "archived",
    is_default: false,
    website: "https://contoso.example",
    launched_on: null,
    secret: "shown",
    secret_visible: true,
    updated_at: "2026-01-02T10:00:00Z",
  },
  {
    id: "b3",
    practice_id: "p1",
    name: "Fabrikam",
    status: "active",
    is_default: false,
    website: null,
    launched_on: null,
    secret: null,
    secret_visible: false,
    updated_at: "2026-01-02T10:00:00Z",
  },
];

function provider(overrides: Partial<DataProvider> = {}): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: ROWS, total: ROWS.length })) as DataProvider["getList"],
    getOne: vi.fn(async (_r, { id }) => ({ data: ROWS.find((r) => r.id === id) })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
    ...overrides,
  };
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

const alert = Alert.alert as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => alert.mockClear());

/** Press a button of the last Alert.alert. */
function pressAlert(text: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  act(() => buttons.find((b) => b.text === text)!.onPress!());
}

describe("rows", () => {
  it("uses summary(row) for the title, subtitle and chips", () => {
    const item = rowItem(summaryView, ROWS[0]!);
    expect(item).toEqual({ id: "b1", title: "Northwind", subtitle: "Since 2026-01-02", chips: [{ label: "Live", tone: "success" }] });
  });

  it("shows no subtitle when the summary has none, never a raw column", () => {
    const item = rowItem(plainView, ROWS[1]!);
    expect(item).toEqual({ id: "b2", title: "Contoso", chips: [] });
  });

  it("draws rows as list items with the summary's chip", async () => {
    render(<NativeResourceView view={summaryView} />, { wrapper: wrap(provider()) });
    const row = await screen.findByTestId("native-resource-view-row-b1");
    expect(row.getAttribute("aria-label")).toBe("Northwind, Since 2026-01-02, Live");
    expect(screen.getByTestId("native-resource-view-row-b1-chip").textContent).toBe("Live");
  });
});

describe("sections", () => {
  it("groups by groupBy in the order groups first appear, with a section for no value", () => {
    const rows = [...ROWS, { ...ROWS[2]!, id: "b4", name: "Tailspin", status: null }];
    const sections = sectionsFor(plainView, rows, messages);
    expect(sections.map((s) => [s.title, s.data.map((r) => r.id)])).toEqual([
      ["Active", ["b1", "b3"]],
      ["Archived", ["b2"]],
      ["No status", ["b4"]],
    ]);
  });

  it("is one untitled section without groupBy, and none for no rows", () => {
    expect(sectionsFor(summaryView, ROWS, messages).map((s) => s.title)).toEqual([""]);
    expect(sectionsFor(summaryView, [], messages)).toEqual([]);
  });

  it("draws a header per section", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    expect((await screen.findByTestId("native-resource-view-section-active")).textContent).toContain("Active");
    expect(screen.getByTestId("native-resource-view-section-archived").textContent).toContain("1");
  });
});

describe("guards to swipe actions", () => {
  const handlers = () => ({ onEdit: vi.fn(), onDelete: vi.fn(), onRefused: vi.fn() });

  it("keeps a refused action with its reason, and pressing it explains instead of acting", () => {
    const h = handlers();
    const actions = swipeActionsFor(plainView, ROWS[0]!, { messages, softDelete: false, editable: true, ...h });
    expect(actions.map((a) => [a.id, a.label, a.reason])).toEqual([
      ["edit", "Edit", undefined],
      ["delete", "Delete", "The default brand stays."],
    ]);
    actions[1]!.onPress();
    expect(h.onDelete).not.toHaveBeenCalled();
    expect(h.onRefused).toHaveBeenCalledWith("Delete", "The default brand stays.");
  });

  it("says Move to Bin when the provider bins deletes", () => {
    const actions = swipeActionsFor(plainView, ROWS[1]!, { messages, softDelete: true, editable: true, ...handlers() });
    expect(actions.find((a) => a.id === "delete")).toMatchObject({ label: "Move to Bin", destructive: true, icon: "trash" });
  });

  it("lets the screen only narrow: false hides, a sentence refuses, true never overrides the view", () => {
    const actions = swipeActionsFor(plainView, ROWS[0]!, {
      messages,
      softDelete: false,
      editable: true,
      screen: (action) => (action === "update" ? false : true),
      ...handlers(),
    });
    expect(actions.map((a) => a.id)).toEqual(["delete"]);
    expect(actions[0]!.reason).toBe("The default brand stays.");
  });

  it("reads the reason to screen readers and shows it when pressed", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    const row = await screen.findByTestId("native-resource-view-row-b1");
    expect(row.getAttribute("data-a11y-actions")).toBe("edit,delete");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "delete" }));
    });
    expect(alert).toHaveBeenLastCalledWith("Delete", "The default brand stays.");
  });
});

describe("form sheet", () => {
  it("builds fields from form(mode); read-only columns are text in an edit and absent in a create", () => {
    const edit = formFieldsFor(plainView, "edit");
    expect(edit.map((f) => [f.key, f.kind, f.readOnly, f.sectionTitle])).toEqual([
      ["name", "text", false, null],
      ["status", "segmented", false, "Details"],
      ["website", "url", false, "Details"],
      ["launched_on", "date", false, "Details"],
      ["updated_at", "datetime", true, "Details"],
    ]);
    expect(formFieldsFor(plainView, "create").map((f) => f.key)).toEqual(["name", "status", "website", "launched_on"]);
  });

  it("relies on form(): a derived form has no links, JSON, scope, sensitive or server-filled fields", () => {
    const derived = defineView(notedBrands, { scope: ["practice_id"] });
    expect(formFieldsFor(derived, "create").map((f) => f.key)).toEqual(["name", "status", "is_default", "website", "launched_on", "secret"]);
    expect(formFieldsFor(derived, "edit").map((f) => f.key)).toEqual(["name", "status", "is_default", "website", "launched_on", "secret"]);
  });

  it("copies form() rather than changing it (core caches and freezes it)", () => {
    const before = plainView.form("edit");
    formFieldsFor(plainView, "edit").forEach((f) => (f.label = "changed"));
    expect(plainView.form("edit")).toBe(before);
    expect(before[0]!.label).toBe("Name");
  });

  it("sends only writable keys: never read-only, key, scope or joined fields", () => {
    const fields = formFieldsFor(plainView, "edit");
    const values = { ...ROWS[1]!, joined_owner: "x", name: "Contoso 2", website: "" };
    expect(writableValues(plainView, "edit", fields, values)).toEqual({
      name: "Contoso 2",
      status: "archived",
      website: null,
      launched_on: null,
    });
  });

  it("checks required and max before saving", () => {
    const fields = formFieldsFor(plainView, "create");
    expect(validateValues(fields, { name: "" }, messages)).toEqual({ name: "Name is required." });
    expect(validateValues(fields, { name: "A name that is too long" }, messages)).toEqual({
      name: "Name can be at most 10 characters.",
    });
  });

  it("opens with Cancel and Save, shows read-only fields as text, and saves only writable keys", async () => {
    const p = provider();
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(p) });
    const row = await screen.findByTestId("native-resource-view-row-b2");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    const form = await screen.findByTestId("native-resource-view-form");
    expect(within(form).getByTestId("native-resource-view-form-cancel")).toBeTruthy();
    const updated = within(form).getByTestId("native-resource-view-form-field-updated_at");
    expect(updated.querySelector("input")).toBeNull();
    expect(within(form).getByTestId("native-resource-view-form-section-details").textContent).toContain("Details");
    fireEvent.click(within(form).getByTestId("native-resource-view-form-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalled());
    const sent = (p.update as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { id: string; data: Record<string, unknown> };
    expect(sent.id).toBe("b2");
    expect(Object.keys(sent.data).sort()).toEqual(["launched_on", "name", "status", "website"]);
  });
});

describe("links and the screen's filter", () => {
  type Question = { id: string; form_id: string; prompt: string };
  // A required link, read-only as core marks references (writable() leaves it out).
  const questions = defineResource<Question>()({
    name: "questions",
    key: "id",
    labelField: "prompt",
    fields: [
      { name: "id", type: "string", hasDefault: true },
      { name: "form_id", type: "string", references: { resource: "forms", field: "id" }, readOnly: true },
      { name: "prompt", type: "string" },
    ],
  });
  const questionsView = defineView(questions, { form: ["form_id", "prompt"] });
  const QUESTION: Question = { id: "q1", form_id: "f1", prompt: "How was it?" };
  const questionProvider = () =>
    provider({ getList: vi.fn(async () => ({ data: [QUESTION], total: 1 })) as unknown as DataProvider["getList"] });

  it("shows a read-only link as its label and raw id, never an input", async () => {
    render(<NativeResourceView view={questionsView} filter={{ form_id: "f1" }} />, { wrapper: wrap(questionProvider()) });
    const row = await screen.findByTestId("native-resource-view-row-q1");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    const field = await screen.findByTestId("native-resource-view-form-field-form_id");
    expect(field.querySelector("input")).toBeNull();
    expect(field.textContent).toContain("Form");
    expect(screen.getByTestId("native-resource-view-form-field-form_id-value").textContent).toBe("f1");
    expect(formFieldsFor(questionsView, "create").map((f) => f.key)).toEqual(["prompt"]);
  });

  it("sends the filter's link on create although it's read-only, and never on edit", async () => {
    const p = questionProvider();
    const { result } = renderHook(() => useNativeResourceView(questionsView, { filter: { form_id: "f1" } }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(async () => {
      expect(await result.current.save("create", { prompt: "New one", form_id: "typed" })).toEqual({ ok: true });
    });
    expect((p.create as ReturnType<typeof vi.fn>).mock.calls[0]![1].data).toEqual({ prompt: "New one", form_id: "f1" });
    await act(async () => {
      expect(await result.current.save("edit", { ...QUESTION, prompt: "Changed", form_id: "f2" }, QUESTION)).toEqual({ ok: true });
    });
    expect((p.update as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ id: "q1", data: { prompt: "Changed" } });
  });

  it("takes create values from non-null filters only, the screen's over the tab's", () => {
    expect(screenValues({ status: "draft", form_id: "a" }, { form_id: "b", owner_id: null })).toEqual({ status: "draft", form_id: "b" });
  });
});

describe("urls and images", () => {
  it("never opens javascript: or other unsafe schemes", () => {
    expect(openableUrl("javascript:alert(1)")).toBeNull();
    expect(openableUrl("java\tscript:alert(1)")).toBeNull();
    expect(openableUrl("data:text/html,x")).toBeNull();
    expect(openableUrl("/relative")).toBeNull();
    expect(openableUrl("https://contoso.example")).toBe("https://contoso.example");
    expect(openableUrl("mailto:a@b.example")).toBe("mailto:a@b.example");
  });

  it("draws an unsafe url as text and a safe one as a link in the peek", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b1"));
    const peek = await screen.findByTestId("native-resource-view-peek");
    expect(within(peek).getByText("javascript:alert(1)").getAttribute("role")).not.toBe("link");
    expect(within(peek).queryAllByRole("link")).toHaveLength(0);
  });

  it("draws a safe url as a link that opens it", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b2"));
    const link = within(await screen.findByTestId("native-resource-view-peek")).getByRole("link");
    expect(link.textContent).toBe("contoso.example");
    fireEvent.click(link);
    expect(Linking.openURL).toHaveBeenCalledWith("https://contoso.example");
  });
});

describe("peek", () => {
  it("shows view.columns() drawn like the cells: a when-false value and a sensitive field never appear", async () => {
    const peekView = defineView(notedBrands, {
      scope: ["practice_id"],
      fields: { secret: { label: "Secret", when: (r) => r.secret_visible } },
    });
    const rows = [{ ...ROWS[0]!, secret: "hidden-value", notes: "private-note", owner_id: "o1", meta: { a: 1 } }];
    const p = provider({ getList: vi.fn(async () => ({ data: rows, total: 1 })) as unknown as DataProvider["getList"] });
    render(<NativeResourceView view={peekView} />, { wrapper: wrap(p) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b1"));
    const peek = await screen.findByTestId("native-resource-view-peek");
    expect(peek.textContent).toContain("Secret");
    expect(peek.textContent).not.toContain("hidden-value");
    expect(peek.textContent).not.toContain("private-note");
    expect(peek.textContent).not.toContain("Notes");
  });
});

describe("calendar days", () => {
  it("keeps a day the same day west of UTC", () => {
    const date = dayToDate("2026-01-02")!;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 0, 2]);
    expect(dateToDay(date)).toBe("2026-01-02");
    expect(formatDay("2026-01-02")).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(2026, 0, 2)));
    // What `new Date(day)` would have shown here: the day before.
    expect(new Date("2026-01-02").getDate()).toBe(1);
  });
});

describe("refusals", () => {
  it("puts a refused delete back and says why, inline", async () => {
    const p = provider({
      deleteOne: vi.fn(async () => {
        throw new DataWriteError("forbidden", "You can't delete this brand.");
      }),
    });
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(p) });
    const row = await screen.findByTestId("native-resource-view-row-b2");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "delete" }));
    });
    expect(alert.mock.calls.at(-1)?.[0]).toBe("Delete “Contoso”?");
    pressAlert("Delete");
    expect((await screen.findByTestId("native-resource-view-refusal")).textContent).toContain("You can't delete this brand.");
    expect(screen.getByTestId("native-resource-view-row-b2")).toBeTruthy();
  });
});

describe("paging and search", () => {
  it("loads the next page by cursor on onEndReached", async () => {
    const getList = vi.fn(async (_r: string, params: ListParams) =>
      params.pagination?.cursor
        ? { data: [ROWS[2]!], total: 3, nextCursor: null }
        : { data: [ROWS[0]!, ROWS[1]!], total: 3, nextCursor: "c2" },
    );
    const p = provider({ getList: getList as unknown as DataProvider["getList"] });
    const { result } = renderHook(() => useNativeResourceView(plainView, { perPage: 2 }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["b1", "b2", "b3"]));
    expect(getList.mock.calls[1]![1].pagination).toMatchObject({ cursor: "c2", perPage: 2 });
    expect(getList.mock.calls[0]![1].sort).toEqual({ field: "name", order: "asc" });
    expect(result.current.hasMore).toBe(false);
  });

  it("sends the search to the server 300 ms after the last keystroke", async () => {
    const p = provider();
    const { result } = renderHook(() => useNativeResourceView(plainView), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    vi.useFakeTimers();
    try {
      act(() => result.current.setSearch("No"));
      act(() => result.current.setSearch("Nor"));
      act(() => vi.advanceTimersByTime(299));
      expect((p.getList as ReturnType<typeof vi.fn>).mock.calls.some((c) => (c[1] as ListParams).search)).toBe(false);
      act(() => vi.advanceTimersByTime(1));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() =>
      expect((p.getList as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].search).toEqual({ query: "Nor", fields: ["name"] }),
    );
    expect(result.current.search).toBe("Nor");
  });

  it("sends the screen's filter to the server", async () => {
    const p = provider();
    renderHook(() => useNativeResourceView(plainView, { filter: { practice_id: "p1", status: null } }), { wrapper: wrap(p) });
    await waitFor(() => expect(p.getList).toHaveBeenCalled());
    expect((p.getList as ReturnType<typeof vi.fn>).mock.calls[0]![1].filters).toEqual([
      { field: "practice_id", operator: "eq", value: "p1" },
      { field: "status", operator: "is_null" },
    ]);
  });
});
