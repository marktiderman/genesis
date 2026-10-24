// Expo compiles this file on its own; tsx lets it import starter.config.ts (Expo's recommended hook).
import "tsx/cjs";
import type { ConfigContext, ExpoConfig } from "expo/config";
import starter from "./starter.config";

// Name, ids and plugins only. The Genesis plugin (`@marktiderman/genesis-cli`) adds the rest:
// APP_VARIANT variants (development / preview / production), associated domains and app links from
// genesis.config.json, the privacy manifest, export compliance and the fingerprint runtime version.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: starter.app.name,
  slug: starter.app.slug,
  scheme: starter.app.scheme,
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: starter.app.bundleId,
    supportsTablet: true,
    usesAppleSignIn: starter.features.appleSignIn,
  },
  android: { package: starter.app.bundleId },
  experiments: { typedRoutes: true, reactCompiler: true },
  plugins: ["expo-router", "expo-secure-store", "@marktiderman/genesis-cli"],
});
