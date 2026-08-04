import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
} from "@marktiderman/genesis-ui";
import { LAYOUT_CARDS } from "../lib/portfolio-data";
import { STABILITY_VARIANT } from "../components/reference-blocks";

export default function LayoutsIndex() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6" data-testid="showcase-layouts-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Layouts</h1>
        <p className="text-muted-foreground mt-1">
          Page-shaped scaffolds Genesis ships so consumers compose, not
          rebuild: page templates (AppShell, DetailPage, FormPage,
          DashboardPage, SettingsPage) over the layout primitives underneath
          them (Stack, Grid, Split, Section, Container). All {LAYOUT_CARDS.length}{" "}
          live below — this app is running inside one of them right now.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {LAYOUT_CARDS.map((l) => (
          <Link
            key={l.slug}
            to={`/showcase/layouts/${l.slug}`}
            className="block hover:opacity-90 transition"
          >
            <Card data-testid={`layout-link-${l.slug}`} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{l.label}</CardTitle>
                  <Badge variant={STABILITY_VARIANT[l.stability] ?? "outline"}>
                    @{l.stability}
                  </Badge>
                </div>
                <CardDescription>{l.blurb}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
