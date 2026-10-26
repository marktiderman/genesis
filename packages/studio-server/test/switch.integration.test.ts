import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { adminSql, COACH_A, COACH_B, describeDb, loginUrl, resetDatabase } from "./fixtures";
import { IdentitySwitchError, switchToUser } from "../src/index";

const asCoach = (sub: string) => ({ role: "authenticated", claims: { sub, role: "authenticated", aud: "authenticated" } });

describeDb("switchToUser", () => {
  let admin: postgres.Sql;
  let login: postgres.Sql;

  beforeAll(() => {
    admin = adminSql();
    login = postgres(loginUrl(), { max: 2, onnotice: () => {} });
  });
  beforeEach(resetDatabase);
  afterAll(async () => {
    await Promise.all([admin.end(), login.end()]);
  });

  async function clientNames(tx: postgres.TransactionSql): Promise<string[]> {
    const rows = await tx`select name from public.clients order by name`;
    return rows.map((r) => r.name as string);
  }

  it("runs a postgres.js transaction as the user, under RLS", async () => {
    const [mine, theirs] = await Promise.all([
      login.begin(async (tx) => {
        await switchToUser(tx, asCoach(COACH_A));
        return clientNames(tx);
      }),
      login.begin(async (tx) => {
        await switchToUser(tx, asCoach(COACH_B));
        return clientNames(tx);
      }),
    ]);
    const [all] = await admin`select count(*)::int as n from public.clients`;
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.length).toBeGreaterThan(0);
    expect(mine.length + theirs.length).toBe(all!.n);
    expect(mine.some((name) => theirs.includes(name))).toBe(false);
  });

  it("applies RLS on a privileged login too (a superuser pool kept for server-owned writes)", async () => {
    const [{ superuser }] = (await admin`select rolsuper as superuser from pg_roles where rolname = session_user`) as any;
    expect(superuser).toBe(true);
    const asUser = await admin.begin(async (tx) => {
      await switchToUser(tx, asCoach(COACH_A));
      return clientNames(tx);
    });
    const asLogin = await admin`select name from public.clients`;
    expect(asUser.length).toBeLessThan(asLogin.length);
    // The switch ends with the transaction: the pool is privileged again afterwards.
    const [after] = await admin`select current_user as role`;
    expect(after!.role).not.toBe("authenticated");
  });

  it("exposes only the headers given as request.headers, and clears a stale value", async () => {
    const seen = await login.begin(async (tx) => {
      await switchToUser(tx, asCoach(COACH_A), { headers: { "x-app": "gamify" } });
      const [row] = await tx`select current_setting('request.headers', true)::json as headers`;
      return row!.headers;
    });
    expect(seen).toEqual({ "x-app": "gamify" });

    // One connection, so the session-level value someone left on it is there for the next transaction.
    const single = postgres(loginUrl(), { max: 1, onnotice: () => {} });
    try {
      await single`select set_config('request.headers', '{"x-app":"stale"}', false)`;
      const cleared = await single.begin(async (tx) => {
        await switchToUser(tx, asCoach(COACH_A));
        const [row] = await tx`select current_setting('request.headers', true)::json as headers`;
        return row!.headers;
      });
      expect(cleared).toEqual({});
    } finally {
      await single.end();
    }
  });

  it("refuses credential headers before running anything", async () => {
    await expect(
      login.begin(async (tx) => switchToUser(tx, asCoach(COACH_A), { headers: { authorization: "Bearer x" } })),
    ).rejects.toThrow(/credential/);
  });

  it("refuses to go on when the switch didn't take", async () => {
    // A tagged query that drops the settings: `current_user` stays the login.
    await expect(
      login.begin(async (tx) => {
        let first = true;
        await switchToUser(
          (strings, ...values) => {
            if (first) {
              first = false;
              return tx`select 1`;
            }
            return tx(strings, ...(values as never[]));
          },
          asCoach(COACH_A),
        );
      }),
    ).rejects.toBeInstanceOf(IdentitySwitchError);
  });

  it("works with Drizzle's sql tag and tx.execute", async () => {
    const db = drizzle({ client: login });
    const names = await db.transaction(async (tx) => {
      await switchToUser((strings, ...values) => tx.execute(drizzleSql(strings, ...values)), asCoach(COACH_A), {
        headers: { "x-app": "gamify" },
      });
      const rows = await tx.execute(drizzleSql`select name, current_setting('request.jwt.claim.sub', true) as sub from public.clients`);
      return [...rows] as { name: string; sub: string }[];
    });
    const direct = await login.begin(async (tx) => {
      await switchToUser(tx, asCoach(COACH_A));
      return clientNames(tx);
    });
    expect(names.map((r) => r.name).sort()).toEqual([...direct].sort());
    expect(names.every((r) => r.sub === COACH_A)).toBe(true);
  });
});
