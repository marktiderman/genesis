// @feat:cli-doctor
import { describe, expect, it } from "vitest";
import { boundAsParameter, scanCode, usesAsCode } from "../src/doctor/js-scan.js";

describe("the doctor's code scanner", () => {
  it("counts a name used as code: a tag, a call, member access, a value, a template's ${…}", () => {
    for (const code of ["<G {...p} />", "G(1)", "G.x", "const a = G;", "f(G)", "[G]", "`${G}`", "return G", "<p>{G}</p>"]) {
      expect(usesAsCode(code, "G"), code).toBe(true);
    }
  });

  it("doesn't count it in a string, a comment, JSX text, an attribute name or as a property or key", () => {
    for (const code of ['"G()"', "'G.'", "// <G", "/* G( */", "<p>Wraps G (one).</p>", '<a title="G." />', "<a G={1} />", "x.G", "({ G: 1 })", "import { X as G } from 'y';"]) {
      expect(usesAsCode(code, "G"), code).toBe(false);
    }
  });

  it("reads past an apostrophe in JSX text and a regular expression to the code after them", () => {
    expect(usesAsCode("<div><p>Don't</p><G /><p>It's</p></div>", "G")).toBe(true);
    expect(usesAsCode("<div><p>Don't</p>{/* <G */}</div>", "G")).toBe(false);
    expect(usesAsCode("const re = /'/; // <G", "G")).toBe(false);
    expect(usesAsCode("const re = /[/*]/; const x = <G />;", "G")).toBe(true);
  });

  it("treats `<` as a generic in plain TypeScript", () => {
    expect(scanCode("const f = <T,>(x: T) => x; const y = 1;", { jsx: false }).some((t) => t.value === "y")).toBe(true);
  });

  it("finds a name bound as a parameter: functions, arrows, methods, defaults with calls, destructuring", () => {
    for (const code of [
      "function f(contract) {}",
      "const f = (contract) => 1;",
      "const f = contract => 1;",
      "const f = (contract: X): Y => 1;",
      "const o = { tasksOf(contract) { return 1; } };",
      "class V { tasksOf(contract = fallback()) { return 1; } }",
      "function f({ contract }) {}",
    ]) {
      expect(boundAsParameter(code, "contract"), code).toBe(true);
    }
    for (const code of ["defineView(contract, {});", "const x = f(contract);", "if (ok) { defineView(contract); }"]) {
      expect(boundAsParameter(code, "contract"), code).toBe(false);
    }
  });
});
