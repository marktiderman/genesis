// Genesis's own feature registry (features.ts at the repo root), rendered with FeatureList:
// the admin view (table, status board, roadmap) and the public marketing view.
import { FeatureList } from "@marktiderman/genesis-features/react";
import { features } from "../../../../features";

const REPO = "https://github.com/marktiderman/genesis/blob/main";

export default function Features() {
  return (
    <div className="space-y-12">
      <FeatureList
        features={features}
        subtitle="Everything Genesis does, from features.ts."
        viewSettingsKey="sample-features"
        pathHref={(path) => `${REPO}/${path}`}
      />
      <FeatureList features={features} variant="marketing" title="On the README" />
    </div>
  );
}
