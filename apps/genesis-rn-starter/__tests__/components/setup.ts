/**
 * Runs before every component test file. The app's Supabase client is swapped for the fake
 * in `fake-supabase.ts`; everything else is the starter's own code on jest-expo's mocks.
 */
import { afterEach, beforeEach, jest } from "@jest/globals";
import { expectedReports } from "./reports";

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
    setBadgeCountAsync: async () => true,
    getBadgeCountAsync: async () => 0,
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

// A block that reports an error (`[push] …`, `[updates] …`, the observability sink's
// `[observability] …`) only warns in the app; here it fails the test, as does a React update
// outside act(). A mock that's missing something the app calls can't pass in silence.
// A test that provokes a report on purpose names it with `expectReport` (from `./reports`).
const LOUD = [/^\[(push|updates|observability)\] /, /not wrapped in act\(/];
const heard: string[] = [];
const originals = { warn: console.warn, error: console.error };
beforeEach(() => {
  // Installed per test: a test file's `jest.restoreAllMocks()` takes these off with its own spies.
  for (const level of ["warn", "error"] as const) {
    if (jest.isMockFunction(console[level])) continue;
    jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (LOUD.some((pattern) => pattern.test(line)) && !expectedReports.some((pattern) => pattern.test(line))) {
        heard.push(`console.${level}: ${line.split("\n")[0]}`);
      }
      originals[level](...args);
    });
  }
});
afterEach(() => {
  expectedReports.length = 0;
  const lines = heard.splice(0);
  if (lines.length > 0) throw new Error(`The app reported problems during this test:\n${lines.join("\n")}`);
});
