/**
 * defineWorkspace: one record's screen from a view. Checked once and frozen; the helpers give
 * every platform the same header, settings and readiness.
 */
import { describe, expect, it } from "vitest";

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
    { title: "Has a website", ok: !!b.website, reason: "Add the website." },
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
      { title: "Has a website", ok: false, reason: "Add the website.", tone: "warning" },
      { title: "Has a name", ok: true, tone: "success" },
      { title: "Is public", ok: false, tone: "danger" },
    ]);
    const odd = defineWorkspace(brandsView, {
      sections: [{ id: "a", label: "A" }],
      readiness: () => [{ title: "Odd", ok: true, tone: "purple" as never }],
    });
    expect(() => odd.readinessFor(row)).toThrow(/isn't a chip tone/);
    expect(defineWorkspace(brandsView, { sections: [{ id: "a", label: "A" }] }).readinessFor(row)).toEqual([]);
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
