// What decides the runtime version (and so whether a merge to main ships an over-the-air update or
// a new store build, deploy-production.yml): Expo's fingerprint of the native project. Config
// plugins are hashed by the files they load, not by their package.json, so a package's version
// bump alone (every Genesis release bumps @marktiderman/genesis-native, whose rich push plugin the
// app loads) doesn't force a new build; a change to the plugin's code still does. The rich push
// plugin also copies a Swift file into the build, which it reads rather than loads, so that folder
// is hashed too. docs/NATIVE-RELEASE.md, "Fingerprints".
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  configPluginSourceType: "files",
  extraSources: [
    {
      type: "dir",
      filePath: "node_modules/@marktiderman/genesis-native/ios",
      reasons: ["genesis-native rich push extension (copied into the build)"],
    },
  ],
};
