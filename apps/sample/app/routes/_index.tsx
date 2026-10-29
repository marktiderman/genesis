/**
 * The front door: what Genesis is, who it's for, how to start, and a
 * definition beside the screen it draws. Outside the app shell.
 */
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from "@marktiderman/genesis-ui";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { ArrowRight, Bot, Building2, Check, ClipboardList, Copy, LayoutList, MessagesSquare, Smartphone } from "lucide-react";
import { SiteFooter } from "../components/site-footer";
import { GENESIS_VERSION, GROUP_LABELS, LAYER_BANDS, PACKAGES, packagesIn, type GenesisPackage } from "../lib/packages";
import { INIT_COMMAND, NPM_URL, REPO_URL, SITE_TAGLINE } from "../lib/site";
import { itemsView } from "../lib/views/items.view";
import itemsViewSource from "../lib/views/items.view.ts?raw";

const BASE = import.meta.env.BASE_URL;

const NAV = [
  { label: "Demo", to: "/demo" },
  { label: "Components", to: "/showcase" },
  { label: "Packages", to: "/packages" },
  { label: "Docs", href: `${REPO_URL}/tree/main/docs` },
  { label: "Agents", href: `${BASE}llms.txt` },
  { label: "Storybook", href: `${BASE}storybook/` },
  { label: "Changelog", href: `${REPO_URL}/releases` },
];

const PROOF = [
  {
    icon: Building2,
    title: "Workspaces and tenants",
    body: "One app serves many organizations. Row-level security keeps each one's data apart; the workspace switcher picks which one you're working in.",
    to: "/demo",
  },
  {
    icon: LayoutList,
    title: "Lists and record pages",
    body: "Describe a resource once. A list is one line, a record page another, on web and on the phone.",
    to: "/items",
  },
  {
    icon: ClipboardList,
    title: "Forms",
    body: "A serializable form definition with logic, validation and a visual builder, rendered one question at a time or classic.",
    to: "/forms",
  },
  {
    icon: MessagesSquare,
    title: "Chat, sites and data",
    body: "Chat, landing pages and an Airtable-style Data Studio, in the app's own Supabase.",
    to: "/chat",
  },
  {
    icon: Smartphone,
    title: "Web and native",
    body: "The same views on React Native through the native components and an Expo starter.",
    to: "/showcase/primitives",
  },
  {
    icon: Bot,
    title: "Built for your agent",
    body: "Skills, llms.txt and a doctor that fails CI when a screen strays from the system, whoever wrote it.",
    href: `${BASE}llms.txt`,
  },
];

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-border bg-muted/50 py-1.5 pl-4 pr-1.5 font-mono text-sm">
      <span aria-hidden className="select-none text-muted-foreground">$</span>
      <code className="min-w-0 flex-1 truncate">{command}</code>
      <Button testID="index-button-1"
        variant="ghost"
        size="icon"
        aria-label={copied ? "Copied" : "Copy the command"}
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function PackageLink({ p }: { p: GenesisPackage }) {
  return (
    <li className="min-w-0">
      <a className="font-mono text-sm font-medium hover:underline" href={`${BASE}packages/${p.dir}`}>
        {p.short}
      </a>{" "}
      <span className="text-xs text-muted-foreground">{p.version}</span>
      {p.essential ? (
        <Badge variant="secondary" className="ml-2 align-middle text-[10px]" data-testid={`essential-${p.dir}`}>
          essential
        </Badge>
      ) : null}
      <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
    </li>
  );
}

function ModuleCard({ p }: { p: GenesisPackage }) {
  const m = p.module!;
  return (
    <Card className="h-full" data-testid={`module-${p.dir}`}>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            <a className="hover:underline" href={`${BASE}packages/${p.dir}`}>{m.name}</a>
          </CardTitle>
          <span className="font-mono text-xs text-muted-foreground">{p.short} {p.version}</span>
        </div>
        <CardDescription>{m.summary}</CardDescription>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Built from</p>
          <ul className="mt-1 flex flex-wrap gap-1" aria-label={`${m.name} is built from`}>
            {m.builtFrom.map((d) => (
              <li key={d}>
                <Badge variant="outline" className="font-mono text-[11px]">{d}</Badge>
              </li>
            ))}
          </ul>
        </div>
        {m.schema ? (
          <p className="text-xs text-muted-foreground">
            Owns the <code className="rounded bg-muted px-1">{m.schema}</code> schema
          </p>
        ) : null}
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs"><code>{m.install}</code></pre>
      </CardHeader>
    </Card>
  );
}

function NavLink({ item }: { item: (typeof NAV)[number] }) {
  const cls = "rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";
  return "to" in item && item.to ? (
    <Link className={cls} to={item.to}>{item.label}</Link>
  ) : (
    <a className={cls} href={item.href}>{item.label}</a>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">G</span>
            Genesis
          </Link>
          {GENESIS_VERSION ? <Badge variant="outline" data-testid="version-badge">v{GENESIS_VERSION}</Badge> : null}
          <nav aria-label="Site" className="order-last -mx-2 flex w-full flex-wrap gap-1 sm:order-none sm:ml-auto sm:w-auto">
            {NAV.map((item) => (
              <NavLink key={item.label} item={item} />
            ))}
          </nav>
          <a className="ml-auto text-sm text-muted-foreground hover:text-foreground sm:ml-0" href={REPO_URL}>GitHub</a>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">{SITE_TAGLINE}</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Genesis is an open-source framework for multi-tenant business apps. Workspaces, lists, record pages, forms,
            chat and AI, on web and native, from one design system. Row-level security keeps each tenant's data apart,
            and a doctor keeps every screen on the system, whether a person or an agent wrote it.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            For teams and solo builders who ship several apps on React and Supabase and want them to look and behave
            the same.
          </p>
          <div className="mt-8 flex flex-col gap-4">
            <CopyCommand command={INIT_COMMAND} />
            <div className="flex flex-wrap gap-3">
              <Button testID="index-button-2" asChild>
                <Link to="/demo">
                  Try the demo <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button testID="index-button-3" asChild variant="outline">
                <a href={`${REPO_URL}/blob/main/docs/FRAMEWORK.md`}>Read the docs</a>
              </Button>
              <Button testID="index-button-4" asChild variant="ghost">
                <a href={NPM_URL}>npm</a>
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="code-heading" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 id="code-heading" className="text-2xl font-semibold tracking-tight">Describe it once. The screen follows.</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            On the left, the whole definition of a list. On the right, the screen it draws: search, sort, modes, a form
            and a detail panel, running in your browser on sample data.
          </p>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <pre className="max-h-[520px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed" aria-label="items.view.ts" tabIndex={0}>
              <code>{itemsViewSource}</code>
            </pre>
            <div className="min-w-0 overflow-hidden rounded-lg border border-border" data-testid="home-live-view">
              <ResourceView view={itemsView} layout="embedded" mode="table" detail="panel" />
            </div>
          </div>
        </section>

        <section aria-labelledby="proof-heading" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 id="proof-heading" className="text-2xl font-semibold tracking-tight">What's in it</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROOF.map((p) => {
              const body = (
                <Card className="h-full transition hover:border-primary/50">
                  <CardHeader>
                    <p.icon aria-hidden className="mb-2 h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{p.title}</CardTitle>
                    <CardDescription>{p.body}</CardDescription>
                  </CardHeader>
                </Card>
              );
              return p.to ? (
                <Link key={p.title} to={p.to} className="block">{body}</Link>
              ) : (
                <a key={p.title} href={p.href} className="block">{body}</a>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="packages-heading" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 id="packages-heading" className="text-2xl font-semibold tracking-tight">
            {PACKAGES.length} packages, one version
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            In layers that only depend downward: the foundation and primitives are level 1, the modules built from
            them level 2. Start with <code className="rounded bg-muted px-1 text-sm">{INIT_COMMAND}</code> and the
            packages marked essential. This list is read from the repository at build time.
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_16rem]">
            <div className="space-y-4">
              {LAYER_BANDS.map((band) => (
                <section
                  key={band.layer}
                  aria-labelledby={`band-${band.layer}`}
                  className="rounded-lg border border-border p-4 sm:p-5"
                  data-testid={`layer-${band.layer}`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 id={`band-${band.layer}`} className="text-lg font-semibold">{band.title}</h3>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{band.level}</span>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{band.blurb}</p>
                  {band.layer === "module" ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {packagesIn("module").flatMap((g) => g.packages).map((p) => (
                        <ModuleCard key={p.name} p={p} />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {packagesIn(band.layer).map((g) => (
                        <div key={g.group} data-testid={`group-${band.layer}-${g.group}`}>
                          <h4 className="text-sm font-medium">{GROUP_LABELS[g.group]}</h4>
                          <ul className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                            {g.packages.map((p) => (
                              <PackageLink key={p.name} p={p} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
            <aside aria-labelledby="band-tooling" className="h-fit rounded-lg border border-dashed border-border p-4 sm:p-5" data-testid="layer-tooling">
              <h3 id="band-tooling" className="text-lg font-semibold">Tooling</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Beside the layers: it may use any package, and no runtime package uses it.
              </p>
              <ul className="mt-4 space-y-3">
                {packagesIn("tooling").flatMap((g) => g.packages).map((p) => (
                  <PackageLink key={p.name} p={p} />
                ))}
              </ul>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
