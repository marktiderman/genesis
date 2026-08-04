import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
} from "@marktiderman/genesis-ui";
import { DATA_CARDS } from "../lib/portfolio-data";
import { STABILITY_VARIANT } from "../components/reference-blocks";

export default function DataIndex() {
  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6" data-testid="showcase-data-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Data &amp; Resources</h1>
        <p className="text-muted-foreground mt-1">
          The <code className="text-xs bg-muted px-1 rounded">@marktiderman/genesis-ui/data</code>{" "}
          layer — {DATA_CARDS.length} components that bind to a{" "}
          <code className="text-xs bg-muted px-1 rounded">DataProvider</code> and turn config
          into a working CRUD surface. This app wires them to a mock
          provider (<code className="text-xs bg-muted px-1 rounded">GenesisProvider mock=...</code>{" "}
          in <code className="text-xs bg-muted px-1 rounded">root.tsx</code>) — swap it for{" "}
          <code className="text-xs bg-muted px-1 rounded">createSupabaseProvider</code> and every
          component below works unchanged against a real database.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {DATA_CARDS.map((d) => (
          <Link
            key={d.slug}
            to={`/showcase/data/${d.slug}`}
            className="block hover:opacity-90 transition"
          >
            <Card data-testid={`data-link-${d.slug}`} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{d.label}</CardTitle>
                  <Badge variant={STABILITY_VARIANT[d.stability] ?? "outline"}>
                    @{d.stability}
                  </Badge>
                </div>
                <CardDescription>{d.blurb}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
