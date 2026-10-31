/**
 * industry-words.mjs: the words that name an industry, and where they may not appear.
 *
 * The site builder's core (engine, sections, schemas, defaults, examples, docs and tests) is
 * neutral: a section reads naturally for any business. Industry flavour ships only as template
 * content under `packages/sites/src/templates/`. `scripts/check-industry-words.mjs` enforces it.
 *
 * Extend it:
 * - a new industry: add a group to WORDS (lowercase, one word each; plurals ending in "s" or
 *   "es" match on their own, other forms such as "coached" are listed).
 * - a new neutral package: add its folder (or file) to SCOPE.
 * - a file that must use another industry on purpose: add it to EXEMPT, with the reason.
 * - one line that must keep a word (a stored key, say): end it with `industry-words: allow`
 *   and the reason.
 *
 * No trademarks or real business names here: those belong in check-private-names.mjs, hashed.
 */

/** Words per industry. */
export const WORDS = {
  fitness: [
    "athlete",
    "barbell",
    "bootcamp",
    "deadlift",
    "fitness",
    "gym",
    "kettlebell",
    "pilates",
    "weightlifting",
    "wod",
    "workout",
    "yoga",
  ],
  coaching: ["coach", "coached", "coaching"],
  ministry: ["church", "congregation", "ministry", "ministries", "parish", "pastor", "sermon", "worship"],
};

/** Folders and files that must stay neutral (paths from the repo root). */
export const SCOPE = ["packages/sites", "docs/SITES.md"];

/** Paths under SCOPE that may name an industry, each with its reason. */
export const EXEMPT = {
  "packages/sites/src/templates/": "industry template content: the one place industry wording belongs",
  "packages/sites/CHANGELOG.md": "release history, written before the core went neutral",
};
