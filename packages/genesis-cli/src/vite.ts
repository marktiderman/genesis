/**
 * `genesisDoctor()` for Vite: runs the same checks as `genesis doctor`.
 *
 * - `vite build`: fails the build when the doctor finds errors.
 * - `vite dev`: logs problems and shows Vite's error overlay, re-checking
 *   (debounced) whenever a scanned file, the config or the rules doc changes.
 *
 *   import { genesisDoctor } from "@marktiderman/genesis-cli/vite";
 *   export default defineConfig({ plugins: [genesisDoctor()] });
 */
import * as path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { formatReport, loadConfig, loadGenesis, runDoctor, type DoctorResult, type GenesisFacts } from "./doctor/index.js";

export interface GenesisDoctorOptions {
  /** The app root. Default: Vite's `root`. */
  root?: string;
  /** Explicit config file. */
  configPath?: string;
  /** Fail builds on warnings too. */
  strict?: boolean;
  /** Re-check delay after a change, in ms. Default 300. */
  debounceMs?: number;
}

const formatProblems = (result: DoctorResult, withWarnings = false) =>
  result.findings
    .filter((f) => f.level === "error" || withWarnings)
    .map((f) => `${f.file}${f.line ? `:${f.line}` : ""}  [${f.rule}] ${f.message}`)
    .join("\n");

export function genesisDoctor(options: GenesisDoctorOptions = {}): Plugin[] {
  let root = options.root ?? process.cwd();
  return [
    {
      name: "genesis-doctor:build",
      apply: "build",
      configResolved(config) {
        root = options.root ?? config.root;
      },
      async buildStart() {
        const result = await runDoctor({ root, configPath: options.configPath, strict: options.strict });
        if (!result.ok) this.error(`Genesis doctor found problems:\n${formatProblems(result, options.strict)}`);
        if (result.warnings > 0) this.warn(formatReport(result));
      },
    },
    {
      name: "genesis-doctor:serve",
      apply: "serve",
      configResolved(config) {
        root = options.root ?? config.root;
      },
      configureServer(server: ViteDevServer) {
        let genesis: GenesisFacts | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let failing = false;
        // The last overlay message, re-sent to browsers that connect after the check ran.
        let lastError: string | null = null;
        const showError = (message: string) => {
          lastError = message;
          failing = true;
          server.config.logger.error(message, { timestamp: true });
          server.ws.send({ type: "error", err: { message, stack: "", plugin: "genesis-doctor" } });
        };
        let running = false;
        let again = false;

        const check = async () => {
          if (running) {
            again = true;
            return;
          }
          running = true;
          try {
            // Genesis facts only change on reinstall; read them once per server.
            genesis ??= loadGenesis(root, loadConfig(root, options.configPath).config);
            const result = await runDoctor({ root, configPath: options.configPath, genesis });
            if (result.errors > 0) {
              showError(`Genesis doctor found problems:\n${formatProblems(result)}`);
            } else if (failing) {
              // Clear the overlay once the problems are fixed.
              failing = false;
              lastError = null;
              server.config.logger.info("Genesis doctor: all clear", { timestamp: true });
              server.ws.send({ type: "full-reload" });
            }
          } catch (err) {
            showError(`Genesis doctor could not run: ${(err as Error).message}`);
          } finally {
            running = false;
            if (again) {
              again = false;
              void check();
            }
          }
        };

        const schedule = (file: string) => {
          const rel = path.relative(root, file).split(path.sep).join("/");
          if (rel.startsWith("..") || rel.includes("node_modules/")) return;
          clearTimeout(timer);
          timer = setTimeout(() => void check(), options.debounceMs ?? 300);
        };
        // The config and rules doc live outside src/, so watch them explicitly.
        server.watcher.add([path.join(root, "genesis.config.json"), ...(options.configPath ? [path.resolve(root, options.configPath)] : [])]);
        try {
          const { config } = loadConfig(root, options.configPath);
          if (config.rulesDoc) server.watcher.add(path.resolve(root, config.rulesDoc));
        } catch {
          // A broken config is reported by the first check.
        }
        server.watcher.on("change", schedule);
        server.watcher.on("add", schedule);
        server.watcher.on("unlink", schedule);
        server.ws.on("connection", () => {
          if (lastError) server.ws.send({ type: "error", err: { message: lastError, stack: "", plugin: "genesis-doctor" } });
        });
        server.httpServer?.once("listening", () => void check());
        if (!server.httpServer) void check();
      },
    },
  ];
}
