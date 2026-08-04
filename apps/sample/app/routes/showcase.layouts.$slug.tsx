import { Link, useParams } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@marktiderman/genesis-ui";
import { ArrowLeft } from "lucide-react";
import { LAYOUTS } from "../lib/portfolio-data";

const SPEC_BULLETS: Record<string, string[]> = {
  settings: [
    "Sectioned ListItem rows",
    "Stack.Screen large title with scroll-edge appearance",
    "Dangerous-action footer with destructive variant",
  ],
  "settings-sub": [
    "Form fields composed from Genesis primitives",
    "Save action surfaced in nav bar; disabled until dirty",
    "Dirty-form leave warning",
    "Optimistic save with rollback on error",
  ],
  notifications: [
    "Grouped by relative date (Today / Yesterday / Earlier)",
    "Swipe-to-mark-read",
    "Empty-state slot",
    "Pull-to-refresh",
    "Mark-all-read action in nav overflow",
  ],
  "empty-state": [
    "Variant: first-run",
    "Variant: no-results",
    "Variant: error",
    "Action slot for primary CTA",
  ],
  auth: [
    "<AuthBranding /> — logo + headline + tagline",
    "<SocialAuthRow /> — provider buttons in stable layout",
    "<AuthForm /> — email + password with react-hook-form",
    "Sign-in / sign-up shipped as composition recipes (not variants)",
  ],
};

export default function LayoutDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const meta = LAYOUTS.find((l) => l.slug === slug);
  const bullets = SPEC_BULLETS[slug] ?? [];

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6" data-testid={`layout-detail-${slug}`}>
      <Link
        to="/showcase/layouts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Layouts
      </Link>

      {meta ? (
        <>
          <header className="space-y-2">
            <Badge variant="outline">{meta.spec}</Badge>
            <h1 className="text-3xl font-bold tracking-tight">{meta.label}</h1>
            <p className="text-muted-foreground">{meta.summary}</p>
          </header>

          <Alert>
            <AlertTitle>Coming with G-MEGA-2</AlertTitle>
            <AlertDescription>
              This route is reserved so the portfolio IA stays stable.
              The placeholder swaps for the real implementation when
              G-MEGA-2 lands, with no route changes.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>What this will ship</CardTitle>
              <CardDescription>
                Spec sourced from PRD-07 phase {meta.spec}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {bullets.map((b, i) => (
                  <li key={i} className="text-sm">
                    &middot; {b}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Unknown layout</CardTitle>
            <CardDescription>Slug: {slug}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
