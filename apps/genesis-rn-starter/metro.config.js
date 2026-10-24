// Metro in the Genesis monorepo. An app made from the starter outside the
// monorepo can replace this file with `withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" })`.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// The workspace packages the app imports, so edits to them reload the app.
config.watchFolders = [
  ...(config.watchFolders || []),
  ...["core", "design-system", "native", "supabase", "ui-native"].map((name) => path.resolve(monorepoRoot, "packages", name)),
];

config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths || []),
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// One copy of each of these, resolved from the app, wherever they're imported from. A workspace
// package can have its own copy in its node_modules (ui-native has NativeWind's runtime), and a
// second React, React Native, query cache or NativeWind style registry in the bundle breaks hooks,
// native modules, shared caches or the components' classNames.
const singletons = ["react", "react-native", "@tanstack/react-query", "@tanstack/query-core", "nativewind", "react-native-css-interop"];
const appOrigin = path.join(projectRoot, "package.json");
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const single = singletons.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  const ctx = single ? { ...context, originModulePath: appOrigin } : context;
  return resolveRequest ? resolveRequest(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
