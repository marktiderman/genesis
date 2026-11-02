// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const testingLibrary = require("eslint-plugin-testing-library");

// React Native Testing Library 14 made render, renderHook, fireEvent, act, rerender and unmount
// async. Left unawaited, a test reads the screen before React has updated it, and React logs
// "overlapping act() calls". testing-library's await-async-events knows fireEvent is async when
// told to (its React preset assumes it isn't, so only that rule is turned on); it has no rule for
// render or act, so a small no-restricted-syntax rule covers those (and expo-router's
// renderRouter, and this app's renderApp helper, which wrap render).
const RNTL_ASYNC = "render|renderHook|renderRouter|renderApp|act";
const unawaited = (message, ...callees) =>
  callees.flatMap((callee) => [
    { selector: `ExpressionStatement > CallExpression${callee}`, message },
    { selector: `VariableDeclarator > CallExpression${callee}`, message },
  ]);

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", ".expo/*", "supabase/functions/**"] },
  {
    files: ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.test.{js,jsx,ts,tsx}"],
    plugins: { "testing-library": testingLibrary },
    rules: {
      "testing-library/await-async-events": ["error", { eventModule: ["fireEvent", "userEvent"] }],
      "no-restricted-syntax": [
        "error",
        ...unawaited(
          "React Native Testing Library 14's render calls (render, renderHook, renderRouter, renderApp) and act return promises: await them.",
          `[callee.name=/^(${RNTL_ASYNC})$/]`,
        ),
        ...unawaited(
          "React Native Testing Library 14's rerender and unmount return promises: await them.",
          "[callee.property.name=/^(rerender|unmount)$/]",
        ),
      ],
    },
  },
]);
