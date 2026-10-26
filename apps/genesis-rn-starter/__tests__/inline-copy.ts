/**
 * Finds user-facing text written into code instead of read from `src/copy.ts`,
 * by walking the TypeScript syntax tree (so `a > b`, generics and comments
 * can't be mistaken for JSX text, and `{"…"}` children can't hide it):
 *
 * - JSX text with a letter in it, and string or template literals as JSX children;
 * - string attributes, except the ones that are never shown (`testID`, `href`, `variant`…);
 * - the title and message of `Alert.alert` / `Alert.prompt`;
 * - object properties that hold copy (`title: "…"`, `text: "…"`, `label: "…"`…).
 */
import ts from "typescript";

/** JSX attributes whose strings are identifiers, routes, icons or styles, never shown as text. */
const NON_COPY_ATTRIBUTES = new Set([
  "testID", "nativeID", "id", "key", "name", "href", "src", "md", "sf", "variant", "size", "mode", "type", "appearance",
  "className", "contentClassName", "textClassName", "style", "autoComplete", "textContentType", "keyboardType",
  "returnKeyType", "autoCapitalize", "accessibilityRole", "behavior", "statusBar", "themeMode", "pointerEvents", "icon", "kind",
]);

/** Object keys whose string values are shown to people. */
const COPY_KEYS = new Set([
  "title", "label", "text", "message", "subtitle", "body", "headline", "subhead", "description", "placeholder",
  "headerTitle", "emptyTitle", "emptyBody", "submitLabel", "errorMessage", "accessibilityLabel", "accessibilityHint",
]);

const hasLetter = (s: string) => /\p{L}/u.test(s);
const isStringish = (n: ts.Node): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
const textOf = (n: ts.Node, source: ts.SourceFile) => n.getText(source).replace(/\s+/g, " ").trim();

export function findInlineCopy(code: string, fileName = "file.tsx"): string[] {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const hit = (n: ts.Node) => {
    const { line } = source.getLineAndCharacterOfPosition(n.getStart(source));
    hits.push(`${fileName}:${line + 1}: ${textOf(n, source)}`);
  };
  const stringHasLetter = (n: ts.Node) => isStringish(n) && hasLetter(n.getText(source).slice(1, -1));

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasLetter(node.text)) hit(node);
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) && stringHasLetter(node.expression)) {
      hit(node);
    }
    if (ts.isJsxAttribute(node) && node.initializer && !NON_COPY_ATTRIBUTES.has(node.name.getText(source))) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (value && stringHasLetter(value)) hit(node);
    }
    if (ts.isCallExpression(node) && /^Alert\.(alert|prompt)$/.test(node.expression.getText(source))) {
      for (const arg of node.arguments.slice(0, 2)) if (stringHasLetter(arg)) hit(arg);
    }
    if (ts.isPropertyAssignment(node) && COPY_KEYS.has(node.name.getText(source).replace(/["']/g, "")) && stringHasLetter(node.initializer)) {
      hit(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}
