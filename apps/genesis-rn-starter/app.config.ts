// Expo compiles this file on its own; tsx lets it import starter.config.ts (Expo's recommended hook).
import "tsx/cjs";
import type { ConfigContext, ExpoConfig } from "expo/config";
import starter from "./starter.config";

const MICROPHONE = "Record voice and video messages to send in a conversation.";
const CAMERA = "Record video messages to send in a conversation.";
import { easConfig, nativePlatforms, privacyBlocks, sentryProject } from "./src/lib/define-starter";
import { readFileSync } from "node:fs";

// genesis.config.json `observability.sentry`, or null while its organization or project is empty.
// Read, not imported: an imported file is fingerprinted whole, so any change to genesis.config.json
// would give a new runtime version. The plugin's options are in the evaluated config, which is.
const sentry = sentryProject(JSON.parse(readFileSync(`${__dirname}/genesis.config.json`, "utf8")).observability);

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
    // The check-in's photo question picks from the library only. The camera and microphone sentences
    // are set on every plugin that writes them: plugins' mods run in reverse order, so the picker's
    // `cameraPermission: false` would delete the one expo-camera adds, as its
    // `microphonePermission: false` deleted expo-audio's (seen in a simulator build).
    ["expo-image-picker", { photosPermission: "Choose photos to add to a check-in or a message.", cameraPermission: CAMERA, microphonePermission: MICROPHONE }],
    // Video messages in chat (expo-camera records, expo-video plays).
    ["expo-camera", { cameraPermission: CAMERA, microphonePermission: MICROPHONE, recordAudioAndroid: true }],
    "expo-video",
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
    // Readable Sentry stack traces (the observability block): with genesis.config.json
    // `observability.sentry` set, every EAS build uploads its source maps to Sentry. Needs
    // SENTRY_AUTH_TOKEN in the build's EAS environment: without it the build fails, so a release
    // never ships unreadable. See the README's Observability section.
    ...(sentry ? [["@sentry/react-native/expo", sentry] as [string, typeof sentry]] : []),
  ],
});
