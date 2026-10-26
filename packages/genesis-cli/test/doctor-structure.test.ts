// @feat:cli-doctor
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { formatReport, genesisInstalls, loadGenesis, runDoctor, satisfies, toJson, validateConfig, webRoutes, type DoctorConfig, type Finding } from "../src/doctor/index.js";
import { scanFiles } from "../src/doctor/scan.js";
import { createTrail, stripForImports } from "../src/doctor/trail.js";
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
declare function ResourceView(): React.ReactNode;
export { FormError, AppShell, AppShellPageHeader, AppShellSubNavEnd, BreadcrumbPage, Button, Card, CardContent, DashboardPage, DetailPage, Dialog, DialogContent, PageHeader, ResourceView, StatusBadge, SubNavTabs, Tabs, TabsContent, TabsList, TabsTrigger, useAppShellSubNav };
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
        "src/routes/_shell/brands.tsx": route(`<ResourceView view={brandsView} />`, `import { ResourceView } from "@marktiderman/genesis-ui";`),
        "src/routes/_shell/embedded.tsx": route(`<ResourceView view={v} layout="embedded" />`, `import { ResourceView } from "@marktiderman/genesis-ui";`),
        "src/routes/_shell/framed.tsx": route(`<DetailPage title="x"><ResourceView view={v} layout="embedded" /></DetailPage>`, `import { ResourceView } from "@marktiderman/genesis-ui";`),
        "src/routes/_shell/chosen.tsx": route(`<ResourceView view={v} layout={mode} />`, `import { ResourceView } from "@marktiderman/genesis-ui";`),
        "src/routes/_shell/crumbs.tsx": route(`<BreadcrumbPage />`),
        "src/routes/_shell/go.tsx": route(`<Navigate to="/" />`),
        "src/routes/_shell/invite.$token.tsx": `export const Route = createFileRoute("/invite/$token")({ beforeLoad: () => { throw redirect({ to: "/" }); } });`,
        // Outside the shell: Genesis has no PublicPage / AuthPage yet.
        "src/routes/sign-in.tsx": route(`<main><h1>Sign in</h1></main>`),
        "src/routes/index.tsx": route(`<Landing />`),
      }),
    );
    expect(brief(f, "page-layout")).toEqual([
      "src/routes/_shell/crumbs.tsx:0",
      "src/routes/_shell/embedded.tsx:0",
      "src/routes/_shell/inbox.tsx:0",
    ]);
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

describe("follow-ups from the #303 review", () => {
  const routesOf = (root: string) => {
    const routes = webRoutes({ root, config: {}, files: scanFiles(root, {}) });
    return Object.fromEntries(routes.map((r) => [r.file.path, r]));
  };

  it("a route whose component is imported renders (not redirect-only), and page-layout follows the import", async () => {
    const root = app({
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/courses.tsx": `import { CoursesPage } from "@/components/CoursesPage";\nexport const Route = createFileRoute("/_shell/courses")({ component: CoursesPage });`,
      "src/components/CoursesPage.tsx": `import { DetailPage } from "@marktiderman/genesis-ui";\nexport function CoursesPage() { return <DetailPage title="Courses" />; }`,
      "src/routes/_shell/inbox.tsx": `import { Inbox } from "@/components/Inbox";\nexport const Route = createFileRoute("/_shell/inbox")({ component: Inbox });`,
      "src/components/Inbox.tsx": `export function Inbox() { return <main />; }`,
      "src/routes/_shell/go.tsx": `function Go() { return <Navigate to="/" />; }\nexport const Route = createFileRoute("/_shell/go")({ component: Go });`,
    });
    const by = routesOf(root);
    expect(by["src/routes/_shell/courses.tsx"]!.redirectOnly).toBe(false);
    expect(by["src/routes/_shell/inbox.tsx"]!.redirectOnly).toBe(false);
    expect(by["src/routes/_shell/go.tsx"]!.redirectOnly).toBe(true);
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/inbox.tsx:0"]);
  });

  it("pairs a TanStack posts.lazy.tsx with posts.tsx as one route", async () => {
    const root = app({
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/posts.tsx": `export const Route = createFileRoute("/_shell/posts")({ loader: () => fetchPosts() });`,
      "src/routes/_shell/posts.lazy.tsx": `export const Route = createLazyFileRoute("/_shell/posts")({ component: () => <main><h1>Posts</h1></main> });`,
      "src/routes/_shell/admin/route.lazy.tsx": `export const Route = createLazyFileRoute("/_shell/admin")({ component: () => <Outlet /> });`,
    });
    const routes = webRoutes({ root, config: {}, files: scanFiles(root, {}) });
    const posts = routes.filter((r) => r.segments.join("/") === "_shell/posts");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.file.path).toBe("src/routes/_shell/posts.lazy.tsx");
    expect(posts[0]!.files.map((f) => f.path).sort()).toEqual(["src/routes/_shell/posts.lazy.tsx", "src/routes/_shell/posts.tsx"]);
    expect(posts[0]!.redirectOnly).toBe(false);
    expect(routes.find((r) => r.file.path.endsWith("admin/route.lazy.tsx"))).toMatchObject({ segments: ["_shell", "admin"], layout: true, page: false });
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/posts.lazy.tsx:0"]);
  });

  it("checks a page that renders its own content around an <Outlet>, in page-layout and hand-rolled-sub-nav", async () => {
    const root = app({
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      // A list with the detail beside it: a page and a layout.
      "src/routes/_shell/courses.tsx": `export const Route = createFileRoute("/_shell/courses")({ component: () => (
  <main>
    <TabsList><TabsTrigger value="a">All</TabsTrigger></TabsList>
    <Outlet />
  </main>
) });`,
      "src/routes/_shell/courses.$id.tsx": `export const Route = createFileRoute("/_shell/courses/$id")({ component: () => <DetailPage title="x" /> });`,
      // Pure layouts: a pathless one, and one rendering nothing but the outlet.
      "src/routes/_shell/_admin.tsx": `export const Route = createFileRoute("/_shell/_admin")({ component: () => <section><Outlet /></section> });`,
      "src/routes/_shell/settings.tsx": `export const Route = createFileRoute("/_shell/settings")({ component: () => <Outlet /> });`,
      "src/routes/_shell/settings.profile.tsx": `export const Route = createFileRoute("/_shell/settings/profile")({ component: () => <DetailPage title="x" /> });`,
    });
    const by = routesOf(root);
    expect(by["src/routes/_shell/courses.tsx"]).toMatchObject({ layout: true, page: true });
    expect(by["src/routes/_shell/_admin.tsx"]).toMatchObject({ layout: true, page: false });
    expect(by["src/routes/_shell/settings.tsx"]).toMatchObject({ layout: true, page: false });
    const f = await run(root);
    expect(brief(f, "page-layout")).toEqual(["src/routes/_shell/courses.tsx:0"]);
    expect(brief(f, "hand-rolled-sub-nav")).toEqual(["src/routes/_shell/courses.tsx:3 TabsList"]);
  });

  it("reads Next.js app/: no private _folders, (groups), @slots or special files as routes", () => {
    const page = (title: string) => `export default function Page() { return <main>${title}</main>; }`;
    const root = app({
      "src/app/layout.tsx": `export default function Root({ children }) { return <html><body>{children}</body></html>; }`,
      "src/app/page.tsx": page("Home"),
      "src/app/courses/[id]/page.tsx": page("Course"),
      "src/app/courses/[id]/error.tsx": `"use client";\nexport default function Error() { return <p>Oops</p>; }`,
      "src/app/courses/[id]/loading.tsx": `export default function Loading() { return <p>…</p>; }`,
      "src/app/courses/not-found.tsx": `export default function NotFound() { return <p>Gone</p>; }`,
      "src/app/courses/template.tsx": `export default function T({ children }) { return <div>{children}</div>; }`,
      "src/app/@modal/default.tsx": `export default function D() { return null; }`,
      "src/app/_components/Card.tsx": `export function Card() { return <div />; }`,
      "src/app/(marketing)/about/page.tsx": page("About"),
    });
    const routes = webRoutes({ root, config: {}, files: scanFiles(root, {}) });
    expect(routes.map((r) => r.file.path).sort()).toEqual([
      "src/app/(marketing)/about/page.tsx",
      "src/app/courses/[id]/page.tsx",
      "src/app/layout.tsx",
      "src/app/page.tsx",
    ]);
    const by = Object.fromEntries(routes.map((r) => [r.file.path, r]));
    expect(by["src/app/(marketing)/about/page.tsx"]).toMatchObject({ segments: ["about"], index: true, page: true });
    expect(by["src/app/courses/[id]/page.tsx"]).toMatchObject({ segments: ["courses", "[id]"], index: true });
    expect(by["src/app/layout.tsx"]).toMatchObject({ layout: true, page: false });
    expect(by["src/app/page.tsx"]!.parents.map((p) => p.file.path)).toEqual(["src/app/layout.tsx"]);
  });

  describe("dev-only Genesis copies", () => {
    const pkg = (name: string, version: string, deps: Record<string, string> = {}, peers: Record<string, string> = {}) =>
      JSON.stringify({ name, version, dependencies: deps, peerDependencies: peers });

    it("a copy nested under the CLI (a devDependency) is info, not a runtime duplicate", async () => {
      const root = makeApp(null, {
        "package.json": JSON.stringify({
          name: "app",
          version: "1.0.0",
          dependencies: { "@marktiderman/genesis-features": "^0.3.0", "@marktiderman/genesis-chat": "^0.2.0" },
          devDependencies: { "@marktiderman/genesis-cli": "1.3.0", vitest: "1.0.0" },
        }),
        "node_modules/@marktiderman/genesis-features/package.json": pkg("@marktiderman/genesis-features", "0.3.0"),
        "node_modules/@marktiderman/genesis-cli/package.json": pkg("@marktiderman/genesis-cli", "1.3.0", { "@marktiderman/genesis-features": "^0.1.1" }),
        "node_modules/@marktiderman/genesis-cli/node_modules/@marktiderman/genesis-features/package.json": pkg(
          "@marktiderman/genesis-features",
          "0.1.2",
          {},
          { "@marktiderman/genesis-ui": "^1.0.0" },
        ),
        // A test runner's own copy: tooling, so its tree doesn't ship.
        "node_modules/vitest/package.json": pkg("vitest", "1.0.0", { "@marktiderman/genesis-chat": "^0.1.0" }),
        "node_modules/vitest/node_modules/@marktiderman/genesis-chat/package.json": pkg("@marktiderman/genesis-chat", "0.1.0"),
        "node_modules/@marktiderman/genesis-chat/package.json": pkg("@marktiderman/genesis-chat", "0.2.0"),
      });
      const copies = genesisInstalls(root);
      expect(copies.get("@marktiderman/genesis-features")!.map((c) => [c.version, c.devOnly])).toEqual([
        ["0.3.0", false],
        ["0.1.2", true],
      ]);
      const f = await run(root);
      expect(f.filter((x) => x.rule === "duplicate-genesis-package").map((x) => `${x.level} ${x.subject}`)).toEqual([
        "info @marktiderman/genesis-features",
        "info @marktiderman/genesis-chat",
      ]);
      // The CLI's own copy wants a genesis-ui the app doesn't have: info too.
      expect(f.filter((x) => x.rule === "peer-range-mismatch").map((x) => x.level)).toEqual(["info"]);
      expect((await runDoctor({ root, config: {}, strict: true })).ok).toBe(true);
    });

    it("the CLI's tree is dev-only even when it's listed in dependencies; a runtime copy still warns", async () => {
      const root = makeApp(null, {
        "package.json": JSON.stringify({
          name: "app",
          version: "1.0.0",
          dependencies: { "@marktiderman/genesis-cli": "1.3.0", "@marktiderman/genesis-core": "^1.7.0", "@marktiderman/genesis-studio-server": "0.2.1" },
        }),
        "node_modules/@marktiderman/genesis-cli/package.json": pkg("@marktiderman/genesis-cli", "1.3.0", { "@marktiderman/genesis-core": "^1.0.0" }),
        "node_modules/@marktiderman/genesis-cli/node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.0.0"),
        "node_modules/@marktiderman/genesis-studio-server/package.json": pkg("@marktiderman/genesis-studio-server", "0.2.1", { "@marktiderman/genesis-core": "1.6.0" }),
        "node_modules/@marktiderman/genesis-studio-server/node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.6.0"),
      });
      const core = genesisInstalls(root).get("@marktiderman/genesis-core")!;
      expect(core.map((c) => [c.version, c.devOnly])).toEqual([
        ["9.9.9", false],
        ["1.0.0", true],
        ["1.6.0", false],
      ]);
      const dup = (await run(root)).filter((x) => x.rule === "duplicate-genesis-package");
      expect(dup.map((x) => x.level)).toEqual(["warn"]);
      expect(dup[0]!.message).toContain("1.0.0 at node_modules/@marktiderman/genesis-cli/node_modules/@marktiderman/genesis-core");
      expect(dup[0]!.message).toContain("[dev only]");
    });
  });
});

describe("#314 review", () => {
  const pkg = (name: string, version: string, deps: Record<string, string> = {}, peers: Record<string, string> = {}) =>
    JSON.stringify({ name, version, dependencies: deps, peerDependencies: peers });
  const route = (body: string, imports = "") => `${imports}\nexport const Route = createFileRoute("/x")({ component: () => ${body} });`;
  const routesOf = (root: string) => Object.fromEntries(webRoutes({ root, config: {}, files: scanFiles(root, {}) }).map((r) => [r.file.path, r]));

  describe("duplicates in an app that lists everything as devDependencies", () => {
    it("still warns, and fails --strict (a Vite SPA's devDependencies ship)", async () => {
      const root = makeApp(null, {
        "package.json": JSON.stringify({
          name: "spa",
          version: "1.0.0",
          devDependencies: { "@marktiderman/genesis-core": "^1.7.0", "@marktiderman/genesis-ui": "^9.9.9", vite: "^7.0.0" },
        }),
        "node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.7.0"),
        "node_modules/@marktiderman/genesis-ui/node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.6.0"),
      });
      // makeApp's genesis-ui fixture has no deps; give it the nested core's range.
      writeFileSync(
        path.join(root, "node_modules/@marktiderman/genesis-ui/package.json"),
        JSON.stringify({ name: "@marktiderman/genesis-ui", version: "9.9.9", types: "./dist/index.d.ts", dependencies: { "@marktiderman/genesis-core": "1.6.0" } }),
      );
      const result = await runDoctor({ root, config: {}, strict: true });
      expect(result.findings.filter((f) => f.rule === "duplicate-genesis-package").map((f) => `${f.level} ${f.subject}`)).toEqual([
        "warn @marktiderman/genesis-core",
      ]);
      expect(result.ok).toBe(false);
      expect(genesisInstalls(root).get("@marktiderman/genesis-core")!.every((c) => !c.devOnly)).toBe(true);
    });

    it("warns when no copy ships but more than one is installed", async () => {
      const root = makeApp(null, {
        "package.json": JSON.stringify({ name: "app", version: "1.0.0", dependencies: { react: "^19.0.0" }, devDependencies: { "tool-a": "1", "tool-b": "1" } }),
        "node_modules/tool-a/package.json": pkg("tool-a", "1.0.0", { "@marktiderman/genesis-forms": "^1.0.0" }),
        "node_modules/tool-a/node_modules/@marktiderman/genesis-forms/package.json": pkg("@marktiderman/genesis-forms", "1.0.0"),
        "node_modules/tool-b/package.json": pkg("tool-b", "1.0.0", { "@marktiderman/genesis-forms": "^0.9.0" }),
        "node_modules/tool-b/node_modules/@marktiderman/genesis-forms/package.json": pkg("@marktiderman/genesis-forms", "0.9.0"),
      });
      const dup = (await run(root)).filter((f) => f.rule === "duplicate-genesis-package");
      expect(dup.map((f) => `${f.level} ${f.subject}`)).toEqual(["warn @marktiderman/genesis-forms"]);
    });
  });

  it("a wrapper layout (<div className><Outlet/></div>) is a layout, not a page", async () => {
    const root = app({
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/settings.tsx": route(`<div className="space-y-4"><Outlet /></div>`),
      "src/routes/_shell/settings.profile.tsx": route(`<DetailPage title="Profile" />`),
    });
    expect(routesOf(root)["src/routes/_shell/settings.tsx"]).toMatchObject({ layout: true, page: false });
    expect(brief(await run(root), "page-layout")).toEqual([]);
  });

  it("follows the trail: two hops, barrels, lazyRouteComponent, tsconfig and package.json aliases; an unreadable alias is skipped", async () => {
    const root = app({
      "package.json": JSON.stringify({ name: "app", version: "1.0.0", imports: { "#ui/*": "./src/ui/*" }, dependencies: { "@tanstack/react-router": "1" } }),
      "tsconfig.json": `{
  // JSONC, as tsconfig is
  "compilerOptions": { "baseUrl": ".", "paths": { "@app/*": ["src/*"], }, },
}`,
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      // route → page component → barrel → wrapper → DetailPage
      "src/routes/_shell/two.tsx": route(`<CoursesPage />`, `import { CoursesPage } from "@app/pages/CoursesPage";`),
      "src/pages/CoursesPage.tsx": `import { Frame } from "../ui";\nexport function CoursesPage() { return <Frame />; }`,
      "src/ui/index.ts": `export * from "./Frame";`,
      "src/ui/Frame.tsx": `import { DetailPage } from "@marktiderman/genesis-ui";\nexport const Frame = () => <DetailPage title="x" />;`,
      "src/routes/_shell/lazy.tsx": `export const Route = createFileRoute("/lazy")({ component: lazyRouteComponent(() => import("../../pages/LazyPage")) });`,
      "src/pages/LazyPage.tsx": `export default function LazyPage() { return <DetailPage title="Lazy" />; }`,
      "src/routes/_shell/hash.tsx": route(`<Framed />`, `import { Framed } from "#ui/Framed";`),
      "src/ui/Framed.tsx": `export const Framed = () => <DashboardPage title="x" />;`,
      // Neither installed, declared nor an alias we can read: unknown, so no finding.
      "src/routes/_shell/lost.tsx": route(`<Mystery />`, `import { Mystery } from "@corp/mystery";`),
      // A sure "no": the trail ends in app files and packages without a layout. A data helper it only
    // calls isn't followed (even from an unreadable package), and "Start from" in a string isn't an import.
      "src/routes/_shell/bare.tsx": route(`<Plain />`, `import { Plain } from "@app/pages/Plain";`),
      "src/pages/Plain.tsx": `import { load } from "@corp/data-helpers";\nconst fields = [{ label: "Start from", type: "select" }];\nexport const Plain = () => <main>{load(fields)}</main>;`,
    });
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/bare.tsx:0"]);
  });

  it("a layout whose <Outlet> is in an imported component wraps its children (_layout pathless routes too)", async () => {
    const root = app({
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/_layout.tsx": `import { AdminLayout } from "@/components/AdminLayout";\nexport const Route = createFileRoute("/_shell/_layout")({ component: AdminLayout });`,
      "src/components/AdminLayout.tsx": `export function AdminLayout() { return <DetailPage title="Admin"><Outlet /></DetailPage>; }`,
      "src/routes/_shell/_layout/users.tsx": route(`<UsersTable />`),
      "src/routes/_shell/team.tsx": `import { TeamLayout } from "@/components/TeamLayout";\nexport const Route = createFileRoute("/_shell/team")({ component: TeamLayout });`,
      "src/components/TeamLayout.tsx": `export function TeamLayout() { return <DashboardPage title="Team"><Outlet /></DashboardPage>; }`,
      "src/routes/_shell/team.members.tsx": route(`<MembersTable />`),
    });
    const by = routesOf(root);
    expect(by["src/routes/_shell/_layout.tsx"]).toMatchObject({ layout: true, page: false });
    expect(by["src/routes/_shell/team.tsx"]!.layout).toBe(true);
    expect(by["src/routes/_shell/_layout/users.tsx"]!.parents.map((p) => p.file.path)).toContain("src/routes/_shell/_layout.tsx");
    expect(brief(await run(root), "page-layout")).toEqual([]);
  });

  it("Next: a (group) layout wraps only its group, @slot pages don't collide, and colocated files aren't routes", async () => {
    const page = (body: string) => `export default function Page() { return ${body}; }`;
    const root = app({
      "src/app/layout.tsx": `import { AppShell } from "@marktiderman/genesis-ui";\nexport default function Root({ children }) { return <AppShell navigation={[]}>{children}</AppShell>; }`,
      "src/app/page.tsx": page(`<main>Home</main>`),
      "src/app/(admin)/layout.tsx": `export default function Admin({ children }) { return <DetailPage title="Admin">{children}</DetailPage>; }`,
      "src/app/(admin)/users/page.tsx": page(`<UsersTable />`),
      "src/app/@modal/page.tsx": page(`<p>modal</p>`),
      "src/app/courses/page.tsx": page(`<DetailPage title="Courses" />`),
      "src/app/courses/CourseCard.tsx": `export function CourseCard() { return <div>card</div>; }`,
    });
    const by = routesOf(root);
    expect(Object.keys(by)).not.toContain("src/app/courses/CourseCard.tsx");
    expect(by["src/app/page.tsx"]!.parents.map((p) => p.file.path)).toEqual(["src/app/layout.tsx"]);
    expect(by["src/app/(admin)/users/page.tsx"]!.parents.map((p) => p.file.path)).toEqual(["src/app/(admin)/layout.tsx", "src/app/layout.tsx"]);
    expect(by["src/app/@modal/page.tsx"]).toMatchObject({ segments: [], tree: ["@modal"] });
    // The home page has no layout of its own and the (admin) layout doesn't wrap it; the @slot page is the same.
    expect(brief(await run(root), "page-layout")).toEqual(["src/app/@modal/page.tsx:0", "src/app/page.tsx:0"]);
  });

  it("a folder route.tsx with its own content around an <Outlet> is a page; export default of a local redirect is redirect-only", async () => {
    const root = app({
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/posts/route.tsx": route(`<section><h2>Posts</h2><ul><li>One</li></ul><Outlet /></section>`),
      "src/routes/_shell/posts/$id.tsx": route(`<DetailPage title="Post" />`),
      "src/routes/_shell/old.tsx": `function R() { return <Navigate to="/" />; }\nexport default R;`,
    });
    const by = routesOf(root);
    expect(by["src/routes/_shell/posts/route.tsx"]).toMatchObject({ layout: true, page: true });
    expect(by["src/routes/_shell/old.tsx"]!.redirectOnly).toBe(true);
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/posts/route.tsx:0"]);
  });
});

describe("#314 re-review", () => {
  const pkgJson = (extra: Record<string, unknown> = {}) => JSON.stringify({ name: "app", version: "1.0.0", dependencies: { "@tanstack/react-router": "1" }, ...extra });
  const route = (body: string, imports = "") => `${imports}\nexport const Route = createFileRoute("/x")({ component: () => ${body} });`;
  const layoutTest = (code: string) => /<DetailPage(?=[\s>/])/.test(code);

  it("the trail cache gives the same answer in either order, through a cycle", () => {
    const root = app({
      "src/A.tsx": `import { B } from "./B";\nimport { D } from "./D";\nexport const A = () => <><B /><D /></>;`,
      "src/B.tsx": `import { A } from "./A";\nexport const B = () => <A />;`,
      "src/C.tsx": `import { B } from "./B";\nexport const C = () => <B />;`,
      "src/D.tsx": `export const D = () => <DetailPage title="x" />;`,
    });
    const files = scanFiles(root, {});
    const get = (name: string) => files.find((f) => f.path === `src/${name}.tsx`)!;
    const forward = createTrail({ root, files });
    const one = [forward.reach(get("A"), layoutTest), forward.reach(get("C"), layoutTest), forward.reach(get("B"), layoutTest)];
    const backward = createTrail({ root, files });
    const two = [backward.reach(get("B"), layoutTest), backward.reach(get("C"), layoutTest), backward.reach(get("A"), layoutTest)];
    expect(one).toEqual(["yes", "yes", "yes"]);
    expect(two).toEqual(["yes", "yes", "yes"]);
  });

  it("resolves tsconfig extends (a file or a package) and baseUrl bare imports, so it reports what main reported", async () => {
    const root = app({
      "package.json": pkgJson(),
      "tsconfig.json": `{ "extends": "./tsconfig.base.json", "compilerOptions": { "strict": true } }`,
      "tsconfig.base.json": `{ "extends": "@acme/tsconfig/web.json", "compilerOptions": { "baseUrl": "src" } }`,
      "node_modules/@acme/tsconfig/package.json": JSON.stringify({ name: "@acme/tsconfig", version: "1.0.0" }),
      "node_modules/@acme/tsconfig/web.json": `{ "compilerOptions": { "paths": { "@app/*": ["../../../src/*"] } } }`,
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      // Through the package's paths (relative to the config that holds them): a layout, so it passes.
      "src/routes/_shell/framed.tsx": route(`<Framed />`, `import { Framed } from "@app/pages/Framed";`),
      "src/pages/Framed.tsx": `export const Framed = () => <DetailPage title="x" />;`,
      // Through baseUrl: no layout at the end, so it's reported (as on main).
      "src/routes/_shell/plain.tsx": route(`<Plain />`, `import { Plain } from "pages/Plain";`),
      "src/pages/Plain.tsx": `export const Plain = () => <main />;`,
    });
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/plain.tsx:0"]);
  });

  it("ignores import() in strings and comments", async () => {
    expect(stripForImports(`const s = "import('./Page')"; // import("./Old")\nimport { A } from "./a";`)).toContain(`from "./a"`);
    expect(stripForImports(`const s = "import('./Page')";`)).not.toContain("./Page");
    expect(stripForImports("const t = `${x} import(\"./T\")`;")).not.toContain("./T");
    expect(stripForImports(`<p>Don't import("./x") here</p>; const y = import("./real");`)).toContain(`import("./real")`);
    const root = app({
      "package.json": pkgJson(),
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/notes.tsx": `const tip = "lazy(() => import('../../pages/Page'))";\n/* import("../../pages/Page") */\n${route("<main>{tip}</main>")}`,
      "src/pages/Page.tsx": `export default function Page() { return <DetailPage title="x" />; }`,
    });
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/notes.tsx:0"]);
  });

  it("past six hops the trail ends as main's did: the route is reported", async () => {
    const chain = (prefix: string, n: number): Record<string, string> => {
      const files: Record<string, string> = {};
      for (let i = 1; i <= n; i++) {
        files[`src/${prefix}/C${i}.tsx`] =
          i === n ? `export const C${i} = () => <DetailPage title="x" />;` : `import { C${i + 1} } from "./C${i + 1}";\nexport const C${i} = () => <C${i + 1} />;`;
      }
      return files;
    };
    const root = app({
      "package.json": pkgJson(),
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/near.tsx": route(`<C1 />`, `import { C1 } from "../../near/C1";`),
      ...chain("near", 3),
      "src/routes/_shell/far.tsx": route(`<C1 />`, `import { C1 } from "../../far/C1";`),
      ...chain("far", 8),
    });
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/far.tsx:0"]);
  });

  it("an unresolved import never counts as an <Outlet>: the route stays a page and its children are still checked", async () => {
    const root = app({
      "package.json": pkgJson(),
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/team.tsx": route(`<main><Mystery /></main>`, `import { Mystery } from "@corp/mystery";`),
      "src/routes/_shell/team.members.tsx": route(`<MembersTable />`),
    });
    const by = Object.fromEntries(webRoutes({ root, config: {}, files: scanFiles(root, {}) }).map((r) => [r.file.path, r]));
    expect(by["src/routes/_shell/team.tsx"]!.layout).toBe(false);
    expect(by["src/routes/_shell/team.members.tsx"]!.parents.map((p) => p.file.path)).not.toContain("src/routes/_shell/team.tsx");
    // team.tsx itself is unsure (its import can't be traced); its child is reported as on main.
    expect(brief(await run(root), "page-layout")).toEqual(["src/routes/_shell/team.members.tsx:0"]);
  });

  it("a mixed graph (an undeclared hoisted package pulls in the top-level copy) warns", async () => {
    const pkg = (name: string, version: string, deps: Record<string, string> = {}) => JSON.stringify({ name, version, dependencies: deps });
    const root = makeApp(null, {
      "package.json": JSON.stringify({ name: "app", version: "1.0.0", dependencies: { react: "^19.0.0" }, devDependencies: { "@marktiderman/genesis-ui": "^9.0.0" } }),
      "node_modules/react/package.json": pkg("react", "19.0.0"),
      "node_modules/@marktiderman/genesis-chat/package.json": pkg("@marktiderman/genesis-chat", "0.2.0", { "@marktiderman/genesis-core": "^1.7.0" }),
      "node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.7.0"),
      "node_modules/@marktiderman/genesis-ui/node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.6.0"),
    });
    writeFileSync(
      path.join(root, "node_modules/@marktiderman/genesis-ui/package.json"),
      JSON.stringify({ name: "@marktiderman/genesis-ui", version: "9.9.9", types: "./dist/index.d.ts", dependencies: { "@marktiderman/genesis-core": "1.6.0" } }),
    );
    const core = genesisInstalls(root).get("@marktiderman/genesis-core")!;
    // genesis-ui is a devDependency, but not tooling: a bundler ships it, so its nested core is runtime.
    expect(core.map((c) => [c.version, c.runtime, c.devOnly])).toEqual([
      ["1.7.0", false, false],
      ["1.6.0", true, false],
    ]);
    const result = await runDoctor({ root, config: {}, strict: true });
    expect(result.findings.filter((f) => f.rule === "duplicate-genesis-package").map((f) => f.level)).toEqual(["warn"]);
    expect(result.ok).toBe(false);
  });

  it("Next intercepting folders are the segment they intercept; a conditional outlet is still a layout", () => {
    const root = app({
      "src/app/layout.tsx": `export default function Root({ children }) { return <html><body>{children}</body></html>; }`,
      "src/app/feed/(..)photo/[id]/page.tsx": `export default function P() { return <main>Photo</main>; }`,
      "src/routes-unused.tsx": "",
    });
    const by = Object.fromEntries(webRoutes({ root, config: {}, files: scanFiles(root, {}) }).map((r) => [r.file.path, r]));
    expect(by["src/app/feed/(..)photo/[id]/page.tsx"]!.segments).toEqual(["feed", "photo", "[id]"]);
    const tan = app({
      "src/routes/__root.tsx": `export const Route = createRootRoute({ component: () => <Outlet /> });`,
      "src/routes/admin.tsx": `export const Route = createFileRoute("/admin")({ component: () => isAdmin ? <div className="p-4"><Outlet /></div> : <Outlet /> });`,
    });
    const admin = webRoutes({ root: tan, config: {}, files: scanFiles(tan, {}) }).find((r) => r.file.path === "src/routes/admin.tsx")!;
    expect(admin).toMatchObject({ layout: true, page: false });
  });
});

describe("trail: third-pass review", () => {
  it("a cyclic import graph costs about what an acyclic one of the same size does", () => {
    const N = 300;
    const K = 8;
    const graph = (cyclic: boolean) => {
      const files: Record<string, string> = {};
      for (let i = 0; i < N; i++) {
        // Acyclic: each imports the next K. Cyclic: K/2 ahead and K/2 behind (wrapping), so nearly every path loops.
        const deps = (cyclic ? Array.from({ length: K }, (_, j) => (j < K / 2 ? i + j + 1 : i - (j - K / 2) - 1)) : Array.from({ length: K }, (_, j) => i + j + 1))
          .map((d) => (cyclic ? (d + N) % N : d))
          .filter((d) => d < N && d !== i);
        files[`src/c/C${i}.tsx`] =
          deps.map((d) => `import { C${d} } from "./C${d}";`).join("\n") + `\nexport const C${i} = () => <div>${deps.map((d) => `<C${d} />`).join("")}</div>;`;
      }
      for (let r = 0; r < 60; r++) files[`src/r/R${r}.tsx`] = `import { C${(r * 7) % N} } from "../c/C${(r * 7) % N}";\nexport const R = () => <C${(r * 7) % N} />;`;
      const root = makeApp(null, files);
      const scanned = scanFiles(root, {});
      return { root, routes: scanned.filter((f) => f.path.startsWith("src/r/")), scanned };
    };
    const layout = (code: string) => /<DetailPage(?=[\s>/])/.test(code);
    const once = (g: ReturnType<typeof graph>) => {
      const trail = createTrail({ root: g.root, files: g.scanned });
      const t0 = performance.now();
      for (const r of g.routes) expect(trail.reach(r, layout)).toBe("no");
      return performance.now() - t0;
    };
    // Best of five each, interleaved, so a noisy moment on a shared runner hits both graphs.
    const acyclicGraph = graph(false);
    const cyclicGraph = graph(true);
    let acyclic = Infinity;
    let cyclic = Infinity;
    for (let run = 0; run < 5; run++) {
      acyclic = Math.min(acyclic, once(acyclicGraph));
      cyclic = Math.min(cyclic, once(cyclicGraph));
    }
    if (process.env.TRAIL_BENCH) process.stderr.write(`BENCH ${JSON.stringify({ acyclic, cyclic })}\n`);
    // Relative, not a fixed budget: ~2.5-3x with cut answers cached, ~9x without; the limit sits between.
    expect(cyclic).toBeLessThan(acyclic * 6 + 25);
  });

  it("a cut answer is reused only while its cut modules are on the path (same answers in any order)", () => {
    // X → Y → Z → X, Z → W (W renders the layout only when reached; Y alone has no route to it but through Z).
    const root = app({
      "src/X.tsx": `import { Y } from "./Y";\nexport const X = () => <Y />;`,
      "src/Y.tsx": `import { Z } from "./Z";\nexport const Y = () => <Z />;`,
      "src/Z.tsx": `import { X } from "./X";\nimport { W } from "./W";\nexport const Z = () => <><X /><W /></>;`,
      "src/W.tsx": `export const W = () => <DetailPage title="w" />;`,
      "src/V.tsx": `import { Y } from "./Y";\nexport const V = () => <Y />;`,
    });
    const files = scanFiles(root, {});
    const get = (n: string) => files.find((f) => f.path === `src/${n}.tsx`)!;
    const test = (code: string) => /<DetailPage(?=[\s>/])/.test(code);
    const orders = [
      ["X", "V", "Y", "Z"],
      ["V", "Z", "X", "Y"],
      ["Z", "Y", "V", "X"],
    ];
    for (const order of orders) {
      const trail = createTrail({ root, files });
      expect(order.map((n) => trail.reach(get(n), test))).toEqual(order.map(() => "yes"));
    }
  });
});

describe("installs: third-pass review", () => {
  const pkg = (name: string, version: string, deps: Record<string, string> = {}) => JSON.stringify({ name, version, dependencies: deps });
  it("a bundled app's devDependencies ship: core ^1.7 in deps and genesis-ui (nested core 1.6) in devDeps warns", async () => {
    const root = makeApp(null, {
      "package.json": JSON.stringify({
        name: "app",
        version: "1.0.0",
        dependencies: { "@marktiderman/genesis-core": "^1.7.0" },
        devDependencies: { "@marktiderman/genesis-ui": "^9.0.0", vite: "^7.0.0", vitest: "^3.0.0", "@types/react": "^19.0.0" },
      }),
      "node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.7.0"),
      "node_modules/@marktiderman/genesis-ui/node_modules/@marktiderman/genesis-core/package.json": pkg("@marktiderman/genesis-core", "1.6.0"),
    });
    writeFileSync(
      path.join(root, "node_modules/@marktiderman/genesis-ui/package.json"),
      JSON.stringify({ name: "@marktiderman/genesis-ui", version: "9.9.9", types: "./dist/index.d.ts", dependencies: { "@marktiderman/genesis-core": "1.6.0" } }),
    );
    const core = genesisInstalls(root).get("@marktiderman/genesis-core")!;
    expect(core.map((c) => [c.version, c.runtime, c.devOnly])).toEqual([
      ["1.7.0", true, false],
      ["1.6.0", true, false],
    ]);
    const result = await runDoctor({ root, config: {}, strict: true });
    expect(result.findings.filter((f) => f.rule === "duplicate-genesis-package").map((f) => `${f.level} ${f.subject}`)).toEqual([
      "warn @marktiderman/genesis-core",
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("tokenizer: third-pass review", () => {
  it("reads regex literals, and backticks and apostrophes in JSX text, without losing its place", () => {
    const code = [
      `const re = /\`+/g; const half = a / b / c;`,
      `export const Song = () => <p>Rock 'n roll, use \`npm i\` and/or <Inner /></p>;`,
      `const t = css\`color: red\`;`,
      `const lazyPage = lazy(() => import("./Page"));`,
      `<Foo bar={x} /></Foo>`,
      `<p>{done}/{total} done</p><Bar />`,
      `<p> / <Baz /></p>`,
    ].join("\n");
    const out = stripForImports(code)!;
    expect(out).not.toBeNull();
    expect(out).toContain("<Inner />");
    expect(out).toContain(`import("./Page")`);
    expect(out).toContain("<Foo bar={x} /></Foo>");
    expect(out).toContain("{done}/{total} done</p><Bar />");
    expect(out).toContain("<p> / <Baz /></p>");
    expect(out).not.toContain("color: red");
    expect(out.length).toBe(code.length);
  });

  it("gives up (null) when it can't be sure, and the trail then reports nothing for that route", async () => {
    expect(stripForImports(`<p>'Tis the season</p>\nconst x = 1;`)).toBeNull();
    expect(stripForImports("const t = `never closed")).toBeNull();
    const root = app({
      "package.json": JSON.stringify({ name: "app", version: "1.0.0", dependencies: { "@tanstack/react-router": "1" } }),
      "src/routes/_shell/route.tsx": SHELL_LAYOUT,
      "src/routes/_shell/carols.tsx": `import { Carols } from "../../pages/Carols";\nexport const Route = createFileRoute("/carols")({ component: Carols });`,
      "src/pages/Carols.tsx": `export const Carols = () => <main><p>'Tis the season</p></main>;`,
      // Rock 'n roll used to blank the rest of the file and hide the layout below it.
      "src/routes/_shell/songs.tsx": `import { Songs } from "../../pages/Songs";\nexport const Route = createFileRoute("/songs")({ component: Songs });`,
      "src/pages/Songs.tsx": `import { Frame } from "./Frame";\nexport const Songs = () => <Frame><p>Rock 'n roll</p></Frame>;\n`,
      "src/pages/Frame.tsx": `export const Frame = ({ children }) => <DetailPage title="Songs">{children}</DetailPage>;`,
    });
    expect(brief(await run(root), "page-layout")).toEqual([]);
  });
});

describe("installs: a nested app with its own install", () => {
  const manifest = (name: string, version: string, extra: Record<string, unknown> = {}) => JSON.stringify({ name, version, ...extra });
  /** A parent app (makeApp's install, plus a CLI and a UI that pulls in the parent's core) and apps/mobile inside it. */
  const nested = (opts: { lockfile: boolean; mobileDeps?: Record<string, string> }) => {
    const root = makeApp(null, {
      "package.json": manifest("parent", "1.0.0", { dependencies: { "@marktiderman/genesis-ui": "^9.0.0", "@marktiderman/genesis-forms": "^1.0.0" } }),
      "node_modules/@marktiderman/genesis-cli/package.json": manifest("@marktiderman/genesis-cli", "1.8.0", { dependencies: { "@marktiderman/genesis-core": "^9.0.0" } }),
      "node_modules/@marktiderman/genesis-forms/package.json": manifest("@marktiderman/genesis-forms", "1.0.0", { dependencies: { "@marktiderman/genesis-core": "^9.0.0" } }),
      // The mobile app's own install: its own core (same version as the parent's) and a chat with optional peers.
      "apps/mobile/package.json": manifest("mobile", "0.1.0", {
        dependencies: { "@marktiderman/genesis-core": "9.9.9", "@marktiderman/genesis-chat": "0.2.0", ...opts.mobileDeps },
      }),
      ...(opts.lockfile ? { "apps/mobile/bun.lock": "{}" } : {}),
      "apps/mobile/node_modules/@marktiderman/genesis-core/package.json": manifest("@marktiderman/genesis-core", "9.9.9"),
      "apps/mobile/node_modules/@marktiderman/genesis-chat/package.json": manifest("@marktiderman/genesis-chat", "0.2.0", {
        peerDependencies: { "@marktiderman/genesis-core": "^9.0.0", "@marktiderman/genesis-ui": "^9.0.0" },
        peerDependenciesMeta: { "@marktiderman/genesis-ui": { optional: true } },
      }),
    });
    // The parent's genesis-ui depends on the parent's core.
    writeFileSync(
      path.join(root, "node_modules/@marktiderman/genesis-ui/package.json"),
      JSON.stringify({ name: "@marktiderman/genesis-ui", version: "9.9.9", types: "./dist/index.d.ts", dependencies: { "@marktiderman/genesis-core": "^9.0.0" } }),
    );
    return path.join(root, "apps", "mobile");
  };
  const installs = async (app: string) => (await runDoctor({ root: app, config: {} })).findings.filter((f) => /duplicate|peer-range/.test(f.rule));

  it("leaves out copies only the parent's packages load (an unmet optional peer, an undeclared CLI)", async () => {
    const app = nested({ lockfile: true });
    const core = genesisInstalls(app).get("@marktiderman/genesis-core")!;
    expect(core.map((c) => c.dir)).toEqual(["node_modules/@marktiderman/genesis-core"]);
    expect(genesisInstalls(app).has("@marktiderman/genesis-cli")).toBe(false);
    expect(await installs(app)).toEqual([]);
  });

  it("keeps a parent copy the app's own dependencies resolve to", async () => {
    // genesis-forms isn't in the mobile install, so Node resolves it (and its core) from the parent.
    const app = nested({ lockfile: true, mobileDeps: { "@marktiderman/genesis-forms": "^1.0.0" } });
    const found = await installs(app);
    expect(found.map((f) => `${f.level} ${f.rule} ${f.subject}`)).toEqual(["warn duplicate-genesis-package @marktiderman/genesis-core"]);
    expect(found[0]!.message).toContain("../../node_modules/@marktiderman/genesis-core (@marktiderman/genesis-forms@1.0.0 wants ^9.0.0)");
  });

  it("a workspace member (no install of its own) shares the root's: hoisted peers there still count", async () => {
    const app = nested({ lockfile: false });
    const found = await installs(app);
    expect(found.map((f) => `${f.level} ${f.subject}`)).toEqual(["warn @marktiderman/genesis-core"]);
  });
});
