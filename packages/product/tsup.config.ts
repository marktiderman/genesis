import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", server: "src/server.ts", node: "src/node.ts", cli: "src/cli.ts", native: "src/native/index.ts" },
  format: ["esm"],
  dts: { entry: { index: "src/index.ts", server: "src/server.ts", node: "src/node.ts", native: "src/native/index.ts" } },
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [/^@marktiderman\//, /^node:/, "react", "react/jsx-runtime", "react-native", "react-native-safe-area-context"],
});
