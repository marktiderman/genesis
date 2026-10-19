import { describe, expect, it } from "vitest";
import { detectHost, planStudioInit, type ProjectFacts } from "../src/studio/init.js";

function project(files: Record<string, string>, deps: Record<string, string>): ProjectFacts {
  return {
    packageJson: { dependencies: deps },
    exists: (p) => Object.keys(files).some((f) => f === p || f.startsWith(`${p}/`)),
    read: (p) => files[p] ?? null,
    timestamp: "20261019120000",
  };
}

const LOVABLE = project(
  {
    "src/integrations/supabase/client.ts": 'export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, "k");',
    "src/pages/Index.tsx": "",
    "supabase/config.toml": 'project_id = "abc"\n',
    "supabase/migrations/20260101_init.sql": "",
  },
  { "@supabase/supabase-js": "^2", vite: "^5", "react-router-dom": "^6" },
);

describe("genesis studio init", () => {
  it("puts a Vite or Lovable app's studio server in a Supabase Edge Function", () => {
    const plan = planStudioInit(LOVABLE);
    expect(plan.host).toBe("supabase-function");
    expect(plan.files.map((f) => f.path)).toEqual([
      "supabase/migrations/20261019120000_genesis_studio.sql",
      "supabase/functions/genesis-studio/index.ts",
      "supabase/config.toml",
      "src/pages/DataStudioPage.tsx",
    ]);
    const page = plan.files.find((f) => f.path === "src/pages/DataStudioPage.tsx")!.content;
    expect(page).toContain('import { supabase } from "@/integrations/supabase/client";');
    expect(page).toContain("/functions/v1/genesis-studio");
    expect(page).toContain('import "@marktiderman/genesis-studio/standalone.css";');
    expect(plan.files.find((f) => f.path === "supabase/config.toml")).toMatchObject({ append: true, content: expect.stringContaining("verify_jwt = false") });
    expect(plan.steps[0]).toContain('<Route path="/admin/data"');
  });

  it("writes one migration with a NOINHERIT login, the audit trail, and no password", () => {
    const sql = planStudioInit(LOVABLE).files[0]!.content;
    expect(sql).toContain("create role genesis_studio_login login noinherit;");
    expect(sql).toContain("grant authenticated to genesis_studio_login;");
    expect(sql).toContain("create table if not exists genesis_studio.audit_log");
    expect(sql).toContain("session_user <> 'genesis_studio_login'");
    expect(sql).not.toMatch(/with password|password '/i);
  });

  it("uses a Next.js app's own routes", () => {
    const next = project({ "app/layout.tsx": "" }, { next: "^15", "@supabase/ssr": "^0.5" });
    expect(detectHost(next)).toBe("next");
    const plan = planStudioInit(next, { route: "/staff/data" });
    expect(plan.files.map((f) => f.path)).toEqual(["genesis-studio.sql", "app/api/studio/route.ts", "app/staff/data/page.tsx"]);
    expect(plan.files[2]!.content).toContain('import { createBrowserClient } from "@supabase/ssr";');
    expect(plan.files[1]!.content).toContain("supabaseStudio(");
  });

  it("refuses names it would have to quote", () => {
    expect(() => planStudioInit(LOVABLE, { loginRole: "x; drop table y" })).toThrow(/plain Postgres role name/);
    expect(() => planStudioInit(LOVABLE, { route: "/a b" })).toThrow(/simple path/);
  });
});
