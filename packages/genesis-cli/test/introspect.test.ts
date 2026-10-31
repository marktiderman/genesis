// @feat:cli-introspect
import postgres from "postgres";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CommentSettingsError,
  emitContracts,
  introspectOpenApi,
  introspectPostgres,
  parseColumnComment,
  parseTableComment,
  type IntrospectedTable,
} from "../src/introspect/index.js";
import { linkOf } from "../src/introspect/postgres.js";

/** Type-check generated source on its own, as a consumer's compiler would. */
function compileErrors(source: string): string[] {
  const file = "resources.genesis.ts";
  const host = ts.createCompilerHost({ strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 });
  const read = host.getSourceFile;
  host.getSourceFile = (name, version) =>
    name === file ? ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true) : read(name, version);
  const program = ts.createProgram([file], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, types: [] }, host);
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

describe("@genesis comment settings", () => {
  it("splits the description from the settings", () => {
    expect(parseTableComment('People in a program. @genesis {"label": "Customers", "labelField": "name"}', "t")).toEqual({
      description: "People in a program.",
      settings: { label: "Customers", labelField: "name" },
    });
    expect(parseColumnComment("Just a note.", "c")).toEqual({ description: "Just a note." });
    expect(parseColumnComment(null, "c")).toEqual({});
  });

  it("refuses malformed or unknown settings, naming where", () => {
    expect(() => parseColumnComment("@genesis {nope", "public.customers.notes")).toThrow(/public\.customers\.notes/);
    expect(() => parseColumnComment('@genesis {"color": "red"}', "c")).toThrow(CommentSettingsError);
    expect(() => parseTableComment('@genesis {"label": 3}', "t")).toThrow(/must be a string/);
    expect(() => parseColumnComment('@genesis {"readonly": "yes"}', "c")).toThrow(/must be a boolean/);
  });

  it("reads the resource facts: noun, readonly and sensitive", () => {
    expect(parseTableComment('@genesis {"labelField": "name", "noun": "category", "nounPlural": "categories"}', "t").settings).toEqual({
      labelField: "name",
      noun: "category",
      nounPlural: "categories",
    });
    expect(parseColumnComment('Set by the server. @genesis {"readonly": true}', "c")).toEqual({
      description: "Set by the server.",
      settings: { readonly: true },
    });
    expect(parseColumnComment('@genesis {"sensitive": true, "label": "Coach notes"}', "c").settings).toEqual({
      sensitive: true,
      label: "Coach notes",
    });
  });
});

describe("view keys and composite links", () => {
  it("reads a key setting, one column or a list, and refuses anything else", () => {
    expect(parseTableComment('Joined. @genesis {"key": "id"}', "t").settings).toEqual({ key: ["id"] });
    expect(parseTableComment('@genesis {"key": ["org_id", "id"]}', "t").settings).toEqual({ key: ["org_id", "id"] });
    expect(() => parseTableComment('@genesis {"key": []}', "t")).toThrow(/column name or a list/);
    expect(() => parseTableComment('@genesis {"key": 1}', "t")).toThrow(/column name or a list/);
    expect(() => parseColumnComment('@genesis {"key": "id"}', "c")).toThrow(/unknown @genesis setting "key"/);
  });

  it("keys a view from its comment over OpenAPI too, and refuses a key that isn't a column", () => {
    const view = (key: string) => ({
      swagger: "2.0",
      definitions: {
        gallery_cards: {
          description: `Galleries with counts. @genesis {"key": "${key}"}`,
          properties: { id: { format: "uuid", type: "string" }, photos: { format: "bigint", type: "integer" } },
        },
      },
    });
    const [cards] = introspectOpenApi(view("id"));
    expect(cards!.key).toEqual(["id"]);
    expect(cards!.description).toBe("Galleries with counts.");
    expect(emitContracts([cards!], { source: "x" })).toContain('  key: "id",');
    expect(() => introspectOpenApi(view("nope"))).toThrow(/key "nope" isn't one of its columns/);
  });

  it("links one column of a composite key when every other column references its namesake", () => {
    expect(linkOf(["gallery_id"], ["id"])).toBe(0);
    expect(linkOf(["gallery_id", "org_id"], ["id", "org_id"])).toBe(0);
    expect(linkOf(["org_id", "gallery_id"], ["org_id", "id"])).toBe(1);
    // Nothing of its own (an extension table), or two of its own: not one row's field.
    expect(linkOf(["id", "org_id"], ["id", "org_id"])).toBe(-1);
    expect(linkOf(["a_id", "b_id"], ["id", "other_id"])).toBe(-1);
  });
});

const OPENAPI = {
  swagger: "2.0",
  definitions: {
    customers: {
      description: 'People in a program. @genesis {"label": "Customers"}',
      required: ["id", "name", "status"],
      properties: {
        id: { format: "uuid", type: "string", default: "gen_random_uuid()", description: "Note:\nThis is a Primary Key.<pk/>" },
        name: { format: "text", type: "string" },
        status: { format: "public.customer_status", type: "string", enum: ["active", "paused"] },
        program_id: {
          format: "integer",
          type: "integer",
          description: 'The program. @genesis {"label": "Program"}\n\nNote:\nThis is a Foreign Key to `programs.id`.<fk table=\'programs\' column=\'id\'/>',
        },
        tags: { type: "array", items: { type: "string", format: "text" } },
        starts_at: { format: "timestamp with time zone", type: "string" },
      },
    },
    programs: { required: ["id"], properties: { id: { format: "integer", type: "integer", description: "Note:\nThis is a Primary Key.<pk/>" } } },
  },
};

describe("introspect from OpenAPI (PostgREST / Supabase)", () => {
  it("reads keys, links, enums, arrays and comment settings", () => {
    const [customers, programs] = introspectOpenApi(OPENAPI);
    expect(customers).toMatchObject({ name: "public.customers", key: ["id"], description: "People in a program.", settings: { label: "Customers" } });
    expect(programs!.key).toEqual(["id"]);
    const col = (n: string) => customers!.columns.find((c) => c.name === n)!;
    expect(col("id")).toMatchObject({ type: "string", dbType: "uuid", hasDefault: true, nullable: false });
    expect(col("id").description).toBeUndefined();
    expect(col("status")).toMatchObject({ enumValues: ["active", "paused"] });
    expect(col("program_id")).toMatchObject({
      type: "number",
      nullable: true,
      references: { resource: "public.programs", field: "id" },
      description: "The program.",
      settings: { label: "Program" },
    });
    expect(col("tags")).toMatchObject({ array: true, dbType: "text[]", type: "string" });
    expect(col("starts_at").type).toBe("datetime");
  });

  it("reads a NOT NULL column with a default as not nullable, since PostgREST lists it as required", () => {
    const [notes] = introspectOpenApi({
      swagger: "2.0",
      definitions: {
        notes: {
          required: ["id", "title"],
          properties: {
            id: { format: "integer", type: "integer", description: "Note:\nThis is a Primary Key.<pk/>" },
            title: { format: "text", type: "string", default: "" },
            memo: { format: "text", type: "string" },
          },
        },
      },
    });
    const col = (n: string) => notes!.columns.find((c) => c.name === n)!;
    expect(col("title")).toMatchObject({ nullable: false, hasDefault: true });
    expect(col("memo")).toMatchObject({ nullable: true, hasDefault: false });
    const out = emitContracts([notes!], { source: "x" });
    expect(out).toContain('name: "title", type: "string", dbType: "text", nullable: false, optional: true, hasDefault: true');
  });

  it("explains a document that isn't PostgREST's", () => {
    expect(() => introspectOpenApi({ openapi: "3.0.0" })).toThrow(/PostgREST/);
  });
});

describe("the emitted contract", () => {
  const tables = introspectOpenApi(OPENAPI);
  const source = emitContracts(tables, { source: "OpenAPI test" });

  it("compiles under strict TypeScript, with row types", () => {
    expect(compileErrors(source)).toEqual([]);
    expect(source).toContain("export type PublicCustomersRow = {");
    expect(source).toContain("export const publicCustomers = defineResource<PublicCustomersRow>()({");
    expect(source).toContain('"public.customers": publicCustomers,');
    expect(source).toContain("export type PublicCustomersField = keyof PublicCustomersRow;");
    expect(source).toContain('  status: "active" | "paused";');
    expect(source).toContain("  program_id: number | null;");
    expect(source).toContain("  tags: string[] | null;");
    expect(source).toContain('label: "Program", description: "The program."');
  });

  it("views get the row type: RowOf<typeof contract> is the row, and labelField is typed", () => {
    const check = `${source}
import type { RowOf } from "@marktiderman/genesis-core";
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const same: Equal<RowOf<typeof publicCustomers>, PublicCustomersRow> = true;
const key: (typeof publicCustomers)["name"] = "public.customers";
void same; void key;
`;
    expect(compileErrors(check)).toEqual([]);
  });

  it("refuses a labelField that isn't a column, and two tables that flatten to one name", () => {
    const one = (name: string, schema: string, table: string): IntrospectedTable => ({
      name, schema, table, key: ["id"],
      columns: [{ name: "id", dbType: "uuid", type: "string", array: false, nullable: false, hasDefault: true, generated: false }],
    });
    expect(() => emitContracts([{ ...one("public.t", "public", "t"), settings: { labelField: "nmae" } }], { source: "x" })).toThrow(
      /public\.t: @genesis labelField "nmae" isn't one of its columns/,
    );
    expect(() => emitContracts([one("public.a_b", "public", "a_b"), one("public_a.b", "public_a", "b")], { source: "x" })).toThrow(
      /public\.a_b and public_a\.b would both be named PublicABRow/,
    );
  });

  it("is the same bytes on a re-run, whatever order the tables came in", () => {
    expect(emitContracts([...tables].reverse(), { source: "OpenAPI test" })).toBe(source);
  });

  it("emits the facts, and a contract that breaks ResourceContract fails to compile", () => {
    const t: IntrospectedTable = {
      name: "public.brands",
      schema: "public",
      table: "brands",
      key: ["id"],
      settings: { labelField: "name", noun: "brand" },
      columns: [
        { name: "id", dbType: "uuid", type: "string", array: false, nullable: false, hasDefault: true, generated: false },
        { name: "name", dbType: "text", type: "string", array: false, nullable: false, hasDefault: false, generated: false },
        {
          name: "status", dbType: "text", type: "string", array: false, nullable: false, hasDefault: true, generated: false,
          settings: { readonly: true },
        },
        {
          name: "notes", dbType: "text", type: "string", array: false, nullable: true, hasDefault: false, generated: false,
          settings: { sensitive: true, widget: "textarea" },
        },
      ],
    };
    const out = emitContracts([t], { source: "x" });
    expect(compileErrors(out)).toEqual([]);
    expect(out).toContain('  noun: "brand",');
    expect(out).toContain("readOnly: true");
    expect(out).toContain('widget: "textarea", sensitive: true');
    const bad = emitContracts(
      [{ ...t, columns: [{ ...t.columns[0]!, settings: { widget: "rainbow" } }, ...t.columns.slice(1)] }],
      { source: "x" },
    );
    expect(compileErrors(bad).join("\n")).toMatch(/rainbow/);
  });

  it("quotes names that aren't identifiers", () => {
    const odd: IntrospectedTable = {
      name: "public.odd table",
      schema: "public",
      table: "odd table",
      key: ["a-b", "c"],
      columns: [
        { name: "a-b", dbType: "text", type: "string", array: false, nullable: false, hasDefault: false, generated: false },
        { name: "c", dbType: "jsonb", type: "json", array: false, nullable: true, hasDefault: false, generated: false },
      ],
    };
    const out = emitContracts([odd], { source: "x" });
    expect(compileErrors(out)).toEqual([]);
    expect(out).toContain('  "a-b": string;');
    expect(out).toContain('key: ["a-b", "c"]');
  });
});

const ADMIN_URL = process.env.GENESIS_TEST_DATABASE_URL ?? process.env.STUDIO_TEST_DATABASE_URL;
const DB = "genesis_cli_introspect_test";

describe.skipIf(!ADMIN_URL)("introspect from Postgres", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    // A database of its own, so this never touches another package's fixtures.
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`drop database if exists ${DB} with (force)`);
      await admin.unsafe(`create database ${DB}`);
    } finally {
      await admin.end();
    }
    const url = new URL(ADMIN_URL!);
    url.pathname = `/${DB}`;
    sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await sql.unsafe(`
      create type public.customer_status as enum ('active', 'paused', 'done');
      create table public.programs (id int primary key, name text not null);
      create table public.customers (
        id uuid primary key default gen_random_uuid(),
        program_id int references public.programs (id),
        name text not null,
        status public.customer_status not null default 'active',
        tags text[],
        score numeric(5, 2),
        starts_on date,
        seq bigint generated always as identity,
        updated_at timestamptz(6) not null default now()
      );
      create table public.owner_customers (owner_id uuid, customer_id uuid references public.customers (id), primary key (owner_id, customer_id));
      comment on table public.customers is 'People in a program. @genesis {"label": "Customer accounts", "labelField": "name"}';
      comment on column public.customers.tags is 'Free-form tags. @genesis {"label": "Tags"}';
      create schema private;
      create table private.hidden (id int primary key, note text not null);
      create table public.goals (
        id uuid primary key default gen_random_uuid(),
        program_id int not null references public.programs (id),
        title text not null,
        status text not null default 'open' check (status in ('open', 'done')),
        stage varchar(8) check (stage is null or stage in ('a', 'b')),
        due_on date
      );
      comment on column public.goals.title is 'What to reach. @genesis {"label": "Goal"}';
      comment on table public.goals is 'Targets. @genesis {"noun": "goal", "label": "All goals", "labelField": "title"}';
      create view public.my_goals with (security_invoker) as
        select * from public.goals where program_id = any (array(select id from public.programs));
      comment on column public.my_goals.due_on is 'When it is due.';
      create view public.goal_titles as select id as goal_id, upper(title) as title, status from public.goals;
      create view public.goal_counts as select status, count(*) as n from public.goals group by status;
      create view public.hidden_view as select * from private.hidden;
      create table public.odd_checks (
        id int primary key,
        x text check (x in ('a', 'b')) check (x in ('c', 'd')),
        y text check (y in ('a', 'b', 'c')) check (y in ('b', 'c', 'z'))
      );
      create table public.pairs (id int primary key, other_id int not null, note text);
      create view public.swapped as select * from public.pairs;
      alter view public.swapped rename column id to tmp;
      alter view public.swapped rename column other_id to id;
      alter view public.swapped rename column tmp to other_id;
      alter view public.swapped rename column note to memo;
      create schema "my.s";
      create table "my.s"."we.ird" (id int primary key, pair_id int references public.pairs (id));
      create table public."a.b" (id int primary key, w int references "my.s"."we.ird" (id));
      create table public.owners (id int primary key, name text not null);
      create table public.pets (id int primary key, owner_id int not null references public.owners (id), name text not null);
      create view public.owner_pets as
        select p.id, p.name from public.owners o left join public.pets p on p.owner_id = o.id;
      create rule owner_pets_update as on update to public.owner_pets
        do instead update public.pets set name = new.name where id = old.id;
      create rule owner_pets_delete as on delete to public.owner_pets
        do instead delete from public.pets where id = old.id;
      create type public.mood as enum ('calm', 'busy', 'away');
      create table public.moods (id int primary key, mood public.mood not null check (mood in ('calm', 'busy')));
      create view public.my_moods as select * from public.moods;
      create table public.orgs (id int primary key);
      create table public.galleries (id int primary key, org_id int not null references public.orgs (id), name text not null, unique (id, org_id));
      create table public.photos (
        id int primary key,
        org_id int not null references public.orgs (id),
        gallery_id int not null,
        foreign key (gallery_id, org_id) references public.galleries (id, org_id)
      );
      create view public.gallery_cards as
        select g.id, g.name, count(p.id) as photos from public.galleries g left join public.photos p on p.gallery_id = g.id group by g.id, g.name;
      comment on view public.gallery_cards is 'Galleries with counts. @genesis {"key": "id"}';
    `);
  });
  afterAll(async () => {
    await sql?.end();
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`drop database if exists ${DB} with (force)`).finally(() => admin.end());
  });

  it("reads tables, keys, types, links and comment settings from the catalog", async () => {
    const tables = await introspectPostgres(sql, ["public"]);
    expect(tables.map((t) => t.name)).toEqual([
      'public."a.b"',
      "public.customers",
      "public.galleries",
      "public.gallery_cards",
      "public.goal_counts",
      "public.goal_titles",
      "public.goals",
      "public.hidden_view",
      "public.moods",
      "public.my_goals",
      "public.my_moods",
      "public.odd_checks",
      "public.orgs",
      "public.owner_customers",
      "public.owner_pets",
      "public.owners",
      "public.pairs",
      "public.pets",
      "public.photos",
      "public.programs",
      "public.swapped",
    ]);
    const customers = tables.find((t) => t.name === "public.customers")!;
    expect(customers).toMatchObject({ key: ["id"], description: "People in a program.", settings: { label: "Customer accounts", labelField: "name" } });
    const col = (n: string) => customers.columns.find((c) => c.name === n)!;
    expect(col("status")).toMatchObject({ dbType: "customer_status", enumValues: ["active", "paused", "done"], hasDefault: true, nullable: false });
    expect(col("program_id").references).toEqual({ resource: "public.programs", field: "id" });
    expect(col("tags")).toMatchObject({ array: true, type: "string", settings: { label: "Tags" }, description: "Free-form tags." });
    expect(col("score")).toMatchObject({ type: "number", dbType: "numeric(5,2)" });
    expect(col("starts_on")).toMatchObject({ type: "datetime", dbType: "date" });
    expect(col("seq")).toMatchObject({ generated: true, hasDefault: true });
    expect(tables.find((t) => t.name === "public.owner_customers")!.key).toEqual(["owner_id", "customer_id"]);
    expect(compileErrors(emitContracts(tables, { source: "Postgres (public)" }))).toEqual([]);
  });

  it("reads the values a CHECK lists as enum values", async () => {
    const goals = (await introspectPostgres(sql, ["public"])).find((t) => t.name === "public.goals")!;
    const col = (n: string) => goals.columns.find((c) => c.name === n)!;
    expect(col("status")).toMatchObject({ enumValues: ["open", "done"], nullable: false, hasDefault: true });
    expect(col("stage")).toMatchObject({ enumValues: ["a", "b"], nullable: true });
    expect(col("title").enumValues).toBeUndefined();
    const odd = (await introspectPostgres(sql, ["public"])).find((t) => t.name === "public.odd_checks")!;
    // Two checks sharing nothing say nothing; two that overlap give what both allow.
    expect(odd.columns.find((c) => c.name === "x")!.enumValues).toBeUndefined();
    expect(odd.columns.find((c) => c.name === "y")!.enumValues).toEqual(["b", "c"]);
  });

  it("gives a simple view its table's key and column facts", async () => {
    const tables = await introspectPostgres(sql, ["public"]);
    const goals = tables.find((t) => t.name === "public.goals")!;
    const mine = tables.find((t) => t.name === "public.my_goals")!;
    expect(mine.key).toEqual(["id"]);
    // The table's noun and labelField come along; its label and description are the table's own.
    expect(mine.settings).toEqual({ noun: "goal", labelField: "title" });
    expect(mine.description).toBeUndefined();
    // Every column as the table has it, but the view's own comment wins.
    expect(mine.columns.filter((c) => c.name !== "due_on")).toEqual(goals.columns.filter((c) => c.name !== "due_on"));
    expect(mine.columns.find((c) => c.name === "program_id")).toMatchObject({
      nullable: false,
      references: { resource: "public.programs", field: "id" },
    });
    expect(mine.columns.find((c) => c.name === "title")).toMatchObject({ settings: { label: "Goal" }, description: "What to reach." });
    expect(mine.columns.find((c) => c.name === "due_on")).toMatchObject({ nullable: true, description: "When it is due." });

    // Renamed columns keep their facts and the key; a computed one stays as read.
    const titles = tables.find((t) => t.name === "public.goal_titles")!;
    expect(titles.key).toEqual(["goal_id"]);
    expect(titles.columns.find((c) => c.name === "goal_id")).toMatchObject({ nullable: false, hasDefault: true });
    expect(titles.columns.find((c) => c.name === "title")).toMatchObject({ nullable: true, hasDefault: false });
    expect(titles.columns.find((c) => c.name === "title")!.settings).toBeUndefined();
    expect(titles.columns.find((c) => c.name === "status")).toMatchObject({ enumValues: ["open", "done"], nullable: false });

    // A view Postgres can't update (grouping) is left as read.
    const counts = tables.find((t) => t.name === "public.goal_counts")!;
    expect(counts.key).toEqual([]);
    expect(counts.columns.every((c) => c.nullable && c.nullableUnknown && !c.enumValues)).toBe(true);

    // A source table outside the schemas asked for is read, not emitted.
    const hidden = tables.find((t) => t.name === "public.hidden_view")!;
    expect(hidden.key).toEqual(["id"]);
    expect(hidden.columns.map((c) => c.nullable)).toEqual([false, false]);
  });

  it("leaves a view updatable only through its rules as read, since its rows need not be the table's", async () => {
    const pets = (await introspectPostgres(sql, ["public"])).find((t) => t.name === "public.owner_pets")!;
    // An outer join: an owner without pets gives a row whose id and name are null.
    expect(pets.key).toEqual([]);
    expect(pets.columns.every((c) => c.nullable && c.nullableUnknown && !c.references)).toBe(true);
  });

  it("keeps a CHECK's narrowing of an enum type on a view of the table", async () => {
    const tables = await introspectPostgres(sql, ["public"]);
    const mood = (t: string) => tables.find((x) => x.name === t)!.columns.find((c) => c.name === "mood")!.enumValues;
    expect(mood("public.moods")).toEqual(["calm", "busy"]);
    expect(mood("public.my_moods")).toEqual(["calm", "busy"]);
  });

  it("follows a renamed view column by position, not the name it was created with", async () => {
    const swapped = (await introspectPostgres(sql, ["public"])).find((t) => t.name === "public.swapped")!;
    // `id` in the view is the table's other_id now: the key is the view's other_id.
    expect(swapped.key).toEqual(["other_id"]);
    const col = (n: string) => swapped.columns.find((c) => c.name === n)!;
    expect(col("other_id")).toMatchObject({ nullable: false, hasDefault: false });
    expect(col("id")).toMatchObject({ nullable: false });
    expect(col("id").nullableUnknown).toBeUndefined();
    // Renamed once: still traced, still nullable as the table's note is.
    expect(col("memo")).toMatchObject({ nullable: true });
    expect(col("memo").nullableUnknown).toBeUndefined();
  });

  it("leaves a view's guessed nullability out of the contract, and states the known kinds", async () => {
    const out = emitContracts(await introspectPostgres(sql, ["public"]), { source: "x" });
    const block = (name: string) => out.slice(out.indexOf(`name: "${name}"`), out.indexOf("});", out.indexOf(`name: "${name}"`)));
    expect(block("public.goal_counts")).not.toContain("nullable:");
    expect(block("public.goals")).toContain('{ name: "title", type: "string", dbType: "text", nullable: false');
    expect(block("public.goals")).toContain('{ name: "due_on", type: "datetime", dbType: "date", nullable: true');
    expect(block("public.my_goals")).toContain('{ name: "title", type: "string", dbType: "text", nullable: false');
  });

  it("quotes a name part that holds a dot, so it splits back exactly", async () => {
    const [weird] = await introspectPostgres(sql, ["my.s"]);
    expect(weird!.name).toBe('"my.s"."we.ird"');
    expect(weird!.columns.find((c) => c.name === "pair_id")!.references).toEqual({ resource: "public.pairs", field: "id" });
    const dotted = (await introspectPostgres(sql, ["public"])).find((t) => t.table === "a.b")!;
    expect(dotted.name).toBe('public."a.b"');
    expect(dotted.columns.find((c) => c.name === "w")!.references).toEqual({ resource: '"my.s"."we.ird"', field: "id" });
  });

  it("links the column of a tenant-safe composite key, and keys a joined view from its comment", async () => {
    const tables = await introspectPostgres(sql, ["public"]);
    const photos = tables.find((t) => t.name === "public.photos")!;
    const col = (n: string) => photos.columns.find((c) => c.name === n)!;
    expect(col("gallery_id").references).toEqual({ resource: "public.galleries", field: "id" });
    // The tenant column keeps its own single-column link.
    expect(col("org_id").references).toEqual({ resource: "public.orgs", field: "id" });
    const cards = tables.find((t) => t.name === "public.gallery_cards")!;
    expect(cards).toMatchObject({ key: ["id"], description: "Galleries with counts." });
    expect(emitContracts(tables, { source: "x" })).toContain('name: "public.gallery_cards",\n  key: "id",');
  });

  it("emits the same bytes on a re-run", async () => {
    const once = emitContracts(await introspectPostgres(sql, ["public"]), { source: "x" });
    expect(emitContracts(await introspectPostgres(sql, ["public"]), { source: "x" })).toBe(once);
    expect(once).toContain('  status: "open" | "done";');
    expect(once).toContain('  stage: "a" | "b" | null;');
  });
});
