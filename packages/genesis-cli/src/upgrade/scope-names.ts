/**
 * The "practice" names genesis-core 2 removed, found and rewritten in one place: the
 * `genesis-core-2-scope-names` codemod rewrites them and the doctor's `removed-scope-name` rule
 * reports any left, so a missed codemod is an error in CI, not times on the wrong clock.
 *
 * Only Genesis API usage counts, never an app's own names that happen to match:
 *
 * - `timeZone: "practice"` inside a `defineView(…)` call, or an object typed (`: T =` or
 *   `satisfies T`) as `ViewDefinition` or `ViewField`, with `defineView` / the type imported from
 *   Genesis;
 * - `practiceTimeZone` as an attribute of a `<NativeResourceView>` tag, or a key of an object
 *   typed `NativeResourceViewProps`;
 * - `resolveZone("practice", …)` where `resolveZone` is Genesis's;
 * - DisplayTimeZones' `practice`: a key of DisplayTimeZonesProvider's `value={{ … }}` or of an
 *   object typed `DisplayTimeZones`, and `.practice` on a value from Genesis's
 *   `useDisplayTimeZones()` or typed `DisplayTimeZones`.
 *
 * A removed name outside these shapes is still caught: `timeZone` is a closed type, `defineView`
 * refuses `"practice"` when the view loads, and the other names are gone from the types.
 */

/** Imports from a Genesis package. */
export const IMPORTS_GENESIS = /\bfrom\s*["']@marktiderman\/genesis[\w/-]*["']/;

/** One removed name left in a file, with its rewrite. */
export interface RemovedScopeName {
  /** Offset of the name in the file. */
  index: number;
  /** What it is, for the report. */
  what: "timeZone-practice" | "resolveZone-practice" | "practiceTimeZone" | "DisplayTimeZones.practice";
  /** What to write instead. */
  instead: string;
  /** The text to replace (`[start, end)`) and its replacement. */
  start: number;
  end: number;
  replacement: string;
}

type Span = readonly [number, number];
const within = (spans: readonly Span[], at: number) => spans.some(([a, b]) => at >= a && at < b);

/** Whether `name` is imported from a Genesis package in `text` (`import { name }`, `import { type name }`, `import { x as name }`). */
export function importedFromGenesis(text: string, name: string): boolean {
  for (const m of text.matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@marktiderman\/genesis[\w/-]*["']/g)) {
    for (const part of m[1]!.split(",")) {
      const local = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (local === name) return true;
    }
  }
  return false;
}

const OPEN: Record<string, string> = { "(": ")", "{": "}", "[": "]" };

/** The offset just past the bracket matching the one at `open` (`(`, `{` or `[`), skipping strings. */
function matching(text: string, open: number): number {
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (OPEN[ch]) stack.push(OPEN[ch]!);
    else if (ch === ")" || ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return text.length;
}

/** The offset of the `{` matching the `}` at `close`, walking back (strings are rare in the way; braces in them are not counted). */
function matchingBack(text: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return 0;
}

/** Spans of the calls `name(…)`. */
function callSpans(text: string, name: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(new RegExp(`\\b${name}\\s*(?:<[^()]*?>)?\\s*\\(`, "g"))) {
    const open = m.index! + m[0].length - 1;
    out.push([open, matching(text, open)]);
  }
  return out;
}

/** Spans of object literals typed `T`: `x: T<…> = { … }`, `{ … } satisfies T<…>`, `{ … } as T`. */
function typedObjectSpans(text: string, types: readonly string[]): Span[] {
  const out: Span[] = [];
  if (types.length === 0) return out;
  // The type, alone or wrapped once (`Partial<T>`, `Readonly<T>`, `Pick<T, …>`).
  const names = `(?:(?:Partial|Readonly|Required|Pick|Omit)\\s*<\\s*)?(?:${types.join("|")})`;
  for (const m of text.matchAll(new RegExp(`:\\s*${names}\\b(?:<[^=]*?>)?[^=;{]*?=\\s*\\{`, "g"))) {
    const open = m.index! + m[0].length - 1;
    out.push([open, matching(text, open)]);
  }
  for (const m of text.matchAll(new RegExp(`\\}\\s*(?:satisfies|as)\\s+${names}\\b`, "g"))) {
    const close = m.index!;
    out.push([matchingBack(text, close), close + 1]);
  }
  return out;
}

/** Spans of `<Tag …>` opening tags (attributes included, nested expressions too). */
function tagSpans(text: string, tag: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(new RegExp(`<${tag}\\b`, "g"))) {
    let depth = 0;
    let quote: string | null = null;
    let end = text.length;
    for (let i = m.index! + 1; i < text.length; i++) {
      const ch = text[i]!;
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        end = i + 1;
        break;
      }
    }
    out.push([m.index!, end]);
  }
  return out;
}

/** The `{ … }` of `<Tag … attr={{ … }}`. */
function attributeObjectSpans(text: string, tag: string, attr: string): Span[] {
  const out: Span[] = [];
  for (const [a, b] of tagSpans(text, tag)) {
    const inTag = text.slice(a, b);
    for (const m of inTag.matchAll(new RegExp(`\\s${attr}\\s*=\\s*\\{\\s*\\{`, "g"))) {
      const open = a + m.index! + m[0].length - 1;
      out.push([open, matching(text, open)]);
    }
  }
  return out;
}

/** Names bound to DisplayTimeZones: `const zones = useDisplayTimeZones()`, `zones: DisplayTimeZones`. */
function zoneBindings(text: string, hook: boolean, type: boolean): string[] {
  const names = new Set<string>();
  if (hook) {
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*DisplayTimeZones\s*)?=\s*useDisplayTimeZones\(\)/g)) names.add(m[1]!);
  }
  if (type) for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\??\s*:\s*DisplayTimeZones\b/g)) names.add(m[1]!);
  return [...names];
}

const escape = (name: string) => name.replace(/\$/g, "\\$");

/** Every removed name in `text`, in file order, each with its rewrite. Empty for a file that imports no Genesis package. */
export function findRemovedScopeNames(text: string): RemovedScopeName[] {
  if (!IMPORTS_GENESIS.test(text)) return [];
  const out: RemovedScopeName[] = [];
  const has = (name: string) => importedFromGenesis(text, name);

  // A view field's clock.
  const viewSpans = [
    ...(has("defineView") ? callSpans(text, "defineView") : []),
    ...typedObjectSpans(text, ["ViewDefinition", "ViewField"].filter(has)),
  ];
  for (const m of text.matchAll(/(\btimeZone\s*:\s*)(["'`])practice\2/g)) {
    const at = m.index! + m[1]!.length;
    if (!within(viewSpans, at)) continue;
    out.push({ index: m.index!, what: "timeZone-practice", instead: 'timeZone: "scope"', start: at + 1, end: at + 1 + "practice".length, replacement: "scope" });
  }

  // resolveZone("practice", …): Genesis's resolveZone only.
  if (has("resolveZone")) {
    for (const m of text.matchAll(/(\bresolveZone\(\s*)(["'`])practice\2/g)) {
      const at = m.index! + m[1]!.length + 1;
      out.push({ index: m.index!, what: "resolveZone-practice", instead: 'resolveZone("scope", …)', start: at, end: at + "practice".length, replacement: "scope" });
    }
  }

  // NativeResourceView's prop: its tag's attribute, or a key of an object typed NativeResourceViewProps.
  const propSpans = [
    ...(has("NativeResourceView") ? tagSpans(text, "NativeResourceView") : []),
    ...typedObjectSpans(text, ["NativeResourceViewProps"].filter(has)),
  ];
  for (const m of text.matchAll(/(^|[\s{,(])practiceTimeZone(\s*[=:])/gm)) {
    const at = m.index! + m[1]!.length;
    if (!within(propSpans, at)) continue;
    out.push({ index: at, what: "practiceTimeZone", instead: "scopeTimeZone", start: at, end: at + "practiceTimeZone".length, replacement: "scopeTimeZone" });
  }

  // DisplayTimeZones' practice: a key of the provider's value or of a typed object, and `.practice` on one.
  const zoneSpans = [
    ...(has("DisplayTimeZonesProvider") ? attributeObjectSpans(text, "DisplayTimeZonesProvider", "value") : []),
    ...typedObjectSpans(text, ["DisplayTimeZones"].filter(has)),
  ];
  for (const m of text.matchAll(/(^|[\s{,])practice(\s*:)/gm)) {
    const at = m.index! + m[1]!.length;
    if (!within(zoneSpans, at)) continue;
    out.push({ index: at, what: "DisplayTimeZones.practice", instead: "scope", start: at, end: at + "practice".length, replacement: "scope" });
  }
  for (const name of zoneBindings(text, has("useDisplayTimeZones"), has("DisplayTimeZones"))) {
    for (const m of text.matchAll(new RegExp(`\\b${escape(name)}\\s*\\??\\.\\s*(practice)\\b`, "g"))) {
      const at = m.index! + m[0].length - "practice".length;
      out.push({ index: m.index!, what: "DisplayTimeZones.practice", instead: `${name}.scope`, start: at, end: at + "practice".length, replacement: "scope" });
    }
  }

  // One finding per place (a key can sit in two spans).
  const seen = new Set<number>();
  return out.filter((f) => (seen.has(f.start) ? false : (seen.add(f.start), true))).sort((a, b) => a.start - b.start);
}

/** `text` with every removed name {@link findRemovedScopeNames} reports rewritten, and nothing else. */
export function rewriteScopeNames(text: string): string {
  let next = text;
  for (const f of findRemovedScopeNames(text).sort((a, b) => b.start - a.start)) {
    next = next.slice(0, f.start) + f.replacement + next.slice(f.end);
  }
  return next;
}

/**
 * Where the file reads `practiceId` off a scope (`scope.practiceId`, `scope?.practiceId`). It is
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
