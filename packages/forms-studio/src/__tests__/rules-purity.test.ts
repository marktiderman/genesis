// @feat:forms-studio
// @vitest-environment node
//
// `/rules` is the pure half of the studio: a phone app or a server computes form summaries
// with it, without React, react-dom or genesis-ui installed (they are optional peers, for
// the components only). Runs against the build (the test gate runs after
// `pnpm build:packages`), because what ships is dist, not src.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const pkgDir = fileURLToPath(new URL("../..", import.meta.url));
const dist = join(pkgDir, "dist");

/** Packages `/rules` may load, all pure: followed into their own dist and checked too. */
const PURE = ["@marktiderman/genesis-core", "@marktiderman/genesis-forms"] as const;
/** Never reachable from `/rules`, in any import form. */
const FORBIDDEN = /^(react|react-dom|@marktiderman\/genesis-ui|lucide-react)(\/|$)/;

// `from "x"`, `import "x"`, `import("x")`, `require("x")`, in JS and in .d.ts.
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function specifiers(code: string): string[] {
  return [...code.matchAll(SPECIFIER)].map((m) => m[1]!);
}

type Exports = string | { [condition: string]: Exports } | null | undefined;

/** A bare specifier of a PURE package, to its file in that package's dist (ESM + types). */
function resolveBare(spec: string, kind: "import" | "types"): string {
  const name = PURE.find((p) => spec === p || spec.startsWith(`${p}/`));
  if (!name) throw new Error(`not a pure package: ${spec}`);
  const root = join(pkgDir, "node_modules", name);
  const exportsMap = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).exports as Record<string, Exports>;
  const pick = (e: Exports): string | undefined => {
    if (typeof e === "string") return e;
    if (!e) return undefined;
    return pick(e[kind]) ?? pick(e.import) ?? pick(e.default);
  };
  const target = pick(exportsMap[`.${spec.slice(name.length)}`]);
  if (!target) throw new Error(`${spec} has no ${kind} export`);
  return join(root, target);
}

/** Every file `entry` reaches (relative imports and PURE packages), and every bare import seen. */
function walk(entry: string, kind: "import" | "types"): { files: string[]; bare: Set<string> } {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      if (spec.startsWith(".")) {
        const base = resolve(dirname(file), spec);
        const next = [base, `${base}.js`, `${base}.d.ts`, base.replace(/\.js$/, ".d.ts")].find(
          (f) => existsSync(f) && !f.endsWith("/"),
        );
        if (!next) throw new Error(`${file}: cannot resolve ${spec}`);
        queue.push(next);
      } else {
        bare.add(spec);
        if (PURE.some((p) => spec === p || spec.startsWith(`${p}/`))) queue.push(resolveBare(spec, kind));
      }
    }
  }
  return { files: [...seen], bare };
}

describe("/rules is pure", () => {
  for (const [entry, kind] of [
    ["rules.js", "import"],
    ["rules.d.ts", "types"],
  ] as const) {
    it(`dist/${entry} reaches no React, react-dom or genesis-ui`, () => {
      const { files, bare } = walk(join(dist, entry), kind);
      // It does reach genesis-core's /resource, so the walk went past the entry.
      expect([...bare]).toContain("@marktiderman/genesis-core/resource");
      expect(files.length).toBeGreaterThan(1);
      expect([...bare].filter((s) => FORBIDDEN.test(s))).toEqual([]);
      for (const f of files) expect(readFileSync(f, "utf8")).not.toMatch(/["']react(-dom)?(\/[^"']*)?["']/);
    });
  }

  it("the checker sees every import form", () => {
    const forms = specifiers(
      `import a from "react"; export { b } from 'react-dom'; import "@marktiderman/genesis-ui/layout";
       const c = await import("react/jsx-runtime"); const d = require( "lucide-react" );
       type E = import("react").ReactNode;`,
    );
    expect(forms.filter((s) => FORBIDDEN.test(s))).toHaveLength(6);
  });

  describe("in Node, with only forms-studio, genesis-core and genesis-forms installed", () => {
    const root = mkdtempSync(join(tmpdir(), "forms-studio-rules-"));
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it("imports /rules and computes a summary; react is not there to load", () => {
      const install = (name: string, from: string) => {
        const to = join(root, "node_modules", name);
        cpSync(join(from, "dist"), join(to, "dist"), { recursive: true });
        cpSync(join(from, "package.json"), join(to, "package.json"));
      };
      install("@marktiderman/genesis-forms-studio", pkgDir);
      for (const name of PURE) install(name, join(pkgDir, "node_modules", name));
      const script = join(root, "check.mjs");
      writeFileSync(
        script,
        `const rules = await import("@marktiderman/genesis-forms-studio/rules");
         let react = "missing";
         try { await import("react"); react = "found"; } catch {}
         const chip = rules.readinessChip(rules.readinessOf([{ level: "error", code: "no-questions" }]));
         console.log(JSON.stringify({ react, chip, nav: rules.formNavItems("/f").length }));`,
      );
      const out = JSON.parse(execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8" }));
      expect(out).toEqual({ react: "missing", chip: { label: "Add a question", tone: "muted" }, nav: 4 });
    });
  });
});
