/**
 * `eas.push`: push credentials for the native app. A manual step: the credentials live in Apple's
 * and Google's consoles and in `eas credentials`, which asks its own questions, and there is no
 * call that checks them from here. Its verify checks the EAS CLI is signed in; a test push to a
 * device build is the real check, and the instructions end with it.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { defineSetupStep } from "@marktiderman/genesis-config/setup";
import { TOOL_AUTH_ENV } from "../../exec/run.js";
import { OFFLINE, type StepRunner } from "./framework.js";

export const easPushStep = defineSetupStep({
  id: "eas.push",
  title: "Set up push notification credentials",
  package: "@marktiderman/genesis-notifications",
  tools: ["eas"],
  manual: true,
  links: [
    { label: "Expo: push notifications setup", url: "https://docs.expo.dev/push-notifications/push-notifications-setup/" },
    { label: "Expo: push notifications tool", url: "https://expo.dev/notifications" },
  ],
  instructions: [
    "Sign the EAS CLI in: eas login (or set EXPO_TOKEN).",
    "iOS: run eas credentials -p ios, choose your build profile, then Push Notifications: set up a push key (it needs your Apple Developer account).",
    "Android: make a Firebase project for the app, put its google-services.json in the app and point android.googleServicesFile at it; then eas credentials -p android → Google Service Account → upload the FCM V1 service account key.",
    "Build the app for a device, then send it a test push from the Expo push notifications tool.",
  ],
});

export const easPush: StepRunner = {
  step: easPushStep,
  appliesTo: (root) => existsSync(path.join(root, "eas.json")),
  plan: () => ({ summary: "nothing runs: push credentials are set up by hand with eas credentials", manual: easPushStep.instructions.join("\n") }),
  async verify(ctx) {
    if (!ctx.network) return OFFLINE;
    const res = await ctx.run("eas", ["whoami"], { cwd: ctx.root, timeoutMs: 30_000, passEnv: TOOL_AUTH_ENV["eas"] ?? [] }).catch((err: Error) => ({ code: 1, stdout: "", stderr: err.message }));
    if (res.code !== 0) return { ok: false, message: "The EAS CLI isn't signed in: run eas login (or set EXPO_TOKEN)." };
    const who = res.stdout.trim().split("\n")[0]?.trim();
    return { ok: true, message: `Signed in to EAS${who ? ` as ${who}` : ""}. Push credentials can't be checked from here: send a test push to a device build to be sure.` };
  },
};
