import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", web: "src/web/index.ts", "web-chat": "src/web-chat/index.ts", native: "src/native/index.ts", email: "src/email.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [
    "react",
    "react-dom",
    "react-native",
    "react-native-safe-area-context",
    "react-native-view-shot",
    /^expo-/,
    /^@marktiderman\/genesis-/,
    /^@tanstack\//,
    /^@supabase\//,
  ],
});
