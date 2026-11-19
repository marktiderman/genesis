import { defineConfig, type Options } from "tsup";

const external: Options["external"] = [
  "react",
  "react-dom",
  "react-native",
  "react-native-safe-area-context",
  "react-native-view-shot",
  /^expo-/,
  /^@marktiderman\/genesis-/,
  /^@tanstack\//,
  /^@supabase\//,
  /^zod/,
];

export default defineConfig([
  {
    entry: { index: "src/index.ts", web: "src/web/index.ts", "web-chat": "src/web-chat/index.ts", native: "src/native/index.ts", email: "src/email.ts", ai: "src/ai.ts", server: "src/server/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: "es2022",
    external,
  },
  {
    // The server entry also as CommonJS: a NestJS (or other CommonJS) backend `require`s it.
    entry: { server: "src/server/index.ts" },
    format: ["cjs"],
    outExtension: () => ({ js: ".cjs" }),
    dts: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: "es2022",
    external,
  },
]);
