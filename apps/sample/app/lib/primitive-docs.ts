/**
 * Reader for the auto-generated primitives.json.
 *
 * The JSON ships from `pnpm --filter sample docs:generate`, which walks
 * @marktiderman/genesis-ui + @marktiderman/genesis-ui-native via react-docgen-typescript
 * and emits one entry per source file. This module is the route-side adapter.
 */

import generated from "../data/primitives.json";

export interface PrimitiveProp {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string;
}

export interface PrimitiveComponent {
  name: string;
  summary: string;
  props: PrimitiveProp[];
}

export interface PrimitiveDoc {
  slug: string;
  aliases: string[];
  surface: "web" | "native";
  subpath: string;
  filePath: string;
  stability: "stable" | "beta" | "planned" | "deprecated" | "experimental";
  summary: string;
  primaryComponent: string;
  components: PrimitiveComponent[];
}

interface GeneratedFile {
  generatedAt: string;
  surfaces: {
    web: { package: string; subpaths: string[]; count: number };
    native: { package: string; subpaths: string[]; count: number };
  };
  primitives: PrimitiveDoc[];
}

/**
 * Runtime shape guard for primitives.json — keeps callers (PRIMITIVE_DOCS,
 * the surface metadata, findPrimitive) from triggering hard-to-trace
 * downstream errors when the generator output drifts. Validates the
 * fields actually consumed in this module; deeper component-level
 * validation is intentionally out of scope (the generator is the source
 * of truth for component shape).
 */
function isGeneratedFile(value: unknown): value is GeneratedFile {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<GeneratedFile>;
  if (typeof v.generatedAt !== "string") return false;
  if (!v.surfaces || typeof v.surfaces !== "object") return false;
  if (!Array.isArray(v.primitives)) return false;
  return true;
}

if (!isGeneratedFile(generated)) {
  throw new Error(
    "apps/sample/app/data/primitives.json failed shape validation. " +
      "Run `pnpm --filter sample docs:generate` to refresh."
  );
}

const data: GeneratedFile = generated;

export const PRIMITIVE_DOCS: PrimitiveDoc[] = data.primitives;

export const PRIMITIVE_DOCS_GENERATED_AT = data.generatedAt;

export const PRIMITIVE_DOCS_SURFACES = data.surfaces;

/**
 * Two source files can legitimately share one slug — e.g. the canonical
 * `EmptyState` at the package root and the deprecated `/data` re-export
 * that now aliases it. The showcase must document the SUPPORTED import, so
 * a deprecated entry is only ever used when nothing else matches.
 */
function preferSupported(
  matches: PrimitiveDoc[]
): PrimitiveDoc | undefined {
  return (
    matches.find((p) => p.stability !== "deprecated") ?? matches[0]
  );
}

/**
 * Look up a primitive by canonical slug, falling back to declared aliases
 * (e.g. `toast` resolves to `sonner.tsx`). Web primitives win over native
 * when both surfaces share a slug, since today's /showcase/primitives/:slug
 * route is the web reference page. Within a surface, a non-deprecated entry
 * wins over a deprecated one sharing the same slug (see `preferSupported`).
 * The incoming slug is normalised (trim + toLowerCase) so URL
 * casing/whitespace variants still match — primitive slugs are
 * kebab-case-lowercase by generator contract.
 */
export function findPrimitive(slug: string): PrimitiveDoc | undefined {
  const key = slug.trim().toLowerCase();
  if (!key) return undefined;

  const exactWeb = preferSupported(
    PRIMITIVE_DOCS.filter(
      (p) => p.surface === "web" && p.slug.toLowerCase() === key
    )
  );
  if (exactWeb) return exactWeb;

  const aliasWeb = preferSupported(
    PRIMITIVE_DOCS.filter(
      (p) =>
        p.surface === "web" &&
        p.aliases.some((a) => a.toLowerCase() === key)
    )
  );
  if (aliasWeb) return aliasWeb;

  const exactNative = preferSupported(
    PRIMITIVE_DOCS.filter(
      (p) => p.surface === "native" && p.slug.toLowerCase() === key
    )
  );
  if (exactNative) return exactNative;

  return preferSupported(
    PRIMITIVE_DOCS.filter((p) =>
      p.aliases.some((a) => a.toLowerCase() === key)
    )
  );
}
