import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react/index.tsx",
    web: "src/web/index.ts",
    native: "src/native/index.ts",
    server: "src/server/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [
    "react",
    "react-dom",
    /^react\//,
    "react-native",
    /^react-native-/,
    /^expo-/,
    /^expo$/,
    /^@marktiderman\/genesis-/,
    /^@tanstack\//,
    /^@supabase\//,
    "lucide-react",
  ],
});
