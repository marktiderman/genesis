import * as React from "react";
import { useParams, Link } from "react-router";
import {
  neutral,
  semantic,
  status,
  fontFamily,
  fontSize,
  fontWeight,
  borderRadius,
  spacing,
} from "@marktiderman/genesis-design-system";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  Badge,
  Button,
  H1,
  H2,
  H3,
  H4,
  P,
  Lead,
  Large,
  Small,
  Muted,
} from "@marktiderman/genesis-ui";
import { ArrowLeft } from "lucide-react";
import { TOKEN_CATEGORIES } from "../lib/portfolio-data";

function ColorRow({
  name,
  hex,
  testId,
}: {
  name: string;
  hex: string;
  testId?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 py-2"
      data-testid={testId ?? `token-color-${name}`}
    >
      <div
        className="h-9 w-14 rounded-md border border-black/10"
        style={{ backgroundColor: hex }}
      />
      <div className="flex-1">
        <div className="text-sm">{name}</div>
        <div className="text-xs text-muted-foreground font-mono">{hex}</div>
      </div>
    </div>
  );
}

function TokensColors() {
  return (
    <div className="space-y-4" data-testid="tokens-colors">
      <Card>
        <CardHeader>
          <CardTitle>Neutral scale</CardTitle>
          <CardDescription>50 → 900 grayscale ramp.</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.entries(neutral).map(([step, hex]) => (
            <ColorRow key={step} name={`neutral.${step}`} hex={hex} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Semantic</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.entries(semantic).map(([key, scale]) => (
            <div key={key} className="mb-4 last:mb-0">
              <div className="font-medium mb-1">{key}</div>
              {Object.entries(scale).map(([variant, hex]) => (
                <ColorRow
                  key={variant}
                  name={`${key}.${variant}`}
                  hex={hex as string}
                />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.entries(status).map(([key, hex]) => (
            <ColorRow key={key} name={`status.${key}`} hex={hex as string} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TokensTypography() {
  return (
    <div className="space-y-4" data-testid="tokens-typography">
      <Card>
        <CardHeader>
          <CardTitle>Presets</CardTitle>
          <CardDescription>
            Top-level type stops via the typography re-exports from{" "}
            <code>@marktiderman/genesis-ui</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <H1>Heading 1</H1>
          <H2>Heading 2</H2>
          <H3>Heading 3</H3>
          <H4>Heading 4</H4>
          <Lead>Lead paragraph for hero copy</Lead>
          <P>Body paragraph at the default body preset.</P>
          <Large>Large emphasis</Large>
          <Small>Small caption</Small>
          <Muted>Muted helper</Muted>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Font families</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.entries(fontFamily).map(([key, family]) => (
            <div key={key} className="py-2 border-b last:border-b-0">
              <div className="text-sm">{key}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {family}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Font sizes</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.entries(fontSize).map(([key, [size, meta]]) => (
            <div key={key} className="flex items-baseline gap-3 py-2">
              <span className="text-xs text-muted-foreground w-10">{key}</span>
              <span style={{ fontSize: size as string }}>{size} Aa</span>
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                lh: {(meta as { lineHeight: string }).lineHeight}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Font weights</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.entries(fontWeight).map(([key, weight]) => (
            <div
              key={key}
              className="flex items-baseline gap-3 py-2 border-b last:border-b-0"
            >
              <span className="text-xs text-muted-foreground w-24">
                {key} ({weight})
              </span>
              <span style={{ fontWeight: weight as string }}>
                The quick brown fox
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TokensSpacing() {
  return (
    <Card data-testid="tokens-spacing">
      <CardHeader>
        <CardTitle>Spacing scale</CardTitle>
        <CardDescription>Page padding, card padding, section gap.</CardDescription>
      </CardHeader>
      <CardContent>
        {Object.entries(spacing).map(([group, values]) => (
          <div key={group} className="mb-3 last:mb-0">
            <div className="font-medium mb-1">{group}</div>
            {typeof values === "object"
              ? Object.entries(values as Record<string, string>).map(
                  ([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center gap-3 py-2 border-b last:border-b-0"
                    >
                      <span className="text-xs text-muted-foreground w-32">
                        {group}.{key}
                      </span>
                      <span className="text-xs font-mono">{val}</span>
                    </div>
                  ),
                )
              : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TokensRadii() {
  return (
    <Card data-testid="tokens-radii">
      <CardHeader>
        <CardTitle>Border radius scale</CardTitle>
        <CardDescription>
          CSS-var-resolved radii — primitives compose these via the brand
          theme.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {Object.entries(borderRadius).map(([key, val]) => (
          <div
            key={key}
            className="flex items-center gap-3 py-3 border-b last:border-b-0"
          >
            <div
              className="h-10 w-10 bg-primary"
              style={{ borderRadius: val }}
            />
            <span className="text-sm">radius.{key}</span>
            <span className="ml-auto text-xs text-muted-foreground font-mono">
              {val}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TokensMotion() {
  const durations = [
    { name: "instant", ms: 0 },
    { name: "fast", ms: 120 },
    { name: "default", ms: 200 },
    { name: "slow", ms: 320 },
  ];
  const easings = [
    { name: "standard", curve: "cubic-bezier(0.2, 0, 0, 1)" },
    { name: "decelerate", curve: "cubic-bezier(0, 0, 0.2, 1)" },
    { name: "accelerate", curve: "cubic-bezier(0.4, 0, 1, 1)" },
    { name: "linear", curve: "linear" },
  ];
  return (
    <div className="space-y-4" data-testid="tokens-motion">
      <Card>
        <CardHeader>
          <CardTitle>Duration</CardTitle>
        </CardHeader>
        <CardContent>
          {durations.map((d) => (
            <div
              key={d.name}
              className="flex items-center gap-3 py-2 border-b last:border-b-0"
            >
              <div
                className="h-2 bg-primary rounded"
                style={{ width: Math.max(8, d.ms / 4) }}
              />
              <span className="text-sm">duration.{d.name}</span>
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                {d.ms}ms
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Easing</CardTitle>
        </CardHeader>
        <CardContent>
          {easings.map((e) => (
            <div
              key={e.name}
              className="flex items-center gap-3 py-2 border-b last:border-b-0"
            >
              <span className="text-sm">easing.{e.name}</span>
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                {e.curve}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TokensShadows() {
  const shadows = [
    { name: "shadow.none", css: "none" },
    { name: "shadow.sm", css: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
    { name: "shadow.md", css: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" },
    { name: "shadow.lg", css: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="tokens-shadows">
      {shadows.map((s) => (
        <Card key={s.name}>
          <CardHeader>
            <CardTitle>{s.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="h-24 w-full bg-card rounded-lg border"
              style={{ boxShadow: s.css }}
            />
            <code className="block text-xs text-muted-foreground mt-2 break-all">
              {s.css}
            </code>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const RENDERERS: Record<string, () => React.ReactElement> = {
  colors: TokensColors,
  typography: TokensTypography,
  spacing: TokensSpacing,
  radii: TokensRadii,
  motion: TokensMotion,
  shadows: TokensShadows,
};

export default function TokenCategory() {
  const { category = "" } = useParams<{ category: string }>();
  const meta = TOKEN_CATEGORIES.find((c) => c.slug === category);
  const Renderer = RENDERERS[category];

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <Link to="/showcase/tokens" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tokens
      </Link>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          {meta?.label ?? "Unknown"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {meta?.description ?? "Token category not found."}
        </p>
      </header>
      {Renderer ? (
        <Renderer />
      ) : (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unknown token category: {category}
            </p>
            <Link to="/showcase/tokens">
              <Button variant="outline" size="sm" className="mt-3">
                Back to tokens
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
