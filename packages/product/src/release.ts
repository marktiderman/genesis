import type { CatalogFeature, Signal } from "./model";

/** What a release did to one feature. @stability Experimental */
export interface ReleaseChange {
  feature: CatalogFeature;
  /** `live`: shipped to everyone. `beta`: shipped to try. */
  change: "live" | "beta";
  /** Its status before, or `undefined` when it is new in the catalog. */
  from?: CatalogFeature["status"];
}

/**
 * The features a release shipped: those that reached `live` or `beta` between
 * the catalog before and after it. Features with `visibility: internal` are
 * left out of release notes.
 *
 * @stability Experimental
 */
export function diffRelease(before: readonly CatalogFeature[], after: readonly CatalogFeature[]): ReleaseChange[] {
  const was = new Map(before.map((f) => [f.id, f.status]));
  const changes: ReleaseChange[] = [];
  for (const f of after) {
    if (f.visibility === "internal") continue;
    const from = was.get(f.id);
    if (from === f.status) continue;
    if (f.status === "live") changes.push({ feature: f, change: "live", from });
    else if (f.status === "beta" && from !== "live") changes.push({ feature: f, change: "beta", from });
  }
  return changes.sort((a, b) => a.change.localeCompare(b.change) || a.feature.name.localeCompare(b.feature.name));
}

/**
 * The open signals a release answers: the people to tell, and the asks to
 * close. This is how the loop closes.
 *
 * @stability Experimental
 */
export function answeredBy(changes: readonly ReleaseChange[], signals: readonly Signal[]): Signal[] {
  const shipped = new Set(changes.flatMap((c) => [c.feature.id, ...(c.feature.aliases ?? [])]));
  return signals.filter((s) => s.state === "open" && s.featureId !== undefined && shipped.has(s.featureId));
}

/** Options for {@link renderRelease}. @stability Experimental */
export interface RenderReleaseOptions {
  /** The release's name, e.g. `2026-10-25` or a version. */
  name: string;
}

/**
 * Draft release notes for people, not developers: each feature's tagline (or
 * its summary), grouped into shipped and in beta, with the asks it answers. A
 * person edits and publishes them.
 *
 * @stability Experimental
 */
export function renderRelease(changes: readonly ReleaseChange[], signals: readonly Signal[], options: RenderReleaseOptions): string {
  const answered = answeredBy(changes, signals);
  const section = (title: string, kind: ReleaseChange["change"]) => {
    const own = changes.filter((c) => c.change === kind);
    if (!own.length) return [];
    return [
      `## ${title}`,
      "",
      ...own.map((c) => {
        const asks = answered.filter((s) => s.featureId === c.feature.id || c.feature.aliases?.includes(s.featureId!));
        const thanks = asks.length ? ` Asked for in ${asks.map((s) => (s.url ? `[${s.id.replace(/^github/, "")}](${s.url})` : s.id)).join(", ")}.` : "";
        return `- **${c.feature.name}**: ${c.feature.tagline ?? c.feature.summary}${thanks}`;
      }),
      "",
    ];
  };
  const body = [...section("Shipped", "live"), ...section("In beta", "beta")];
  return [`# Release ${options.name}`, "", ...(body.length ? body : ["_No feature reached beta or live in this range._", ""])].join("\n");
}
