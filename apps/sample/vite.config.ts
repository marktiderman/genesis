import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { studioDevServer } from "./studio/vite-plugin";

export default defineConfig(({ mode }) => ({
  // The studio handler runs in the dev server only (`apply: "serve"`), so a
  // production build of this static sample is unchanged by it.
  plugins: [tailwindcss(), reactRouter(), studioDevServer(loadEnv(mode, process.cwd(), "STUDIO_"))],
  resolve: { tsconfigPaths: true },
  server: { port: 3200 },
}));
