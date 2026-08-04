import { defineConfig } from "tsup";

// Multi-entry build for @marktiderman/genesis-ui.
// All Radix/Tanstack/RR7/etc. peer deps stay external — consumers pin their own.
// Kept internally bundled: class-variance-authority, clsx, tailwind-merge (tiny,
// version-sensitive, deep use across all components).
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/components/data/index.ts",
    "src/hooks/index.ts",
    "src/hooks/*.ts",
    "src/utils.ts",
    "src/status-colors.ts",
    "src/provider/index.ts",
    // Per-component entrypoints → `@marktiderman/genesis-ui/button` etc.
    // resolve to just that component instead of the whole barrel + peers.
    "src/components/ui/*.tsx",
    // Layer barrels + per-component entrypoints for the patterns tier.
    //
    // These six are listed one by one rather than globbed as
    // `patterns/*.tsx`, because the entry list has to MIRROR the `exports`
    // map — no wider, no narrower. A glob is wider: it would also emit
    // `patterns/view-toggle.js` and `view-settings.js`, which no `exports`
    // entry declares, so Node answers ERR_PACKAGE_PATH_NOT_EXPORTED to
    // anyone who guesses those paths. Both stay public through the
    // `/patterns` barrel and the package root, which is the intended surface.
    //
    // The six moved out of `components/ui/` in the layer split, so the
    // `ui/*.tsx` glob above no longer covers them. An entry missing here
    // fails neither the build nor the typecheck on its own — the subpath
    // just 404s at runtime, for consumers only, on install. That is why
    // `scripts/check-exports-resolve.mjs` runs after every build and turns
    // exactly this omission into a build failure.
    "src/components/patterns/empty-state.tsx",
    "src/components/patterns/form-field.tsx",
    "src/components/patterns/page-loading.tsx",
    "src/components/patterns/settings-row.tsx",
    "src/components/patterns/status-badge.tsx",
    "src/components/patterns/toggle-row.tsx",
    "src/components/patterns/user-avatar.tsx",
    "src/components/patterns/index.ts",
    "src/components/layout/index.ts",
    // Page templates (FRAMEWORK.md step 8), listed one by one for the same
    // mirror-the-exports-map reason as the patterns entries above. A
    // `layout/*.tsx` glob would be WIDER than the map: it would also emit
    // `stack.js`, `grid.js`, `AppShell.js` and the rest, which no `exports`
    // entry declares, so Node answers ERR_PACKAGE_PATH_NOT_EXPORTED to
    // anyone who guesses those paths. `scripts/check-exports-resolve.mjs`
    // catches the opposite omission — a declared subpath with nothing
    // emitted — after every build.
    "src/components/layout/dashboard-page.tsx",
    "src/components/layout/detail-page.tsx",
    "src/components/layout/form-page.tsx",
    "src/components/layout/settings-page.tsx",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Emit the esbuild metafile so the post-build `stamp-use-client` step can map
  // each emitted chunk back to its source inputs and re-attach the per-file
  // "use client" directive that esbuild strips during bundling. This keeps a
  // Next.js RSC server graph able to import interactive components without
  // crashing at module init, while pure presentational primitives stay
  // directive-free (server-usable).
  metafile: true,
  external: [
    "react",
    "react-dom",
    "@marktiderman/genesis-core",
    "@marktiderman/genesis-design-system",
    /^@radix-ui\//,
    /^@tanstack\//,
    "@hookform/resolvers",
    "react-hook-form",
    "zod",
    "cmdk",
    "date-fns",
    "embla-carousel-react",
    "input-otp",
    "lucide-react",
    // The unified Radix package. tsup already externalizes everything in
    // `peerDependencies`, so this entry changes no emitted byte today —
    // verified by building `toggle.tsx` with and without it and diffing the
    // output. It is here for consistency: all 15 of the other peers are
    // enumerated in this list too, so the list reads as the complete
    // statement of what stays external rather than as a partial one that
    // silently defers the rest to tsup's default. #382 moved the package to
    // a peer without adding it here; this closes that gap.
    "radix-ui",
    "react-day-picker",
    "react-dropzone",
    "react-resizable-panels",
    "react-router",
    "recharts",
    "sonner",
    "vaul",
  ],
});
