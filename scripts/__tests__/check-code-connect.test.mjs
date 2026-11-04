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
  PACKAGES,
  chatComponentsFromIndex,
  checkCodeConnect,
  componentsFromIndex,
  layoutsFromIndex,
  templateProblems,
  webComponentsFromIndexes,
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
function fixture({ required = [], notYet = [], composed, templates = {}, sources = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "code-connect-"));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write(COMPONENTS_INDEX, componentsIndex);
  write(LAYOUTS_INDEX, layoutsIndex);
  write(ALLOWLIST, JSON.stringify(composed ? { required, notYet, composed } : { required, notYet }));
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
    expect(failures).toContain(
      `SettingsPage: exported from ui-native but in no list of ${ALLOWLIST}; add it to "notYet" (or "required" with its template, or "composed" for a screen assembled from library components)`,
    );
    const both = make({
      required: ["NativeAvatar"],
      notYet: ALL,
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx"],
      templates: { NativeAvatar: template("NativeAvatar") },
    });
    expect(checkCodeConnect(both).failures).toEqual([`${ALLOWLIST}: NativeAvatar is in both "required" and "notYet"`]);
  });

  it("accepts a composed screen without a template, counts it apart, and fails one that has a template or is listed twice", () => {
    const composedList = ["SettingsPage", "AuthForm", "AppleSignInButton"];
    const clean = make({
      required: ["NativeAvatar"],
      notYet: ALL.filter((n) => n !== "NativeAvatar" && !composedList.includes(n)),
      composed: composedList,
      sources: ["packages/ui-native/src/components/NativeAvatar.tsx"],
      templates: { NativeAvatar: template("NativeAvatar") },
    });
    const result = checkCodeConnect(clean);
    expect(result.failures).toEqual([]);
    expect(result.composed).toEqual(composedList);
    expect(result.missing).toHaveLength(ALL.length - 1 - composedList.length);
    expect(result.missing).not.toContain("SettingsPage");

    const withTemplate = make({
      required: [],
      notYet: ALL.filter((n) => !composedList.includes(n)),
      composed: composedList,
      sources: ["packages/ui-native/src/layouts/settings-page.tsx"],
      templates: { SettingsPage: template("SettingsPage", { source: "packages/ui-native/src/layouts/settings-page.tsx" }) },
    });
    expect(checkCodeConnect(withTemplate).failures).toEqual([
      `SettingsPage: has a template but is "composed" in ${ALLOWLIST}; a composed screen has no template by design, so move it to "required" or delete the template`,
    ]);

    const twice = make({
      required: [],
      notYet: ALL.filter((n) => !composedList.includes(n) || n === "AuthForm"),
      composed: composedList,
    });
    expect(checkCodeConnect(twice).failures).toEqual([`${ALLOWLIST}: AuthForm is in both "notYet" and "composed"`]);
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

const webIndex = `
export { Card, CardHeader, CardTitle, CardContent } from "./card";
export { Dialog, DialogTrigger, DialogClose, DialogContent } from "./dialog";
export { AlertDialog, AlertDialogAction } from "./alert-dialog";
export { Alert, AlertTitle } from "./alert";
export { Select, SelectGroup, SelectValue } from "./select";
export { Toggle, ToggleGroup, ToggleGroupItem } from "./toggle";
export { Table, TableRow, TableCell } from "./table";
export { H1, H2, Lead, Muted } from "./typography";
export { Stack, Grid, Split, Container } from "./layout";
export { DataTable, DateCell, CurrencyCell, formatCell, useDataTable, DATA_LIMIT } from "./data";
export { Form, FormLabel, CalendarDayButton, Calendar, CommandDialog, Command } from "./misc";
export { ThemeProvider, Button } from "./button";
`;
const webIndex2 = `
export { Button, AppShell } from "./again";
export { AppShell, PageHeader } from "./layout";
`;

describe("web sub-part rule", () => {
  it("keeps parents, drops suffix and explicit sub-parts, typography, layout primitives and cell factories", () => {
    expect(webComponentsFromIndexes([webIndex])).toEqual([
      "Card", "Dialog", "AlertDialog", "Alert", "Select", "Toggle", "ToggleGroup", "Table",
      "DataTable", "Form", "Calendar", "Command", "Button",
    ]);
  });

  it("counts a component re-exported from two indexes once", () => {
    expect(webComponentsFromIndexes([webIndex2])).toEqual(["Button", "AppShell", "PageHeader"]);
  });
});

describe("two-package layout", () => {
  it("checks each package against its own allowlist and names the package", () => {
    const [native, web] = PACKAGES;
    expect(PACKAGES.map((p) => p.name)).toEqual(["ui-native", "ui", "chat-native", "chat-web"]);
    expect(web.figmaDir).toBe("packages/ui/figma");
    const root = make({ notYet: ALL, sources: [] });
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    for (const { file } of web.indexes) write(file, "");
    write(web.indexes[0].file, webIndex);
    write(`${web.figmaDir}/code-connect.json`, JSON.stringify({ required: [], notYet: ["Card", "Button", "Gone"] }));
    expect(checkCodeConnect(root, native).failures).toEqual([]);
    const { failures, components } = checkCodeConnect(root, web);
    expect(components).toContain("Card");
    expect(failures).toContain("packages/ui/figma/code-connect.json: Gone is not a visual component exported from ui; remove it");
    expect(failures).toContain(
      'Dialog: exported from ui but in no list of packages/ui/figma/code-connect.json; add it to "notYet" (or "required" with its template, or "composed" for a screen assembled from library components)',
    );
  });
});

const chatIndex = `
export { ChatInboxScreen, inboxRow, type ChatInboxScreenProps } from "./inbox-screen";
export { ChatComposer, type ChatComposerProps } from "./composer";
export { MessageBubble, displayBody, formatClock } from "./message-bubble";
export { ChatAutoRetry, useChatAutoRetry, isOnline } from "./auto-retry";
export { ChatNativeProvider, useChatNative } from "./context";
export { ChatErrorBoundary } from "./error-boundary";
export { EMOJI_CATEGORIES, RECENT_EMOJI_MAX, type EmojiEntry } from "./emoji";
export type { ChatPushCopy } from "./push";
`;

describe("chat entry points", () => {
  it("lists PascalCase components without hooks, providers, constants, helpers or the non-visual exports", () => {
    expect(chatComponentsFromIndex(chatIndex)).toEqual(["ChatInboxScreen", "ChatComposer", "MessageBubble"]);
  });

  it("checks the native and web entry points against their own folders, so a shared name is two components", () => {
    const chat = PACKAGES.filter((p) => p.name.startsWith("chat-"));
    expect(chat.map((p) => p.figmaDir)).toEqual(["packages/chat/figma/native", "packages/chat/figma/web"]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "code-connect-chat-"));
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    const url = "https://www.figma.com/design/abcdefghijklmnopqrstuv/Sample?node-id=1-2";
    for (const pkg of chat) {
      write(pkg.indexes[0].file, chatIndex);
      const plat = pkg.name.slice("chat-".length);
      write(`packages/chat/src/${plat}/composer.tsx`, "export {};\n");
      write(`${pkg.figmaDir}/ChatComposer.figma.ts`, `// url=${url}\n// source=packages/chat/src/${plat}/composer.tsx\n// component=ChatComposer\n`);
      write(`${pkg.figmaDir}/code-connect.json`, JSON.stringify({ required: ["ChatComposer"], notYet: ["MessageBubble"], composed: ["ChatInboxScreen"] }));
    }
    for (const pkg of chat) {
      const result = checkCodeConnect(root, pkg);
      expect(result.failures).toEqual([]);
      expect(result.covered).toEqual(["ChatComposer"]);
      expect(result.composed).toEqual(["ChatInboxScreen"]);
      expect(result.missing).toEqual(["MessageBubble"]);
    }
    fs.rmSync(`${root}/packages/chat/figma/web/ChatComposer.figma.ts`);
    expect(checkCodeConnect(root, chat[1]).failures).toEqual(["ChatComposer: required, but packages/chat/figma/web/ChatComposer.figma.ts is missing"]);
    expect(checkCodeConnect(root, chat[0]).failures).toEqual([]);
  });
});
