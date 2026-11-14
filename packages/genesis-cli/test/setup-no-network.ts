/**
 * No test reaches the network. `npx` and `eas` (which fetch packages and call Expo's API) are
 * stand-ins that fail at once, saying so, ahead of any real one on PATH; npm runs offline. A test
 * that needs either passes its own stand-in (RELEASE_EAS, or a PATH of its own).
 */
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

const bin = mkdtempSync(path.join(tmpdir(), "genesis-no-network-"));
mkdirSync(bin, { recursive: true });
for (const name of ["npx", "eas"]) {
  const file = path.join(bin, name);
  writeFileSync(file, `#!/bin/sh\necho "${name} $*: blocked, a test never reaches the network (test/setup-no-network.ts)" >&2\nexit 97\n`);
  chmodSync(file, 0o755);
}
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ""}`;
process.env.npm_config_offline = "true";
