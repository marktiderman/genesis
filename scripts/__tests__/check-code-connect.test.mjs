// @feat:figma-design-library
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ALLOWLIST,
  COMPONENTS_INDEX,
  FIGMA_DIR,
  LAYOUTS_INDEX,
  checkCodeConnect,
  componentsFromIndex,
  layoutsFromIndex,
  templateProblems,
} from "../check-code-connect.mjs";

const componentsIndex = `
export { NativeText, textVariants } from "./text";
export type { NativeTextProps } from "./text";
export {
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "./card";
export { NativeChip, NativeChipGroup } from "./chip-group";
export { NativeSectionListHeader } from "./section-list";
export { NativeToastProvider, useToast } from "./toast";
export { NativeFullScreenModal, FULL_SCREEN_DARK } from "./full-screen-modal";
export { Stack, Inline } from "./layout";
export { NativeAvatar } from "./avatar";
`;

const layoutsIndex = `
export { ScreenContainer, composeHeaderOptions, type ScreenContainerProps } from "./screen-container";
export { NavBarTitle, type NavBarTitleProps } from "./nav-bar";
export { SettingsPage, getSettingsPageStackOptions } from "./settings-page";
export { AuthForm, ForgotPasswordLink } from "./auth";
export { KEYBOARD_TOOLBAR_HEIGHT, KeyboardScrollProvider, useKeyboardScroll } from "./keyboard";
export { AppleSignInButton, appleProvider } from "./apple-sign-in";
`;

const template = (name, { url = "https://www.figma.com/design/abcdefghijklmnopqrstuv/Sample?node-id=1-2", source = `packages/ui-native/src/components/${name}.tsx`, component = name } = {}) =>
  `// url=${url}\n// source=${source}\n// component=${component}\nimport figma from 'figma'\nexport default { example: figma.code\`<${name} />\` }\n`;

/** A throwaway checkout with the two indexes, the allowlist, and the given templates. */
function fixture({ required = [], notYet = [], templates = {}, sources = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "code-connect-"));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write(COMPONENTS_INDEX, componentsIndex);
  write(LAYOUTS_INDEX, layoutsIndex);
  write(ALLOWLIST, JSON.stringify({ required, notYet }));
  for (const rel of sources) write(rel, "export {};\n");
  for (const [name, text] of Object.entries(templates)) write(`${FIGMA_DIR}/${name}.figma.ts`, text);
  return root;
}

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const make = (opts) => {
  const root = fixture(opts);
  roots.push(root);
  return root;
};

const ALL = ["NativeText", "NativeCard", "NativeChip", "NativeChipGroup", "NativeSectionListHeader", "NativeFullScreenModal", "NativeAvatar", "ScreenContainer", "SettingsPage", "AuthForm", "AppleSignInButton"];

describe("check-code-connect", () => {
  it("lists Native* components without their sub-parts, hooks, providers, constants or variants", () => {
    expect(componentsFromIndex(componentsIndex)).toEqual([
      "NativeText",
      "NativeCard",
      "NativeChip",
      "NativeChipGroup",
      "NativeSectionListHeader",
      "NativeFullScreenModal",
      "NativeAvatar",
    ]);
  });

  it("lists the layouts without their chrome parts, helpers, hooks or providers", () => {
    expect(layoutsFromIndex(layoutsIndex)).toEqual(["ScreenContainer", "SettingsPage", "AuthForm", "AppleSignInButton"]);
  });

  it("is clean when every required template is well-formed and the rest are notYet", () => {
    const root = make({
      required: ["NativeAvatar"],
      notYet: ALL.filter((n) => n !== "NativeAvatar"),
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx"],
      templates: { NativeAvatar: template("NativeAvatar") },
    });
    const result = checkCodeConnect(root);
    expect(result.failures).toEqual([]);
    expect(result.covered).toEqual(["NativeAvatar"]);
    expect(result.missing).toHaveLength(ALL.length - 1);
  });

  it("fails a required component with no template, and a notYet one that has a template", () => {
    const root = make({
      required: ["NativeAvatar", "NativeText"],
      notYet: ALL.filter((n) => n !== "NativeAvatar" && n !== "NativeText"),
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx", "packages/ui-native/src/components/NativeCard.tsx"],
      templates: { NativeAvatar: template("NativeAvatar"), NativeCard: template("NativeCard") },
    });
    expect(checkCodeConnect(root).failures).toEqual([
      `NativeText: required, but ${FIGMA_DIR}/NativeText.figma.ts is missing`,
      `NativeCard: has a template but is still "notYet" in ${ALLOWLIST}; move it to "required"`,
    ]);
  });

  it("fails a component in neither list, in both lists, or a name that is no longer exported", () => {
    const root = make({
      required: ["NativeAvatar", "NativeOldThing"],
      notYet: ALL.filter((n) => n !== "NativeAvatar" && n !== "SettingsPage"),
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx"],
      templates: { NativeAvatar: template("NativeAvatar") },
    });
    const { failures } = checkCodeConnect(root);
    expect(failures).toContain(`${ALLOWLIST}: NativeOldThing is not a visual component exported from ui-native; remove it`);
    expect(failures).toContain(`SettingsPage: exported from ui-native but in neither list of ${ALLOWLIST}; add it to "notYet" (or "required" with its template)`);
    const both = make({
      required: ["NativeAvatar"],
      notYet: ALL,
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx"],
      templates: { NativeAvatar: template("NativeAvatar") },
    });
    expect(checkCodeConnect(both).failures).toEqual([`${ALLOWLIST}: NativeAvatar is in both "required" and "notYet"`]);
  });

  it("checks the three leading directives: order, a source that exists, a component equal to the file name", () => {
    const root = make({
      required: [],
      notYet: ALL,
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx"],
      templates: {
        NativeAvatar: template("NativeAvatar"),
        NativeText: template("NativeText", { component: "NativeTxt", source: "packages/ui-native/src/components/missing.tsx" }),
        NativeCard: "// A comment first\n// url=x\n// source=y\n",
      },
    });
    expect(templateProblems(root, "NativeAvatar")).toEqual([]);
    expect(templateProblems(root, "NativeText")).toEqual([
      `${FIGMA_DIR}/NativeText.figma.ts:2: \`// source=packages/ui-native/src/components/missing.tsx\` does not exist`,
      `${FIGMA_DIR}/NativeText.figma.ts:3: \`// component=NativeTxt\` does not match the file name NativeText`,
    ]);
    expect(templateProblems(root, "NativeCard")).toEqual([
      `${FIGMA_DIR}/NativeCard.figma.ts:1: expected \`// url=…\`, found "// A comment first"`,
      `${FIGMA_DIR}/NativeCard.figma.ts:2: expected \`// source=…\`, found "// url=x"`,
      `${FIGMA_DIR}/NativeCard.figma.ts:3: expected \`// component=…\`, found "// source=y"`,
    ]);
    expect(templateProblems(root, "NativeChip")).toBeNull();
  });
});

describe("url directive", () => {
  it("rejects a url that is not a Figma design node", () => {
    const root = fixture({
      required: ["NativeAvatar"],
      templates: { NativeAvatar: template("NativeAvatar", { url: "https://example.com/not-figma" }) },
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx"],
    });
    expect(templateProblems(root, "NativeAvatar")).toEqual([
      `${FIGMA_DIR}/NativeAvatar.figma.ts:1: \`// url=\` must be a figma.com/design file URL with a node-id, found https://example.com/not-figma`,
    ]);
  });
});
