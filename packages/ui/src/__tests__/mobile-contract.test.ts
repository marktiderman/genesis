// @vitest-environment node
/**
 * The mobile contract (docs/MOBILE.md), read straight from the source so a change that breaks
 * it fails here, before any app sees it:
 *
 * - controls are 44px on a touch screen (`pointer-coarse:`);
 * - form controls keep 16px text on a touch screen, so iOS doesn't zoom on focus;
 * - anything fixed to the bottom of the screen pads for the home indicator;
 * - one reduced-motion rule covers everything genesis-ui draws;
 * - an overlay's height is never in `vh`, which a phone's toolbar and keyboard cut off.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(srcDir, path), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const all = sources(join(srcDir, "components")).map((path) => ({
  file: relative(srcDir, path),
  text: readFileSync(path, "utf8"),
}));

describe("44px targets on a touch screen", () => {
  it("every Button size is at least 44px tall, and an icon button 44px wide", () => {
    const button = read("components/ui/button.tsx");
    expect(button).toMatch(/pointer-coarse:min-h-11/);
    expect(button).toMatch(/icon: "[^"]*pointer-coarse:min-w-11/);
  });

  it.each([
    ["components/ui/tabs.tsx", "tab triggers"],
    ["components/ui/input.tsx", "inputs"],
    ["components/ui/select.tsx", "select triggers and options"],
    ["components/ui/dropdown-menu.tsx", "menu items"],
  ])("%s grows its %s", (file) => {
    expect(read(file)).toMatch(/pointer-coarse:(?:min-)?h-11/);
  });
});

describe("No zoom on focus", () => {
  it("form controls drop to 14px text only for a mouse", () => {
    for (const file of ["components/ui/input.tsx", "components/ui/textarea.tsx"]) {
      const text = read(file);
      expect(text, file).toMatch(/\btext-base\b/);
      // A bare `md:text-sm` shrinks the text on an iPad too, and Safari zooms in on focus.
      expect(text, file).not.toMatch(/(?<![\w:-])md:text-sm/);
    }
  });
});

describe("Safe areas", () => {
  it("anything fixed to the bottom edge pads for the home indicator", () => {
    const offenders = all.filter(({ text }) =>
      [...text.matchAll(/"[^"\n]*\bfixed\b[^"\n]*\bbottom-0\b[^"\n]*"/g)].some(
        ([classes]) => !classes.includes("safe-area-inset-bottom"),
      ),
    );
    expect(offenders.map((o) => o.file)).toEqual([]);
  });
});

describe("Reduced motion", () => {
  it("styles.css stops every animation and transition when less motion is asked for", () => {
    const css = read("styles.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/animation-duration: 0\.01ms !important/);
    expect(css).toMatch(/transition-duration: 0\.01ms !important/);
  });
});

describe("Overlay heights", () => {
  it("no component sizes an overlay in vh", () => {
    // A vh height is fine as the fallback for browsers without dvh, on a line that also sets the dvh one.
    const vhOnly = (text: string) => text.split("\n").some((line) => /\b(?:max-)?h-\[\d+(?:\.\d+)?vh\]/.test(line) && !/dvh/.test(line));
    const offenders = all.filter(({ text }) => vhOnly(text) && /Content\b/.test(text) && /(Dialog|Sheet)/.test(text));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });
});
