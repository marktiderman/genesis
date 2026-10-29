/** One package: install line, entry points and their exports, generated at build. */
import { Link } from "react-router";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@marktiderman/genesis-ui";
import { data } from "react-router";
import primitives from "../data/primitives.json";
import { catalog, readmeIntro } from "../lib/catalog.server";
import { GROUP_LABELS, PACKAGES } from "../lib/packages";
import { REPO_URL } from "../lib/site";
import type { Route } from "./+types/packages.$name";

export async function loader({ params }: Route.LoaderArgs) {
  const pkg = (await catalog()).find((p) => p.dir === params.name);
  if (!pkg) throw data("No such package", { status: 404 });
  // A component with a page of its own links to it.
  const pages = new Map<string, string>();
  for (const p of (primitives as { primitives: Array<{ slug: string; components: Array<{ name: string }> }> }).primitives) {
    for (const c of p.components) if (!pages.has(c.name)) pages.set(c.name, p.slug);
  }
  const meta = PACKAGES.find((p) => p.dir === pkg.dir);
  return {
    ...pkg,
    layer: meta ? { layer: meta.layer, group: GROUP_LABELS[meta.group], essential: meta.essential, install: meta.module?.install } : null,
    intro: readmeIntro(pkg.dir),
    entries: pkg.entries.map((e) => ({
      name: e.name,
      barrel: e.barrel,
      description: e.description,
      components: e.components.map((c) => ({ name: c.name, stability: c.stability, summary: c.summary, page: pages.get(c.name) })),
      hooks: e.values.filter((v) => /^use[A-Z]/.test(v.name)).map((v) => ({ name: v.name, summary: v.summary })),
      other: e.values.filter((v) => !/^use[A-Z]/.test(v.name)).map((v) => v.name),
      types: e.types.length,
    })),
  };
}

const LAYER_TITLES = { foundation: "Foundation", primitive: "Primitive", module: "Module", tooling: "Tooling" } as const;

export default function PackagePage({ loaderData: pkg }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" data-testid={`package-page-${pkg.dir}`}>
      <header className="space-y-2">
        <p className="text-sm">
          <Link className="text-muted-foreground hover:underline" to="/packages">Packages</Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">{pkg.name}</h1>
          <Badge variant="outline">{pkg.version}</Badge>
          {pkg.layer ? (
            <Badge variant="secondary" data-testid="package-layer">
              {LAYER_TITLES[pkg.layer.layer]}
              {pkg.layer.layer === "module" ? "" : ` · ${pkg.layer.group}`}
            </Badge>
          ) : null}
          {pkg.layer?.essential ? <Badge variant="secondary">essential</Badge> : null}
        </div>
        <p className="text-muted-foreground">{pkg.description}</p>
        {pkg.intro.map((p, i) => (
          <p key={i} className="text-sm text-muted-foreground">{p}</p>
        ))}
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"><code>{pkg.layer?.install ? `${pkg.layer.install}\n` : ""}pnpm add {pkg.name}</code></pre>
        <p className="flex flex-wrap gap-x-4 text-sm">
          <a className="underline-offset-2 hover:underline" href={`${REPO_URL}/tree/main/packages/${pkg.dir}#readme`}>README</a>
          <a className="underline-offset-2 hover:underline" href={`${REPO_URL}/blob/main/packages/${pkg.dir}/CHANGELOG.md`}>Changelog</a>
          <a className="underline-offset-2 hover:underline" href={`https://www.npmjs.com/package/${pkg.name}`}>npm</a>
        </p>
      </header>

      {pkg.entries.map((e) => (
        <Card key={e.name} data-testid={`entry-${e.name}`}>
          <CardHeader>
            <CardTitle className="font-mono text-base">{e.name}</CardTitle>
            {e.description ? <CardDescription>{e.description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {e.components.length ? (
              <section>
                <h2 className="mb-2 font-medium">Components ({e.components.length})</h2>
                <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {e.components.map((c) => (
                    <li key={c.name} className="min-w-0">
                      {c.page ? (
                        <Link className="font-mono hover:underline" to={`/showcase/primitives/${c.page}`}>{c.name}</Link>
                      ) : (
                        <span className="font-mono">{c.name}</span>
                      )}
                      {c.stability ? <span className="ml-2 text-xs text-muted-foreground">{c.stability}</span> : null}
                      {c.summary ? <p className="line-clamp-2 text-muted-foreground">{c.summary}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {e.hooks.length ? (
              <section>
                <h2 className="mb-2 font-medium">Hooks ({e.hooks.length})</h2>
                <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {e.hooks.map((h) => (
                    <li key={h.name} className="min-w-0">
                      <span className="font-mono">{h.name}</span>
                      {h.summary ? <p className="line-clamp-2 text-muted-foreground">{h.summary}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {e.other.length ? (
              <section>
                <h2 className="mb-2 font-medium">Other exports ({e.other.length})</h2>
                <p className="break-words font-mono text-xs text-muted-foreground">{e.other.join(" · ")}</p>
              </section>
            ) : null}
            {e.types ? <p className="text-xs text-muted-foreground">And {e.types} types.</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
