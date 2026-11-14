const path = require("path");
const root = process.argv[2];
const ids = ["update", "update:list", "update:view", "build:list", "channel:view", "fingerprint:generate", "workflow:run", "workflow:runs", "env:exec"];
const out = {};
for (const id of ids) {
  const file = path.join(root, "build", "commands", ...id.split(":")) + (id.includes(":") ? ".js" : path.sep + "index.js");
  const C = require(file).default;
  const flags = {};
  for (const [name, f] of Object.entries(C.flags ?? {})) flags[name] = { ...(f.char ? { char: f.char } : {}), type: f.type, ...(f.multiple ? { multiple: true } : {}) };
  out[id] = { args: Object.keys(C.args ?? {}), flags: Object.fromEntries(Object.entries(flags).sort(([a], [b]) => a.localeCompare(b))) };
}
console.log(JSON.stringify({ "eas-cli": require(path.join(root, "package.json")).version, commands: out }, null, 2));
