// @feat:native-app-shell @feat:define-block
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { BlockError, defineBlock } from "@marktiderman/genesis-features/blocks";
import { GenesisNativeApp, type GenesisNativeAppProps } from "../app";
import { mergeBlockSettings, useBlockSettings, useBlocks, type NativeBlock, type NativeBlockRootProps } from "../blocks";
import type { FatalScreenProps } from "../errors";
import { createUpdates, UPDATES_BLOCK_ID } from "../updates";
import { fakeSupabase, settle } from "./fakes";

afterEach(() => vi.restoreAllMocks());

const provider = createMockProvider({});

function setup(props: Partial<GenesisNativeAppProps> = {}) {
  return render(
    <GenesisNativeApp brand={genesisBrand} supabase={fakeSupabase({ user: { id: "u1" } }).client} provider={provider} rejectionTracker={null} {...props}>
      {props.children ?? <span data-testid="screens">screens</span>}
    </GenesisNativeApp>,
  );
}

function wrapper(name: string) {
  return function Root({ children }: NativeBlockRootProps) {
    return <div data-testid={`root-${name}`}>{children}</div>;
  };
}

const SupportFatal = ({ error }: FatalScreenProps) => <span data-testid="support-fatal">{error.message}</span>;

describe("GenesisNativeApp blocks", () => {
  it("runs blocks' boot steps in dependency order, after the app's, and mounts their roots, the first outermost", async () => {
    const ran: string[] = [];
    const account: NativeBlock = { ...defineBlock({ id: "account" }), bootSteps: [{ id: "account:load", run: () => void ran.push("account") }], Root: wrapper("account") };
    const support: NativeBlock = {
      ...defineBlock({ id: "support", requires: ["account"] }),
      bootSteps: [{ id: "support:load", run: () => void ran.push("support") }],
      Root: wrapper("support"),
    };
    setup({ blocks: [support, account], steps: [{ id: "app", run: () => void ran.push("app") }] });
    await act(settle);
    expect(ran).toEqual(["app", "account", "support"]);
    const outer = screen.getByTestId("root-account");
    expect(outer.contains(screen.getByTestId("root-support"))).toBe(true);
    expect(screen.getByTestId("root-support").contains(screen.getByTestId("screens"))).toBe(true);
  });

  it("puts a block's slot fills under the app's own slots", async () => {
    const support: NativeBlock = defineBlock({ id: "support", contributes: { slots: { fatal: SupportFatal } } });
    function Boom(): ReactNode {
      throw new Error("kaboom");
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ blocks: [support], children: <Boom /> });
    await act(settle);
    expect(screen.getByTestId("support-fatal").textContent).toBe("kaboom");
  });

  it("lets the app's slots win over a block's", async () => {
    const support: NativeBlock = defineBlock({ id: "support", contributes: { slots: { fatal: SupportFatal } } });
    function Boom(): ReactNode {
      throw new Error("kaboom");
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ blocks: [support], slots: { fatal: () => <span data-testid="app-fatal" /> }, children: <Boom /> });
    await act(settle);
    expect(screen.getByTestId("app-fatal")).toBeTruthy();
    expect(screen.queryByTestId("support-fatal")).toBeNull();
  });

  it("shows the fatal screen and reports a BlockError when a requirement is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const support: NativeBlock = defineBlock({ id: "support", requires: ["account"] });
    const account: NativeBlock = defineBlock({ id: "account", platforms: ["web"] });
    setup({ blocks: [support, account], onError });
    await act(settle);
    expect(screen.getByTestId("genesis-fatal-plain")).toBeTruthy();
    const error = onError.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(BlockError);
    expect((error as BlockError).problems).toEqual(['support.requires: "account" doesn\'t run on native; turn it on or turn support off']);
  });

  it("runs the updates block once when it is given as `updates` and in `blocks`", async () => {
    const updates = createUpdates({ platform: "ios", policyTimeoutMs: 50 });
    const run = vi.spyOn(updates.bootStep, "run");
    function Ids() {
      return <span data-testid="ids">{[...useBlocks().ids].join(",")}</span>;
    }
    setup({ updates, blocks: [updates], children: <Ids /> });
    await act(settle);
    expect(screen.getByTestId("ids").textContent).toBe(UPDATES_BLOCK_ID);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("useBlockSettings", () => {
  it("adds blocks' rows to their sections, with live subtitles, and the updates block's version row to About", async () => {
    const application = { nativeApplicationVersion: "1.4.0", nativeBuildVersion: "37" };
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50 });
    const support: NativeBlock = defineBlock({
      id: "support",
      contributes: { settings: [{ id: "contact", section: "help", title: "Contact support", href: "/support", useSubtitle: () => "We answer in a day" }] },
    });
    const navigate = vi.fn();
    let seen: ReturnType<typeof useBlockSettings> = [];
    function Settings() {
      seen = useBlockSettings([{ id: "about", title: "About", rows: [{ id: "terms", title: "Terms" }] }], { navigate, sectionTitles: { help: "Help" } });
      return null;
    }
    setup({ blocks: [support, updates], children: <Settings /> });
    await act(settle);
    expect(seen.map((s) => [s.id, s.title, s.rows.map((r) => r.id)])).toEqual([
      ["about", "About", ["terms", "app-version"]],
      ["help", "Help", ["contact"]],
    ]);
    const version = seen[0]!.rows[1]!;
    expect(version.title).toBe("Version");
    expect(version.subtitle).toMatch(/^1\.4\.0 \(37\)/);
    const contact = seen[1]!.rows[0]!;
    expect(contact.subtitle).toBe("We answer in a day");
    contact.onPress?.();
    expect(navigate).toHaveBeenCalledWith("/support");
  });

  it("leaves the version row out with versionRow: false, and returns the sections unchanged outside the shell", () => {
    const updates = createUpdates({ platform: "ios", versionRow: false });
    expect(updates.contributes?.settings).toEqual([]);
    const sections = [{ id: "about", rows: [{ id: "terms", title: "Terms" }] }];
    expect(mergeBlockSettings(sections, [])).toEqual(sections);
  });
});
