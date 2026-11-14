// The doctor rule genesis-ui declares for times (package.json, genesis.doctor): a browser time
// input is flagged, the TimePicker and other inputs are left alone.
import { describe, expect, it } from "vitest";
import pkgJson from "../../package.json";

const pkg = pkgJson as unknown as { genesis: { doctor: { prefer: { id: string; forbid: { pattern?: string } }[] } } };
const found = pkg.genesis.doctor.prefer.find((r) => r.id === "times-use-time-picker");
const re = new RegExp(found!.forbid.pattern!);

describe("times-use-time-picker", () => {
  it.each([['<Input type="time" value={t} />'], ["<input type='time' />"], ['<Input id="at" type={"time"} />'], ['<Input value={t} autoFocus type = "time" />'],
    // An arrow function before `type`: its `>` is inside braces, not the tag's end.
    ['<Input onChange={(e) => setT(e.target.value)} type="time" />'],
    ['<Input onChange={(e) => { setT(e.target.value); }} value={t}\n  type="time" />'],
    ['<Input className={cn("w-32", x > 1 && "a")} type="time" />']])("flags %s", (code) =>
    expect(re.test(code)).toBe(true),
  );
  it("stays linear on long adversarial tags", () => {
    // Each `t` before `type=` is taken by one branch only, so a failing match never backtracks.
    for (const evil of [
      "<Input " + "type ".repeat(10_000),
      "<Input " + "t".repeat(50_000),
      "<Input " + "type".repeat(12_000) + "=x",
      "<Input {" + "a".repeat(50_000),
      "<Input " + "{".repeat(50_000),
      "<Input " + "{{}".repeat(16_000),
      "<Input " + "{t}".repeat(16_000) + ">",
    ]) {
      const start = performance.now();
      expect(re.test(evil)).toBe(false);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });
  it.each([
    ['<TimePicker value={at} onChange={setAt} />'],
    ['<Input type="text" />'],
    ['<Input type="datetime-local" />'],
    ['<Input onChange={(e) => go(e)} type="text" /> <p type="time" />'],
  ])("leaves %s alone", (code) =>
    expect(re.test(code)).toBe(false),
  );
});
