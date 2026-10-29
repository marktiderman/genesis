import { Link } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@marktiderman/genesis-ui";
import { LAYOUTS } from "../lib/portfolio-data";

export default function LayoutsIndex() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6" data-testid="showcase-layouts-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Layouts</h1>
        <p className="text-muted-foreground mt-1">
          Every screen inside the app shell sits in one of these page layouts, from{" "}
          <code className="text-xs bg-muted px-1 rounded">@marktiderman/genesis-ui</code>. Open one to see it running.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {LAYOUTS.map((l) => (
          <Link key={l.slug} to={`/showcase/layouts/${l.slug}`} className="block hover:opacity-90 transition">
            <Card data-testid={`layout-link-${l.slug}`}>
              <CardHeader>
                <CardTitle>{l.label}</CardTitle>
                <CardDescription>{l.summary}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
