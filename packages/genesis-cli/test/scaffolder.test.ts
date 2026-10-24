// @feat:cli-init
import { describe, expect, it, vi } from "vitest";
import {
  planScaffold,
  runScaffold,
  validateConsumerName,
  type FileSystem,
} from "../src/scaffolder.js";

// ---------------------------------------------------------------------------
// In-memory FS for deterministic, side-effect-free tests.
// ---------------------------------------------------------------------------

function createMemoryFs(initial: Record<string, string> = {}): {
  fs: FileSystem;
  files: Map<string, string>;
  mkdirCalls: string[];
} {
  const files = new Map(Object.entries(initial));
  const mkdirCalls: string[] = [];
  const fs: FileSystem = {
    async exists(p) {
      return files.has(p);
    },
    async readFile(p) {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    async writeFile(p, content) {
      files.set(p, content);
    },
    async mkdirp(dir) {
      mkdirCalls.push(dir);
    },
  };
  return { fs, files, mkdirCalls };
}

// ---------------------------------------------------------------------------
// validateConsumerName
// ---------------------------------------------------------------------------

describe("validateConsumerName", () => {
  it.each([
    ["acme"],
    ["gamify"],
    ["gamify-mobile"],
    ["a1"],
    ["my-app-2026"],
  ])("accepts %s", (name) => {
    expect(() => validateConsumerName(name)).not.toThrow();
  });

  it.each([
    ["A"], // uppercase
    ["1consumer"], // starts with digit
    ["x"], // too short
    [""], // empty
    ["my_app"], // underscore
    ["my.app"], // dot
    ["my app"], // space
    ["a".repeat(40)], // too long
  ])("rejects %s", (name) => {
    expect(() => validateConsumerName(name)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// planScaffold (pure function)
// ---------------------------------------------------------------------------

describe("planScaffold", () => {
  it("returns the canonical 8-file plan", () => {
    const plan = planScaffold({ consumerName: "sample" });
    const paths = plan.map((f) => f.path);
    expect(paths).toEqual([
      "packages/sample-brand/package.json",
      "packages/sample-brand/src/brand.ts",
      "packages/sample-brand/src/index.ts",
      "packages/sample-brand/tsconfig.json",
      "tailwind.config.ts",
      "app/global.css",
      "CLAUDE.md",
    ]);
  });

  it("interpolates the consumer name into brand schema", () => {
    const plan = planScaffold({ consumerName: "gamify" });
    const brand = plan.find((f) => f.path.endsWith("brand.ts"))!;
    expect(brand.content).toContain('name: "gamify"');
    expect(brand.content).toContain("@gamify/brand");
  });

  it("interpolates the consumer name into tailwind config", () => {
    const plan = planScaffold({ consumerName: "gamify" });
    const tw = plan.find((f) => f.path === "tailwind.config.ts")!;
    expect(tw.content).toContain('from "@gamify/brand"');
  });

  it("uses workspace:^ as default genesisVersion", () => {
    const plan = planScaffold({ consumerName: "test" });
    const pkg = plan.find((f) => f.path.endsWith("package.json"))!;
    expect(pkg.content).toContain('"workspace:^"');
  });

  it("honors a custom genesisVersion", () => {
    const plan = planScaffold({ consumerName: "test", genesisVersion: "^1.2.3" });
    const pkg = plan.find((f) => f.path.endsWith("package.json"))!;
    expect(pkg.content).toContain('"^1.2.3"');
  });
});

// ---------------------------------------------------------------------------
// runScaffold — fresh write
// ---------------------------------------------------------------------------

describe("runScaffold (fresh)", () => {
  it("writes all 8 files to a clean target", async () => {
    const { fs, files } = createMemoryFs();
    const result = await runScaffold(
      { consumerName: "sample", targetDir: "/tmp/proj" },
      fs,
    );

    expect(result.written).toHaveLength(7);
    expect(result.skipped).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(files.has("/tmp/proj/packages/sample-brand/src/brand.ts")).toBe(true);
    expect(files.has("/tmp/proj/CLAUDE.md")).toBe(true);
    expect(files.has("/tmp/proj/.genesis/cli.yml")).toBe(false);
  });

  it("calls mkdirp for every parent dir", async () => {
    const { fs, mkdirCalls } = createMemoryFs();
    await runScaffold(
      { consumerName: "sample", targetDir: "/tmp/proj" },
      fs,
    );
    // At minimum: packages/sample-brand/src + app
    expect(mkdirCalls.some((d) => d.includes("packages/sample-brand/src"))).toBe(true);
    expect(mkdirCalls.some((d) => d.endsWith("/app"))).toBe(true);
    expect(mkdirCalls.some((d) => d.endsWith("/app"))).toBe(true);
  });

  it("rejects an invalid consumer name", async () => {
    const { fs } = createMemoryFs();
    await expect(
      runScaffold({ consumerName: "Bad_Name", targetDir: "/x" }, fs),
    ).rejects.toThrow(/Invalid consumer name/);
  });
});

// ---------------------------------------------------------------------------
// runScaffold — idempotent re-run
// ---------------------------------------------------------------------------

describe("runScaffold (idempotent)", () => {
  it("skips identical files on re-run", async () => {
    const { fs, files } = createMemoryFs();
    await runScaffold(
      { consumerName: "sample", targetDir: "/p" },
      fs,
    );
    expect(files.size).toBe(7);

    const second = await runScaffold(
      { consumerName: "sample", targetDir: "/p" },
      fs,
    );
    expect(second.written).toHaveLength(0);
    expect(second.skipped).toHaveLength(7);
    expect(second.conflicts).toHaveLength(0);
    expect(files.size).toBe(7); // No new files
  });

  it("does not overwrite a divergent existing file", async () => {
    const { fs, files } = createMemoryFs({
      "/p/CLAUDE.md": "# my own claude.md, do not touch\n",
    });
    const result = await runScaffold(
      { consumerName: "sample", targetDir: "/p" },
      fs,
    );
    expect(files.get("/p/CLAUDE.md")).toBe(
      "# my own claude.md, do not touch\n",
    );
    expect(result.skipped).toContain("CLAUDE.md");
    expect(result.conflicts).toHaveLength(0);
  });

  it("emits .genesis-next sibling when emitConflicts=true", async () => {
    const { fs, files } = createMemoryFs({
      "/p/CLAUDE.md": "# custom claude.md\n",
    });
    const result = await runScaffold(
      {
        consumerName: "sample",
        targetDir: "/p",
        emitConflicts: true,
      },
      fs,
    );
    expect(files.has("/p/CLAUDE.md.genesis-next")).toBe(true);
    expect(files.get("/p/CLAUDE.md")).toBe("# custom claude.md\n");
    expect(result.conflicts).toContain("CLAUDE.md.genesis-next");
  });

  it("does NOT emit .genesis-next when content matches (skip wins)", async () => {
    const { fs, files } = createMemoryFs();
    await runScaffold(
      { consumerName: "sample", targetDir: "/p" },
      fs,
    );
    const result = await runScaffold(
      {
        consumerName: "sample",
        targetDir: "/p",
        emitConflicts: true,
      },
      fs,
    );
    // No `.genesis-next` files exist after the second run.
    const nextFiles = [...files.keys()].filter((k) =>
      k.endsWith(".genesis-next"),
    );
    expect(nextFiles).toHaveLength(0);
    expect(result.skipped).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Logger wiring
// ---------------------------------------------------------------------------

describe("runScaffold logger", () => {
  it("logs every write via the supplied logger", async () => {
    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const { fs } = createMemoryFs();
    await runScaffold(
      {
        consumerName: "sample",
        targetDir: "/p",
        logger: { info, warn, error },
      },
      fs,
    );
    expect(info.mock.calls.length).toBe(7);
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs warnings for skipped existing files", async () => {
    const { fs } = createMemoryFs({
      "/p/CLAUDE.md": "# pre-existing\n",
    });
    const warn = vi.fn();
    await runScaffold(
      {
        consumerName: "sample",
        targetDir: "/p",
        logger: { info: vi.fn(), warn, error: vi.fn() },
      },
      fs,
    );
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("CLAUDE.md"))).toBe(true);
  });
});

describe("planScaffold native", () => {
  const tailwind = (native: boolean) => planScaffold({ consumerName: "acme", native }).find((f) => f.path === "tailwind.config.ts")!.content;

  it("adds NativeWind's preset and the genesis-ui-native glob for an Expo app", () => {
    const config = tailwind(true);
    expect(config).toContain('import nativewindPreset from "nativewind/preset";');
    expect(config).toContain('import { genesisNativewindPreset as genesisPreset } from "@marktiderman/genesis-design-system/presets/nativewind";');
    expect(config).not.toContain("presets/tailwind");
    expect(config).toContain("presets: [nativewindPreset, genesisPreset]");
    expect(config).toContain("@marktiderman/genesis-ui-native");
  });

  it("leaves both out for a web app", () => {
    const config = tailwind(false);
    expect(config).not.toContain("nativewind");
    expect(config).not.toContain("genesis-ui-native");
    expect(config).toContain("presets: [genesisPreset]");
  });
});
