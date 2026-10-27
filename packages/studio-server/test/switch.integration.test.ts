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

  it("refuses a superuser login, where `reset role` would undo the switch", async () => {
    const [{ superuser }] = (await admin`select rolsuper as superuser from pg_roles where rolname = session_user`) as any;
    expect(superuser).toBe(true);
    await expect(
      admin.begin(async (tx) => {
        await switchToUser(tx, asCoach(COACH_A));
      }),
    ).rejects.toThrow(/superuser or bypasses RLS/);

    // The escape it guards against, allowed here for the test only.
    const [before, after] = await admin.begin(async (tx) => {
      await switchToUser(tx, asCoach(COACH_A), { allowPrivilegedLogin: true });
      const mine = await clientNames(tx);
      await tx`reset role`;
      return [mine, await clientNames(tx)];
    });
    expect(after!.length).toBeGreaterThan(before!.length);
  });

  it("leaves `reset role` on the NOINHERIT login with no privileges at all", async () => {
    await expect(
      login.begin(async (tx) => {
        await switchToUser(tx, asCoach(COACH_A));
        await tx`reset role`;
        return clientNames(tx);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses a role that bypasses RLS even when allowRoles lists it", async () => {
    await admin.unsafe(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
      end $$;
      grant service_role to studio_login;
    `);
    await expect(
      login.begin(async (tx) => {
        await switchToUser(tx, { role: "service_role", claims: { sub: COACH_A } }, { allowRoles: ["service_role"] });
      }),
    ).rejects.toBeInstanceOf(IdentitySwitchError);
  });

  it("aborts the transaction on a failed check, so catching it doesn't help", async () => {
    let ranAfter = false;
    await expect(
      login.begin(async (tx) => {
        let first = true;
        try {
          // A tagged query that drops the settings: the check finds the login, not the user.
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
        } catch (error) {
          expect(error).toBeInstanceOf(IdentitySwitchError);
        }
        await tx`select 1`;
        ranAfter = true;
      }),
    ).rejects.toMatchObject({ code: "42501" });
    // The next statement failed too (25P02, in failed transaction): nothing ran as the login.
    expect(ranAfter).toBe(false);
  });

  it("passes a database error during the switch through, and the transaction rolls back", async () => {
    await expect(
      login.begin(async (tx) => {
        await switchToUser(tx, { role: "no_such_role", claims: {} }, { allowRoles: ["no_such_role"] });
      }),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("sets a statement timeout that holds", async () => {
    await expect(
      login.begin(async (tx) => {
        await switchToUser(tx, asCoach(COACH_A), { statementTimeoutMs: 50 });
        await tx`select pg_sleep(1)`;
      }),
    ).rejects.toMatchObject({ code: "57014" });
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
