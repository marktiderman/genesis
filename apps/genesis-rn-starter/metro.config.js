// Metro in the Genesis monorepo. An app made from the starter outside the
// monorepo can replace this file with `withNativeWind(getSentryExpoConfig(__dirname), { input: "./global.css" })`
// (or getDefaultConfig from expo/metro-config, without Sentry).
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

// Readable Sentry stack traces: with genesis.config.json `observability.sentry` set (organization
// and project), Sentry's config writes a Debug ID into every bundle and its source map, so Sentry
// matches an error to its map. It wraps Expo's default config, so everything below (the monorepo's
// watchFolders and resolveRequest) builds on it, and NativeWind wraps it last.
const sentry = require("./genesis.config.json").observability?.sentry;
const withSentry = Boolean(sentry?.organization && sentry?.project);

/** @type {import('expo/metro-config').MetroConfig} */
const config = withSentry ? require("@sentry/react-native/metro").getSentryExpoConfig(projectRoot) : getDefaultConfig(projectRoot);

// The workspace packages the app imports, so edits to them reload the app.
config.watchFolders = [
  ...(config.watchFolders || []),
  ...["chat", "core", "design-system", "features", "forms", "forms-native", "forms-react", "native", "notifications", "product", "supabase", "support", "ui-native"].map((name) => path.resolve(monorepoRoot, "packages", name)),
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
