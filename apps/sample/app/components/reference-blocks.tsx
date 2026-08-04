/**
 * Shared "component reference" building blocks — Import / Exports / Props /
 * Storybook / Live-example cards used by every showcase detail route
 * (`/showcase/primitives/:slug`, `/showcase/layouts/:slug`,
 * `/showcase/data/:slug`).
 *
 * Extracted so the three catalogs (primitives, layouts, data) render the
 * generated `primitives.json` docs identically instead of drifting into
 * three slightly-different implementations.
 */
import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  Badge,
  Button,
} from "@marktiderman/genesis-ui";
import { ExternalLink } from "lucide-react";
import type { PrimitiveDoc, PrimitiveProp } from "../lib/primitive-docs";

export const STABILITY_VARIANT: Record<
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

export function StabilityBadge({ stability }: { stability?: string }) {
  if (!stability) return null;
  return (
    <Badge variant={STABILITY_VARIANT[stability] ?? "outline"}>
      @{stability}
    </Badge>
  );
}

export function ImportCard({ doc }: { doc: PrimitiveDoc }) {
  const importLine = `import { ${doc.primaryComponent} } from "${doc.subpath}";`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import</CardTitle>
        <CardDescription>
          Subpath export: <code className="text-xs bg-muted px-1 rounded">{doc.subpath}</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="text-xs bg-muted/40 p-3 rounded overflow-x-auto">
          <code>{importLine}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

export function ExportsCard({
  exports,
  packageName = "@marktiderman/genesis-ui",
}: {
  exports: string[];
  packageName?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exports</CardTitle>
        <CardDescription>
          Re-exported from <code className="text-xs bg-muted px-1 rounded">{packageName}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-2">
          {exports.map((name) => (
            <li
              key={name}
              className="text-xs font-mono bg-muted/40 px-2 py-1 rounded"
            >
              {name}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PropsTable({ props }: { props: PrimitiveProp[] }) {
  if (props.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground italic">
        No declared props.
      </p>
    );
  }

  return (
    <div className="mt-2 overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Prop</th>
            <th className="px-2 py-1.5 text-left font-medium">Type</th>
            <th className="px-2 py-1.5 text-left font-medium">Default</th>
            <th className="px-2 py-1.5 text-left font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name} className="border-t">
              <td className="px-2 py-1.5 font-mono align-top">
                {p.name}
                {p.required ? (
                  <span className="text-destructive" aria-label="required">
                    *
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 font-mono text-muted-foreground align-top">
                {p.type}
              </td>
              <td className="px-2 py-1.5 font-mono text-muted-foreground align-top">
                {p.defaultValue ?? "—"}
              </td>
              <td className="px-2 py-1.5 align-top">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComponentBlock({
  component,
}: {
  component: PrimitiveDoc["components"][number];
}) {
  return (
    <section>
      <h3 className="text-sm font-mono font-semibold">{component.name}</h3>
      {component.summary ? (
        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
          {component.summary}
        </p>
      ) : null}
      <PropsTable props={component.props} />
    </section>
  );
}

export function ComponentsCard({ doc }: { doc: PrimitiveDoc }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Components</CardTitle>
        <CardDescription>
          Auto-generated from TypeScript source via <code className="text-xs bg-muted px-1 rounded">react-docgen-typescript</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {doc.components.map((c) => (
          <ComponentBlock key={c.name} component={c} />
        ))}
      </CardContent>
    </Card>
  );
}

// Storybook host. Defaults to the local dev server; override at build/run
// time via VITE_STORYBOOK_URL when pointing at a deployed Storybook (e.g.
// Chromatic preview, GitHub Pages).
const STORYBOOK_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_STORYBOOK_URL) ||
  "http://localhost:6006";

export function storybookUrl(storyId: string): string {
  return `${STORYBOOK_BASE_URL.replace(/\/$/, "")}/?path=/story/${storyId}`;
}

/**
 * Storybook reference card. Only render this when a story is known to exist
 * for `storyId` — an unconditional link here is how earlier showcase pages
 * ended up pointing at 404s for primitives that had a catalog card but no
 * `.stories.tsx` file.
 */
export function StorybookCard({ storyId }: { storyId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Storybook</CardTitle>
        <CardDescription>
          Storybook hosts the canonical visual reference with controls for
          every variant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={storybookUrl(storyId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex"
        >
          <Button variant="outline" size="sm">
            Open in Storybook <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}

/** "See it live" — links out to an in-app route that already demonstrates
 * this component in a realistic composition, for components better shown
 * in context (bound to real data/routing) than in Storybook isolation. */
export function LiveDemoLinksCard({
  links,
}: {
  links: { label: string; to: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>See it live</CardTitle>
        <CardDescription>
          Already wired up in the reference app, with real routing and data.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link key={l.to} to={l.to}>
            <Button variant="outline" size="sm">
              {l.label} <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
