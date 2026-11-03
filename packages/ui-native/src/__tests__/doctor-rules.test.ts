// The doctor rules ui-native declares (package.json, genesis.doctor): their patterns, held to
// fixtures so a change that widens or narrows one shows here.
import { describe, expect, it } from "vitest";
import pkgJson from "../../package.json";

const pkg = pkgJson as unknown as {
  genesis: { doctor: { prefer: { id: string; forbid: { pattern?: string }; unless?: unknown }[] } };
};
const rule = (id: string) => {
  const found = pkg.genesis.doctor.prefer.find((r) => r.id === id);
  if (!found?.forbid.pattern) throw new Error(`no pattern for ${id}`);
  return { ...found, re: new RegExp(found.forbid.pattern) };
};

describe("motion-uses-tokens", () => {
  const { re, unless } = rule("motion-uses-tokens");

  it.each([
    ["withTiming(1, { duration: 300 })"],
    ["R.withSpring(target, { damping: 20 })"],
    ["withSpring(x, {\n  damping: 20,\n})"],
    ["withTiming(0, {\n  easing: Easing.out(Easing.cubic),\n  duration: .3,\n})"],
    ["withTiming(1, { duration: 0.3 })"],
    ["Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true })"],
    ["Animated.spring(v, { toValue: 0, bounciness: 6 })"],
    ["FadeIn.duration(300)"],
    ["FadeInDown.springify().damping(15)"],
    ["LinearTransition.duration(250)"],
  ])("flags %s", (code) => expect(re.test(code)).toBe(true));

  it.each([
    ["withTiming(1, motionTiming(motion, 'fast', Easing))"],
    ["withSpring(0, motionSpring(motion, 'snappy', velocity))"],
    ["animateMotion(R, motion, 0, { spring: 'snappy' })"],
    ["withTiming(1);\ntoast.show({ title: 'Saved', duration: 3000 })"],
    ["dayjs.duration(5, 'minutes')"],
    ["moment.duration(30)"],
    ["withTiming(0, { duration: 0 })"],
    ["Animated.timing(v, cfg).start(); const t = { duration: 1000 }"],
  ])("leaves %s alone", (code) => expect(re.test(code)).toBe(false));

  it("checks every file: a token call elsewhere in it doesn't exempt a literal", () => {
    expect(unless).toBeUndefined();
  });
});

describe("threads-use-thread-list", () => {
  const { re } = rule("threads-use-thread-list");

  it.each([
    ["<FlatList inverted data={m} />"],
    ["<FlatList renderItem={({ item }) => <Row item={item} />} inverted />"],
    ["<FlatList data={m} inverted={true} />"],
    ["<FlashList data={m} maintainVisibleContentPosition={{ startRenderingFromBottom: true }} />"],
  ])("flags %s", (code) => expect(re.test(code)).toBe(true));
  it.each([["<FlatList data={rows} />"], ["<FlatList data={rows} inverted={false} />"], ["<FlatList data={rows} inverted={ false } />"]])(
    "leaves %s alone",
    (code) => expect(re.test(code)).toBe(false),
  );
});
