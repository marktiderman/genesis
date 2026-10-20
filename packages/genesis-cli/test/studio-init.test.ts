import { readFileSync } from "node:fs";
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
    expect(plan.install).toContain("@hookform/resolvers@^5.1.0");
    // The browser client and the Edge Function run the exact server this CLI was built with.
    const { version } = JSON.parse(readFileSync(new URL("../../studio-server/package.json", import.meta.url), "utf8"));
    expect(plan.install).toContain(`@marktiderman/genesis-studio-server@${version}`);
    const fn = plan.files.find((f) => f.path === "supabase/functions/genesis-studio/index.ts")!.content;
    expect(fn).toContain(`npm:@marktiderman/genesis-studio-server@${version}"`);
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
    // Next.js inlines public variables into the browser bundle only for dot access.
    expect(plan.files[2]!.content).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL!");
    expect(plan.files[1]!.content).toContain("supabaseStudio(");
  });

  it("refuses names it would have to quote", () => {
    expect(() => planStudioInit(LOVABLE, { loginRole: "x; drop table y" })).toThrow(/plain Postgres role name/);
    expect(() => planStudioInit(LOVABLE, { route: "/a b" })).toThrow(/simple path/);
  });
});

const SHELL_APP = `import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { AdminGuard } from "@/components/admin/AdminGuard";
const Auth = lazy(() => import("./pages/Auth"));
const TodayPage = lazy(() => import("./pages/TodayPage"));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Index />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
`;

describe("putting the studio inside the app's shell", () => {
  const app = project(
    { ...Object.fromEntries(["src/integrations/supabase/client.ts", "src/pages/Index.tsx"].map((p) => [p, ""])), "src/App.tsx": SHELL_APP },
    { "@supabase/supabase-js": "^2", "react-router-dom": "^6" },
  );

  it("adds the route inside the layout route, behind the app's admin guard, lazy like its other pages", () => {
    const plan = planStudioInit(app);
    const router = plan.files.find((f) => f.path === "src/App.tsx")!;
    expect(router.edit).toMatch(/inside your app's layout, behind <AdminGuard>/);
    expect(router.content).toContain('const DataStudioPage = lazy(() => import("./pages/DataStudioPage"));');
    expect(router.content).toContain('          <Route path="admin/data" element={<AdminGuard><DataStudioPage /></AdminGuard>} />\n        </Route>');
    const page = plan.files.find((f) => f.path === "src/pages/DataStudioPage.tsx")!.content;
    expect(page).toContain('variant="plain"');
    expect(plan.steps.some((s) => s.includes("<Route path="))).toBe(false);
  });

  it("nests the page relative to a layout route that has its own path", () => {
    const plan = planStudioInit(project({ "src/App.tsx": SHELL_APP.replace('path="/"\n', 'path="/admin"\n') }, {}));
    expect(plan.files.find((f) => f.path === "src/App.tsx")!.content).toContain('<Route path="data" element={<AdminGuard><DataStudioPage /></AdminGuard>} />');
  });

  it("leaves the router alone when the layout route lives outside the page's path", () => {
    const plan = planStudioInit(project({ "src/App.tsx": SHELL_APP.replace('path="/"\n', 'path="/dashboard"\n') }, {}));
    expect(plan.files.some((f) => f.path === "src/App.tsx")).toBe(false);
    expect(plan.steps.join("\n")).toMatch(/layout route lives at \/dashboard, outside \/admin\/data/);
  });

  it("leaves an existing page at that path alone, and says how to swap it", () => {
    const taken = project({ "src/App.tsx": SHELL_APP.replace('path="admin"', 'path="admin/data"') }, {});
    const plan = planStudioInit(taken);
    expect(plan.files.some((f) => f.path === "src/App.tsx")).toBe(false);
    expect(plan.steps.join("\n")).toMatch(/already has a page at \/admin\/data/);
  });
});

describe("TanStack Start apps", () => {
  const shell = `import { AppShell } from "@marktiderman/genesis-ui/data";\nexport const Route = createFileRoute("/_authenticated/_shell")({ component: () => <AppShell /> });`;
  const app = project(
    {
      "src/routes/__root.tsx": "",
      "src/routes/_authenticated/route.tsx": "export const Route = createFileRoute('/_authenticated')({ component: () => <Outlet /> });",
      "src/routes/_authenticated/_shell/route.tsx": shell,
      "src/routes/_authenticated/_shell/clients/$clientId/route.tsx": "<Layout />",
      "src/routes/_authenticated/_shell/admin.tsx": "export const Route = createFileRoute('/_authenticated/_shell/admin')({});",
      "src/integrations/supabase/client.ts": "",
      "src/styles.css": '@import "tailwindcss" source(none);\n@source "../node_modules/@marktiderman/genesis-ui/dist";\n',
    },
    { "@tanstack/react-start": "^1", "@supabase/supabase-js": "^2" },
  );
  const facts = { ...app, listDeep: () => ["src/routes/_authenticated/route.tsx", "src/routes/_authenticated/_shell/route.tsx", "src/routes/_authenticated/_shell/clients/$clientId/route.tsx", "src/routes/_authenticated/_shell/admin.tsx"] };

  it("puts the server in the app and the page in the shell's folder, beside an existing /admin page", () => {
    const plan = planStudioInit(facts);
    expect(plan.host).toBe("tanstack-start");
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain("src/routes/api/studio.ts");
    expect(paths).toContain("src/routes/_authenticated/_shell/admin_.data.tsx");
    const page = plan.files.find((f) => f.path.endsWith("admin_.data.tsx"))!.content;
    expect(page).toContain('createFileRoute("/_authenticated/_shell/admin_/data")');
    expect(page).toContain('variant="plain"');
    expect(page).not.toContain("standalone.css");
    const server = plan.files.find((f) => f.path === "src/routes/api/studio.ts")!.content;
    expect(server).toContain('await import("@marktiderman/genesis-studio-server")');
    // Bracket access works under noPropertyAccessFromIndexSignature.
    expect(server).toContain('process.env["STUDIO_DATABASE_URL"]!');
    expect(server).not.toMatch(/process\.env\.[A-Z]/);
    expect(plan.files.find((f) => f.path === "src/styles.css")!.content).toContain('@source "../node_modules/@marktiderman/genesis-studio/dist";');
  });

  it("has Tailwind scan genesis-ui too, when the app doesn't yet", () => {
    const bare = { ...facts, read: (p: string) => (p === "src/styles.css" ? '@import "tailwindcss" source(none);\n' : facts.read(p)) };
    const css = planStudioInit(bare).files.find((f) => f.path === "src/styles.css")!.content;
    expect(css).toBe('@import "tailwindcss" source(none);\n@source "../node_modules/@marktiderman/genesis-ui/dist";\n@source "../node_modules/@marktiderman/genesis-studio/dist";\n');
  });
});
