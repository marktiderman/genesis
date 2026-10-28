// @feat:cli-introspect
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkEnumValues, viewColumnOrigins } from "../src/introspect/catalog-text.js";

// Real `pg_rewrite.ev_action` text from Postgres 17, for:
//   create table goals (id uuid primary key, person_id uuid not null, "Title X" text not null,
//                       status text, kind varchar(10) not null, due_on date);  -- oid 16384
//   create view select_star as select * from goals
//     where person_id = any(array(select person_id from goals g2 where g2.status = 'open'));
//   create view renamed as select id as goal_id, upper("Title X") as title, status from goals;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/introspect/${name}`, import.meta.url), "utf8");

describe("viewColumnOrigins", () => {
  it("traces every plain column of a select-star view, not the subquery's", () => {
    expect(viewColumnOrigins(fixture("view-select-star.txt"))).toEqual([
      { position: 1, name: "id", relation: 16384, column: 1 },
      { position: 2, name: "person_id", relation: 16384, column: 2 },
      { position: 3, name: "Title X", relation: 16384, column: 3 },
      { position: 4, name: "status", relation: 16384, column: 4 },
      { position: 5, name: "kind", relation: 16384, column: 5 },
      { position: 6, name: "due_on", relation: 16384, column: 6 },
    ]);
  });

  it("follows a rename and leaves a computed column out", () => {
    expect(viewColumnOrigins(fixture("view-renamed.txt"))).toEqual([
      { position: 1, name: "goal_id", relation: 16384, column: 1 },
      { position: 3, name: "status", relation: 16384, column: 4 },
    ]);
  });

  it("returns nothing for text it doesn't recognise", () => {
    expect(viewColumnOrigins("")).toEqual([]);
    expect(viewColumnOrigins("({QUERY :commandType 1})")).toEqual([]);
  });
});

describe("checkEnumValues", () => {
  it("reads IN lists, as Postgres prints them", () => {
    expect(checkEnumValues("CHECK ((status = ANY (ARRAY['open'::text, 'done'::text])))", "status")).toEqual(["open", "done"]);
    expect(
      checkEnumValues("CHECK (((kind)::text = ANY ((ARRAY['a'::character varying, 'b''c'::character varying])::text[])))", "kind"),
    ).toEqual(["a", "b'c"]);
  });

  it("reads a list or'd with IS NULL, either way round", () => {
    expect(checkEnumValues("CHECK (((status IS NULL) OR (status = ANY (ARRAY['open'::text, 'done'::text]))))", "status")).toEqual([
      "open",
      "done",
    ]);
    expect(checkEnumValues("CHECK (((status = ANY (ARRAY['open'::text])) OR (status IS NULL)))", "status")).toEqual(["open"]);
  });

  it("reads one value and a quoted column name", () => {
    expect(checkEnumValues("CHECK ((kind = 'x'::text))", "kind")).toEqual(["x"]);
    expect(checkEnumValues(`CHECK (("Kind" = ANY (ARRAY['a'::text, 'b'::text])))`, "Kind")).toEqual(["a", "b"]);
    expect(checkEnumValues("CHECK ((status = ANY (ARRAY['a'::text]))) NOT VALID", "status")).toEqual(["a"]);
  });

  it("skips anything else", () => {
    for (const def of [
      "CHECK ((length(status) > 0))",
      "CHECK ((n = ANY (ARRAY[1, 2])))",
      "CHECK (((status = 'a'::text) OR (status = 'b'::text)))",
      "CHECK (((status IS NULL) OR (other = ANY (ARRAY['a'::text]))))",
      "CHECK ((status = ANY (ARRAY['a'::text, lower(x)])))",
      "CHECK ((status = ANY ('{a,b}'::text[])))",
      "CHECK ((other = 'a'::text))",
      "UNIQUE (status)",
    ]) {
      expect(checkEnumValues(def, "status"), def).toBeUndefined();
    }
  });
});
