// @feat:settings-screen
import { describe, expect, it } from "vitest";
import { detectSettingsHost, planSettingsInit, type SettingsInitFacts } from "../src/settings-init.js";

function project(deps: Record<string, string>, paths: string[] = [], name = "@acme/portal"): SettingsInitFacts {
  return { packageJson: { name, dependencies: deps }, exists: (p) => paths.some((f) => f === p || f.startsWith(`${p}/`)) };
}

describe("genesis settings init", () => {
  it("detects the framework from package.json", () => {
    expect(detectSettingsHost(project({ next: "15.0.0" }))).toBe("next");
    expect(detectSettingsHost(project({ "@tanstack/react-start": "1.0.0" }))).toBe("tanstack-start");
    expect(detectSettingsHost(project({ "@react-router/dev": "7.0.0" }))).toBe("react-router");
    expect(detectSettingsHost(project({ "expo-router": "6.0.0" }))).toBe("expo");
    expect(detectSettingsHost(project({ vite: "7.0.0" }))).toBeNull();
    expect(() => planSettingsInit(project({ vite: "7.0.0" }))).toThrow(/--host/);
  });

  it("writes a Next.js route handler that serves createSettingsHandler with the publishable key", () => {
    const plan = planSettingsInit(project({ next: "15.0.0", "@supabase/supabase-js": "2.0.0" }, ["src/app/layout.tsx"]));
    expect(plan.file.path).toBe("src/app/api/genesis/settings/route.ts");
    expect(plan.file.content).toContain('import { createSettingsHandler } from "@marktiderman/genesis-supabase/settings/server";');
    expect(plan.file.content).toContain('required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"])');
    expect(plan.file.content).toContain('app: { name: "portal" }');
    expect(plan.file.content).toContain("export const POST = handler;");
    expect(plan.file.content).not.toMatch(/SERVICE_ROLE/i);
    expect(plan.install).toEqual(["@marktiderman/genesis-supabase"]);
  });

  it("writes a TanStack Start server route", () => {
    const plan = planSettingsInit(project({ "@tanstack/react-start": "1.0.0" }), { route: "/api/admin/settings" });
    expect(plan.file.path).toBe("src/routes/api/admin/settings.ts");
    expect(plan.file.content).toContain('createFileRoute("/api/admin/settings")');
    expect(plan.file.content).toContain("POST: ({ request }) => handler(request)");
  });

  it("writes a React Router resource route and says how to register it", () => {
    const plan = planSettingsInit(project({ "@react-router/dev": "7.0.0" }, ["app/routes.ts"]));
    expect(plan.file.path).toBe("app/routes/api.genesis.settings.ts");
    expect(plan.file.content).toContain("export async function action({ request }: { request: Request })");
    expect(plan.steps[0]).toContain('route("api/genesis/settings", "routes/api.genesis.settings.ts")');
  });

  it("writes an Expo Router API route, and says it needs a server build", () => {
    const plan = planSettingsInit(project({ "expo-router": "6.0.0" }, ["src/app/_layout.tsx"]));
    expect(plan.file.path).toBe("src/app/api/genesis/settings+api.ts");
    expect(plan.file.content).toContain('required("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"');
    expect(plan.file.content).toContain("export function POST(request: Request)");
    expect(plan.steps[0]).toMatch(/web\.output to "server"/);
  });

  it("refuses a route that isn't a plain path", () => {
    expect(() => planSettingsInit(project({ next: "15.0.0" }), { route: "/api/../x" })).toThrow(/simple path/);
    expect(() => planSettingsInit(project({ next: "15.0.0" }), { route: "api/x" })).toThrow(/simple path/);
  });
});
