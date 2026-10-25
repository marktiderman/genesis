// @feat:native-starter @feat:native-app-shell
/**
 * The app's entry (`index.ts`): the dependency warnings the app can't act on are kept out of
 * LogBox before expo-router loads, since NativeWind's runtime warns while the first screen is
 * required. Otherwise React Native 0.88 pins "Open debugger to view warnings." over the native tab
 * bar and the first tab tap after a launch, or after a link opened the app, lands on it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("index.ts", () => {
  it("is the app's entry", () => {
    expect(JSON.parse(read("package.json")).main).toBe("index.ts");
  });

  it("ignores the known warnings first, then requires expo-router's entry (a require, so it isn't hoisted)", () => {
    const source = read("index.ts");
    const ignore = source.indexOf("ignoreKnownDependencyWarnings(LogBox, __DEV__);");
    const entry = source.indexOf('require("expo-router/entry");');
    expect(ignore).toBeGreaterThan(-1);
    expect(entry).toBeGreaterThan(ignore);
    expect(source).not.toMatch(/^import ["']expo-router\/entry["']/m);
  });
});
