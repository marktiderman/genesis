import { Link, useParams } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@marktiderman/genesis-ui";
import { LAYOUTS } from "../lib/portfolio-data";
import { LAYOUT_EXAMPLES } from "../components/layout-examples";

export default function LayoutDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const meta = LAYOUTS.find((l) => l.slug === slug);
  const Example = LAYOUT_EXAMPLES[slug];

  if (!meta || !Example) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Unknown layout</CardTitle>
            <CardDescription>
              There's no layout called "{slug}". <Link className="underline" to="/showcase/layouts">See them all</Link>.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  return (
    <div data-testid={`layout-detail-${slug}`}>
      <p className="px-6 pt-4 text-sm text-muted-foreground">
        <code className="text-xs bg-muted px-1 rounded">{meta.label}</code>: {meta.summary}{" "}
        <Link className="underline" to={`/showcase/elements/${meta.label.replace(/Page$/, "-page").toLowerCase()}`}>Props</Link>
      </p>
      <Example />
    </div>
  );
}
