import { Link, useParams } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@marktiderman/genesis-ui";
import { ArrowLeft } from "lucide-react";
import { PRIMITIVE_CARDS } from "../lib/portfolio-data";
import { findPrimitive } from "../lib/primitive-docs";
import {
  StabilityBadge,
  ImportCard,
  ExportsCard,
  ComponentsCard,
  StorybookCard,
} from "../components/reference-blocks";

export default function PrimitiveDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const card = PRIMITIVE_CARDS.find((x) => x.slug === slug);
  const doc = findPrimitive(slug);

  // Prefer the generated stability tag when present — it reflects the
  // @stability JSDoc in source. Fall back to the hand-curated card.
  const stability = doc?.stability ?? card?.stability;
  const label = card?.label ?? doc?.primaryComponent ?? slug;
  const blurb = card?.blurb ?? doc?.summary ?? "";
  // storyId construction mirrors Storybook's own auto-id: `title: "UI/Foo"`
  // -> `ui-foo--default`. Every /showcase/primitives entry's story exports
  // a `Default` story under the `UI/` category, so the convention holds
  // without needing `card.storyId`'s explicit override. Only rendered when
  // the catalog entry confirms a matching `.stories.tsx` file exists (see
  // `ReferenceCardEntry.hasStory`).
  const storyId = card?.storyId ?? `ui-${slug.replace(/-/g, "")}--default`;

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
            <StabilityBadge stability={stability} />
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

          {card?.hasStory ? <StorybookCard storyId={storyId} /> : null}
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
