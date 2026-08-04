import { Link, useParams } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  Badge,
  Button,
} from "@marktiderman/genesis-ui";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PRIMITIVE_CARDS } from "../lib/portfolio-data";
import {
  findPrimitive,
  type PrimitiveDoc,
  type PrimitiveProp,
} from "../lib/primitive-docs";

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

export default function PrimitiveDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const card = PRIMITIVE_CARDS.find((x) => x.slug === slug);
  const doc = findPrimitive(slug);

  // Prefer the generated stability tag when present — it reflects the
  // @stability JSDoc in source. Fall back to the hand-curated card.
  const stability = doc?.stability ?? card?.stability;
  const label = card?.label ?? doc?.primaryComponent ?? slug;
  const blurb = card?.blurb ?? doc?.summary ?? "";

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6" data-testid="primitive-detail">
      <Link
        to="/showcase/primitives"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Primitives
      </Link>

      {card || doc ? (
        <>
          <header className="space-y-2">
            {stability ? (
              <Badge variant={STABILITY_VARIANT[stability]}>@{stability}</Badge>
            ) : null}
            <h1 className="text-3xl font-bold tracking-tight">{label}</h1>
            {blurb ? (
              <p className="text-muted-foreground">{blurb}</p>
            ) : null}
            {doc?.summary && doc.summary !== blurb ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {doc.summary}
              </p>
            ) : null}
            {doc ? (
              <p className="text-xs font-mono text-muted-foreground">
                {doc.filePath}
              </p>
            ) : null}
          </header>

          {doc ? <ImportCard doc={doc} /> : null}

          {card ? <ExportsCard exports={card.exports} /> : null}

          {doc ? <ComponentsCard doc={doc} /> : null}

          <StorybookCard slug={slug} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Unknown primitive</CardTitle>
            <CardDescription>Slug: {slug}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function ImportCard({ doc }: { doc: PrimitiveDoc }) {
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

function ExportsCard({ exports }: { exports: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exports</CardTitle>
        <CardDescription>
          Re-exported from <code className="text-xs bg-muted px-1 rounded">@marktiderman/genesis-ui</code>.
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

function ComponentsCard({ doc }: { doc: PrimitiveDoc }) {
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

function PropsTable({ props }: { props: PrimitiveProp[] }) {
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

// Storybook host. Defaults to the local dev server; override at build/run
// time via VITE_STORYBOOK_URL when pointing at a deployed Storybook (e.g.
// Chromatic preview, GitHub Pages).
const STORYBOOK_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_STORYBOOK_URL) ||
  "http://localhost:6006";

function storybookUrl(slug: string): string {
  const storyId = `ui-${slug.replace(/-/g, "")}--default`;
  return `${STORYBOOK_BASE_URL.replace(/\/$/, "")}/?path=/story/${storyId}`;
}

function StorybookCard({ slug }: { slug: string }) {
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
          href={storybookUrl(slug)}
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
