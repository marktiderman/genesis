import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
} from "@marktiderman/genesis-ui";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ThemeControls } from "../components/theme-controls";
import { PORTFOLIO_SECTIONS } from "../lib/portfolio-data";

const BADGE: Record<string, "default" | "secondary" | "outline"> = {
  stable: "default",
  beta: "secondary",
  planned: "outline",
};

export default function ShowcaseIndex() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8" data-testid="showcase-index">
      <header className="space-y-3">
        <Badge variant="outline">Genesis Showcase &middot; Phase G</Badge>
        <h1 className="text-4xl font-bold tracking-tight">Genesis</h1>
        <p className="text-xl text-muted-foreground">
          The brand-agnostic design system for Tiderman Ventures.
        </p>
        <p className="text-sm text-muted-foreground max-w-2xl">
          This sample app is the canonical browser-side reference for{" "}
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
            @marktiderman/genesis-ui
          </code>
          . Every section below is live — driven by the same package your
          consumer apps install from npm.
        </p>
      </header>

      <ThemeControls />

      <section className="grid gap-4 md:grid-cols-2">
        {PORTFOLIO_SECTIONS.map((s) => {
          const isExternal = s.href.startsWith("http");
          const Wrapper = isExternal
            ? ({ children }: { children: React.ReactNode }) => (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block hover:opacity-90 transition"
                >
                  {children}
                </a>
              )
            : ({ children }: { children: React.ReactNode }) => (
                <Link to={s.href} className="block hover:opacity-90 transition">
                  {children}
                </Link>
              );

          return (
            <Wrapper key={s.id}>
              <Card data-testid={`showcase-section-${s.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {s.title}
                      {isExternal ? (
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : null}
                    </CardTitle>
                    <Badge variant={BADGE[s.status]}>{s.status}</Badge>
                  </div>
                  <CardDescription>{s.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    Open <ArrowRight className="h-3 w-3" />
                  </span>
                </CardContent>
              </Card>
            </Wrapper>
          );
        })}
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Also available on iOS &amp; Android</CardTitle>
            <CardDescription>
              The same showcase ships as a native app via Expo Router. Run the
              sample-native app from the workspace root.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="text-xs bg-muted px-2 py-1 rounded inline-block mr-2">
              pnpm --filter sample-native ios
            </code>
            <code className="text-xs bg-muted px-2 py-1 rounded inline-block">
              pnpm --filter sample-native android
            </code>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
