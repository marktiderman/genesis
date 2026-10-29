/** Every published Genesis package, generated at build from packages/*. */
import { Link } from "react-router";
import { Badge, Card, CardDescription, CardHeader, CardTitle } from "@marktiderman/genesis-ui";
import { catalog } from "../lib/catalog.server";
import type { Route } from "./+types/packages._index";

export async function loader() {
  return (await catalog()).map((p) => ({
    name: p.name,
    dir: p.dir,
    version: p.version,
    description: p.description,
    entries: p.entries.length,
    components: p.entries.reduce((n, e) => n + e.components.length, 0),
  }));
}

export default function Packages({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" data-testid="packages-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Packages</h1>
        <p className="mt-1 text-muted-foreground">
          {loaderData.length} published packages, read from the repository when this site was built. Each page lists
          its entry points and everything they export.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {loaderData.map((p) => (
          <Link key={p.name} to={`/packages/${p.dir}`} className="block" data-testid={`package-${p.dir}`}>
            <Card className="h-full transition hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="font-mono text-base">{p.name.replace("@marktiderman/", "")}</CardTitle>
                  <Badge variant="outline">{p.version}</Badge>
                </div>
                <CardDescription className="line-clamp-3">{p.description}</CardDescription>
                <p className="text-xs text-muted-foreground">
                  {p.entries} entry point{p.entries === 1 ? "" : "s"}
                  {p.components ? ` · ${p.components} components` : ""}
                </p>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
