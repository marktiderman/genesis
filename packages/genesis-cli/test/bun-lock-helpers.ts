// A bun.lock fixture for the upgrade and doctor tests.

/** A bun.lock as Bun writes it: trailing commas, one package per line. */
export function bunLock({ native = "0.8.0", uiNative = "3.5.0", nested = "3.3.0", range = "^3.3.0", overlay = true } = {}): string {
  return [
    "{",
    '  "lockfileVersion": 1,',
    '  "workspaces": {',
    '    "": {',
    '      "name": "sample-app",',
    '      "dependencies": {',
    `        "@marktiderman/genesis-native": "${native}",`,
    `        "@marktiderman/genesis-ui-native": "${uiNative}",`,
    "      },",
    "    },",
    ...(overlay
      ? ['    "packages/fixture": {', '      "name": "@marktiderman/genesis-fixture",', '      "version": "1.0.0+local.2",', "    },"]
      : []),
    "  },",
    '  "packages": {',
    ...(overlay ? ['    "@marktiderman/genesis-fixture": ["@marktiderman/genesis-fixture@workspace:packages/fixture"],'] : []),
    `    "@marktiderman/genesis-native": ["@marktiderman/genesis-native@${native}", "", { "dependencies": { "@marktiderman/genesis-ui-native": "${range}" } }, "sha512-native=="],`,
    ...(nested
      ? [`    "@marktiderman/genesis-native/@marktiderman/genesis-ui-native": ["@marktiderman/genesis-ui-native@${nested}", "", { "peerDependencies": { "react": "^19.0.0" } }, "sha512-old=="],`]
      : []),
    `    "@marktiderman/genesis-ui-native": ["@marktiderman/genesis-ui-native@${uiNative}", "", { "peerDependencies": { "react": "^19.0.0" } }, "sha512-new=="],`,
    '    "react": ["react@19.2.5", "", {}, "sha512-react=="],',
    "  }",
    "}",
    "",
  ].join("\n");
}
