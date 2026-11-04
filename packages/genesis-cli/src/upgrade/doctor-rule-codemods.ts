/**
 * Codemods for the two doctor rules from the 2026-11-03 release with a mechanical fix. The other two
 * findings that release raised (`shadowed-export`, the `persistQueries` deprecation) have none:
 * docs/MIGRATION.md says why and what to do by hand.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { stripComments } from "../doctor/genesis.js";
import { appScripts } from "./app-scripts.js";
import type { Codemod } from "./codemods.js";

const IMPORTS_GENESIS_UI = /from\s*["']@marktiderman\/genesis-ui(?:\/[^"']*)?["']/;
const OVERLAY_TAG = /<(?:Dialog|AlertDialog|Sheet)Content\b[^>]*>/g;
const VH_CLASS = /(^|[\s"'`{])((?:[\w-]+:)*)(max-h|min-h|h)-\[(\d+(?:\.\d+)?)vh\]/g;

/** At or above this, a `max-h` is the "fit the screen" Genesis's overlays already do; below it, a size someone chose. */
const CHOSEN_CAP_BELOW = 80;

/**
 * `ui/overlays-fit-the-phone`: Genesis's dialogs and sheets already cap themselves to the screen, so
 * a `max-h-[…vh]` that only says that goes. A shorter cap, a set height or a minimum keeps its size
 * in `dvh`, which follows the mobile browser's bars. Only an opening tag with one of these changes.
 */
export function rewriteOverlayHeights(text: string): string {
  return text.replace(OVERLAY_TAG, (tag) => {
    const next = tag.replace(VH_CLASS, (_all, lead: string, variants: string, kind: string, size: string) => (kind === "max-h" && Number(size) >= CHOSEN_CAP_BELOW ? lead : `${lead}${variants}${kind}-[${size}dvh]`));
    if (next === tag) return tag;
    return next.replace(/\bclassName=(["'])([^"']*)\1/, (_all, quote: string, classes: string) => `className=${quote}${classes.trim().replace(/\s+/g, " ")}${quote}`).replace(/\s+className=(["'])\1/, "");
  });
}

export const overlaysFitThePhone: Codemod = {
  id: "genesis-ui-overlays-fit-the-phone",
  package: "@marktiderman/genesis-ui",
  version: "2.31.0",
  description: "In Genesis's DialogContent, AlertDialogContent and SheetContent, drops a max-h-[…vh] of 80 or more (they cap themselves to the screen) and moves a shorter cap or a set height to dvh.",
  run({ root, dryRun, log }) {
    const changed: string[] = [];
    for (const rel of appScripts(root).filter((f) => /\.[jt]sx$/.test(f))) {
      const abs = path.join(root, rel);
      const text = readFileSync(abs, "utf8");
      const next = rewriteOverlayHeights(text);
      if (next === text) continue;
      // A local copy of the component doesn't cap itself, so its height stays.
      if (!IMPORTS_GENESIS_UI.test(text)) {
        log(`  ${rel}: sizes an overlay in vh but doesn't import genesis-ui; left as it is`);
        continue;
      }
      changed.push(rel);
      if (!dryRun) writeFileSync(abs, next);
    }
    if (changed.length) log('  Remove any doctor.allow entry for ui/overlays-fit-the-phone these files had (stale-exception names it). A long form may want mobileLayout="fullscreen".');
    return changed;
  },
};

const NATIVE_UI = "@marktiderman/genesis-ui-native";
const NAMESPACE = /\bimport\s*\*\s*as\s+(\w+)\s+from\s*(["'])expo-haptics\2;?/;
const ANY_CALL = /\b(?:impactAsync|selectionAsync|notificationAsync)\s*\(/;

/** Whether a position is in a line or block comment, near enough for a call on its own line. */
function inComment(text: string, at: number): boolean {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  if (/^\s*(?:\/\/|\*)/.test(text.slice(lineStart, at)) || /(?:^|[\s;{}()])\/\/[^"'`]*$/.test(text.slice(lineStart, at))) return true;
  return text.lastIndexOf("/*", at) > text.lastIndexOf("*/", at);
}

/**
 * `haptics-use-genesis`: each direct expo-haptics call in a file that imports it as a namespace
 * becomes `playHaptic(Haptics, "light")`, which works outside React as well as in it and never
 * throws. Left for a person: a style Genesis has no kind for (`Soft`, `Rigid`), a style in a
 * variable, a call chained with `.then`, and named imports.
 */
export function rewriteHaptics(text: string): { text: string; left: boolean } {
  const ns = NAMESPACE.exec(text)?.[1];
  if (!ns) return { text, left: /from\s*["']expo-haptics["']/.test(text) && ANY_CALL.test(text) };
  const call = (method: string, argument: string) => new RegExp(`(?:\\bawait\\s+)?\\b${ns}\\??\\.${method}\\(\\s*${argument}\\s*\\)(?!\\s*\\.(?:then|catch|finally)\\b)`, "g");
  let used = false;
  // A call in a comment stays as it is: nothing runs there, and it would add an unused import.
  const rewrite = (source: string, method: string, argument: string, kindOf: (captured?: string) => string) =>
    source.replace(call(method, argument), (all: string, ...rest: unknown[]) => {
      const captured = typeof rest[0] === "string" ? rest[0] : undefined;
      const offset = rest.find((r): r is number => typeof r === "number")!;
      if (inComment(source, offset)) return all;
      used = true;
      return `playHaptic(${ns}, "${kindOf(captured)}")`;
    });
  let next = rewrite(text, "impactAsync", `(?:${ns}\\.ImpactFeedbackStyle\\.(Light|Medium|Heavy))?`, (style) => (style ?? "Medium").toLowerCase());
  next = rewrite(next, "selectionAsync", "", () => "select");
  next = rewrite(next, "notificationAsync", `(?:${ns}\\.NotificationFeedbackType\\.(Success|Warning|Error))?`, (type) => (type ?? "Success").toLowerCase());
  const left = new RegExp(`\\b${ns}\\??\\.(?:impactAsync|selectionAsync|notificationAsync)\\(`).test(stripComments(next));
  if (!used) return { text, left };
  if (!/\bimport\s*\{[^}]*\bplayHaptic\b[^}]*\}/.test(next)) {
    const existing = new RegExp(`\\bimport\\s*\\{([^}]*)\\}\\s*from\\s*(["'])${NATIVE_UI}\\2`).exec(next);
    if (existing) next = next.replace(existing[0], existing[0].replace(`{${existing[1]}}`, `{ ${existing[1]!.trim().replace(/,$/, "")}, playHaptic }`));
    else next = next.replace(NAMESPACE, (line) => `${line}\nimport { playHaptic } from "${NATIVE_UI}";`);
  }
  return { text: next, left };
}

export const hapticsUseGenesis: Codemod = {
  id: "genesis-ui-native-haptics",
  package: NATIVE_UI,
  version: "3.7.0",
  description: 'Turns direct expo-haptics calls into playHaptic(Haptics, "light"), with Genesis\'s named kinds.',
  run({ root, dryRun, log }) {
    const changed: string[] = [];
    for (const rel of appScripts(root)) {
      if (/(?:^|\/)__tests__\/|\.test\.[jt]sx?$/.test(rel)) continue;
      const abs = path.join(root, rel);
      const text = readFileSync(abs, "utf8");
      if (!text.includes("expo-haptics")) continue;
      const result = rewriteHaptics(text);
      if (result.left) log(`  ${rel}: has expo-haptics calls this can't rewrite (a Soft or Rigid style, a style in a variable, a chained call, named imports); use useHaptics() there`);
      if (result.text === text) continue;
      changed.push(rel);
      if (!dryRun) writeFileSync(abs, result.text);
    }
    if (changed.length) log("  Inside a component, useHaptics() (with expo-haptics passed once as GenesisModules.haptics) is the shorter form.");
    return changed;
  },
};
