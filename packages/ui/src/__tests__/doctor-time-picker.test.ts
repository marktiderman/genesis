// The doctor rule genesis-ui declares for times (package.json, genesis.doctor): a browser time
// input is flagged, the TimePicker and other inputs are left alone.
import { describe, expect, it } from "vitest";
import pkgJson from "../../package.json";

const pkg = pkgJson as unknown as { genesis: { doctor: { prefer: { id: string; forbid: { pattern?: string } }[] } } };
const found = pkg.genesis.doctor.prefer.find((r) => r.id === "times-use-time-picker");
const re = new RegExp(found!.forbid.pattern!);

describe("times-use-time-picker", () => {
  it.each([['<Input type="time" value={t} />'], ["<input type='time' />"], ['<Input id="at" type={"time"} />']])("flags %s", (code) =>
    expect(re.test(code)).toBe(true),
  );
  it.each([['<TimePicker value={at} onChange={setAt} />'], ['<Input type="text" />'], ['<Input type="datetime-local" />']])("leaves %s alone", (code) =>
    expect(re.test(code)).toBe(false),
  );
});
