/**
 * The web barrel (`index.ts`) and the native one (`index.native.ts`, which Metro resolves through
 * the `react-native` condition) export the same names, but for a frozen list of older web-only ones: a name only in the web barrel is undefined
 * on a phone, and the tests (which resolve `import`) would never see it.
 */
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const src = path.resolve(import.meta.dirname, "..");

/**
 * Names the web barrel exported before this test and the native one never has (app styles and
 * brands as CSS, component tokens, density). Frozen: a new export goes in both barrels, and a name
 * moved to native comes off this list.
 */
const WEB_ONLY = ["APP_BRAND_PAIRS", "AppBrand", "AppBrandContrastProblem", "AppBrandImage", "AppBrandInput", "AppCssOptions", "AppCssVariables", "AppStyle", "AppStyleInput", "COMPONENT_TOKENS", "ComponentTokenInfo", "ComponentTokenKind", "DENSITY_LEVELS", "DensityLevel", "NO_SHADOW", "STARTER_BRANDS", "STARTER_STYLES", "THEME_FONTS", "THEME_PARTS", "THEME_TOKEN_NAMES", "ThemeDeclarations", "ThemeFont", "ThemePartInfo", "ThemePartStyles", "ThemeRoleColors", "ThemeTokenValues", "appBrandContrastProblems", "appBrandCss", "appBrandVariables", "appStyleCss", "appStyleVariables", "arenaBrand", "arenaStyle", "checklistBrand", "checklistStyle", "componentTokenCss", "componentTokenProblem", "defineAppBrand", "defineAppStyle", "getComponentToken", "getStarterBrand", "getStarterStyle", "getThemePart", "journalBrand", "journalStyle", "notebookBrand", "notebookStyle", "parsePartSelector", "pressBrand", "pressStyle", "renderAppStylesCss", "repositoryBrand", "repositoryStyle", "resolveDensity", "trackerBrand", "trackerStyle", "validateAppBrand", "validateAppStyle"];

function exportsOf(program: ts.Program, file: string): string[] {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`no source for ${file}`);
  const symbol = checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`no module symbol for ${file}`);
  return checker.getExportsOfModule(symbol).map((s) => s.getName()).sort();
}

describe("the design system's barrels", () => {
  it("export the same names on the web and on native", () => {
    const web = path.join(src, "index.ts");
    const native = path.join(src, "index.native.ts");
    const program = ts.createProgram([web, native], { noEmit: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, skipLibCheck: true, allowImportingTsExtensions: false });
    const a = exportsOf(program, web);
    const b = exportsOf(program, native);
    expect(b.filter((n) => !a.includes(n))).toEqual([]);
    expect(a.filter((n) => !b.includes(n))).toEqual([...WEB_ONLY].sort());
    expect(b).toContain("resolveChatRoles");
    expect(b).toContain("CHAT_ROLES");
    expect(b).toContain("CHAT_ACCENTS");
  });
});
