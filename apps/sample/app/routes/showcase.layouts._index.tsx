import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@marktiderman/genesis-ui";
import { LAYOUTS } from "../lib/portfolio-data";

export default function LayoutsIndex() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6" data-testid="showcase-layouts-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Layouts</h1>
        <p className="text-muted-foreground mt-1">
          Page-level scaffolds Genesis ships so consumers compose, not rebuild.
          Five layouts in scope; placeholder routes today, real implementations
          land with G-MEGA-2.
        </p>
      </header>

      <Alert>
        <AlertTitle>Coming with G-MEGA-2</AlertTitle>
        <AlertDescription>
          All five layouts gate on the C5 Card two-form refactor in G-MEGA-1.
          The placeholder routes below stabilize the IA so consumer teams can
          deep-link them while we build them out.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 md:grid-cols-2">
        {LAYOUTS.map((l) => (
          <Link
            key={l.slug}
            to={`/showcase/layouts/${l.slug}`}
            className="block hover:opacity-90 transition"
          >
            <Card data-testid={`layout-link-${l.slug}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{l.label}</CardTitle>
                  <Badge variant="outline">{l.spec}</Badge>
                </div>
                <CardDescription>{l.summary}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
