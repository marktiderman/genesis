// Expo compiles this file on its own; tsx lets it import starter.config.ts (Expo's recommended hook).
import "tsx/cjs";
import type { ConfigContext, ExpoConfig } from "expo/config";
import starter from "./starter.config";

const MICROPHONE = "Record voice messages to send in a conversation.";
import { easConfig, nativePlatforms, privacyBlocks } from "./src/lib/define-starter";

// Name, ids and plugins only. The Genesis plugin (`@marktiderman/genesis-cli`) adds the rest:
// APP_VARIANT variants (development / preview / production), associated domains and app links from
// genesis.config.json, the privacy manifest, export compliance and the fingerprint runtime version.
// `easConfig` adds the EAS update URL and project id from starter.config.ts `app.easProjectId`. It
// sets `updates` and `extra` whole: there is no app.json, so nothing else writes them.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ...easConfig(starter.app),
  name: starter.app.name,
  slug: starter.app.slug,
  scheme: starter.app.scheme,
  version: "1.0.0",
  platforms: nativePlatforms(starter.features),
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: starter.app.bundleId,
    supportsTablet: true,
    usesAppleSignIn: starter.features.appleSignIn,
  },
  android: { package: starter.app.bundleId },
  experiments: { typedRoutes: true, reactCompiler: true },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-updates",
    "expo-notifications",
    // The check-in's photo question picks from the library only: no camera, so no camera or microphone prompt.
    // The microphone sentence is set on both: plugins' mods run in reverse order, so the picker's
    // `microphonePermission: false` would delete the one expo-audio adds (seen in a simulator build).
    ["expo-image-picker", { photosPermission: "Choose photos to add to a check-in or a message.", cameraPermission: false, microphonePermission: MICROPHONE }],
    // Voice messages in chat. Kept whichever way the chat switch is, so it stays JavaScript only.
    ["expo-audio", { microphonePermission: MICROPHONE }],
    // The privacy manifest declares the data of the blocks that are on (account, observability, push).
    ["@marktiderman/genesis-cli", { privacy: { blocks: privacyBlocks(starter.features) } }],
    // iOS rich push for chat: a Notification Service Extension that shows the sender's photo, makes
    // message pushes Communication Notifications (Focus treats them as messages) and attaches photos.
    // Kept whichever way the chat and push switches are, so they stay JavaScript only: it does nothing
    // until a push carries chatPushPayload's fields. After the Genesis plugin, so the extension's
    // bundle id follows the APP_VARIANT suffix.
    "@marktiderman/genesis-native/rich-push-plugin",
    // Optional: upload source maps to Sentry from EAS builds (the observability block). Set your
    // organization and project slugs, add SENTRY_AUTH_TOKEN as an EAS secret, set "@sentry/cli" to
    // true under allowBuilds in pnpm-workspace.yaml, and switch metro.config.js to
    // getSentryExpoConfig. See the README's Observability section.
    // ["@sentry/react-native/expo", { organization: "your-org", project: "your-project", url: "https://sentry.io/" }],
  ],
});
