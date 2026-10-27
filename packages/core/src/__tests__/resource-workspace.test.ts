/**
 * defineWorkspace: one record's screen from a view. Checked once and frozen; the helpers give
 * every platform the same header, settings and readiness.
 */
import { describe, expect, it, vi } from "vitest";

import { defineView, defineWorkspace, isWorkspace, ViewDefinitionError } from "../resource-view";
import { defineResource } from "../schema/types";

type Brand = {
  id: string;
  name: string;
  website: string | null;
  is_default: boolean;
  public: boolean;
  updated_at: string;
};
type Product = { id: string; brand_id: string; title: string };
type Rich = Brand & { meta: unknown; tags: string[]; owner_id: string | null; secret: string | null };

const brands = defineResource<Brand>()({
  name: "public.brands",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "website", type: "string", widget: "url", nullable: true },
    { name: "is_default", type: "boolean", hasDefault: true },
    { name: "public", type: "boolean", hasDefault: true },
    { name: "updated_at", type: "datetime", hasDefault: true, readOnly: true },
  ],
});
const products = defineResource<Product>()({
  name: "public.products",
  key: "id",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "brand_id", type: "string" },
    { name: "title", type: "string" },
  ],
});

const rich = defineResource<Rich>()({
  name: "public.brands",
  key: "id",
  fields: [
    ...brands.fields,
    { name: "meta", type: "json", nullable: true },
    { name: "tags", type: "string", array: true, nullable: true },
    { name: "owner_id", type: "string", nullable: true, references: { resource: "public.people", field: "id" } },
    { name: "secret", type: "string", nullable: true, sensitive: true },
  ],
});

const brandsView = defineView(brands, {
  fields: { website: { label: "Website", max: 200 } },
  summary: (b) => ({ title: b.name, subtitle: b.website ?? undefined, chips: [{ label: "Brand", tone: "info" }] }),
  actions: [
    { name: "archive", label: "Archive", confirm: "Archive it?", can: (b) => (b.is_default ? "The default brand stays." : true) },
    { name: "duplicate", label: "Duplicate" },
  ],
});
const productsView = defineView(products);

const row: Brand = { id: "b1", name: "Northwind", website: null, is_default: true, public: false, updated_at: "" };

const workspace = defineWorkspace(brandsView, {
  header: { actions: ["archive"] },
  sections: [
    { id: "products", label: "Products", list: { view: productsView, filter: (b) => ({ brand_id: b.id }) } },
    { id: "settings", label: "Settings", settings: ["website", "public"] },
    { id: "more", label: "More", settings: ["name"] },
    { id: "activity", label: "Activity" },
  ],
  readiness: (b) => [
    { id: "website", title: "Has a website", ok: !!b.website, reason: "Add the website." },
    { title: "Has a name", ok: !!b.name },
    { title: "Is public", ok: b.public, tone: "danger" },
  ],
});

describe("defineWorkspace", () => {
  it("resolves the sections, frozen", () => {
    expect(isWorkspace(workspace)).toBe(true);
    expect(isWorkspace(brandsView)).toBe(false);
    expect(Object.isFrozen(workspace)).toBe(true);
    expect(workspace.sections.map((s) => [s.id, s.kind])).toEqual([
      ["products", "list"],
      ["settings", "settings"],
      ["more", "settings"],
      ["activity", "slot"],
    ]);
    expect(workspace.section("products")).toMatchObject({ kind: "list", view: productsView });
    expect(workspace.section("nope")).toBeUndefined();
    expect(workspace.listFilter("products", row)).toEqual({ brand_id: "b1" });
    expect(() => workspace.listFilter("settings", row)).toThrow(ViewDefinitionError);
  });

  it("builds the header from the summary and the header's actions, with guards", () => {
    const header = workspace.headerFor(row);
    expect(header.title).toBe("Northwind");
    expect(header.chips).toEqual([{ label: "Brand", tone: "info" }]);
    expect(header.actions).toEqual([{ name: "archive", label: "Archive", confirm: "Archive it?", allowed: "The default brand stays." }]);
    expect(workspace.headerFor({ ...row, is_default: false }).actions[0]!.allowed).toBe(true);
  });

  it("offers every view action when the header names none", () => {
    const all = defineWorkspace(brandsView, { sections: [{ id: "a", label: "A" }] });
    expect(all.headerActions).toEqual(["archive", "duplicate"]);
    const none = defineWorkspace(brandsView, { header: { actions: [] }, sections: [{ id: "a", label: "A" }] });
    expect(none.headerFor(row).actions).toEqual([]);
  });

  it("maps settings through the view's edit form, in the listed order", () => {
    const fields = workspace.settingsFields("settings");
    expect(fields.map((f) => f.field.name)).toEqual(["website", "public"]);
    expect(fields[0]).toMatchObject({ label: "Website", max: 200, display: "url", readOnly: false });
    expect(fields[1]!.display).toBe("boolean");
    expect(workspace.settingsFields().map((f) => f.field.name)).toEqual(["website", "public", "name"]);
    expect(workspace.settingsFields("settings")).toBe(workspace.settingsFields("settings"));
    expect(() => workspace.settingsFields("products")).toThrow(ViewDefinitionError);
  });

  it("a save sends only the section's listed keys", () => {
    expect(workspace.settingsPatch("settings", { website: "https://x.example", public: true, name: "Sneaky", id: "b2" })).toEqual({
      website: "https://x.example",
      public: true,
    });
    expect(workspace.settingsPatch("settings", { public: false })).toEqual({ public: false });
  });

  it("resolves readiness tones, chip tones only", () => {
    expect(workspace.readinessFor(row)).toEqual([
      { key: "website", title: "Has a website", ok: false, reason: "Add the website.", tone: "warning" },
      { key: "1:Has a name", title: "Has a name", ok: true, tone: "success" },
      { key: "2:Is public", title: "Is public", ok: false, tone: "danger" },
    ]);
    const odd = defineWorkspace(brandsView, {
      sections: [{ id: "a", label: "A" }],
      readiness: () => [{ title: "Odd", ok: true, tone: "purple" as never }],
    });
    // A bad tone falls back to a neutral one, with a development warning.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(odd.readinessFor(row)[0]!.tone).toBe("muted");
    expect(warn.mock.calls[0]![0]).toMatch(/isn't a chip tone/);
    warn.mockRestore();
    expect(workspace.readinessSummary(row)).toEqual({ state: "problems", count: 1 });
    expect(workspace.readinessSummary({ ...row, public: true })).toEqual({ state: "warnings", count: 1 });
    expect(workspace.readinessSummary({ ...row, public: true, website: "https://x.example" })).toEqual({ state: "ready", count: 0 });
    expect(defineWorkspace(brandsView, { sections: [{ id: "a", label: "A" }] }).readinessFor(row)).toEqual([]);
    expect(defineWorkspace(brandsView, { sections: [{ id: "a", label: "A" }] }).readinessSummary(row)).toBeNull();
  });
});

describe("defineWorkspace review fixes", () => {
  it("freezes the sections and each settings list", () => {
    expect(Object.isFrozen(workspace.sections)).toBe(true);
    const settings = workspace.section("settings");
    expect(settings?.kind === "settings" && Object.isFrozen(settings.settings)).toBe(true);
    expect(Object.isFrozen(workspace.headerActions)).toBe(true);
  });

  it("locks settings when the view refuses update, with the reason", () => {
    const locked = defineWorkspace(defineView(brands, { can: { update: (b) => (b.is_default ? "Locked." : true) } }), {
      sections: [{ id: "s", label: "S", settings: ["name"] }],
    });
    expect(locked.settingsLocked(row)).toBe("Locked.");
    expect(locked.settingsLocked({ ...row, is_default: false })).toBeNull();
    const silent = defineWorkspace(defineView(brands, { can: { update: () => "" } }), { sections: [{ id: "s", label: "S", settings: ["name"] }] });
    expect(silent.settingsLocked(row)).toBe("This isn't allowed.");
  });

  it("addresses the record by its key fields", () => {
    expect(workspace.recordId(row)).toBe("b1");
    const pairs = defineResource<{ a: string; b: string; name: string }>()({
      name: "public.pairs",
      key: ["a", "b"],
      fields: [
        { name: "a", type: "string" },
        { name: "b", type: "string" },
        { name: "name", type: "string" },
      ],
    });
    const ws = defineWorkspace(defineView(pairs), { sections: [{ id: "s", label: "S", settings: ["name"] }] });
    expect(ws.recordId({ a: "x", b: "y", name: "n" })).toBe('["x","y"]');
  });

  it("narrows header actions by the screen's can and by the provider", () => {
    const all = defineWorkspace(brandsView, { sections: [{ id: "a", label: "A" }] });
    const free = { ...row, is_default: false };
    expect(all.headerFor(free, { can: (name) => (name === "duplicate" ? false : true) }).actions.map((a) => a.name)).toEqual(["archive"]);
    expect(all.headerFor(free, { can: (name) => (name === "archive" ? "Not today." : true) }).actions[0]!.allowed).toBe("Not today.");
    // The screen can't widen: the view's refusal stays.
    expect(all.headerFor(row, { can: () => true }).actions[0]!.allowed).toBe("The default brand stays.");
    expect(all.headerFor(free, { runnable: false }).actions).toEqual([]);
    expect(all.headerFor(free, { served: ["duplicate"] }).actions.map((a) => a.name)).toEqual(["duplicate"]);
  });

  it("refuses an empty list filter, or one without single values, in development", () => {
    const bad = defineWorkspace(brandsView, {
      sections: [
        { id: "all", label: "All", list: { view: productsView, filter: () => ({}) } },
        { id: "odd", label: "Odd", list: { view: productsView, filter: () => ({ brand_id: ["b1"] as never }) } },
      ],
    });
    expect(() => bad.listFilter("all", row)).toThrow(/gave no keys, which would list every row/);
    expect(() => bad.listFilter("odd", row)).toThrow(/"brand_id" no single value/);
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(bad.listFilter("all", row)).toEqual({});
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});

describe("defineWorkspace checks", () => {
  const problemsOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(ViewDefinitionError);
      return (error as ViewDefinitionError).problems.join("\n");
    }
    throw new Error("expected a ViewDefinitionError");
  };

  it("settings must be writable on edit", () => {
    const problems = problemsOf(() =>
      defineWorkspace(brandsView, {
        sections: [{ id: "s", label: "S", settings: ["updated_at", "id", "colour" as never, "name", "name"] }],
      }),
    );
    expect(problems).toContain('sections.s.settings names "updated_at", which the view can\'t write on edit');
    expect(problems).toContain('sections.s.settings names "id"');
    expect(problems).toContain('sections.s.settings names "colour"');
    expect(problems).toContain('settings lists "name" twice');
  });

  it("settings can't be JSON, lists, links or sensitive fields, even when the form lists them", () => {
    const richView = defineView(rich, { form: ["name", "meta", "tags", "owner_id", "secret"] });
    const problems = problemsOf(() =>
      defineWorkspace(richView, { sections: [{ id: "s", label: "S", settings: ["name", "meta", "tags", "owner_id", "secret"] }] }),
    );
    expect(problems).toContain('"meta", which is JSON');
    expect(problems).toContain('"tags", which is a list');
    expect(problems).toContain('"owner_id", which is a link');
    expect(problems).toContain('"secret", which is sensitive');
    expect(problems).not.toContain('"name"');
  });

  it("rejects keys a section doesn't have", () => {
    expect(problemsOf(() => defineWorkspace(brandsView, { sections: [{ id: "s", label: "S", setting: ["name"] } as never] }))).toContain(
      'sections.s has "setting", which isn\'t a section key',
    );
  });

  it("header actions must be view actions", () => {
    expect(
      problemsOf(() => defineWorkspace(brandsView, { header: { actions: ["explode", "archive", "archive"] }, sections: [{ id: "a", label: "A" }] })),
    ).toMatch(/header.actions names "explode", which isn't a view action[\s\S]*header.actions lists "archive" twice/);
  });

  it("section ids are unique, and each has a label", () => {
    const problems = problemsOf(() =>
      defineWorkspace(brandsView, {
        sections: [
          { id: "a", label: "A" },
          { id: "a", label: "Again" },
          { id: "", label: "Nameless" },
          { id: "b", label: " " },
        ],
      }),
    );
    expect(problems).toContain('sections lists "a" twice');
    expect(problems).toContain("sections[2] has no id");
    expect(problems).toContain("sections.b has no label");
  });

  it("sections don't nest", () => {
    const inner = defineWorkspace(productsView, { sections: [{ id: "x", label: "X" }] });
    const problems = problemsOf(() =>
      defineWorkspace(brandsView, {
        sections: [
          { id: "a", label: "A", list: { view: inner as never, filter: () => ({}) } },
          { id: "b", label: "B", sections: [] } as never,
          { id: "c", label: "C", workspace: inner } as never,
          inner as never,
        ],
      }),
    );
    expect(problems).toContain("sections.a.list.view is a workspace; sections don't nest");
    expect(problems).toContain("sections.b holds a workspace; sections don't nest");
    expect(problems).toContain("sections.c holds a workspace; sections don't nest");
    expect(problems).toContain("sections[3] has no id");
  });

  it("a section is a list, settings or a slot, never two", () => {
    const problems = problemsOf(() =>
      defineWorkspace(brandsView, {
        sections: [
          { id: "a", label: "A", list: { view: productsView, filter: () => ({}) }, settings: ["name"] } as never,
          { id: "b", label: "B", list: { view: {} as never, filter: "x" as never } },
          { id: "c", label: "C", settings: [] },
        ],
      }),
    );
    expect(problems).toContain("sections.a has both list and settings; a section has one");
    expect(problems).toContain("sections.b.list.view isn't a view");
    expect(problems).toContain("sections.b.list.filter isn't a function");
    expect(problems).toContain("sections.c.settings lists no fields");
  });

  it("needs sections", () => {
    expect(problemsOf(() => defineWorkspace(brandsView, { sections: [] }))).toContain("sections is empty");
    expect(problemsOf(() => defineWorkspace(brandsView, {} as never))).toContain("sections isn't a list");
  });
});


describe("defineWorkspace with viewer-aware guards", () => {
  type Who = { teamRoles?: readonly string[] };
  const isEditor = (v: { roles?: object }) => ((v.roles as Who | undefined)?.teamRoles ?? []).includes("editor");
  const view = defineView(brands, {
    can: { update: (_b, v) => (isEditor(v) ? true : "Only editors change settings.") },
    actions: [{ name: "publish", label: "Publish", can: (_b, v) => (v.id ? true : "Sign in to publish.") }],
  });
  const workspace = defineWorkspace(view, { sections: [{ id: "settings", label: "Settings", settings: ["name"] }] });
  const brand: Brand = { id: "b1", name: "North", website: null, is_default: false, public: true, updated_at: "2026-01-01T00:00:00Z" };
  const ann = { id: "ann", scope: {}, roles: { teamRoles: ["editor"] } as never };
  const bob = { id: "bob", scope: {}, roles: { teamRoles: ["reader"] } as never };

  it("locks settings for one viewer and not another, and for no viewer", () => {
    expect(workspace.settingsLocked(brand, bob)).toBe("Only editors change settings.");
    expect(workspace.settingsLocked(brand, ann)).toBeNull();
    expect(workspace.settingsLocked(brand)).toBe("Only editors change settings.");
  });

  it("asks header action guards with the viewer", () => {
    expect(workspace.headerFor(brand, { viewer: bob }).actions[0]!.allowed).toBe(true);
    expect(workspace.headerFor(brand).actions[0]!.allowed).toBe("Sign in to publish.");
  });
});
