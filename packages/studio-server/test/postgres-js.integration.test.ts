// postgres.js behaviour that Studio relies on, measured through Studio's own
// database seam (`createPostgresDatabase` → `asUser` → `Query`) against a real
// Postgres: on Studio's own pool (a connection string) and on a pool an app
// passes in.
//
// - A query postgres.js can't serialize, inside `query.savepoint`, fails only
//   that savepoint; bulk writes and imports depend on it.
// - `Date` parameters keep their instant when this process runs outside UTC,
//   including across daylight-saving changes (postgres.js 4 sends parameters
//   untyped by default, `infer: false`).

import { afterAll, beforeAll, expect, it } from "vitest";
import postgres from "postgres";
import { adminSql, COACH_A, describeDb, loginUrl, resetDatabase } from "./fixtures";
import { createPostgresDatabase, type Query, type StudioDatabase } from "../src/index";
import { Params } from "../src/rows";

const asCoach = { role: "authenticated", claims: { sub: COACH_A, role: "authenticated", aud: "authenticated" } };
const write = { readOnly: false, statementTimeoutMs: 10_000 };

const ZONE = "America/New_York";
/** Around both of New York's 2026 clock changes, where a local-time mistake shows. */
const INSTANTS = [
  "2026-01-15T12:00:00.000Z",
  "2026-03-08T06:59:59.999Z", // 01:59:59.999 EST, the last instant before the clocks go forward
  "2026-03-08T07:00:00.000Z", // 03:00 EDT
  "2026-11-01T05:30:00.000Z", // 01:30 EDT, the first time round
  "2026-11-01T06:30:00.000Z", // 01:30 EST, the second
  "2026-12-31T23:30:00.000Z", // already the next day in UTC, not in New York
];

describeDb("postgres.js through Studio's database seam", () => {
  const previousTz = process.env.TZ;
  let admin: postgres.Sql;
  let appPool: postgres.Sql;
  const pools: [string, () => StudioDatabase][] = [
    ["Studio's own pool", () => createPostgresDatabase(loginUrl())],
    ["a pool the app passes in", () => createPostgresDatabase(appPool)],
  ];

  beforeAll(async () => {
    process.env.TZ = ZONE;
    await resetDatabase();
    admin = adminSql();
    await admin.unsafe(`
      create table public.pg_probe (
        id int primary key,
        note text,
        at timestamptz,
        wall timestamp,
        day date
      );
      grant select, insert on public.pg_probe to authenticated;`);
    // The app's pool opens its sessions in New York time; Studio sets UTC per transaction.
    appPool = postgres(loginUrl(), { max: 2, onnotice: () => {}, connection: { timezone: ZONE } });
  });
  afterAll(async () => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  async function storedIds(): Promise<number[]> {
    const rows = await admin.unsafe(`select id from public.pg_probe order by id`);
    return rows.map((r) => Number(r.id));
  }

  async function withDb<T>(make: () => StudioDatabase, fn: (query: Query) => Promise<T>): Promise<T> {
    const db = make();
    try {
      return await db.asUser(asCoach, write, fn);
    } finally {
      await db.end();
    }
  }

  it("runs this file outside UTC", () => {
    expect(new Date("2026-01-15T12:00:00.000Z").getTimezoneOffset()).toBe(300);
    expect(new Date("2026-07-15T12:00:00.000Z").getTimezoneOffset()).toBe(240);
  });

  for (const [pool, make] of pools) {
    it(`keeps the other rows when one row's value can't be serialized (${pool})`, async () => {
      await admin.unsafe(`truncate public.pg_probe`);
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const unserializable = { toJSON: () => { throw new Error("no JSON for this value"); } };
      const failures: string[] = [];
      await withDb(make, async (query) => {
        const insert = (id: number, note: unknown) =>
          query.savepoint((q) => q(`insert into public.pg_probe (id, note) values ($1::text::int, $2::text)`, [String(id), note]));
        await insert(1, "first");
        for (const [id, bad] of [[2, circular], [3, unserializable]] as const) {
          // postgres.js rejects these while building the query, before anything reaches the server.
          await insert(id, bad).catch((error: Error) => failures.push(error.message));
        }
        await insert(4, "after the failures");
      });
      expect(failures).toHaveLength(2);
      expect(failures[0]).toMatch(/circular/i);
      expect(failures[1]).toMatch(/no JSON for this value/);
      // The transaction carried on past both failures and committed the rest.
      expect(await storedIds()).toEqual([1, 4]);
    });

    it(`stores Date and ISO parameters at their instant outside UTC (${pool})`, async () => {
      await admin.unsafe(`truncate public.pg_probe`);
      await withDb(make, async (query) => {
        for (const [i, iso] of INSTANTS.entries()) {
          // The handler's own path: every value as text, cast by Postgres (rows.ts `Params`).
          const params = new Params();
          await query(
            `insert into public.pg_probe (id, note, at, wall, day)
             values (${params.add(i * 10 + 1, "int")}, 'iso', ${params.add(iso, "timestamptz")}, ${params.add(iso, "timestamp")}, ${params.add(iso, "date")})`,
            params.values,
          );
          // A JS Date passed to `Query`, cast through text the way Studio casts every parameter.
          const date = new Date(iso);
          await query(
            `insert into public.pg_probe (id, note, at, wall, day)
             values ($1::text::int, 'date via text', $2::text::timestamptz, $3::text::timestamp, $4::text::date)`,
            [String(i * 10 + 2), date, date, date],
          );
          // A JS Date with no cast at all: postgres.js 4 sends it untyped and the column types it.
          await query(`insert into public.pg_probe (id, note, at) values ($1::text::int, 'date untyped', $2)`, [String(i * 10 + 3), date]);
          await query(`insert into public.pg_probe (id, note, wall) values ($1::text::int, 'date untyped', $2)`, [String(i * 10 + 4), date]);
          await query(`insert into public.pg_probe (id, note, day) values ($1::text::int, 'date untyped', $2)`, [String(i * 10 + 5), date]);
        }
      });
      const rows = await admin.unsafe(`
        select id, note,
               (extract(epoch from at) * 1000)::bigint::text as at_ms,
               to_char(wall, 'YYYY-MM-DD"T"HH24:MI:SS.MS') as wall,
               day::text as day
          from public.pg_probe order by id`);
      expect(rows).toHaveLength(INSTANTS.length * 5);
      for (const row of rows) {
        const iso = INSTANTS[Math.floor(Number(row.id) / 10)]!;
        const at = row.at_ms === null ? null : Number(row.at_ms);
        const kind = Number(row.id) % 10;
        // timestamptz: the same instant. timestamp: the UTC wall clock (Studio's sessions run in UTC). date: the UTC day.
        if (kind <= 3) expect({ id: row.id, at }).toEqual({ id: row.id, at: Date.parse(iso) });
        if (kind <= 2 || kind === 4) expect({ id: row.id, wall: row.wall }).toEqual({ id: row.id, wall: iso.slice(0, 23) });
        if (kind <= 2 || kind === 5) expect({ id: row.id, day: row.day }).toEqual({ id: row.id, day: iso.slice(0, 10) });
      }
    });
  }
});
