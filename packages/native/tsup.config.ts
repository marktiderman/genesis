import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", persist: "src/persist.ts", updates: "src/updates/index.ts", push: "src/push/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [
    "react",
    "react-native",
    "react-native-safe-area-context",
    /^expo-/,
    /^@marktiderman\/genesis-/,
    /^@tanstack\//,
  ],
});
