/**
 * The Genesis packages are ES modules whose `exports` name an `import` entry and no `require`
 * one. jest-expo resolves with the `require` and `react-native` conditions only, so it would
 * find nothing; for `@marktiderman/*` (and only those) this adds `import`. Babel turns the
 * module into CommonJS on the way in (`alsoTransform` in jest.config.js).
 *
 * Everything then goes through Reanimated's resolver (its Jest guide), which picks the web
 * builds of Reanimated and Worklets: shared values, animated styles and gesture callbacks run
 * in Jest without a UI thread.
 */
const reanimatedResolver = require("react-native-reanimated/jest/resolver");

module.exports = (request, options) => {
  // Gesture Handler's native build hands Worklets' UI runtime to its native module once loaded.
  // Jest runs the web Worklets, which has no UI runtime and throws, so that one step takes Gesture
  // Handler's web build (a no-op), as it does on the web. Its gestures still run on its Jest mocks.
  if (request.endsWith("/installUIRuntimeBindings") && options.basedir.includes("react-native-gesture-handler")) {
    return reanimatedResolver(`${request}.web`, options);
  }
  if (request.startsWith("@marktiderman/")) {
    return reanimatedResolver(request, { ...options, conditions: [...(options.conditions ?? []), "import"] });
  }
  return reanimatedResolver(request, options);
};
