/**
 * The Genesis packages are ES modules whose `exports` name an `import` entry and no `require`
 * one. jest-expo resolves with the `require` and `react-native` conditions only, so it would
 * find nothing; for `@marktiderman/*` (and only those) this adds `import`. Babel turns the
 * module into CommonJS on the way in (`alsoTransform` in jest.config.js).
 */
module.exports = (request, options) => {
  if (request.startsWith("@marktiderman/")) {
    return options.defaultResolver(request, { ...options, conditions: [...(options.conditions ?? []), "import"] });
  }
  return options.defaultResolver(request, options);
};
