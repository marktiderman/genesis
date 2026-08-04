/**
 * Marketing landing page — the public face of the Genesis project.
 *
 * Lives outside `_layout.tsx` (see `routes.ts`: `index("routes/_index.tsx")`
 * is a sibling of the `layout(...)` block, not nested inside it) so it gets
 * its own chrome instead of the app-shaped `AppShell` sidebar every other
 * route uses — a marketing page and a dev-tool sidebar want different
 * shapes. `/showcase` (inside the layout) is the developer-facing entry
 * point this page hands off to.
 *
 * Built entirely from Genesis's own components — the best demonstration of
 * the system's quality is this page itself.
 */
import { useState } from "react";
import { Link } from "react-router";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Separator,
  H1,
  H2,
  Lead,
  P,
  Muted,
} from "@marktiderman/genesis-ui";
import { Container, Section, Stack, Grid } from "@marktiderman/genesis-ui/layout";
import { StatCard } from "@marktiderman/genesis-ui/data";
import {
  ArrowRight,
  Check,
  Copy,
  Sparkles,
  Blocks,
  Database,
  Palette,
  Smartphone,
  GitBranch,
  BookOpen,
  Package,
  ExternalLink,
} from "lucide-react";

const REPO_URL = "https://github.com/marktiderman/genesis";
const NPM_URL = "https://www.npmjs.com/package/@marktiderman/genesis-ui";
const STORYBOOK_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_STORYBOOK_URL) ||
  "http://localhost:6006";

const INSTALL_SNIPPET =
  "npm install @marktiderman/genesis-ui @marktiderman/genesis-core @marktiderman/genesis-design-system";

const CODE_SNIPPET = `import { GenesisProvider, createSupabaseProvider } from "@marktiderman/genesis-core";
import { ResourcePage } from "@marktiderman/genesis-ui/data";

<GenesisProvider provider={createSupabaseProvider(supabase)}>
  <ResourcePage
    resource="orders"
    title="Orders"
    columns={["customer", "email", "status", "total"]}
    allowCreate
    allowEdit
    formFields={[
      { key: "customer", required: true },
      { key: "email", type: "email" },
    ]}
  />
</GenesisProvider>`;

const FEATURES = [
  {
    icon: Blocks,
    title: "Shadcn/Radix, batteries included",
    description:
      "120+ primitives, patterns, and page templates — buttons through full page layouts — all built on Radix, all tree-shakeable by subpath.",
  },
  {
    icon: Database,
    title: "A data layer, not just a UI kit",
    description:
      "A DataProvider contract plus ResourcePage turn a resource into a working CRUD page — table, filters, forms, detail view — in a few lines of config.",
  },
  {
    icon: Palette,
    title: "Brand-agnostic tokens",
    description:
      "DTCG design tokens and a CanonicalBrand schema. Point tailwindFromBrand() at your own brand and the whole system re-themes — no fork required.",
  },
  {
    icon: Smartphone,
    title: "React Native, same vocabulary",
    description:
      "genesis-ui-native ships the same component language on NativeWind, so a web team and a native team speak one design system.",
  },
  {
    icon: GitBranch,
    title: "Pluggable data backends",
    description:
      "The Switchboard binds a resource to two backends at once during a migration, verifies they agree, then cuts over — no big-bang rewrite.",
  },
  {
    icon: BookOpen,
    title: "Storybook + visual regression",
    description:
      "Every primitive ships a story with controls. Chromatic snapshots catch visual drift before it reaches a consumer app.",
  },
];

const PACKAGES = [
  {
    name: "@marktiderman/genesis-ui",
    description:
      "Shadcn/Radix-based web components — primitives, forms, overlays, layout, and a /data subpath that turns a DataProvider into a working CRUD page.",
  },
  {
    name: "@marktiderman/genesis-core",
    description:
      "Platform-agnostic foundation: the DataProvider contract, GenesisProvider, useResource/useOne/useResourceForm/useWizard hooks, a Supabase provider.",
  },
  {
    name: "@marktiderman/genesis-design-system",
    description:
      "Brand-agnostic design tokens (DTCG-style), a CanonicalBrand schema, and factories that turn your brand into a Tailwind preset or a NativeWind theme.",
  },
  {
    name: "@marktiderman/genesis-ui-native",
    description:
      "The React Native (NativeWind) counterpart to genesis-ui — same component vocabulary, native primitives.",
  },
  {
    name: "@marktiderman/genesis-switchboard",
    description:
      "A DataProvider implementation for migrating a resource between backends — Supabase, Airtable, and Notion adapters ship out of the box.",
  },
  {
    name: "@marktiderman/genesis-cli",
    description: "Scaffolds a new consumer: brand package, Tailwind/NativeWind config, token imports.",
  },
  {
    name: "@marktiderman/genesis",
    description: "One-install umbrella — re-exports every package above under one version coordinate.",
  },
];

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.2.67.8.56A10.99 10.99 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
    </svg>
  );
}

function InstallSnippet() {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(INSTALL_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 py-3 pl-4 pr-2 font-mono text-sm shadow-sm backdrop-blur">
      <span className="select-none text-muted-foreground">$</span>
      <code className="flex-1 overflow-x-auto whitespace-nowrap text-foreground">{INSTALL_SNIPPET}</code>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={handleCopy}
        aria-label="Copy install command"
        testID="landing-copy-install"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border/60">
      <Container size="lg" className="flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            G
          </span>
          Genesis
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden sm:block">
            <Button variant="ghost" size="sm">
              <GitHubIcon className="h-4 w-4" /> GitHub
            </Button>
          </a>
          <a href={STORYBOOK_URL} target="_blank" rel="noreferrer" className="hidden sm:block">
            <Button variant="ghost" size="sm">
              Storybook
            </Button>
          </a>
          <Link to="/showcase">
            <Button size="sm" testID="landing-header-showcase">
              Showcase <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </nav>
      </Container>
    </header>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden">
      {/* Soft decorative gradient — CSS vars only, so it re-themes with the
          brand automatically and needs no image asset. Static (no motion),
          so there's nothing to gate behind reduce-motion. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center blur-3xl"
      >
        <div
          className="aspect-[1155/678] w-[72rem] opacity-30 dark:opacity-20"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--info)))",
            clipPath:
              "polygon(74% 44%, 100% 62%, 91% 100%, 61% 92%, 34% 100%, 0 74%, 15% 33%, 42% 0, 63% 15%)",
          }}
        />
      </div>

      <Container size="lg" className="py-20 sm:py-28">
        <Stack gap="lg" align="center" className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="gap-1.5">
            <Sparkles className="h-3 w-3" /> Open source &middot; MIT licensed
          </Badge>

          <H1 className="text-5xl lg:text-6xl">
            A design system that ships full pages, not just buttons.
          </H1>

          <Lead className="text-balance">
            Genesis is a shadcn-based, brand-agnostic design system and
            data-provider layer for React and React Native — primitives,
            layouts, and a CRUD toolkit that turns a data source into a
            working page in a few lines of config.
          </Lead>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/showcase">
              <Button size="lg" testID="landing-hero-showcase">
                Browse the showcase <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <Button size="lg" variant="outline">
                <GitHubIcon className="h-4 w-4" /> View on GitHub
              </Button>
            </a>
          </div>

          <div className="w-full max-w-xl pt-4">
            <InstallSnippet />
          </div>
        </Stack>
      </Container>
    </div>
  );
}

function Stats() {
  return (
    <Container size="lg" className="pb-4">
      <Grid cols={4} gap="lg">
        <StatCard label="Components" value="120+" icon={Blocks} color="primary" />
        <StatCard label="Packages" value="7" icon={Package} color="primary" />
        <StatCard label="Platforms" value="2" icon={Smartphone} color="primary" />
        <StatCard label="License" value="MIT" icon={BookOpen} color="primary" />
      </Grid>
    </Container>
  );
}

function Features() {
  return (
    <Container size="lg">
      <Section
        title="Everything an app needs, one install"
        headingClassName="text-3xl font-bold"
        description="Not a component pile — a layered system, from tokens to full CRUD pages."
      >
        <Grid cols={3} gap="lg" className="pt-2">
          {FEATURES.map((f) => (
            <Card key={f.title} className="h-full">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <CardTitle className="pt-2">{f.title}</CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </Grid>
      </Section>
    </Container>
  );
}

function CodeSample() {
  return (
    <Container size="lg">
      <Section
        title="A full CRUD page, start to finish"
        headingClassName="text-3xl font-bold"
        description="This is the whole thing — no boilerplate hiding off-screen."
      >
        <div className="grid gap-6 pt-2 lg:grid-cols-[3fr_2fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-[#0b0f19] shadow-lg">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
              <span className="ml-2 font-mono text-xs text-white/40">orders.tsx</span>
            </div>
            <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-slate-200">
              <code>{CODE_SNIPPET}</code>
            </pre>
          </div>
          <Stack gap="md" justify="center">
            <P className="mt-0">
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm">ResourcePage</code>{" "}
              reads a resource off any <code className="rounded bg-muted px-1.5 py-0.5 text-sm">DataProvider</code> —
              Supabase today, a mock in this showcase, your own backend if you write one —
              and renders a searchable, sortable, filterable table with create/edit
              forms and a detail view.
            </P>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "Table, grid, and list views, switchable per user",
                "Search, sort, and status filters wired to real state",
                "Create/edit forms generated from a field config",
                "Keyboard navigation (j/k, Enter, Backspace) for free",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>
            <div>
              <Link to="/showcase/data/resource-page">
                <Button variant="outline">
                  See ResourcePage live <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Stack>
        </div>
      </Section>
    </Container>
  );
}

function Packages() {
  return (
    <Container size="lg">
      <Section
        title="One system, seven packages"
        headingClassName="text-3xl font-bold"
        description="Install the whole system as one pinned coordinate, or pull in only what you need."
      >
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          {PACKAGES.map((p) => (
            <Card key={p.name}>
              <CardContent className="flex items-start justify-between gap-3 pt-6">
                <div className="min-w-0">
                  <code className="text-sm font-semibold">{p.name}</code>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                </div>
                <a
                  href={`https://www.npmjs.com/package/${p.name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`${p.name} on npm`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </Container>
  );
}

function ClosingCta() {
  return (
    <Container size="lg" className="pb-24">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <H2 className="border-none pb-0">See every component, live</H2>
          <Muted className="max-w-md text-sm">
            Tokens, primitives, layouts, and the full data toolkit — every
            one of them rendered from the same package you&apos;d install.
          </Muted>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/showcase">
              <Button size="lg" testID="landing-closing-showcase">
                Open the showcase <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              <Button size="lg" variant="outline">
                <Package className="h-4 w-4" /> View on npm
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </Container>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <Container size="lg" className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-sm text-muted-foreground">
          Genesis is MIT licensed. Built with Genesis&apos;s own components —
          this page is the demo.
        </p>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            GitHub
          </a>
          <a href={NPM_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            npm
          </a>
          <a href={STORYBOOK_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            Storybook
          </a>
          <Link to="/showcase" className="hover:text-foreground">
            Showcase
          </Link>
        </nav>
      </Container>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      <Header />
      <main>
        <Hero />
        <Stats />
        <Separator className="my-16" />
        <Features />
        <Separator className="my-16" />
        <CodeSample />
        <Separator className="my-16" />
        <Packages />
        <Separator className="my-16" />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}
