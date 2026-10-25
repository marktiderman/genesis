/**
 * Runs before every component test file. The app's Supabase client is swapped for the fake
 * in `fake-supabase.ts`; everything else is the starter's own code on jest-expo's mocks.
 */
import { jest } from "@jest/globals";

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.invalid";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

// Native modules jest-expo has no mock for: each library's own Jest mock.
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("@react-native-community/netinfo", () => require("@react-native-community/netinfo/jest/netinfo-mock.js"));
jest.mock("react-native-keyboard-controller", () => require("react-native-keyboard-controller/jest"));
// jest-expo's expo-notifications mock returns listener subscriptions without `remove`, which the
// push block calls; this one is the subset the block uses, on a device that hasn't been asked yet.
jest.mock("expo-notifications", () => {
  const subscription = () => ({ remove: () => {} });
  return {
    setNotificationHandler: () => {},
    setNotificationChannelAsync: async () => null,
    getPermissionsAsync: async () => ({ status: "undetermined", granted: false, canAskAgain: true, expires: "never" }),
    requestPermissionsAsync: async () => ({ status: "denied", granted: false, canAskAgain: false, expires: "never" }),
    getExpoPushTokenAsync: async () => ({ type: "expo", data: "ExponentPushToken[test]" }),
    addPushTokenListener: subscription,
    addNotificationResponseReceivedListener: subscription,
    getLastNotificationResponse: () => null,
    clearLastNotificationResponse: () => {},
    AndroidImportance: { DEFAULT: 3 },
  };
});
// jest-expo's expo-updates mock answers `checkForUpdateAsync` with nothing; the server has no update.
jest.mock("expo-updates", () => ({
  ...jest.requireActual<object>("expo-updates"),
  checkForUpdateAsync: async () => ({ isAvailable: false, isRollBackToEmbedded: false }),
}));

jest.mock("@/lib/supabase", () => {
  const { fakeSupabase, sessionReady } = jest.requireActual<typeof import("./fake-supabase")>("./fake-supabase");
  return { supabase: fakeSupabase, sessionReady };
});
