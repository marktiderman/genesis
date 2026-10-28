/**
 * defineView: a contract plus what it means to people. Names are checked once, defaults come from
 * the contract, and the result is frozen, so every platform draws the same view.
 */
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { csvField, exportCsv } from "../csv";
import { defineView, deriveDisplay, initialsOf, rowPicture, scopeValues, valueText, ViewDefinitionError, type ViewField } from "../resource-view";
import { defineResource, type ResourceContract } from "../schema/types";
import { isSafeUrl } from "../urls";

type BrandRow = {
  id: string;
  practice_id: string;
  name: string;
  status: "active" | "archived";
  is_default: boolean;
  website: string | null;
  notes: string | null;
  launched_on: string | null;
  updated_at: string;
  score: number;
};

const brands = {
  name: "public.brands",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "practice_id", type: "string", references: { resource: "public.practices", field: "id" } },
    { name: "name", type: "string", label: "Brand name" },
    { name: "status", type: "string", enumValues: ["active", "archived"], hasDefault: true },
    { name: "is_default", type: "boolean", hasDefault: true },
    { name: "website", type: "string", widget: "url", nullable: true },
    { name: "notes", type: "string", nullable: true, sensitive: true },
    { name: "launched_on", type: "datetime", dbType: "date", nullable: true },
    { name: "updated_at", type: "datetime", hasDefault: true, readOnly: true },
    { name: "score", type: "number", generated: true },
  ],
} as const satisfies ResourceContract<BrandRow>;

const row: BrandRow = {
  id: "b1",
  practice_id: "p1",
  name: "Northwind",
  status: "active",
  is_default: true,
  website: "https://example.com",
  notes: "private",
  launched_on: "2026-01-02",
  updated_at: "2026-01-02T00:00:00Z",
  score: 4,
};

describe("a field's clock", () => {
  it("is closed: a bare word (the removed \"practice\") is a type error", () => {
    // @ts-expect-error "practice" was renamed "scope" in genesis-core 2
    const removed: ViewField["timeZone"] = "practice";
    const kept: ViewField["timeZone"][] = ["viewer", "scope", "UTC", "Europe/Berlin"];
    expect([removed, ...kept]).toHaveLength(5);
  });

  it("refuses \"practice\" and a zone the runtime doesn't know when the view loads, never falling back", () => {
    const renamed = () => defineView(brands, { fields: { name: { timeZone: "practice" as never } } });
    expect(renamed).toThrow(ViewDefinitionError);
    expect(renamed).toThrow(/timeZone "practice" was renamed "scope".*genesis codemod genesis-core-2-scope-names/);
    expect(() => defineView(brands, { fields: { name: { timeZone: "Mars/Olympus" } } })).toThrow(/timeZone "Mars\/Olympus" isn't "viewer", "scope" or a time zone/);
    for (const zone of ["viewer", "scope", "UTC", "Europe/Berlin"] as const) {
      expect(() => defineView(brands, { fields: { name: { timeZone: zone } } })).not.toThrow();
    }
  });
});

describe("defineView defaults", () => {
  const view = defineView<typeof brands, BrandRow>(brands);

  it("names the resource from the contract", () => {
    expect(view.resource).toBe("public.brands");
    expect(view.noun).toBe("brand");
    expect(view.nounPlural).toBe("brands");
    expect(view.title).toBe("Brands");
    expect(view.labelField).toBe("name");
  });

  it("derives labels and display hints", () => {
    expect(view.label("name")).toBe("Brand name");
    expect(view.label("launched_on")).toBe("Launched On");
    expect(view.display("status")).toBe("badge");
    expect(view.display("practice_id")).toBe("relation");
    expect(view.display("website")).toBe("url");
    expect(view.display("launched_on")).toBe("date");
    expect(view.display("updated_at")).toBe("datetime");
    expect(view.display("is_default")).toBe("boolean");
    expect(deriveDisplay({ name: "x", type: "json" })).toBe("json");
  });

  it("leaves the key and sensitive fields out of the default columns", () => {
    const keys = view.columns().map((c) => c.key);
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("notes");
    expect(keys).toContain("name");
    expect(view.columns().find((c) => c.key === "name")!.value(row)).toBe("Northwind");
  });

  it("builds a form of writable fields only", () => {
    const create = view.form("create").map((f) => f.field.name);
    expect(create).not.toContain("id");
    expect(create).not.toContain("score");
    expect(create).not.toContain("updated_at");
    expect(create).not.toContain("notes");
    expect(view.form("create").find((f) => f.field.name === "name")!.required).toBe(true);
    expect(view.form("create").find((f) => f.field.name === "status")!.required).toBe(false);
    expect(view.form("edit").find((f) => f.field.name === "status")!.required).toBe(true);
  });

  it("summarises a row by its label field", () => {
    expect(view.summary(row)).toEqual({ title: "Northwind" });
    expect(view.summary({ ...row, name: "" }).title).toBe("Brand");
  });

  it("allows everything when the view has no guards", () => {
    expect(view.can("create")).toBe(true);
    expect(view.can("delete", row)).toBe(true);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.columns())).toBe(true);
    expect(view.columns()).toBe(view.columns());
  });
});

describe("labels", () => {
  const view = defineView<typeof brands, BrandRow>(brands, {
    fields: { status: { labels: { active: "Published" }, tones: { active: "success" } } },
    form: ["name", "status"],
  });

  it("says a value in the view's words, else in title case", () => {
    expect(view.valueLabel("status", "active")).toBe("Published");
    expect(view.valueLabel("status", "archived")).toBe("Archived");
    expect(view.valueLabel("name", "on_hold")).toBe("On Hold");
    expect(valueText({ draft: "In progress" }, "draft")).toBe("In progress");
    // Own keys only: an inherited name is never a label.
    expect(valueText({}, "constructor")).toBe("Constructor");
  });

  it("carries labels to columns and choices to the form, frozen", () => {
    const status = view.columns().find((c) => c.key === "status")!;
    expect(status.labels).toEqual({ active: "Published" });
    const field = view.form("create").find((f) => f.field.name === "status")!;
    expect(field.options).toEqual([
      { value: "active", label: "Published" },
      { value: "archived", label: "Archived" },
    ]);
    expect(Object.isFrozen(field.options)).toBe(true);
    expect(Object.isFrozen(view.definition.fields!.status!.labels)).toBe(true);
    expect(view.form("create").find((f) => f.field.name === "name")!.options).toBeUndefined();
  });

  it("copies labels, so changing the object passed in changes nothing", () => {
    const labels: Record<string, string> = { active: "Live" };
    const copy = defineView<typeof brands, BrandRow>(brands, { fields: { status: { labels } } });
    labels["active"] = "Changed";
    expect(copy.valueLabel("status", "active")).toBe("Live");
  });

  it("refuses a label for a value the field doesn't have, or one that isn't text", () => {
    expect(() => defineView<typeof brands, BrandRow>(brands, { fields: { status: { labels: { paused: "Paused" } } } })).toThrow(
      /labels names "paused", which isn't one of its values/,
    );
    expect(() =>
      defineView<typeof brands, BrandRow>(brands, { fields: { status: { labels: { active: "" } } } }),
    ).toThrow(/labels\.active isn't text/);
    expect(() =>
      defineView<typeof brands, BrandRow>(brands, { fields: { status: { labels: ["Live"] as never } } }),
    ).toThrow(/isn't a map of values to words/);
  });
});

describe("defineView labelField", () => {
  it("carries a link's labelField to its column and form field", () => {
    const notes = defineResource<{ id: string; body: string; owner_id: string }>()({
      name: "notes",
      key: "id",
      fields: [
        { name: "id", type: "string", hasDefault: true },
        { name: "body", type: "string" },
        { name: "owner_id", type: "string", references: { resource: "people", field: "id" } },
      ],
    });
    const view = defineView(notes, { fields: { owner_id: { labelField: "display_name", missingLabel: "Someone" } }, form: ["body", "owner_id"], columns: { default: ["body", "owner_id"] } });
    expect(view.columns().find((c) => c.key === "owner_id")!.labelField).toBe("display_name");
    expect(view.form("edit").find((f) => f.field.name === "owner_id")!.labelField).toBe("display_name");
    expect(view.columns().find((c) => c.key === "owner_id")!.missingLabel).toBe("Someone");
    expect(view.form("edit").find((f) => f.field.name === "owner_id")!.missingLabel).toBe("Someone");
  });

  it("refuses one on a field that isn't a link, or one that isn't a field name", () => {
    expect(() => defineView<typeof brands, BrandRow>(brands, { fields: { name: { labelField: "title" } } })).toThrow(
      /fields\.name\.labelField is set, but "name" isn't a link/,
    );
    expect(() =>
      defineView<typeof brands, BrandRow>(brands, { fields: { practice_id: { labelField: "name,secret" } } }),
    ).toThrow(/fields\.practice_id\.labelField isn't a field name/);
    expect(() => defineView<typeof brands, BrandRow>(brands, { fields: { name: { missingLabel: "Hidden" } } })).toThrow(
      /fields\.name\.missingLabel is set, but "name" isn't a link/,
    );
    expect(() => defineView<typeof brands, BrandRow>(brands, { fields: { practice_id: { missingLabel: " " } } })).toThrow(
      /fields\.practice_id\.missingLabel isn't text/,
    );
  });
});

describe("defineView settings", () => {
  const view = defineView<typeof brands, BrandRow>(brands, {
    copy: { noun: "label", title: "Labels" },
    scope: ["practice_id"],
    fields: {
      status: { tones: { active: "success", archived: "muted" } },
      name: { max: 120, label: "Name" },
      website: { visible: (v) => v["status"] === "active" },
    },
    columns: {
      default: ["name", "status", { key: "initial", label: "Initial", value: (r) => r.name[0] }],
      compact: ["name"],
    },
    presets: { archived: { label: "Archived", columns: "compact", filter: { status: "archived" } } },
    form: ["name", { section: "web", fields: ["website", "status", "updated_at"] }],
    can: { delete: (r) => (r.is_default ? "The default label stays." : true) },
    summary: (r) => ({ title: r.name, chips: [{ label: r.status, tone: "success" }] }),
  });

  it("uses the view's words", () => {
    expect(view.noun).toBe("label");
    expect(view.nounPlural).toBe("labels");
    expect(view.title).toBe("Labels");
    expect(view.label("name")).toBe("Name");
  });

  it("resolves presets, computed columns and tones", () => {
    expect(view.presets).toEqual(["default", "compact"]);
    expect(view.columns("compact").map((c) => c.key)).toEqual(["name"]);
    const [, status, initial] = view.columns();
    expect(status!.tones).toEqual({ active: "success", archived: "muted" });
    expect(initial!.value(row)).toBe("N");
    expect(initial!.field).toBeUndefined();
    expect(() => view.columns("wide")).toThrow(ViewDefinitionError);
  });

  it("lays out the form in sections, keeping read-only fields out of writes", () => {
    const form = view.form("create");
    expect(form.map((f) => [f.field.name, f.section])).toEqual([
      ["name", null],
      ["website", "web"],
      ["status", "web"],
      ["updated_at", "web"],
    ]);
    expect(form[1]!.sectionTitle).toBe("Web");
    expect(form[0]!.max).toBe(120);
    expect(form[1]!.visible!({ status: "archived" })).toBe(false);
    expect(form[3]!.readOnly).toBe(true);
    expect(view.writable("create")).toEqual(["name", "website", "status"]);
  });

  it("guards narrow with a reason", () => {
    expect(view.can("delete", row)).toBe("The default label stays.");
    expect(view.can("delete", { ...row, is_default: false })).toBe(true);
    expect(view.can("update", row)).toBe(true);
    expect(view.summary(row).chips).toHaveLength(1);
  });
});

describe("defineView checks names", () => {
  it("throws on a field, column, form entry or preset the contract doesn't have", () => {
    const bad = () =>
      defineView(brands, {
        fields: { nope: { label: "x" } } as never,
        columns: { default: ["name", "name", "missing" as never] },
        form: ["name", "name"],
        presets: { x: { columns: "wide" } },
        groupBy: "gone" as never,
      });
    expect(bad).toThrow(ViewDefinitionError);
    try {
      bad();
    } catch (error) {
      const problems = (error as ViewDefinitionError).problems.join("\n");
      expect(problems).toContain('fields names "nope"');
      expect(problems).toContain('columns.default lists "name" twice');
      expect(problems).toContain('columns.default names "missing"');
      expect(problems).toContain('form lists "name" twice');
      expect(problems).toContain('presets.x uses columns "wide"');
      expect(problems).toContain('groupBy names "gone"');
    }
  });

  it("rejects a computed column that shadows a field", () => {
    expect(() => defineView(brands, { columns: { default: [{ key: "name", label: "N", value: () => 1 }] } })).toThrow(
      /clashes with a field/,
    );
  });

  it("reads the row type a generated contract carries", () => {
    const typed = defineResource<BrandRow>()({ name: "public.brands", key: "id", labelField: "name", fields: brands.fields });
    const view = defineView(typed, { can: { delete: (r) => (r.is_default ? "kept" : true) } });
    expectTypeOf(view.summary).parameter(0).toEqualTypeOf<BrandRow>();
    expect(view.can("delete", row)).toBe("kept");
  });

  it("types field names from the contract", () => {
    expectTypeOf<Parameters<typeof defineView<typeof brands>>[1]>().not.toBeAny();
    // @ts-expect-error: not a field of brands
    const wrong = () => defineView(brands, { groupBy: "colour" });
    expect(wrong).toThrow(ViewDefinitionError);
  });
});

describe("defineView review fixes", () => {
  it("leaves out fields the user can't read, and locks ones they can't update", () => {
    const c = {
      name: "notes",
      key: "id",
      fields: [
        { name: "id", type: "string", hasDefault: true },
        { name: "body", type: "string" },
        { name: "payout", type: "number", permissions: { read: false, update: false } },
        { name: "status", type: "string", permissions: { read: true, update: false } },
      ],
    } as const satisfies ResourceContract;
    const v = defineView(c, { columns: { default: ["body", "payout", "status"] }, form: ["body", "payout", "status"] });
    expect(v.columns().map((x) => x.key)).toEqual(["body", "status"]);
    expect(v.form("edit").map((f) => f.field.name)).toEqual(["body", "status"]);
    expect(v.writable("edit")).toEqual(["body"]);
  });

  it("keeps links, scope and JSON out of defaults, keeps a typed key, and never sends a server-filled key", () => {
    const c = {
      name: "codes",
      key: "code",
      fields: [
        { name: "code", type: "string" },
        { name: "owner_id", type: "string", references: { resource: "users", field: "id" } },
        { name: "meta", type: "json", nullable: true },
        { name: "note", type: "string", optional: true },
      ],
    } as const satisfies ResourceContract;
    const v = defineView(c);
    expect(v.columns().map((x) => x.key)).toEqual(["meta", "note"]);
    expect(v.writable("create")).toEqual(["code", "note"]);
    expect(v.writable("edit")).toEqual(["note"]);
    expect(v.form("create").find((f) => f.field.name === "note")!.required).toBe(false);
    const listed = defineView<typeof brands, BrandRow>(brands, { form: ["id", "name"] });
    expect(listed.writable("create")).toEqual(["name"]);
  });

  it("keeps a link named in the form read-only until there's a picker", () => {
    const c = {
      name: "notes",
      key: "id",
      fields: [
        { name: "id", type: "string", hasDefault: true },
        { name: "body", type: "string" },
        { name: "owner_id", type: "string", references: { resource: "users", field: "id" } },
      ],
    } as const satisfies ResourceContract;
    const v = defineView(c, { form: ["body", "owner_id"], columns: { default: ["body", "owner_id"] } });
    expect(v.form("create").find((f) => f.field.name === "owner_id")!.readOnly).toBe(true);
    expect(v.writable("create")).toEqual(["body"]);
  });

  it("guesses common singulars", () => {
    const guess = (name: string) => defineView({ name, key: "id", fields: [{ name: "id", type: "string" }] }).noun;
    expect(["statuses", "series", "addresses", "boxes", "movies", "categories", "classes", "tasks", "people", "work_items"].map(guess)).toEqual([
      "status", "series", "address", "box", "movie", "category", "class", "task", "person", "work item",
    ]);
  });

  it("is deeply frozen: changing what was passed in changes nothing", () => {
    const def = { columns: { default: ["name"] as string[] } };
    const v = defineView<typeof brands, BrandRow>(brands, def as never);
    def.columns.default.push("nope");
    expect(v.columns().map((c) => c.key)).toEqual(["name"]);
    expect(Object.isFrozen(v.definition.columns!.default)).toBe(true);
    expect(Object.isFrozen(v.form("create"))).toBe(true);
    expect(v.form("create")).toBe(v.form("create"));
  });

  it("never resolves a preset from Object.prototype", () => {
    expect(() => defineView(brands, { presets: { x: { columns: "toString" } } })).toThrow(ViewDefinitionError);
    expect(() => defineView(brands).columns("toString")).toThrow(ViewDefinitionError);
  });
});

describe("helpers moved into core", () => {
  it("isSafeUrl accepts http(s), mailto, tel and relative links only", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("/lessons/1")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeUrl("//evil.example")).toBe(false);
  });

  it("exportCsv passes the search's fields and an explicit select to the provider", async () => {
    const calls: unknown[] = [];
    const provider = {
      getList: async (_r: string, params: unknown) => {
        calls.push(params);
        return { data: [{ name: "a" }], total: 1 };
      },
    } as never;
    await exportCsv({ provider, resource: "brands", fields: [{ name: "name", type: "string" }], sorts: [], filters: [], search: "a", searchFields: ["name"], select: "name" });
    expect(calls[0]).toMatchObject({ search: { query: "a", fields: ["name"] }, select: "name" });
  });

  it("csvField neutralises formulas, including after leading spaces", () => {
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("  =HYPERLINK(1)")).toBe("'  =HYPERLINK(1)");
    expect(csvField("\t@x")).toBe("'\t@x");
    expect(csvField("-5")).toBe("-5");
    expect(csvField("plain")).toBe("plain");
  });
});

describe("defineView actions", () => {
  const view = defineView<typeof brands, BrandRow>(brands, {
    actions: [
      { name: "archive", label: "Archive", confirm: "Archive this brand?", can: (r) => (r.is_default ? "The default brand stays." : true) },
      { name: "duplicate", label: "Duplicate", description: "Copies the brand." },
    ],
  });

  it("lists actions in order, frozen, without their guards", () => {
    expect(view.actions()).toEqual([
      { name: "archive", label: "Archive", confirm: "Archive this brand?" },
      { name: "duplicate", label: "Duplicate", description: "Copies the brand." },
    ]);
    expect(Object.isFrozen(view.actions())).toBe(true);
    expect(Object.isFrozen(view.actions()[0])).toBe(true);
    expect(view.actions()).toBe(view.actions());
  });

  it("guards narrow with a reason; an unguarded action is allowed", () => {
    expect(view.canAction("archive", row)).toBe("The default brand stays.");
    expect(view.canAction("archive", { ...row, is_default: false })).toBe(true);
    expect(view.canAction("duplicate", row)).toBe(true);
  });

  it("throws for an action the view doesn't define", () => {
    expect(() => view.canAction("explode", row)).toThrow(ViewDefinitionError);
  });

  it("copies the actions, so changing the list passed in changes nothing", () => {
    const list = [{ name: "a", label: "A" }];
    const v = defineView(brands, { actions: list });
    list[0]!.label = "Changed";
    list.push({ name: "b", label: "B" });
    expect(v.actions()).toEqual([{ name: "a", label: "A" }]);
    expect(Object.isFrozen(v.definition.actions)).toBe(true);
  });

  it("has no actions by default", () => {
    expect(defineView(brands).actions()).toEqual([]);
  });

  it("throws on duplicate names and bad input", () => {
    const bad = () =>
      defineView(brands, {
        actions: [
          { name: "archive", label: "Archive" },
          { name: "archive", label: "Again" },
          { name: "", label: "Nameless" },
          { name: "x", label: "  " },
          { name: "y", label: "Y", can: "no" as never, confirm: 1 as never, description: false as never },
          null as never,
        ],
      });
    expect(bad).toThrow(ViewDefinitionError);
    try {
      bad();
    } catch (error) {
      const problems = (error as ViewDefinitionError).problems.join("\n");
      expect(problems).toContain('actions lists "archive" twice');
      expect(problems).toContain("actions[2] has no name");
      expect(problems).toContain("actions[3] has no label");
      expect(problems).toContain("actions[4].can isn't a function");
      expect(problems).toContain("actions[4].confirm isn't text");
      expect(problems).toContain("actions[4].description isn't text");
      expect(problems).toContain("actions[5] isn't an action");
    }
    expect(() => defineView(brands, { actions: {} as never })).toThrow(/actions isn't a list/);
  });

  it("reserves create, update and delete for the view's own operations", () => {
    for (const name of ["create", "update", "delete"]) {
      expect(() => defineView(brands, { actions: [{ name, label: "X" }] })).toThrow(
        new RegExp(`actions\\[0\\] is named "${name}", which is reserved`),
      );
    }
    expect(() => defineView(brands, { actions: [{ name: "deleteForever", label: "X" }] })).not.toThrow();
  });

  it("types the guard's row from the contract", () => {
    const typed = defineResource<BrandRow>()({ name: "public.brands", key: "id", labelField: "name", fields: brands.fields });
    const v = defineView(typed, { actions: [{ name: "a", label: "A", can: (r) => (r.is_default ? "no" : true) }] });
    expectTypeOf(v.canAction).parameter(1).toEqualTypeOf<BrandRow>();
  });
});

describe("rowPicture", () => {
  it("is null without an image", () => {
    expect(rowPicture({ title: "Ada" })).toBeNull();
  });

  it("draws a safe src, decorative by default, with initials for a failed load", () => {
    expect(rowPicture({ title: "Ada", image: { src: " https://example.com/a.png ", name: "Ada Lovelace" } })).toEqual({
      kind: "image",
      src: "https://example.com/a.png",
      alt: "",
      fallback: "AL",
    });
    expect(rowPicture({ title: "Ada", image: { src: "/avatars/a.png", alt: "Ada at her desk" } })).toEqual({
      kind: "image",
      src: "/avatars/a.png",
      alt: "Ada at her desk",
      fallback: "",
    });
  });

  it("shows initials when src is unsafe or missing", () => {
    expect(rowPicture({ title: "x", image: { src: "javascript:alert(1)", name: "Ada Lovelace" } })).toEqual({ kind: "initials", text: "AL" });
    expect(rowPicture({ title: "x", image: { src: "data:image/png;base64,AAAA", name: "cher" } })).toEqual({ kind: "initials", text: "C" });
    expect(rowPicture({ title: "x", image: { name: "Grace Brewster Hopper" } })).toEqual({ kind: "initials", text: "GH" });
  });

  it("is null with neither a safe src nor a name", () => {
    expect(rowPicture({ title: "x", image: { src: "//evil.example/a.png" } })).toBeNull();
    expect(rowPicture({ title: "x", image: { name: "   " } })).toBeNull();
  });

  it("takes letters only, as whole characters", () => {
    expect(initialsOf("Ana-María López")).toBe("AL");
    expect(initialsOf("李 小龙")).toBe("李小");
    expect(initialsOf("\u00e9mile zola")).toBe("\u00c9Z");
    expect(initialsOf("😊 Jones")).toBe("J");
    expect(initialsOf("(Ada) 2nd Lovelace")).toBe("AL");
    expect(initialsOf("straße")).toBe("S");
    expect(initialsOf("ß")).toBe("ß");
    expect(initialsOf(undefined)).toBe("");
  });

  it("gives no initials for a name with no letters", () => {
    for (const name of ["", "  ", "🎉🎉", "🎉 🎉", "42", "- —"]) {
      expect(initialsOf(name)).toBe("");
      expect(rowPicture({ title: "x", image: { name } })).toBeNull();
    }
    expect(rowPicture({ title: "x", image: { src: "https://example.com/a.png", name: "🎉🎉" } })).toMatchObject({ kind: "image", fallback: "" });
  });
});

describe("scopeValues", () => {
  const scoped = defineView(brands, { scope: ["practice_id"] });

  it("reads the view's scope keys from the viewer's scope, as a filter", () => {
    expect(scopeValues(scoped, { practice_id: "p1", personId: "x" })).toEqual({ practice_id: "p1" });
    expect(scopeValues(scoped, { practiceId: "p2" })).toEqual({ practice_id: "p2" });
    expect(scopeValues(scoped, { practice_id: null })).toEqual({ practice_id: null });
    expect(Object.isFrozen(scopeValues(scoped, { practiceId: "p2" }))).toBe(true);
    expect(scopeValues(defineView(brands), {})).toEqual({});
  });

  it("throws in development when a declared key has no single value", () => {
    expect(() => scopeValues(scoped, {})).toThrow(/scope "practice_id" has no single value/);
    expect(() => scopeValues(scoped, null)).toThrow(ViewDefinitionError);
    expect(() => scopeValues(scoped, { practice_id: ["p1", "p2"] })).toThrow(ViewDefinitionError);
  });

  it("leaves a missing key out in production", () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(scopeValues(scoped, {})).toEqual({});
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});

describe("review fixes: actions and pictures", () => {
  it("only true allows an action; false, empty or missing reasons refuse", () => {
    const view = defineView(brands, {
      actions: [
        { name: "a", label: "A", can: () => false as never },
        { name: "b", label: "B", can: () => "  " },
        { name: "c", label: "C", can: () => undefined as never },
        { name: "d", label: "D", can: () => "Not now." },
      ],
    });
    expect(view.canAction("a", row)).toBe("This isn't allowed.");
    expect(view.canAction("b", row)).toBe("This isn't allowed.");
    expect(view.canAction("c", row)).toBe("This isn't allowed.");
    expect(view.canAction("d", row)).toBe("Not now.");
  });

  it("trims action names before checking them", () => {
    expect(() => defineView(brands, { actions: [{ name: "archive", label: "A" }, { name: " archive ", label: "B" }] })).toThrow(
      /actions lists "archive" twice/,
    );
    expect(() => defineView(brands, { actions: [{ name: " delete", label: "A" }] })).toThrow(/reserved/);
    const view = defineView(brands, { actions: [{ name: " archive ", label: "A" }] });
    expect(view.actions()[0]!.name).toBe("archive");
    expect(view.canAction("archive", row)).toBe(true);
  });

  it("marks destructive actions, and checks the flag", () => {
    const view = defineView(brands, { actions: [{ name: "purge", label: "Purge", destructive: true }, { name: "copy", label: "Copy" }] });
    expect(view.actions()).toEqual([
      { name: "purge", label: "Purge", destructive: true },
      { name: "copy", label: "Copy" },
    ]);
    expect(() => defineView(brands, { actions: [{ name: "x", label: "X", destructive: "yes" as never }] })).toThrow(/destructive isn't true or false/);
  });

  it("takes only http(s) and root-relative image sources", () => {
    for (const src of ["mailto:a@example.com", "tel:+15550100", "#logo", "javascript:x", "//cdn.example/a.png"]) {
      expect(rowPicture({ title: "x", image: { src, name: "Ada Lovelace" } })).toEqual({ kind: "initials", text: "AL" });
    }
    expect(rowPicture({ title: "x", image: { src: "HTTPS://example.com/a.png" } })).toMatchObject({ kind: "image" });
    expect(rowPicture({ title: "x", image: { src: "/a.png" } })).toMatchObject({ kind: "image", fallback: "" });
  });

  it("initials skip punctuation", () => {
    expect(initialsOf("Ada (Admin)")).toBe("AA");
    expect(initialsOf("\"Bo\" O'Neil!")).toBe("BO");
  });

  it("initials work without Intl.Segmenter", async () => {
    vi.resetModules();
    const real = Intl.Segmenter;
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    try {
      const { initialsOf: fallback } = await import("../resource-view/picture");
      expect(fallback("Ana-María López")).toBe("AL");
      expect(fallback("Ada (Admin)")).toBe("AA");
      expect(fallback("😊 Jones")).toBe("J");
      expect(fallback("🎉🎉")).toBe("");
    } finally {
      (Intl as { Segmenter?: unknown }).Segmenter = real;
      vi.resetModules();
    }
  });
});
