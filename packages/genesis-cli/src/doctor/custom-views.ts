/**
 * Rules for an app's own drawing on Genesis (ADR 0019, custom views; ADR 0018, parts). All warn.
 *
 * - `app-part-colors`: a custom view (a file that renders `<CustomView>` or calls
 *   `useCustomView`) or an app part (an element with `data-slot="app-…"`) takes its colours from
 *   the theme's colour roles only (`hsl(var(--primary))`, `bg-primary`), so an app brand recolours
 *   it and dark mode reaches it. It reports a colour property or a Tailwind colour utility whose
 *   value reads a custom property that isn't a colour role (`var(--brand-500)`, `var(--my-red)`).
 *   Literal colours are already `raw-color`'s and `arbitrary-color`'s.
 * - `app-part-name`: an app's own `data-slot` starts `app-`, so an app style can reach it without
 *   ever matching a Genesis part, and a Genesis release can't collide with it. A name Genesis's
 *   parts already use (`THEME_PARTS`) is named as such: the app's element would take every app
 *   style's rules for that part.
 * - `custom-view-states`: a custom view doesn't draw its own loading, empty or error state:
 *   `<CustomView>` draws them (its `loading`, `empty` and `error` props replace one). It reports
 *   a file that calls `useCustomView` (the headless half) and branches on its `status`, or that
 *   renders `<CustomView>` and checks `status === "loading" | "empty" | "error"` inside it.
 */
import { lineAt } from "./scan.js";
import { insideOverlayOf, markedOverlays } from "./overlays.js";
import type { DoctorContext } from "./types.js";

const JSX_EXTS = new Set([".tsx", ".jsx"]);

/** A file that is a custom view: it renders `<CustomView>` or calls `useCustomView`. */
const CUSTOM_VIEW = /<CustomView\b|\buseCustomView\s*[<(]/;
/** An app part: an element marked `data-slot="app-…"`. */
const APP_PART = /data-slot\s*=\s*\{?\s*["'`]app-/;

/** Style-object keys (camelCase) and CSS properties that paint a colour. */
const COLOUR_KEY = /\b(color|background(?:Color)?|border(?:Top|Right|Bottom|Left|Block|Inline)?(?:Color)?|outline(?:Color)?|textDecorationColor|caretColor|accentColor|fill|stroke|columnRuleColor|boxShadow)\s*:\s*(["'`])([^"'`]*)\2/g;
/** Tailwind utilities that take a colour, with an arbitrary value: `bg-[var(--x)]`, `text-[hsl(var(--x))]`. */
const COLOUR_UTILITY = /(?<![\w-])(?:bg|text|border(?:-[xytrbls])?|ring|ring-offset|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret|placeholder)-\[([^\]]*var\(--[^\]]*)\]/g;
const VARIABLE = /var\(\s*(--[A-Za-z0-9_-]+)/g;

export function checkAppParts(ctx: DoctorContext): void {
  const roles = ctx.genesis.colorTokens
  const genesisParts = new Set(ctx.genesis.themeParts ?? []);
  // The app's overlay of the component package is that package: its parts are Genesis's.
  const overlays = markedOverlays(ctx);
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext) && file.ext !== ".ts" && file.ext !== ".js") continue;
    if (insideOverlayOf(overlays, file, ctx.genesis.uiPackage)) continue;
    const code = file.code;

    // ── app-part-name ───────────────────────────────────────────────
    if (JSX_EXTS.has(file.ext)) {
      for (const m of code.matchAll(/\bdata-slot\s*=\s*(?:\{\s*)?["'`]([^"'`$]+)["'`]/g)) {
        const name = m[1]!;
        if (name.startsWith("app-")) continue;
        const clash = genesisParts.has(name);
        ctx.report({
          rule: "app-part-name",
          level: "warn",
          file: file.path,
          line: lineAt(code, m.index ?? 0),
          subject: name,
          message: clash
            ? `marks an app element data-slot="${name}", which is a Genesis part (THEME_PARTS): every app style's rules for it would hit this element too. Name the app's own part "app-${name}"`
            : `marks an app element data-slot="${name}"; name the app's own part "app-${name}", so it never collides with a Genesis part (docs/adr/0018-app-brands-styles-themes.md)`,
        });
      }
    }

    // ── app-part-colors ─────────────────────────────────────────────
    if (roles && roles.size && (CUSTOM_VIEW.test(code) || APP_PART.test(code))) {
      const seen = new Set<string>();
      const check = (value: string, at: number) => {
        for (const v of value.matchAll(VARIABLE)) {
          const name = v[1]!;
          if (roles.has(name)) continue;
          const line = lineAt(code, at);
          if (seen.has(`${line}:${name}`)) continue;
          seen.add(`${line}:${name}`);
          ctx.report({
            rule: "app-part-colors",
            level: "warn",
            file: file.path,
            line,
            subject: name,
            message: `colours a custom view or app part with ${name}, which isn't a colour role; take colours from roles only (hsl(var(--primary)), bg-primary, text-muted-foreground) so the app brand and dark mode reach it`,
          });
        }
      };
      for (const m of code.matchAll(COLOUR_KEY)) check(m[3]!, m.index ?? 0);
      for (const m of code.matchAll(COLOUR_UTILITY)) check(m[1]!, m.index ?? 0);
    }

    // ── custom-view-states ──────────────────────────────────────────
    if (JSX_EXTS.has(file.ext) && CUSTOM_VIEW.test(code)) {
      for (const m of code.matchAll(/\bstatus\s*[!=]={1,2}\s*["'`](loading|empty|error)["'`]/g)) {
        ctx.report({
          rule: "custom-view-states",
          level: "warn",
          file: file.path,
          line: lineAt(code, m.index ?? 0),
          subject: m[1]!,
          message: `draws a custom view's own ${m[1]} state; <CustomView> draws loading, empty and error in the app's style (pass its loading, empty or error prop to replace one) (docs/adr/0019-custom-views.md)`,
        });
      }
    }
  }
}
