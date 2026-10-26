// @feat:notifications
// The sender function template's registry is Deno code (npm: imports), so it is
// read as text and its registry rebuilt against this package's own source.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "../core/index";

const source = readFileSync(join(__dirname, "../../functions/genesis-notifications/notifications.ts"), "utf8");

describe("the sender function template", () => {
  it("mirrors genesis.test as the migration seeds it: critical and transactional", () => {
    // Evaluate the registry the template exports, with the package's own exports in place of the npm: import.
    const body = source
      .replace(/^import type .*$/gm, "")
      .replace(/^import \{([^}]*)\} from "npm:@marktiderman\/genesis-notifications@[^"]*";$/m, "const {$1} = core;")
      .replace(/export const (\w+)(: [^=]+)? =/g, "exports.$1 =");
    const exports: Record<string, unknown> = {};
    new Function("core", "exports", body)(core, exports);
    const registry = exports.notifications as ReturnType<typeof core.defineNotifications>;
    const row = registry.toTypeRows().find((r) => r.key === "genesis.test");
    expect(row).toMatchObject({ critical: true, transactional: true, channels: { in_app: true, push: true, email: true } });
  });
});
