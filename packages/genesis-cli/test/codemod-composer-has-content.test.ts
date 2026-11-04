import { describe, expect, it } from "vitest";
import { codemodById, rewriteComposerBarEmpty } from "../src/upgrade/codemods.js";

describe("rewriteComposerBarEmpty", () => {
  it("turns each form of empty into hasContent, with the opposite sense", () => {
    expect(rewriteComposerBarEmpty(`<NativeComposerBar value={v} empty={false} onSend={send} />`)).toBe(`<NativeComposerBar value={v} hasContent onSend={send} />`);
    expect(rewriteComposerBarEmpty(`<NativeComposerBar empty={true} />`)).toBe(`<NativeComposerBar hasContent={false} />`);
    expect(rewriteComposerBarEmpty(`<NativeComposerBar empty />`)).toBe(`<NativeComposerBar hasContent={false} />`);
    expect(rewriteComposerBarEmpty(`<NativeComposerBar empty={files.length === 0} />`)).toBe(`<NativeComposerBar hasContent={!(files.length === 0)} />`);
  });

  it("reads past an arrow function in another attribute", () => {
    expect(rewriteComposerBarEmpty(`<NativeComposerBar onSend={() => send()} empty={false} />`)).toBe(`<NativeComposerBar onSend={() => send()} hasContent />`);
  });

  it("leaves other components, and an attribute that only ends in empty, alone", () => {
    const text = `<NativeThreadList empty={<None />} /><NativeComposerBar isempty={x} />`;
    expect(rewriteComposerBarEmpty(text)).toBe(text);
  });

  it("touches only the bar's own attribute, not nested JSX or strings", () => {
    const text = `<NativeComposerBar above={<Empty empty={false} />} leading={<Row empty />} placeholder="an empty box" trailing={{ empty: true }} empty={false} />`;
    expect(rewriteComposerBarEmpty(text)).toBe(`<NativeComposerBar above={<Empty empty={false} />} leading={<Row empty />} placeholder="an empty box" trailing={{ empty: true }} hasContent />`);
  });

  it("negates an expression with braces in it, and rewrites two bars", () => {
    expect(rewriteComposerBarEmpty(`<NativeComposerBar empty={check({ a: 1 })} />\n<NativeComposerBar empty />`)).toBe(`<NativeComposerBar hasContent={!(check({ a: 1 }))} />\n<NativeComposerBar hasContent={false} />`);
  });

  it("leaves a bar with no empty as it is", () => {
    const text = `<NativeComposerBar value={v} onSend={() => send()} />`;
    expect(rewriteComposerBarEmpty(text)).toBe(text);
  });

  it("is registered for the release that breaks it", () => {
    const mod = codemodById("genesis-ui-native-3-8-composer-has-content");
    expect(mod?.package).toBe("@marktiderman/genesis-ui-native");
    expect(mod?.version).toBe("3.8.0");
  });
});
