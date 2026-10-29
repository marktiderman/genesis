import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Input,
  Button,
} from "@marktiderman/genesis-ui";
import { useState } from "react";
import { PRIMITIVE_DOCS } from "../lib/primitive-docs";

// Every component, generated from the packages' source (app/data/primitives.json).
const CARDS = PRIMITIVE_DOCS.map((p) => ({
  key: `${p.surface}-${p.slug}-${p.filePath}`,
  slug: p.slug,
  label: p.primaryComponent || p.slug,
  surface: p.surface,
  stability: p.stability,
  blurb: blurb(p.summary),
  exports: p.components.map((c) => c.name),
})).sort((a, b) => a.surface.localeCompare(b.surface) || a.label.localeCompare(b.label));

function blurb(summary: string): string {
  const text = summary.replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim();
  const m = text.match(/^(.{10,180}?[.!?])(\s|$)/);
  return m ? m[1]! : text.slice(0, 160);
}

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
  const [surface, setSurface] = useState<"web" | "native">("web");
  const filtered = CARDS.filter((p) => p.surface === surface).filter((p) =>
    `${p.label} ${p.blurb} ${p.exports.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6" data-testid="showcase-primitives-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Primitives</h1>
        <p className="text-muted-foreground mt-1">
          {CARDS.filter((c) => c.surface === "web").length} web components in{" "}
          <code>@marktiderman/genesis-ui</code> and {CARDS.filter((c) => c.surface === "native").length} native ones in{" "}
          <code>@marktiderman/genesis-ui-native</code>, read from their source at build. Each links to its props and
          examples.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex gap-2" role="group" aria-label="Platform">
          {(["web", "native"] as const).map((s) => (
            <Button testID="showcase-primitives-index-button-1" key={s} size="sm" variant={surface === s ? "default" : "outline"} aria-pressed={surface === s} onClick={() => setSurface(s)}>
              {s === "web" ? "Web" : "Native"}
            </Button>
          ))}
        </div>
        <Input
          aria-label="Filter components"
          placeholder="Filter primitives…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="primitives-filter"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <Link
            key={p.key}
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
