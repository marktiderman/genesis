/**
 * The "practice" names genesis-core 2 removed, found and rewritten in one place: the
 * `genesis-core-2-scope-names` codemod rewrites them and the doctor's `removed-scope-name` rule
 * reports any left, so a missed codemod is an error in CI, not times on the wrong clock.
 *
 * Only files that import a Genesis package are read, so an app's own `practice` names are left
 * alone.
 */

/** Imports from a Genesis package. */
export const IMPORTS_GENESIS = /\bfrom\s*["']@marktiderman\/genesis[\w/-]*["']/;

/** One removed name left in a file. */
export interface RemovedScopeName {
  /** Offset of the match in the file. */
  index: number;
  /** What it is, for the report. */
  what: "timeZone-practice" | "resolveZone-practice" | "practiceTimeZone" | "DisplayTimeZones.practice";
  /** What to write instead. */
  instead: string;
}

/** `timeZone: "practice"` (or `'practice'`), a view field's clock: a string value in a view definition. */
const TIME_ZONE = /(\btimeZone\s*:\s*)(["'`])practice\2/g;
/** `resolveZone("practice", …)`. */
const RESOLVE_ZONE = /(\bresolveZone\(\s*)(["'`])practice\2/g;
/** NativeResourceView's prop, as a JSX attribute or an object key (`{ practiceTimeZone: zone }`). */
const PROP = /(^|[\s{,(])practiceTimeZone(\s*[=:])/gm;
/** A `{ viewer: …, practice: … }` object: DisplayTimeZones as written by hand. */
const ZONES_OBJECT = /\{[^{}]*\bviewer\s*:[^{}]*\}/g;
const PRACTICE_KEY = /(^|[\s{,])practice(\s*:)/g;

/** Names bound to DisplayTimeZones: `const zones = useDisplayTimeZones()`, `zones: DisplayTimeZones`. */
function zoneBindings(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*DisplayTimeZones\s*)?=\s*useDisplayTimeZones\(\)/g)) names.add(m[1]!);
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\??\s*:\s*DisplayTimeZones\b/g)) names.add(m[1]!);
  return [...names];
}

const usesDisplayZones = (text: string) => /\b(DisplayTimeZones|DisplayTimeZonesProvider|useDisplayTimeZones)\b/.test(text);

/** Every removed name in `text`, in file order. Empty for a file that imports no Genesis package. */
export function findRemovedScopeNames(text: string): RemovedScopeName[] {
  if (!IMPORTS_GENESIS.test(text)) return [];
  const out: RemovedScopeName[] = [];
  for (const m of text.matchAll(TIME_ZONE)) out.push({ index: m.index!, what: "timeZone-practice", instead: 'timeZone: "scope"' });
  for (const m of text.matchAll(RESOLVE_ZONE)) out.push({ index: m.index!, what: "resolveZone-practice", instead: 'resolveZone("scope", …)' });
  for (const m of text.matchAll(PROP)) out.push({ index: m.index! + m[1]!.length, what: "practiceTimeZone", instead: "scopeTimeZone" });
  if (usesDisplayZones(text)) {
    for (const obj of text.matchAll(ZONES_OBJECT)) {
      for (const k of obj[0].matchAll(PRACTICE_KEY)) {
        out.push({ index: obj.index! + k.index! + k[1]!.length, what: "DisplayTimeZones.practice", instead: "scope" });
      }
    }
    for (const name of zoneBindings(text)) {
      for (const m of text.matchAll(new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\s*\\??\\.\\s*practice\\b`, "g"))) {
        out.push({ index: m.index!, what: "DisplayTimeZones.practice", instead: `${name}.scope` });
      }
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** `text` with every removed name rewritten (the same set {@link findRemovedScopeNames} reports). */
export function rewriteScopeNames(text: string): string {
  if (!IMPORTS_GENESIS.test(text)) return text;
  let next = text
    .replace(TIME_ZONE, "$1$2scope$2")
    .replace(RESOLVE_ZONE, "$1$2scope$2")
    .replace(PROP, "$1scopeTimeZone$2");
  if (usesDisplayZones(next)) {
    next = next.replace(ZONES_OBJECT, (obj) => obj.replace(PRACTICE_KEY, "$1scope$2"));
    for (const name of zoneBindings(next)) {
      next = next.replace(new RegExp(`(\\b${name.replace(/\$/g, "\\$")}\\s*\\??\\.\\s*)practice\\b`, "g"), "$1scope");
    }
  }
  return next;
}

/**
 * Whether the file reads `practiceId` off a scope (`scope.practiceId`, `scope?.practiceId`). It is
 * still passed and read as before; reading it typed takes one `ResourceScope` augmentation.
 */
export function readsPracticeId(text: string): number[] {
  if (!IMPORTS_GENESIS.test(text)) return [];
  return [...text.matchAll(/\bscope\s*\??\.\s*practiceId\b/g)].map((m) => m.index!);
}

/** Whether the file declares a `ResourceScope` augmentation. */
export const augmentsResourceScope = (text: string) => /\binterface\s+ResourceScope\b/.test(text);

export const PRACTICE_ID_AUGMENTATION =
  'declare module "@marktiderman/genesis-core" { interface ResourceScope { practiceId?: string } }';
