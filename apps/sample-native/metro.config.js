const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Watch only the workspace packages the app depends on
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(monorepoRoot, "packages/core"),
  path.resolve(monorepoRoot, "packages/design-system"),
  path.resolve(monorepoRoot, "packages/ui-native"),
];

// Resolve modules from both app-level and root node_modules
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    ...(config.resolver.nodeModulesPaths || []),
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
  ],
  unstable_conditionNames: ["react-native", "require", "browser", "default"],
};

// Fix tslib ESM resolution for web mode
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib" || moduleName === "tslib/modules/index.js") {
    return context.resolveRequest(context, "tslib/tslib.es6.mjs", platform);
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
