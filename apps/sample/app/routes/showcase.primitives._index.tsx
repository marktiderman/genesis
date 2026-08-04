import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Input,
} from "@marktiderman/genesis-ui";
import { useState } from "react";
import { PRIMITIVE_CARDS } from "../lib/portfolio-data";

const STABILITY_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  stable: "default",
  beta: "secondary",
  planned: "outline",
  deprecated: "destructive",
  // Radix `unstable_*` wrappers — volatile API, flagged like a deprecation
  // so nobody reads the badge as "safe to depend on".
  experimental: "destructive",
};

export default function PrimitivesIndex() {
  const [query, setQuery] = useState("");
  const filtered = PRIMITIVE_CARDS.filter((p) =>
    `${p.label} ${p.blurb} ${p.exports.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6" data-testid="showcase-primitives-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Primitives</h1>
        <p className="text-muted-foreground mt-1">
          {PRIMITIVE_CARDS.length} primitives in <code>@marktiderman/genesis-ui</code>.
          Each card links to a detail page that lists every export and links to
          its Storybook entry.
        </p>
      </header>

      <div>
        <Input
          placeholder="Filter primitives…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="primitives-filter"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <Link
            key={p.slug}
            to={`/showcase/primitives/${p.slug}`}
            className="block hover:opacity-90 transition"
          >
            <Card data-testid={`primitive-${p.slug}`} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{p.label}</CardTitle>
                  <Badge variant={STABILITY_VARIANT[p.stability]}>
                    @{p.stability}
                  </Badge>
                </div>
                <CardDescription>{p.blurb}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matches</CardTitle>
            <CardDescription>
              Try a shorter query, or clear the filter.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
