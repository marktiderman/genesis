import { defineConfig } from "tsup";

// CRITICAL: jsx: "preserve" keeps className strings intact in dist/ so
// consumer's Tailwind content scanner can extract them. See
// docs/research/nativewind-publishing.md for the full recipe + footguns.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "components/index": "src/components/index.ts",
    "data/index": "src/data/index.ts",
    "hooks/index": "src/hooks/index.ts",
    "layouts/index": "src/layouts/index.ts",
    // Subpath: consumers can `import { cn } from "@marktiderman/genesis-ui-native/utils"`
    // without pulling the entire components barrel.
    utils: "src/utils.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  jsx: "preserve",
  target: "es2022",
  outExtension: () => ({ js: ".js" }),
  external: [
    "react",
    "react-native",
    "react-native-css-interop",
    "nativewind",
    "@marktiderman/genesis-core",
    "@marktiderman/genesis-design-system",
    "clsx",
    "tailwind-merge",
    "class-variance-authority",
    "lucide-react-native",
    "@tanstack/react-query",
    "react-hook-form",
    "@hookform/resolvers",
    "zod",
    "react-native-keyboard-controller",
    "react-native-safe-area-context",
    "expo-haptics",
  ],
});
