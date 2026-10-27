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

// Watch what the list asks useInfiniteResource for (maxPages, the sort), with the real hook underneath.
const hooks = vi.hoisted(() => ({ infiniteOptions: [] as Record<string, unknown>[] }));
vi.mock("@marktiderman/genesis-core/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@marktiderman/genesis-core/hooks")>();
  return {
    ...actual,
    useInfiniteResource: (resource: string, options: Record<string, unknown>) => {
      hooks.infiniteOptions.push(options);
      return actual.useInfiniteResource(resource, options);
    },
  };
});

import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Alert, Linking } from "react-native";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DataWriteError,
  defineResource,
  GenesisProvider,
  ViewerScope,
  type DataProvider,
  type ListParams,
  type Viewer,
} from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import {
  dateToDay,
  dayToDate,
  defaultNativeResourceViewMessages as messages,
  formFieldsFor,
  formatDay,
  NativeResourceView,
  NativeResourceViewMessagesProvider,
  openableUrl,
  rowItem,
  screenValues,
  sectionsFor,
  serverSort,
  serverSorts,
  formatInstant,
  resolveZone,
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

function wrap(p: DataProvider, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })) {
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
    expect(item).toEqual({ id: "b1", title: "Northwind", subtitle: "Since 2026-01-02", chips: [{ label: "Live", tone: "success" }], picture: null });
  });

  it("shows no subtitle when the summary has none, never a raw column", () => {
    const item = rowItem(plainView, ROWS[1]!);
    expect(item).toEqual({ id: "b2", title: "Contoso", chips: [], picture: null });
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

  it("titles sections and form choices in the view's words", () => {
    const labelled = defineView(brands, {
      fields: { status: { labels: { active: "Published", draft: "In progress" } } },
      form: ["name", "status"],
      groupBy: "status",
    });
    expect(sectionsFor(labelled, ROWS, messages).map((s) => s.title)).toEqual(["Published", "Archived"]);
    expect(formFieldsFor(labelled, "create").find((f) => f.key === "status")!.options).toEqual([
      { value: "active", label: "Published" },
      { value: "archived", label: "Archived" },
      { value: "draft", label: "In progress" },
    ]);
  });

  it("is one untitled section without groupBy, and none for no rows", () => {
    expect(sectionsFor(summaryView, ROWS, messages).map((s) => s.title)).toEqual([""]);
    expect(sectionsFor(summaryView, [], messages)).toEqual([]);
  });

  it("draws a header per section", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    expect((await screen.findByTestId("native-resource-view-section-active")).textContent).toContain("Active");
    // Only loaded rows could be counted, so the header shows the title alone.
    expect(screen.getByTestId("native-resource-view-section-archived").textContent).toBe("Archived");
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

describe("viewer-aware guards", () => {
  const handlers = () => ({ onEdit: vi.fn(), onDelete: vi.fn(), onRefused: vi.fn() });
  const isEditor = (v: Viewer) => ((v.roles as { teamRoles?: readonly string[] } | undefined)?.teamRoles ?? []).includes("editor");
  const guarded = defineView(brands, {
    form: ["name"],
    can: {
      create: (v) => (isEditor(v) ? true : "Only editors add brands."),
      update: (_r, v) => (isEditor(v) ? true : "Only editors edit brands."),
    },
  });
  const ann: Viewer = { id: "ann", scope: {}, roles: { teamRoles: ["editor"] } as never };
  const bob: Viewer = { id: "bob", scope: {}, roles: { teamRoles: ["reader"] } as never };

  it("refuses one viewer's swipe and allows another's; no viewer refuses", () => {
    const edit = (viewer?: Viewer) =>
      swipeActionsFor(guarded, ROWS[1]!, { messages, softDelete: false, editable: true, ...(viewer ? { viewer } : {}), ...handlers() }).find(
        (a) => a.id === "edit",
      )!.reason;
    expect(edit(bob)).toBe("Only editors edit brands.");
    expect(edit(ann)).toBeUndefined();
    expect(edit()).toBe("Only editors edit brands.");
  });

  it("reads the viewer from ViewerScope for create, and fails closed without one", async () => {
    const at = (viewer?: string, roles?: { teamRoles: string[] }) => {
      const Base = wrap(provider());
      return ({ children }: { children: ReactNode }) => (
        <Base>{viewer ? <ViewerScope viewer={viewer} roles={roles as never}>{children}</ViewerScope> : children}</Base>
      );
    };
    const editor = renderHook(() => useNativeResourceView(guarded), { wrapper: at("ann", { teamRoles: ["editor"] }) });
    await waitFor(() => expect(editor.result.current.canCreate).toBe(true));
    const reader = renderHook(() => useNativeResourceView(guarded), { wrapper: at("bob", { teamRoles: ["reader"] }) });
    await waitFor(() => expect(reader.result.current.canCreate).toBe("Only editors add brands."));
    const nobody = renderHook(() => useNativeResourceView(guarded), { wrapper: at() });
    expect(nobody.result.current.canCreate).toBe("Only editors add brands.");
  });
});

describe("viewer-aware guards when only the roles change", () => {
  const isEditor = (v?: Viewer) => ((v?.roles as { teamRoles?: readonly string[] } | undefined)?.teamRoles ?? []).includes("editor");
  const guarded = defineView(brands, {
    fields: { secret: { label: "Secret", when: (_r, v) => isEditor(v) } },
    columns: { default: ["name", "secret"] },
    form: ["name"],
    can: {
      create: (v) => (isEditor(v) ? true : "Only editors add brands."),
      update: (_r, v) => (isEditor(v) ? true : "Only editors edit brands."),
      delete: (_r, v) => (isEditor(v) ? true : "Only editors delete brands."),
    },
  });

  // ViewerScope keeps the same viewer's screen mounted when the roles change, so create, the row's
  // actions and `when` must be asked again from the viewer in their memos' dependencies.
  it("asks create, edit, delete and `when` again, without remounting", async () => {
    let mounts = 0;
    function Mounts() {
      useState(() => (mounts += 1));
      return null;
    }
    const Base = wrap(provider());
    const at = (roles?: { teamRoles: string[] }) => (
      <Base>
        <ViewerScope viewer="ann" roles={roles as never}>
          <Mounts />
          <NativeResourceView view={guarded} />
        </ViewerScope>
      </Base>
    );
    const reason = (id: "edit" | "delete") => screen.queryByTestId(`native-resource-view-peek-${id}-reason`)?.textContent ?? null;
    const peek = () => screen.getByTestId("native-resource-view-peek").textContent;
    const pressCreate = () => fireEvent.click(screen.getByTestId("native-resource-view-create"));

    // Roles not known yet: create explains instead of opening, edit and delete are refused, the value hidden.
    const { rerender } = render(at(undefined));
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b2"));
    await screen.findByTestId("native-resource-view-peek");
    expect(peek()).toContain("Secret");
    expect(peek()).not.toContain("shown");
    expect(reason("edit")).toBe("Only editors edit brands.");
    expect(reason("delete")).toBe("Only editors delete brands.");
    pressCreate();
    expect(alert).toHaveBeenLastCalledWith("New brand", "Only editors add brands.");

    // Roles arrive (undefined → editor): the same mounted screen allows, and shows the value.
    alert.mockClear();
    rerender(at({ teamRoles: ["editor"] }));
    await waitFor(() => expect(reason("edit")).toBeNull());
    expect(reason("delete")).toBeNull();
    expect(peek()).toContain("shown");
    pressCreate();
    expect(alert).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId("native-resource-view-form-cancel"));

    // Roles change (editor → reader): refused and hidden again, still the same mount.
    rerender(at({ teamRoles: ["reader"] }));
    await waitFor(() => expect(reason("edit")).toBe("Only editors edit brands."));
    expect(reason("delete")).toBe("Only editors delete brands.");
    await waitFor(() => expect(peek()).not.toContain("shown"));
    pressCreate();
    expect(alert).toHaveBeenLastCalledWith("New brand", "Only editors add brands.");
    expect(mounts).toBe(1);
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

  it("opens over the row fetched by id, shows read-only fields as text, and sends only what changed", async () => {
    // The list's select is narrower than the record: the website only comes with getOne.
    const listRows = ROWS.map((r) => ({ ...r, website: null }));
    const p = provider({ getList: vi.fn(async () => ({ data: listRows, total: listRows.length })) as unknown as DataProvider["getList"] });
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(p) });
    const row = await screen.findByTestId("native-resource-view-row-b2");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    const form = await screen.findByTestId("native-resource-view-form");
    expect(within(form).getByTestId("native-resource-view-form-cancel")).toBeTruthy();
    const updated = await within(form).findByTestId("native-resource-view-form-field-updated_at");
    expect(p.getOne).toHaveBeenCalledWith("brands", expect.objectContaining({ id: "b2" }));
    expect(updated.querySelector("input")).toBeNull();
    expect(within(form).getByTestId("native-resource-view-form-section-details").textContent).toContain("Details");
    // The fetched website is in the form, though the list row had none.
    const website = within(form).getByTestId("native-resource-view-form-field-website").querySelector("input")!;
    expect(website.value).toBe("https://contoso.example");
    fireEvent.change(within(form).getByTestId("native-resource-view-form-field-name").querySelector("input")!, { target: { value: "Contoso 2" } });
    fireEvent.click(within(form).getByTestId("native-resource-view-form-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalled());
    expect((p.update as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ id: "b2", data: { name: "Contoso 2" } });
  });

  it("sends nothing when nothing changed", async () => {
    const p = provider();
    const { result } = renderHook(() => useNativeResourceView(plainView), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    await act(async () => {
      expect(await result.current.save("edit", ROWS[1]!, ROWS[1]!, new Set())).toEqual({ ok: true });
    });
    expect(p.update).not.toHaveBeenCalled();
  });

  it("never puts a JSON or list field in the sheet, even when the form names it", () => {
    type Tagged = { id: string; name: string; tags: string[] | null; meta: unknown };
    const tagged = defineResource<Tagged>()({
      name: "tagged",
      key: "id",
      labelField: "name",
      fields: [
        { name: "id", type: "string", hasDefault: true },
        { name: "name", type: "string" },
        { name: "tags", type: "string", array: true, nullable: true },
        { name: "meta", type: "json", nullable: true },
      ],
    });
    const taggedView = defineView(tagged, { form: ["name", "tags", "meta"] });
    for (const mode of ["create", "edit"] as const) {
      expect(formFieldsFor(taggedView, mode).map((f) => f.key)).toEqual(["name"]);
      expect(writableValues(taggedView, mode, formFieldsFor(taggedView, mode), { name: "a", tags: "x,y", meta: "[object Object]" })).toEqual({
        name: "a",
      });
    }
  });

  it("sends null for a cleared optional number or date", () => {
    type Scored = { id: string; name: string; score: number | null; due_on: string | null };
    const scored = defineResource<Scored>()({
      name: "scored",
      key: "id",
      labelField: "name",
      fields: [
        { name: "id", type: "string", hasDefault: true },
        { name: "name", type: "string" },
        { name: "score", type: "number", nullable: true },
        { name: "due_on", type: "datetime", dbType: "date", nullable: true },
      ],
    });
    const scoredView = defineView(scored, {});
    const fields = formFieldsFor(scoredView, "edit");
    expect(fields.find((f) => f.key === "score")?.kind).toBe("number");
    expect(writableValues(scoredView, "edit", fields, { name: "a", score: undefined, due_on: null }, new Set(["score", "due_on"]))).toEqual({
      score: null,
      due_on: null,
    });
  });

  it("shows an empty date as a button to add one, and a set date can be cleared", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-create"));
    const add = await screen.findByTestId("native-resource-view-form-field-launched_on-set");
    expect(add.textContent).toBe("Add a date");
    fireEvent.click(add);
    const clear = await screen.findByTestId("native-resource-view-form-field-launched_on-clear");
    expect(clear.textContent).toBe("Clear launched on");
    fireEvent.click(clear);
    expect((await screen.findByTestId("native-resource-view-form-field-launched_on-set")).textContent).toBe("Add a date");
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

  it("shows a read-only link as text, never an input, and words when its row is hidden", async () => {
    render(<NativeResourceView view={questionsView} filter={{ form_id: "f1" }} />, { wrapper: wrap(questionProvider()) });
    const row = await screen.findByTestId("native-resource-view-row-q1");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    const field = await screen.findByTestId("native-resource-view-form-field-form_id");
    expect(field.querySelector("input")).toBeNull();
    expect(field.textContent).toContain("Form");
    // getList answers every resource with the question, so form f1 isn't found: words, not "f1".
    await waitFor(() => expect(screen.getByTestId("native-resource-view-form-field-form_id-value").textContent).toBe("Not available"));
    expect(formFieldsFor(questionsView, "create").map((f) => f.key)).toEqual(["prompt"]);
  });

  it("shows a read-only link in the linked row's words once they arrive", async () => {
    const p = provider({
      getList: vi.fn(async (resource: string) =>
        resource === "forms" ? { data: [{ id: "f1", title: "Exit survey" }], total: -1 } : { data: [QUESTION], total: 1 },
      ) as unknown as DataProvider["getList"],
    });
    render(<NativeResourceView view={questionsView} filter={{ form_id: "f1" }} />, { wrapper: wrap(p) });
    const row = await screen.findByTestId("native-resource-view-row-q1");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    await waitFor(() => expect(screen.getByTestId("native-resource-view-form-field-form_id-value").textContent).toBe("Exit survey"));
    const asks = (p.getList as ReturnType<typeof vi.fn>).mock.calls.filter(([r]) => r === "forms");
    expect(asks).toHaveLength(1);
    expect(asks[0]![1].filters).toEqual([{ field: "id", operator: "in", value: ["f1"] }]);
  });

  it("falls back to the English for a hidden link when an older catalogue has no hiddenLink", async () => {
    const { common, ...rest } = messages;
    const { hiddenLink: _dropped, ...older } = common;
    void _dropped;
    render(
      <NativeResourceViewMessagesProvider value={{ ...rest, common: older }}>
        <NativeResourceView view={questionsView} filter={{ form_id: "f1" }} />
      </NativeResourceViewMessagesProvider>,
      { wrapper: wrap(questionProvider()) },
    );
    const row = await screen.findByTestId("native-resource-view-row-q1");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    await waitFor(() => expect(screen.getByTestId("native-resource-view-form-field-form_id-value").textContent).toBe("Not available"));
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
    // These start like a link but isSafeUrl refuses them: whitespace, control characters, length.
    expect(openableUrl("https://exa mple.com")).toBeNull();
    expect(openableUrl("https://example.com/\u0000")).toBeNull();
    expect(openableUrl(`https://example.com/${"a".repeat(2100)}`)).toBeNull();
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
  it("shows only the view's columns, never every key of the row", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b2"));
    const peek = await screen.findByTestId("native-resource-view-peek");
    for (const label of ["Name", "Secret", "Launched On", "Status", "Website"]) expect(peek.textContent).toContain(label);
    for (const hidden of ["Practice Id", "Is Default", "Secret Visible", "Updated At"]) expect(peek.textContent).not.toContain(hidden);
  });

  it("hides a when-false value in the peek, as in a cell", async () => {
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b1"));
    const peek = await screen.findByTestId("native-resource-view-peek");
    expect(peek.textContent).toContain("Secret");
    expect(peek.textContent).not.toContain("hidden");
  });

  it("titles the peek with summary(row).title, not the raw labelField", async () => {
    const titled = defineView(brands, { summary: (r) => ({ title: `${r.name} (brand)` }) });
    render(<NativeResourceView view={titled} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b2"));
    expect((await screen.findByTestId("native-resource-view-peek")).textContent).toContain("Contoso (brand)");
  });

  it("shows a refused action with its reason, and the bin's wording", async () => {
    const p = provider({ capabilities: vi.fn(async () => ({ softDelete: true })) as unknown as DataProvider["capabilities"] });
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(p) });
    await waitFor(() => expect(p.capabilities).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b1"));
    const button = await screen.findByTestId("native-resource-view-peek-delete");
    await waitFor(() => expect(button.textContent).toBe("Move to Bin"));
    expect(screen.getByTestId("native-resource-view-peek-delete-reason").textContent).toBe("The default brand stays.");
    fireEvent.click(button);
    expect(alert).toHaveBeenLastCalledWith("Move to Bin", "The default brand stays.");
  });

  it("reads a scope-clock column on the scope's zone: the prop, else ViewerScope's", async () => {
    const clocked = defineView(brands, {
      fields: { updated_at: { timeZone: "scope" } },
      columns: { default: ["name", "updated_at"] },
    });
    const at = "2026-01-02T10:00:00Z";
    expect(formatInstant(at, "Asia/Tokyo")).not.toBe(formatInstant(at, "Europe/Berlin"));

    const first = render(<NativeResourceView view={clocked} scopeTimeZone="Asia/Tokyo" />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b2"));
    expect((await screen.findByTestId("native-resource-view-peek")).textContent).toContain(formatInstant(at, "Asia/Tokyo"));
    first.unmount();

    // No prop: ViewerScope's scopeTimeZone.
    const Base = wrap(provider());
    render(<NativeResourceView view={clocked} />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Base>
          <ViewerScope viewer="ann" timeZone="America/Los_Angeles" scopeTimeZone="Europe/Berlin">
            {children}
          </ViewerScope>
        </Base>
      ),
    });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-b2"));
    expect((await screen.findByTestId("native-resource-view-peek")).textContent).toContain(formatInstant(at, "Europe/Berlin"));
  });

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
    // Only a whole day: a timestamp or trailing text isn't one.
    expect(dayToDate("2026-01-02T00:00:00Z")).toBeNull();
    expect(formatDay("2026-01-02junk")).toBe("2026-01-02junk");
    // A timestamp is the day on the clock asked for, not its UTC day: 8pm in New York on Jan 2.
    expect(formatDay("2026-01-03T01:00:00Z", "America/New_York")).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(2026, 0, 2)));
    expect(formatDay("2026-01-03T01:00:00Z", "UTC")).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(2026, 0, 3)));
    // What `new Date(day)` would have shown here: the day before.
    expect(new Date("2026-01-02").getDate()).toBe(1);
  });
});

describe("clocks", () => {
  it("resolves viewer and scope to the given zones, and an unknown name to the viewer's", () => {
    const zones = { viewer: "America/Los_Angeles", scope: "Europe/Berlin" };
    expect(resolveZone(undefined, zones)).toBe("America/Los_Angeles");
    expect(resolveZone("viewer", zones)).toBe("America/Los_Angeles");
    expect(resolveZone("scope", zones)).toBe("Europe/Berlin");
    // The old name is gone, not an alias: it is read as an IANA name, and isn't one.
    expect(resolveZone("practice", zones)).toBe("America/Los_Angeles");
    expect(resolveZone("Asia/Tokyo", zones)).toBe("Asia/Tokyo");
    expect(resolveZone("Not/AZone", zones)).toBe("America/Los_Angeles");
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
    // Grouped by status: the server sorts by it first, so page 2 never lands mid-section.
    expect(getList.mock.calls[0]![1].sort).toEqual({ field: "status", order: "asc" });
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

  it("keeps at most 10 pages loaded by default, and takes the screen's number", () => {
    hooks.infiniteOptions.length = 0;
    renderHook(() => useNativeResourceView(plainView), { wrapper: wrap(provider()) });
    expect(hooks.infiniteOptions.at(-1)).toMatchObject({ maxPages: 10, defaultSorts: [{ field: "status", order: "asc" }, { field: "name", order: "asc" }] });
    renderHook(() => useNativeResourceView(summaryView, { maxPages: 3 }), { wrapper: wrap(provider()) });
    expect(hooks.infiniteOptions.at(-1)).toMatchObject({ maxPages: 3 });
  });

  it("sorts by groupBy first, then by orderBy when there's no group", () => {
    expect(serverSort(plainView)).toEqual({ field: "status", order: "asc" });
    expect(serverSort(defineView(brands, { orderBy: { field: "name", direction: "desc" } }))).toEqual({ field: "name", order: "desc" });
    expect(serverSort(defineView(brands, { groupBy: "status", orderBy: { field: "status", direction: "desc" } }))).toEqual({
      field: "status",
      order: "desc",
    });
    expect(serverSort(summaryView)).toBeUndefined();
  });

  it("sorts within each group by orderBy: the group first, then the order", () => {
    const grouped = defineView(brands, { groupBy: "status", orderBy: { field: "name", direction: "desc" } });
    expect(serverSorts(grouped)).toEqual([
      { field: "status", order: "asc" },
      { field: "name", order: "desc" },
    ]);
    // A provider that sorts by one field keeps the sections whole.
    expect(serverSort(grouped)).toEqual({ field: "status", order: "asc" });
    expect(serverSorts(defineView(brands, { groupBy: "status" }))).toEqual([{ field: "status", order: "asc" }]);
    expect(serverSorts(summaryView)).toEqual([]);
    hooks.infiniteOptions.length = 0;
    renderHook(() => useNativeResourceView(grouped), { wrapper: wrap(provider()) });
    expect(hooks.infiniteOptions.at(-1)).toMatchObject({ defaultSorts: serverSorts(grouped) });
    expect(hooks.infiniteOptions.at(-1)).not.toHaveProperty("defaultSort");
  });

  it("doesn't redraw rows while the person types", async () => {
    const summary = vi.fn((r: Brand) => ({ title: r.name }));
    const counted = defineView(brands, { summary });
    render(<NativeResourceView view={counted} />, { wrapper: wrap(provider()) });
    await screen.findByTestId("native-resource-view-row-b1");
    const before = summary.mock.calls.length;
    const input = screen.getByTestId("native-resource-view-search").querySelector("input")!;
    fireEvent.change(input, { target: { value: "N" } });
    fireEvent.change(input, { target: { value: "No" } });
    expect(summary.mock.calls.length).toBe(before);
  });

  it("keeps the rows and shows a banner when a later read fails", async () => {
    let calls = 0;
    const p = provider({
      getList: vi.fn(async () => {
        calls += 1;
        if (calls > 1) throw new Error("network down");
        return { data: ROWS, total: ROWS.length };
      }) as unknown as DataProvider["getList"],
    });
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(p) });
    await screen.findByTestId("native-resource-view-row-b1");
    fireEvent.click(screen.getByTestId("native-resource-view-refresh"));
    expect((await screen.findByTestId("native-resource-view-read-error")).textContent).toContain("These brands couldn't be loaded.");
    expect(screen.getByTestId("native-resource-view-row-b1")).toBeTruthy();
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

describe("review follow-ups", () => {
  it("diffs a save against what the sheet opened with, so another writer's change isn't sent back", async () => {
    let website = "https://contoso.example";
    const p = provider({
      getOne: vi.fn(async (_r, { id }) => ({ data: { ...ROWS.find((r) => r.id === id)!, website } })) as DataProvider["getOne"],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    render(<NativeResourceView view={plainView} />, { wrapper: wrap(p, client) });
    const row = await screen.findByTestId("native-resource-view-row-b2");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    const form = await screen.findByTestId("native-resource-view-form");
    const name = (await within(form).findByTestId("native-resource-view-form-field-name")).querySelector("input")!;
    fireEvent.change(name, { target: { value: "Contoso 2" } });
    // Someone else changes the website; the record refetches while the sheet is open.
    website = "https://changed.example";
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["brands"] });
    });
    await waitFor(() => expect((p.getOne as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
    fireEvent.click(within(form).getByTestId("native-resource-view-form-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalled());
    expect((p.update as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ id: "b2", data: { name: "Contoso 2" } });
  });

  // A provider that pages by cursor both ways: one row a page.
  function cursorProvider() {
    const pages: Record<string, { data: Brand[]; nextCursor: string | null; prevCursor: string | null }> = {
      start: { data: [ROWS[0]!], nextCursor: "c2", prevCursor: null },
      c1: { data: [ROWS[0]!], nextCursor: "c2", prevCursor: null },
      c2: { data: [ROWS[1]!], nextCursor: "c3", prevCursor: "c1" },
      c3: { data: [ROWS[2]!], nextCursor: null, prevCursor: "c2" },
    };
    const getList = vi.fn(async (_r: string, params: ListParams) => ({ ...pages[params.pagination?.cursor ?? "start"]!, total: 3 }));
    return { getList, p: provider({ getList: getList as unknown as DataProvider["getList"] }) };
  }

  it("loads back a page maxPages dropped from the front", async () => {
    const { getList, p } = cursorProvider();
    const { result, rerender } = renderHook(() => useNativeResourceView(summaryView, { maxPages: 1, perPage: 1 }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["b1"]));
    // useInfiniteResource turns maxPages on once a render has seen the provider page by cursor.
    rerender();
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["b2"]));
    expect(result.current.hasPrevious).toBe(true);
    act(() => result.current.loadPrevious());
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["b1"]));
    expect(getList.mock.calls.at(-1)![1].pagination).toMatchObject({ cursor: "c1" });
  });

  it("wires the top of the list to the previous page and keeps the visible rows in place", async () => {
    const { getList, p } = cursorProvider();
    const { rerender } = render(<NativeResourceView view={summaryView} maxPages={1} perPage={1} />, { wrapper: wrap(p) });
    await screen.findByTestId("native-resource-view-row-b1");
    // useInfiniteResource turns maxPages on once a render has seen the provider page by cursor.
    rerender(<NativeResourceView view={summaryView} maxPages={1} perPage={1} />);
    const list = screen.getByTestId("native-resource-view-list");
    expect(JSON.parse(list.getAttribute("data-maintain-visible-content-position")!)).toEqual({ minIndexForVisible: 0 });
    act(() => {
      list.dispatchEvent(new CustomEvent("endreached"));
    });
    await screen.findByTestId("native-resource-view-row-b2");
    await waitFor(() => expect(screen.queryByTestId("native-resource-view-row-b1")).toBeNull());
    act(() => {
      screen.getByTestId("native-resource-view-list").dispatchEvent(new CustomEvent("startreached"));
    });
    await screen.findByTestId("native-resource-view-row-b1");
    expect(getList.mock.calls.at(-1)![1].pagination).toMatchObject({ cursor: "c1" });
  });

  it("leaves fields the screen's filter fixes out of the create form, and saves the filter's value", async () => {
    const p = provider();
    const { result } = renderHook(() => useNativeResourceView(plainView, { filter: { status: "archived" } }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.formFields("create").map((f) => f.key)).toEqual(["name", "website", "launched_on"]);
    // An edit still shows it: the filter only fills creates.
    expect(result.current.formFields("edit").map((f) => f.key)).toContain("status");
    await act(async () => {
      expect(await result.current.save("create", { name: "Tailspin", status: "active" })).toEqual({ ok: true });
    });
    expect((p.create as ReturnType<typeof vi.fn>).mock.calls[0]![1].data).toMatchObject({ name: "Tailspin", status: "archived" });

    render(<NativeResourceView view={plainView} filter={{ status: "archived" }} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("native-resource-view-create"));
    await screen.findByTestId("native-resource-view-form-field-name");
    expect(screen.queryByTestId("native-resource-view-form-field-status")).toBeNull();
  });

  it("calls the latest onRowPress without redrawing the rows", async () => {
    const summary = vi.fn((r: Brand) => ({ title: r.name }));
    const counted = defineView(brands, { summary });
    const first = vi.fn();
    const second = vi.fn();
    const Wrapper = wrap(provider());
    const { rerender } = render(<NativeResourceView view={counted} onRowPress={first} />, { wrapper: Wrapper });
    await screen.findByTestId("native-resource-view-row-b1");
    const before = summary.mock.calls.length;
    // A screen passing an inline handler gives a new function every render.
    rerender(<NativeResourceView view={counted} onRowPress={second} />);
    expect(summary.mock.calls.length).toBe(before);
    fireEvent.click(screen.getByTestId("native-resource-view-row-b1"));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }));
    expect(first).not.toHaveBeenCalled();
  });
});

describe("row pictures", () => {
  const pictured = (image: (r: Brand) => { src?: string; name?: string; alt?: string } | undefined) =>
    defineView(brands, { summary: (r) => ({ title: r.name, image: image(r) }) });

  it("draws a safe image as the row's leading picture, decorative without alt", async () => {
    const view = pictured((r) => ({ src: `https://img.example/${r.id}.png`, name: r.name }));
    render(<NativeResourceView view={view} />, { wrapper: wrap(provider()) });
    const image = await screen.findByTestId("native-resource-view-row-b1-image");
    expect(image.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByTestId("native-resource-view-row-b1-initials")).toBeNull();
    expect(rowItem(view, ROWS[0]!).picture).toEqual({ kind: "image", src: "https://img.example/b1.png", alt: "", fallback: "N" });
  });

  it("reads the image's alt with the row, when it has one", async () => {
    const view = pictured((r) => ({ src: `https://img.example/${r.id}.png`, name: r.name, alt: `${r.name}'s logo` }));
    render(<NativeResourceView view={view} />, { wrapper: wrap(provider()) });
    expect((await screen.findByTestId("native-resource-view-row-b2")).getAttribute("aria-label")).toBe("Contoso's logo, Contoso");
  });

  it("falls back to initials when the image fails to load", async () => {
    const view = pictured(() => ({ src: "https://img.example/missing.png", name: "Ada Lovelace" }));
    render(<NativeResourceView view={view} />, { wrapper: wrap(provider()) });
    const image = await screen.findByTestId("native-resource-view-row-b1-image");
    fireEvent.error(image.querySelector("img")!);
    expect((await screen.findByTestId("native-resource-view-row-b1-initials")).textContent).toBe("AL");
    expect(screen.queryByTestId("native-resource-view-row-b1-image")).toBeNull();
  });

  it("draws initials when there's only a name", async () => {
    render(<NativeResourceView view={pictured((r) => ({ name: r.name }))} />, { wrapper: wrap(provider()) });
    expect((await screen.findByTestId("native-resource-view-row-b2-initials")).textContent).toBe("C");
    expect(screen.queryByTestId("native-resource-view-row-b2-image")).toBeNull();
  });

  it("never loads an unsafe src: javascript: falls back to initials", async () => {
    const view = pictured(() => ({ src: "javascript:alert(1)", name: "Ada Lovelace" }));
    expect(rowItem(view, ROWS[0]!).picture).toEqual({ kind: "initials", text: "AL" });
    render(<NativeResourceView view={view} />, { wrapper: wrap(provider()) });
    expect((await screen.findByTestId("native-resource-view-row-b1-initials")).textContent).toBe("AL");
    expect(document.querySelector("img")).toBeNull();
  });

  it("draws initials for a safe src a phone can't load (a root-relative path)", () => {
    expect(rowItem(pictured(() => ({ src: "/logo.png", name: "Ada" })), ROWS[0]!).picture).toEqual({ kind: "initials", text: "A" });
  });

  it("draws nothing without a picture", async () => {
    render(<NativeResourceView view={pictured(() => undefined)} />, { wrapper: wrap(provider()) });
    await screen.findByTestId("native-resource-view-row-b1");
    expect(screen.queryByTestId("native-resource-view-row-b1-image")).toBeNull();
    expect(screen.queryByTestId("native-resource-view-row-b1-initials")).toBeNull();
    expect(rowItem(pictured(() => ({ src: "javascript:x" })), ROWS[0]!).picture).toBeNull();
  });
});
