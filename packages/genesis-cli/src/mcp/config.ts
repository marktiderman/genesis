/**
 * `genesis agents --mcp`: the app's `.mcp.json` entry that starts `genesis mcp`, merged into the
 * file: every other server, and any key of the entry Genesis doesn't set (`env`), is kept.
 */
import { chmodSync, existsSync, lstatSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";

export const MCP_JSON = ".mcp.json";
export const MCP_SERVER_NAME = "genesis";

/**
 * The entry: the app's own installed CLI. `npx --no` never downloads a package when the bin isn't
 * installed (an unrelated `genesis` from the registry), it fails instead.
 */
export const GENESIS_MCP_ENTRY = Object.freeze({ type: "stdio", command: "npx", args: Object.freeze(["--no", "genesis", "mcp"]) });

export class McpJsonError extends Error {
  override name = "McpJsonError";
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `.mcp.json`'s new text with the Genesis entry in it, or null when it already has it. Throws McpJsonError when the file can't be merged safely. */
export function mcpJsonEdit(root: string): string | null {
  const file = path.join(root, MCP_JSON);
  refuseLink(file);
  const raw = existsSync(file) ? readFileSync(file, "utf8") : null;
  let json: Record<string, unknown> = {};
  if (raw !== null && raw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new McpJsonError(`${MCP_JSON} isn't valid JSON (${(err as Error).message}); fix it, then run genesis agents --mcp again. Nothing was written.`);
    }
    if (!isObject(parsed)) throw new McpJsonError(`${MCP_JSON} isn't a JSON object; nothing was written.`);
    json = parsed;
  }
  const servers = json.mcpServers ?? {};
  if (!isObject(servers)) throw new McpJsonError(`${MCP_JSON} "mcpServers" isn't an object; nothing was written.`);
  const current = servers[MCP_SERVER_NAME];
  if (current !== undefined && !isObject(current)) throw new McpJsonError(`${MCP_JSON} mcpServers.${MCP_SERVER_NAME} isn't an object; nothing was written.`);
  const entry = { ...(current ?? {}), type: GENESIS_MCP_ENTRY.type, command: GENESIS_MCP_ENTRY.command, args: [...GENESIS_MCP_ENTRY.args] };
  if (current && JSON.stringify(current) === JSON.stringify(entry)) return null;
  const next = { ...json, mcpServers: { ...servers, [MCP_SERVER_NAME]: entry } };
  const indent = raw ? (/^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ") : "  ";
  return `${JSON.stringify(next, null, indent)}\n`;
}

/** A `.mcp.json` that is a symbolic link (a dangling one included) or not a file is never read or written through. */
function refuseLink(file: string): void {
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return;
  }
  if (st.isSymbolicLink()) throw new McpJsonError(`${MCP_JSON} is a symbolic link; genesis agents --mcp never writes through one. Nothing was written.`);
  if (!st.isFile()) throw new McpJsonError(`${MCP_JSON} isn't a file; nothing was written.`);
}

/** Whether `.mcp.json` has the Genesis entry as `genesis agents --mcp` writes it. */
export function mcpJsonState(root: string): "ok" | "missing" | "stale" | "invalid" {
  if (!existsSync(path.join(root, MCP_JSON))) return "missing";
  try {
    return mcpJsonEdit(root) === null ? "ok" : "stale";
  } catch {
    return "invalid";
  }
}

/** Write the entry; returns the files written (none when it was already there). */
export function writeMcpJson(root: string): string[] {
  const content = mcpJsonEdit(root);
  if (content === null) return [];
  const file = path.join(root, MCP_JSON);
  // A temp file beside it, renamed into place: a link that appears meanwhile is replaced, never followed.
  const tmp = path.join(root, `.${MCP_JSON}.genesis-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, content, { flag: "wx" });
  try {
    refuseLink(file);
    // The rewrite keeps the file's mode (a file the person made private stays private).
    if (existsSync(file)) chmodSync(tmp, statSync(file).mode & 0o7777);
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* gone */
    }
    throw err;
  }
  return [MCP_JSON];
}
