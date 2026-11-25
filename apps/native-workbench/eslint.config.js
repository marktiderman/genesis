// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
// Genesis's lint rules, shipped with the CLI so `genesis upgrade` brings new ones (React Native
// Testing Library 14's await rules today; they need eslint-plugin-testing-library).
const { genesis } = require("@marktiderman/genesis-cli/eslint");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", ".expo/*", "supabase/functions/**"] },
  ...genesis("native"),
]);
