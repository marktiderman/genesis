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

  it("reads a generic arrow's type parameters in .tsx as types, not an element that never closes", () => {
    for (const head of ["const f = <T,>(x: T) => x;", "const f = <T extends object>(x: T) => x;", "const f = async <T,>(x: T) => x;"]) {
      expect(usesAsCode(`${head}\nG(1);`, "G"), head).toBe(true);
      expect(usesAsCode(`${head}\nexport const Button = G;\nconst z = <div>hi</div>;`, "G"), head).toBe(true);
    }
  });

  it("divides after a number, a string, a template, `)` or `]`, and after a name called of", () => {
    for (const code of ["const h = (a) / 2 / G;", "const h = 10 / 2; const k = <G />;", "const h = 'a'.length / 2 / G;", "const h = `a` / 2 / G;", "const h = x[0] / 2 / G;", "const of = 4; const k = of / 2 / G;"]) {
      expect(usesAsCode(code, "G"), code).toBe(true);
    }
  });

  it("stays quick and doesn't overflow on huge or deeply nested input", () => {
    const started = Date.now();
    const generics = Array.from({ length: 20000 }, (_, k) => `const f${k} = <T,>(x: T) => x;`).join("\n");
    expect(usesAsCode(`${generics}\nG(1);`, "G")).toBe(true);
    expect(() => scanCode("<a ".repeat(20000))).not.toThrow();
    expect(() => scanCode("`${".repeat(20000))).not.toThrow();
    expect(() => scanCode("<div>".repeat(20000))).not.toThrow();
    expect(boundAsParameter("f(a, ".repeat(20000), "contract")).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("binds a generic function's parameter and a catch clause's, but not a condition's", () => {
    expect(boundAsParameter("function f<T>(contract: T) {}", "contract")).toBe(true);
    expect(boundAsParameter("function f<V extends View<any, any>>(contract: V, x: number) { return defineView(contract.c); }", "contract")).toBe(true);
    expect(boundAsParameter("try { a(); } catch (contract) { b(); }", "contract")).toBe(true);
    // `if (contract) {` is a condition, not a method `if(contract) {`.
    expect(boundAsParameter("if (contract) { defineView(contract); }", "contract")).toBe(false);
  });

  it("counts binding positions only: not a default value, a type, or a renamed key", () => {
    for (const code of ["function f(other = contract) {}", "function f(other: typeof contract) {}", "function f({ contract: other }) {}", "const f = ({ a = contract }) => 1;", "const o = { m(x = contract) { return 1; } };"]) {
      expect(boundAsParameter(code, "contract"), code).toBe(false);
    }
    for (const code of ["function f({ a: contract }) {}", "function f([first, contract]) {}", "function f(...contract) {}", "const f = ({ contract = 1 }) => 1;", "function f(contract?: X) {}"]) {
      expect(boundAsParameter(code, "contract"), code).toBe(true);
    }
  });
});

