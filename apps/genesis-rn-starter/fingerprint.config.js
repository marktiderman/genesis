// What decides the runtime version, and so whether a merge to main ships an over-the-air update or
// a new store build (docs/NATIVE-RELEASE.md, "Fingerprints", in the Genesis repository): Expo's
// fingerprint of the native project.
//
// - Config plugins are hashed by the files they load, not by their package.json. The app loads
//   Genesis's plugins from @marktiderman/genesis-cli (withGenesis) and
//   @marktiderman/genesis-native (the rich push extension); hashed by package.json, a new version
//   of either gives a new runtime version and a store build even when its plugin didn't change. A
//   change to a plugin's code still does.
// - The rich push plugin copies Swift files into the build, which it reads rather than loads, so
//   they are hashed too, each under a key without the folder it was installed in.
//
// Hoisted installs only. The plugin files' paths are part of the fingerprint. In a hoisted
// node_modules (npm, Yarn's node-modules linker, pnpm with node-linker=hoisted, Bun with
// linker=hoisted) they don't change between versions. In an isolated layout (pnpm's default,
// Bun's for workspaces) the real path carries the version, so every Genesis release still changes
// the fingerprint and makes a store build. Expo's Metro setup needs the hoisted layout anyway.
//
// Genesis template (templates/expo/fingerprint.config.js); genesis upgrade refreshes it.
const fs = require("node:fs");
const path = require("node:path");

/** Each file under genesis-native's ios/ as a fingerprint source, keyed by its path inside the package. */
function genesisNativeIos() {
  let ios;
  try {
    ios = path.join(path.dirname(require.resolve("@marktiderman/genesis-native/package.json", { paths: [__dirname] })), "ios");
  } catch {
    return []; // Not installed: nothing of it in the build.
  }
  const files = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  visit(ios);
  return files.map((file) => ({
    type: "file",
    filePath: path.relative(__dirname, file).split(path.sep).join("/"),
    overrideHashKey: `genesis-native/ios/${path.relative(ios, file).split(path.sep).join("/")}`,
    reasons: ["genesis-native rich push extension (copied into the build)"],
  }));
}

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  configPluginSourceType: "files",
  extraSources: genesisNativeIos(),
};
