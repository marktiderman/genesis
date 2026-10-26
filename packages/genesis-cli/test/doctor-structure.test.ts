// @feat:cli-doctor
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { formatReport, genesisInstalls, loadGenesis, runDoctor, satisfies, toJson, validateConfig, webRoutes, type DoctorConfig, type Finding } from "../src/doctor/index.js";
import { scanFiles } from "../src/doctor/scan.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const UI = "node_modules/@marktiderman/genesis-ui/dist/index.d.ts";
/** A genesis-ui with the shell, its sub-navigation and the page layouts. */
const SHELL_UI = `import * as React from 'react';
declare const Button: React.FC;
declare function Card(): React.ReactNode;
declare function CardContent(): React.ReactNode;
declare function Dialog(): React.ReactNode;
declare function DialogContent(): React.ReactNode;
declare function Tabs(): React.ReactNode;
declare function TabsList(): React.ReactNode;
declare function TabsTrigger(): React.ReactNode;
declare function TabsContent(): React.ReactNode;
declare function AppShell(): React.ReactNode;
declare function AppShellPageHeader(): React.ReactNode;
declare function AppShellSubNavEnd(): React.ReactNode;
declare function SubNavTabs(): React.ReactNode;
declare function useAppShellSubNav(items: unknown): void;
declare function DetailPage(): React.ReactNode;
declare function DashboardPage(): React.ReactNode;
declare function BreadcrumbPage(): React.ReactNode;
declare function PageHeader(): React.ReactNode;
declare function StatusBadge(): React.ReactNode;
declare function FormError(): React.ReactNode;
export { FormError, AppShell, AppShellPageHeader, AppShellSubNavEnd, BreadcrumbPage, Button, Card, CardContent, DashboardPage, DetailPage, Dialog, DialogContent, PageHeader, StatusBadge, SubNavTabs, Tabs, TabsContent, TabsList, TabsTrigger, useAppShellSubNav };
`;
const FORMS_STUDIO = {
  "node_modules/@marktiderman/genesis-forms-studio/package.json": JSON.stringify({
    name: "@marktiderman/genesis-forms-studio",
    version: "0.4.0",
    types: "./dist/index.d.ts",
  }),
  "node_modules/@marktiderman/genesis-forms-studio/dist/index.d.ts": `import * as React from 'react';
declare function ResourceHeader(): React.ReactNode;
declare function SettingsSection(): React.ReactNode;
declare function ResourceSettingsPage(): React.ReactNode;
export { ResourceHeader, ResourceSettingsPage, SettingsSection };
`,
};

const SHELL_LAYOUT = `import { AppShell } from "@marktiderman/genesis-ui";
import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_shell")({ component: () => <AppShell navigation={[]}><Outlet /></AppShell> });
`;

const app = (files: Record<string, string>) => makeApp(null, { [UI]: SHELL_UI, ...files });
const run = async (root: string, config: DoctorConfig = {}) => (await runDoctor({ root, config })).findings;
const brief = (findings: Finding[], rule: string) =>
  findings.filter((f) => f.rule === rule).map((f) => `${f.file}:${f.line}${f.subject ? ` ${f.subject}` : ""}`);

describe("routes", () => {
  it("reads TanStack layouts, index pages, params, redirects and un-nested segments", () => {
    const root = app({
      "src/routes/__root.tsx": `export const Route = createRootRoute({ component: () => <Outlet /> });`,
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/my/route.tsx": `export const Route = createFileRoute("/_shell/my")({ component: () => <Space><Outlet /></Space> });`,
      "src/routes/_shell/my/index.tsx": `export const Route = createFileRoute("/_shell/my/")({ component: () => <p>home</p> });`,
      "src/routes/_shell/courses.$courseId.tsx": `export const Route = createFileRoute("/_shell/courses/$courseId")({ component: () => <DetailPage title="x" /> });`,
      "src/routes/_shell/lessons/$id_/print.tsx": `export const Route = createFileRoute("/x")({ component: () => <DetailPage title="x" /> });`,
      "src/routes/_shell/lessons/$id.tsx": `export const Route = createFileRoute("/x")({ component: () => <div><Outlet /></div> });`,
      "src/routes/go.tsx": `export const Route = createFileRoute("/go")({ component: () => <Navigate to="/" /> });`,
      "src/routes/-parts/Bit.tsx": `export const Bit = () => <i />;`,
    });
    const routes = webRoutes({ root, config: {}, files: scanFiles(root, {}) });
    const by = Object.fromEntries(routes.map((r) => [r.file.path.replace("src/routes/", ""), r]));
    expect(Object.keys(by)).not.toContain("-parts/Bit.tsx");
    expect(by["_shell/my/index.tsx"]!.parents.map((p) => p.file.path)).toEqual([
      "src/routes/_shell/my/route.tsx",
      "src/routes/_shell/route.tsx",
      "src/routes/__root.tsx",
    ]);
    expect(by["_shell/courses.$courseId.tsx"]).toMatchObject({ detail: true, layout: false, segments: ["_shell", "courses", "$courseId"] });
    expect(by["_shell/my/route.tsx"]!.layout).toBe(true);
    expect(by["go.tsx"]!.redirectOnly).toBe(true);
    // `$id_` opts out of the `$id` layout.
    expect(by["_shell/lessons/$id_/print.tsx"]!.parents.map((p) => p.file.path)).not.toContain("src/routes/_shell/lessons/$id.tsx");
  });

  it("takes routesDir from config", () => {
    expect(validateConfig({ routesDir: "./app/routes/" }).routesDir).toBe("app/routes");
    expect(() => validateConfig({ routesDir: "../elsewhere" })).toThrow(/inside the app/);
  });
});

describe("hand-rolled-sub-nav", () => {
  const page = (body: string) => `import { DetailPage, Tabs, TabsList, TabsTrigger, TabsContent, Card, Dialog, DialogContent } from "@marktiderman/genesis-ui";
export const Route = createFileRoute("/_shell/worksheets/$id")({ component: Page });
function Page() {
  return (
    <DetailPage title="Worksheet">
${body}
    </DetailPage>
  );
}
`;
  const TABS = `      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Questions</TabsTrigger>
          <TabsTrigger value="b">Settings</TabsTrigger>
        </TabsList>
      </Tabs>`;

  it("flags page-level tabs in a route under the AppShell layout", async () => {
    const f = await run(app({ "src/routes/_shell/route.tsx": SHELL_LAYOUT, "src/routes/_shell/worksheets.$id.tsx": page(TABS) }));
    expect(brief(f, "hand-rolled-sub-nav")).toEqual(["src/routes/_shell/worksheets.$id.tsx:7 TabsList"]);
    const hit = f.find((x) => x.rule === "hand-rolled-sub-nav")!;
    expect(hit.level).toBe("warn");
    expect(hit.message).toContain("useAppShellSubNav");
    expect(hit.message).toContain("SKILL.md");
  });

  it("also flags an app-drawn SubNavTabs", async () => {
    const f = await run(
      app({ "src/routes/_shell/route.tsx": SHELL_LAYOUT, "src/routes/_shell/forms.$id.tsx": page(`      <SubNavTabs items={[]} />`) }),
    );
    expect(brief(f, "hand-rolled-sub-nav")).toEqual(["src/routes/_shell/forms.$id.tsx:6 SubNavTabs"]);
  });

  it("leaves tabs inside a card or dialog, pages that use the hook, and routes outside the shell", async () => {
    const inCard = page(`      <Card title="Answers" footer={<span>{"a > b"}</span>}>\n${TABS}\n      </Card>`);
    const inDialog = page(`      <Dialog open>\n        <DialogContent>\n${TABS}\n        </DialogContent>\n      </Dialog>`);
    const hooked = page(TABS).replace("function Page() {", "function Page() {\n  useAppShellSubNav([]);");
    const f = await run(
      app({
        "src/routes/_shell/route.tsx": SHELL_LAYOUT,
        "src/routes/_shell/a.$id.tsx": inCard,
        "src/routes/_shell/b.$id.tsx": inDialog,
        "src/routes/_shell/c.$id.tsx": hooked,
        "src/routes/auth.tsx": page(TABS),
        "src/components/Tabbed.tsx": page(TABS),
      }),
    );
    expect(brief(f, "hand-rolled-sub-nav")).toEqual([]);
  });

  it("is quiet when the installed Genesis has no shell sub-navigation", async () => {
    const root = makeApp(null, { "src/routes/_shell/route.tsx": SHELL_LAYOUT, "src/routes/_shell/w.$id.tsx": page(TABS) });
    expect(brief(await run(root), "hand-rolled-sub-nav")).toEqual([]);
  });

  it("can be turned off, or allowed per file", async () => {
    const root = app({ "src/routes/_shell/route.tsx": SHELL_LAYOUT, "src/routes/_shell/w.$id.tsx": page(TABS) });
    expect(brief(await run(root, { rules: { "hand-rolled-sub-nav": "off" } }), "hand-rolled-sub-nav")).toEqual([]);
    const allowed = await run(root, { allow: [{ rule: "hand-rolled-sub-nav", file: "src/routes/_shell/w.$id.tsx", reason: "a wizard" }] });
    expect(brief(allowed, "hand-rolled-sub-nav")).toEqual([]);
    expect(brief(allowed, "stale-exception")).toEqual([]);
  });

  it("fails under --strict", async () => {
    const root = app({ "src/routes/_shell/route.tsx": SHELL_LAYOUT, "src/routes/_shell/w.$id.tsx": page(TABS) });
    expect((await runDoctor({ root, config: {}, strict: true })).ok).toBe(false);
  });
});

describe("local-genesis-copy", () => {
  it("flags app components named like genesis-ui or forms-studio components, exported or not", async () => {
    const f = await run(
      app({
        ...FORMS_STUDIO,
        "src/components/ResourceHeader.tsx": `export function ResourceHeader() { return <header />; }`,
        "src/components/settings.tsx": `const SettingsSection = ({ children }) => <section>{children}</section>;\nexport default SettingsSection;`,
        "src/components/Status.tsx": `function StatusBadge() { return <span />; }`,
      }),
    );
    expect(brief(f, "local-genesis-copy")).toEqual([
      "src/components/ResourceHeader.tsx:1 ResourceHeader",
      "src/components/settings.tsx:1 SettingsSection",
      "src/components/Status.tsx:1 StatusBadge",
    ]);
    expect(f.find((x) => x.subject === "ResourceHeader")!.message).toContain("Genesis already has ResourceHeader (@marktiderman/genesis-forms-studio)");
  });

  it("leaves other names, lazy wrappers of Genesis, exported genesis-ui values (shadowed-export) and forms-studio when absent", async () => {
    const f = await run(
      app({
        "src/components/ResourceHeader.tsx": `export function ResourceHeader() { return <header />; }`,
        "src/components/Lazy.tsx": `const StatusBadge = lazy(() =>\n  import("@marktiderman/genesis-ui").then((m) => ({ default: m.StatusBadge })),\n);`,
        "src/components/Page.tsx": `export function PageHeader() { return <header />; }`,
        "src/components/Mine.tsx": `export function CourseCard() { return <div />; }`,
      }),
    );
    expect(brief(f, "local-genesis-copy")).toEqual([]);
    expect(brief(f, "shadowed-export")).toEqual(["src/components/Page.tsx:1 PageHeader"]);
  });

  it("leaves a route's own errorComponent / pendingComponent, route-local helpers and non-components", async () => {
    const f = await run(
      app({
        "src/routes/f.$slug.tsx": `import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
export const Route = createFileRoute("/f/$slug")({ component: Page, errorComponent: FormError, pendingComponent: Card });
function Page() { return <main />; }
function FormError(_props: ErrorComponentProps) {
  const router = useRouter();
  return <p>Try again</p>;
}
function Card() { return <div />; }
function StatusBadge() { return <span />; }
`,
        "src/components/data.tsx": `export const StatusBadge = { ok: "green" };\nexport function Card(label: string) { return label.toUpperCase(); }`,
      }),
    );
    expect(brief(f, "local-genesis-copy")).toEqual([]);
  });

  it("still flags a component a route file exports", async () => {
    const f = await run(
      app({
        ...FORMS_STUDIO,
        "src/routes/x.tsx": `export function ResourceHeader() { return <header />; }\nexport const Route = createFileRoute("/x")({ component: () => <ResourceHeader /> });`,
      }),
    );
    expect(brief(f, "local-genesis-copy")).toEqual(["src/routes/x.tsx:1 ResourceHeader"]);
  });

  it("lists forms-studio's components in --print-genesis facts", () => {
    const g = loadGenesis(app(FORMS_STUDIO), {});
    expect(g.companions).toEqual([
      { package: "@marktiderman/genesis-forms-studio", version: "0.4.0", components: ["ResourceHeader", "ResourceSettingsPage", "SettingsSection"] },
    ]);
    expect(loadGenesis(app(FORMS_STUDIO), validateConfig({ componentPackages: [] })).companions).toEqual([]);
  });
});

describe("duplicate-genesis-package", () => {
  const pkg = (name: string, version: string, deps: Record<string, string> = {}) =>
    JSON.stringify({ name, version, dependencies: deps });

  it("reports a nested copy with the ranges that caused it", async () => {
    const root = makeApp(null, {
      "package.json": pkg("app", "1.0.0", { "@marktiderman/genesis-core": "^1.7.0", "@marktiderman/genesis-studio-server": "0.2.1" }),
      "node_modules/@marktiderman/genesis-studio-server/package.json": pkg("@marktiderman/genesis-studio-server", "0.2.1", {
        "@marktiderman/genesis-core": "^1.3.0",
      }),
      "node_modules/@marktiderman/genesis-studio-server/node_modules/@marktiderman/genesis-core/package.json": pkg(
        "@marktiderman/genesis-core",
        "1.6.0",
      ),
    });
    const f = (await run(root)).filter((x) => x.rule === "duplicate-genesis-package");
    expect(f.map((x) => x.subject)).toEqual(["@marktiderman/genesis-core"]);
    expect(f[0]!.level).toBe("warn");
    expect(f[0]!.message).toContain("node_modules/@marktiderman/genesis-studio-server/node_modules/@marktiderman/genesis-core");
    expect(f[0]!.message).toContain("@marktiderman/genesis-studio-server@0.2.1 wants ^1.3.0");
    expect(f[0]!.message).toContain("the app wants ^1.7.0");
  });

  it("says nothing when every Genesis package is installed once", async () => {
    const root = makeApp(null, {
      "node_modules/left-pad/package.json": pkg("left-pad", "1.0.0"),
      "node_modules/left-pad/node_modules/other/package.json": pkg("other", "1.0.0"),
    });
    expect(brief(await run(root), "duplicate-genesis-package")).toEqual([]);
  });

  /** A store entry (`.pnpm` / `.bun` style): the package, and symlinks to its dependencies beside it. */
  const storeEntry = (store: string, entry: string, name: string, version: string, deps: Record<string, string> = {}, links: Record<string, string> = {}) => {
    const nm = path.join(store, entry, "node_modules");
    const dir = path.join(nm, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "package.json"), pkg(name, version, deps));
    for (const [dep, target] of Object.entries(links)) {
      mkdirSync(path.dirname(path.join(nm, dep)), { recursive: true });
      symlinkSync(target, path.join(nm, dep));
    }
    return dir;
  };
  const link = (target: string, at: string) => {
    mkdirSync(path.dirname(at), { recursive: true });
    symlinkSync(target, at);
  };

  for (const store of [".pnpm", ".bun"]) {
    it(`follows a ${store} store: two entries the app reaches are two copies, its own links aren't extra ones`, () => {
      const root = makeApp(null, {
        "package.json": pkg("app", "1.0.0", { "@marktiderman/genesis-forms": "^1.0.0", "@marktiderman/genesis-chat": "^0.2.0" }),
      });
      const dir = path.join(root, "node_modules", store);
      const forms = storeEntry(dir, "@marktiderman+genesis-forms@1.0.0", "@marktiderman/genesis-forms", "1.0.0");
      const oldForms = storeEntry(dir, "@marktiderman+genesis-forms@0.9.0", "@marktiderman/genesis-forms", "0.9.0");
      const chat = storeEntry(dir, "@marktiderman+genesis-chat@0.2.0", "@marktiderman/genesis-chat", "0.2.0", { "@marktiderman/genesis-forms": "^0.9.0" }, {
        "@marktiderman/genesis-forms": oldForms,
      });
      // An entry nothing depends on never loads.
      storeEntry(dir, "@marktiderman+genesis-forms@0.1.0", "@marktiderman/genesis-forms", "0.1.0");
      link(forms, path.join(root, "node_modules", "@marktiderman", "genesis-forms"));
      link(chat, path.join(root, "node_modules", "@marktiderman", "genesis-chat"));
      const copies = genesisInstalls(root).get("@marktiderman/genesis-forms")!;
      expect(copies.map((c) => c.version).sort()).toEqual(["0.9.0", "1.0.0"]);
      expect(copies.find((c) => c.version === "0.9.0")!.requiredBy).toEqual([{ by: "@marktiderman/genesis-chat@0.2.0", range: "^0.9.0" }]);
      expect(copies.find((c) => c.version === "1.0.0")!.requiredBy).toEqual([{ by: "the app", range: "^1.0.0" }]);
      expect(genesisInstalls(root).get("@marktiderman/genesis-ui")).toHaveLength(1);
    });
  }

  it("follows a pnpm workspace sub-app into the store at the workspace root", async () => {
    const workspace = makeApp(null);
    const store = path.join(workspace, "node_modules", ".pnpm");
    const core = storeEntry(store, "@marktiderman+genesis-core@1.7.0", "@marktiderman/genesis-core", "1.7.0");
    const oldCore = storeEntry(store, "@marktiderman+genesis-core@1.6.0", "@marktiderman/genesis-core", "1.6.0");
    const server = storeEntry(store, "@marktiderman+genesis-studio-server@0.2.1", "@marktiderman/genesis-studio-server", "0.2.1", { "@marktiderman/genesis-core": "1.6.0" }, {
      "@marktiderman/genesis-core": oldCore,
    });
    const app = path.join(workspace, "apps", "web");
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, "package.json"), pkg("web", "1.0.0", { "@marktiderman/genesis-core": "^1.7.0", "@marktiderman/genesis-studio-server": "0.2.1" }));
    link(core, path.join(app, "node_modules", "@marktiderman", "genesis-core"));
    link(server, path.join(app, "node_modules", "@marktiderman", "genesis-studio-server"));
    const copies = genesisInstalls(app).get("@marktiderman/genesis-core")!;
    expect(copies.map((c) => `${c.version} ${c.dir}`)).toEqual([
      "1.6.0 ../../node_modules/.pnpm/@marktiderman+genesis-core@1.6.0/node_modules/@marktiderman/genesis-core",
      "1.7.0 ../../node_modules/.pnpm/@marktiderman+genesis-core@1.7.0/node_modules/@marktiderman/genesis-core",
    ]);
    expect(copies[0]!.requiredBy).toEqual([{ by: "@marktiderman/genesis-studio-server@0.2.1", range: "1.6.0" }]);
    expect(copies[1]!.requiredBy).toEqual([{ by: "the app", range: "^1.7.0" }]);
  });
});

describe("resource-workspace", () => {
  const detail = (header: boolean) =>
    `export const Route = createFileRoute("/x")({ component: () => <DetailPage title="x">${header ? "<AppShellPageHeader><h1 /></AppShellPageHeader>" : ""}</DetailPage> });`;

  it("reports the detail pages beside one that uses AppShellPageHeader", async () => {
    const f = await run(
      app({
        "src/routes/_shell/route.tsx": SHELL_LAYOUT,
        "src/routes/_shell/forms.$formId.tsx": detail(true),
        "src/routes/_shell/courses.$courseId.tsx": detail(false),
        "src/routes/_shell/courses.index.tsx": detail(false),
        "src/routes/_shell/my/lessons.$id.tsx": detail(false),
      }),
    );
    expect(brief(f, "resource-workspace")).toEqual(["src/routes/_shell/courses.$courseId.tsx:0"]);
    expect(f.find((x) => x.rule === "resource-workspace")!.level).toBe("info");
    expect(f.find((x) => x.rule === "resource-workspace")!.message).toContain("unlike forms.$formId.tsx");
  });

  it("is info: shown in text and --json, never failing, --strict included", async () => {
    const root = app({ "src/routes/forms.$formId.tsx": detail(true), "src/routes/courses.$courseId.tsx": detail(false) });
    const strict = await runDoctor({ root, config: {}, strict: true });
    expect(strict).toMatchObject({ ok: true, errors: 0, warnings: 0, infos: 1 });
    expect(formatReport(strict)).toMatch(/^INFO  src\/routes\/courses\.\$courseId\.tsx  \[resource-workspace\]/m);
    expect(formatReport(strict)).toContain("PASS (0 warnings, 1 info)");
    expect(toJson(strict)).toMatchObject({ ok: true, infos: 1, findings: [{ rule: "resource-workspace", level: "info" }] });
    // A level override can raise it.
    expect((await runDoctor({ root, config: { rules: { "resource-workspace": "warn" } }, strict: true })).ok).toBe(false);
  });

  it("says nothing when no detail page uses it", async () => {
    const f = await run(app({ "src/routes/a.$id.tsx": detail(false), "src/routes/b.$id.tsx": detail(false) }));
    expect(brief(f, "resource-workspace")).toEqual([]);
  });
});

describe("page-layout", () => {
  const route = (body: string, imports = "") => `${imports}\nexport const Route = createFileRoute("/x")({ component: () => ${body} });`;

  it("flags a page inside the shell with no Genesis layout, and passes direct, imported, parent-supplied and package layouts", async () => {
    const f = await run(
      app({
        ...FORMS_STUDIO,
        "src/routes/__root.tsx": route("<Outlet />"),
        "src/routes/_shell/route.tsx": SHELL_LAYOUT,
        "src/routes/_shell/inbox.tsx": route(`<main><h1>Inbox</h1></main>`),
        "src/routes/_shell/dashboard.tsx": route(`<DashboardPage title="Home" />`),
        "src/routes/_shell/about.tsx": route(`<AboutPage />`, `import { AboutPage } from "@/components/AboutPage";`),
        "src/components/AboutPage.tsx": `import { DetailPage } from "@marktiderman/genesis-ui";\nexport const AboutPage = () => <DetailPage title="About" />;`,
        "src/routes/_shell/my/route.tsx": route(`<SpaceLayout />`, `import { SpaceLayout } from "../../../components/SpaceLayout";`),
        "src/components/SpaceLayout.tsx": `export const SpaceLayout = () => <DetailPage title="Me"><Outlet /></DetailPage>;`,
        "src/routes/_shell/my/index.tsx": route(`<EmptyState />`),
        "src/routes/_shell/support.tsx": route(`<SupportPage />`, `import { SupportPage } from "@marktiderman/genesis-support";`),
        "src/routes/_shell/settings.tsx": route(`<ResourceSettingsPage />`, `import { ResourceSettingsPage } from "@marktiderman/genesis-forms-studio";`),
        "src/routes/_shell/crumbs.tsx": route(`<BreadcrumbPage />`),
        "src/routes/_shell/go.tsx": route(`<Navigate to="/" />`),
        "src/routes/_shell/invite.$token.tsx": `export const Route = createFileRoute("/invite/$token")({ beforeLoad: () => { throw redirect({ to: "/" }); } });`,
        // Outside the shell: Genesis has no PublicPage / AuthPage yet.
        "src/routes/sign-in.tsx": route(`<main><h1>Sign in</h1></main>`),
        "src/routes/index.tsx": route(`<Landing />`),
      }),
    );
    expect(brief(f, "page-layout")).toEqual(["src/routes/_shell/crumbs.tsx:0", "src/routes/_shell/inbox.tsx:0"]);
    expect(f.find((x) => x.rule === "page-layout")!.message).toContain("DashboardPage");
  });

  it("is off with the native pack, which has native-screen-layout", async () => {
    const root = app({ "src/routes/sign-in.tsx": route(`<main />`) });
    const f = (await runDoctor({ root, config: { packs: ["native"], uiPackage: "@marktiderman/genesis-ui", native: { routerRoot: "src/routes" } } })).findings;
    expect(brief(f, "page-layout")).toEqual([]);
  });
});

describe("peer-range-mismatch", () => {
  const manifest = (name: string, version: string, peers: Record<string, string> = {}) =>
    JSON.stringify({ name, version, peerDependencies: peers });
  const peers = async (files: Record<string, string>) =>
    (await run(makeApp(null, files))).filter((f) => f.rule === "peer-range-mismatch");

  it("flags an installed Genesis peer outside a Genesis package's range", async () => {
    const f = await peers({
      "node_modules/@marktiderman/genesis-forms-studio/package.json": manifest("@marktiderman/genesis-forms-studio", "0.4.0", {
        "@marktiderman/genesis-ui": "^2.13.0",
        "@marktiderman/genesis-core": "^9.0.0",
        react: "^99.0.0",
      }),
    });
    // The fake genesis-ui and genesis-core are 9.9.9: core is in range; react isn't a Genesis package.
    expect(f.map((x) => x.subject)).toEqual(["@marktiderman/genesis-forms-studio>@marktiderman/genesis-ui"]);
    expect(f[0]!.level).toBe("warn");
    expect(f[0]!.message).toContain("wants @marktiderman/genesis-ui ^2.13.0, but 9.9.9 is installed");
  });

  it("resolves the peer from the package's folder: a nested copy wins over the top-level one", async () => {
    const f = await peers({
      "node_modules/@marktiderman/genesis-studio/package.json": manifest("@marktiderman/genesis-studio", "0.2.0", {
        "@marktiderman/genesis-ui": "^9.0.0",
        "@marktiderman/genesis-core": ">=2.0.0 <3",
      }),
      "node_modules/@marktiderman/genesis-studio/node_modules/@marktiderman/genesis-core/package.json": manifest(
        "@marktiderman/genesis-core",
        "2.1.0",
      ),
    });
    expect(f).toEqual([]);
  });

  it("is quiet for satisfied, missing and non-semver peers, and can be turned off", async () => {
    const files = {
      "node_modules/@marktiderman/genesis-chat/package.json": manifest("@marktiderman/genesis-chat", "0.2.0", {
        "@marktiderman/genesis-ui": "^9.9.0 || ^10",
        "@marktiderman/genesis-notifications": "^1.0.0",
        "@marktiderman/genesis-core": "workspace:*",
      }),
    };
    expect(await peers(files)).toEqual([]);
    const off = makeApp(null, {
      "node_modules/@marktiderman/genesis-chat/package.json": manifest("@marktiderman/genesis-chat", "0.2.0", { "@marktiderman/genesis-ui": "^1.0.0" }),
    });
    expect((await run(off)).filter((x) => x.rule === "peer-range-mismatch")).toHaveLength(1);
    expect((await run(off, { rules: { "peer-range-mismatch": "off" } })).filter((x) => x.rule === "peer-range-mismatch")).toEqual([]);
    expect((await runDoctor({ root: off, config: {}, strict: true })).ok).toBe(false);
  });

  it("reads semver ranges like npm does", () => {
    const cases: Array<[string, string, boolean | null]> = [
      ["1.7.0", "^1.3.0", true],
      ["2.0.0", "^1.3.0", false],
      ["0.2.5", "^0.2.1", true],
      ["0.3.0", "^0.2.1", false],
      ["0.0.4", "^0.0.3", false],
      ["1.2.9", "~1.2.3", true],
      ["1.3.0", "~1.2.3", false],
      ["1.5.0", ">=1.2.0 <2", true],
      ["1.5.0", ">= 1.2.0 < 1.4", false],
      ["3.1.0", "1.x || >=3", true],
      ["1.9.9", "1 - 1.9", true],
      ["2.0.0", "1 - 1.9", false],
      ["1.0.0", "*", true],
      ["1.0.0", "", true],
      ["1.3.0-beta.1", "^1.2.0", false],
      ["1.3.0-beta.2", "^1.3.0-beta.1", true],
      ["1.3.0", "^1.3.0-beta.1", true],
      ["1.0.0", "workspace:^", null],
      ["latest", "^1.0.0", null],
    ];
    for (const [version, range, want] of cases) expect([version, range, satisfies(version, range)]).toEqual([version, range, want]);
  });
});
