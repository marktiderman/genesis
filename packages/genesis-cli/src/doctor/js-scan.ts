// A small JavaScript/TypeScript/JSX scanner for the doctor's rules that need to know what is code.
// It tracks code, strings, templates (and their `${…}`), comments, regular expressions and JSX
// (tags, attributes, `{…}` expressions and text), so a name inside a string, a comment or JSX text
// is never taken for a use, and an apostrophe in JSX text ("Don't") is never taken for a quote.
// It isn't a parser: it gives the code's tokens in order, which is what those rules read. It runs
// on an explicit stack (no recursion), so no nesting depth can overflow the call stack.

/** One token of code: a name (`ident`), a JSX tag's name (`jsxTag`), a literal, or punctuation. */
export interface CodeToken {
  kind: "ident" | "jsxTag" | "literal" | "punct";
  value: string;
  index: number;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[\w$]/;
const PUNCT3 = ["...", "===", "!==", "**=", "<<=", ">>=", "??=", "&&=", "||="];
const PUNCT2 = ["=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>"];
// Keywords after which an expression starts, so `/` is a regular expression and `<` may open JSX.
// (`of` isn't one: it's also an ordinary name, `of / 2`.)
const EXPRESSION_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "new", "delete", "void", "throw", "yield", "await", "instanceof"]);
// `<Name,` or `<Name extends`: a generic's type parameters, never a JSX element.
const TYPE_PARAMETERS = /^<\s*[A-Za-z_$][\w$]*\s*(?:,|extends\b)/;

type Frame = { k: "code"; depth: number; stop: boolean } | { k: "template" } | { k: "tag" } | { k: "children" };

/**
 * The code tokens of a file, in order. `jsx` turns on JSX (`.jsx`, `.tsx`, `.js`); in plain `.ts` a
 * `<` after `=` is a generic, never an element.
 */
export function scanCode(code: string, options: { jsx?: boolean } = {}): CodeToken[] {
  const jsx = options.jsx ?? true;
  const tokens: CodeToken[] = [];
  const push = (kind: CodeToken["kind"], value: string) => tokens.push({ kind, value, index: tokens.length });
  // The standard rule: after a name, a literal, `)`, `]` or `}`, `/` divides and `<` compares.
  const expressionNext = () => {
    const t = tokens[tokens.length - 1];
    if (!t) return true;
    if (t.kind === "ident") return EXPRESSION_KEYWORDS.has(t.value);
    if (t.kind === "jsxTag" || t.kind === "literal") return false;
    return !(t.value === ")" || t.value === "]" || t.value === "}" || t.value === "<>");
  };
  const skipString = (i: number, quote: string): number => {
    let j = i + 1;
    while (j < code.length && code[j] !== quote) {
      if (code[j] === "\\") j++;
      else if (code[j] === "\n") return j;
      j++;
    }
    return j + 1;
  };
  const skipRegex = (i: number): number => {
    let j = i + 1;
    let inClass = false;
    while (j < code.length && code[j] !== "\n") {
      const c = code[j]!;
      if (c === "\\") j++;
      else if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) {
        j++;
        while (j < code.length && IDENT.test(code[j]!)) j++;
        return j;
      }
      j++;
    }
    return j;
  };
  const skipTrivia = (i: number): number => {
    let j = i;
    for (;;) {
      while (j < code.length && /\s/.test(code[j]!)) j++;
      if (code.startsWith("//", j)) {
        const end = code.indexOf("\n", j);
        j = end < 0 ? code.length : end;
      } else if (code.startsWith("/*", j)) {
        const end = code.indexOf("*/", j + 2);
        j = end < 0 ? code.length : end + 2;
      } else return j;
    }
  };

  const stack: Frame[] = [{ k: "code", depth: 0, stop: false }];
  // Open a JSX element at `<`: a fragment goes straight to its children, a tag to its attributes.
  const openElement = (i: number): number => {
    if (code[i + 1] === ">") {
      stack.push({ k: "children" });
      return i + 2;
    }
    let j = i + 1;
    while (j < code.length && /[\w$.:-]/.test(code[j]!)) j++;
    const name = code.slice(i + 1, j);
    if (name) push("jsxTag", name.split(/[.:]/)[0]!);
    stack.push({ k: "tag" });
    return j;
  };
  const closeElement = () => {
    stack.pop();
    push("punct", "<>");
  };

  let i = 0;
  while (i < code.length) {
    const top = stack[stack.length - 1]!;
    if (top.k === "code") {
      i = skipTrivia(i);
      if (i >= code.length) break;
      const c = code[i]!;
      if (c === '"' || c === "'") {
        i = skipString(i, c);
        push("literal", "''");
      } else if (c === "`") {
        stack.push({ k: "template" });
        i++;
      } else if (IDENT_START.test(c)) {
        let j = i + 1;
        while (j < code.length && IDENT.test(code[j]!)) j++;
        push("ident", code.slice(i, j));
        i = j;
      } else if (/\d/.test(c) || (c === "." && /\d/.test(code[i + 1] ?? ""))) {
        let j = i + 1;
        while (j < code.length && /[\w.]/.test(code[j]!)) j++;
        push("literal", "0");
        i = j;
      } else if (c === "/" && expressionNext()) {
        i = skipRegex(i);
        push("literal", "//");
      } else if (c === "<" && jsx && expressionNext() && /[A-Za-z_$>]/.test(code[i + 1] ?? "") && !TYPE_PARAMETERS.test(code.slice(i, i + 200))) {
        i = openElement(i);
      } else if (c === "{") {
        top.depth++;
        push("punct", "{");
        i++;
      } else if (c === "}") {
        i++;
        if (top.depth === 0 && top.stop) stack.pop();
        else {
          top.depth = Math.max(0, top.depth - 1);
          push("punct", "}");
        }
      } else {
        const three = code.slice(i, i + 3);
        const two = code.slice(i, i + 2);
        const p = PUNCT3.includes(three) ? three : PUNCT2.includes(two) ? two : c;
        push("punct", p);
        i += p.length;
      }
    } else if (top.k === "template") {
      const c = code[i]!;
      if (c === "\\") i += 2;
      else if (c === "`") {
        stack.pop();
        push("literal", "``");
        i++;
      } else if (c === "$" && code[i + 1] === "{") {
        stack.push({ k: "code", depth: 0, stop: true });
        i += 2;
      } else i++;
    } else if (top.k === "tag") {
      i = skipTrivia(i);
      const c = code[i];
      if (c === undefined) break;
      if (c === "/" && code[i + 1] === ">") {
        closeElement();
        i += 2;
      } else if (c === ">") {
        stack[stack.length - 1] = { k: "children" };
        i++;
      } else if (c === "{") {
        stack.push({ k: "code", depth: 0, stop: true });
        i++;
      } else if (c === '"' || c === "'") i = skipString(i, c);
      else if (c === "<") i = openElement(i);
      else i++; // an attribute's name or `=`: not code
    } else {
      const c = code[i]!;
      if (c === "<" && code[i + 1] === "/") {
        const end = code.indexOf(">", i);
        i = end < 0 ? code.length : end + 1;
        closeElement();
      } else if (c === "<" && /[A-Za-z_$>]/.test(code[i + 1] ?? "")) i = openElement(i);
      else if (c === "{") {
        stack.push({ k: "code", depth: 0, stop: true });
        i++;
      } else i++; // JSX text
    }
  }
  return tokens;
}

/**
 * Whether `name` is used as code: a JSX tag (`<Name`), or a name in code that isn't a property
 * after `.`, an import's `X as Name`, or an object key (`{ Name: … }`). Strings, comments, JSX text
 * and attribute names never count; a template's `${Name}` does.
 */
export function usesAsCode(code: string, name: string, options: { jsx?: boolean } = {}): boolean {
  const tokens = scanCode(code, options);
  return tokens.some((t, i) => {
    if (t.value !== name) return false;
    if (t.kind === "jsxTag") return true;
    if (t.kind !== "ident") return false;
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    if (before?.value === "." || before?.value === "?." || before?.value === "as" || before?.value === "import") return false;
    if (after?.value === ":" && (before?.value === "{" || before?.value === ",")) return false;
    return true;
  });
}

// Before `(`, these open a condition or a call, never a method's parameter list.
const NOT_METHODS = new Set(["if", "for", "while", "switch", "with", "function", "return", "typeof", "await", "new"]);
const OPENS = new Set(["(", "[", "{"]);
const CLOSES = new Set([")", "]", "}"]);

/** The names a parameter list binds: each parameter's pattern, without its default or its type. */
function boundNames(list: CodeToken[]): string[] {
  const out: string[] = [];
  // Split at top-level commas.
  const params: CodeToken[][] = [[]];
  let depth = 0;
  for (const t of list) {
    if (OPENS.has(t.value)) depth++;
    else if (CLOSES.has(t.value)) depth--;
    if (depth === 0 && t.value === ",") params.push([]);
    else params[params.length - 1]!.push(t);
  }
  for (const param of params) {
    // The pattern ends at a top-level `=` (its default) or `:` (its type).
    let d = 0;
    let end = param.length;
    for (let k = 0; k < param.length; k++) {
      const v = param[k]!.value;
      if (OPENS.has(v)) d++;
      else if (CLOSES.has(v)) d--;
      else if (d === 0 && (v === "=" || v === ":" || v === "?")) {
        end = k;
        break;
      }
    }
    // Inside a pattern: a key before `:` isn't bound, and a default (`= …`) is skipped to its `,`
    // or its closing bracket.
    const pattern = param.slice(0, end);
    let skipping = -1;
    d = 0;
    for (let k = 0; k < pattern.length; k++) {
      const t = pattern[k]!;
      if (OPENS.has(t.value)) d++;
      else if (CLOSES.has(t.value)) {
        d--;
        if (skipping > d) skipping = -1;
      }
      if (skipping >= 0) {
        if (t.value === "," && d === skipping) skipping = -1;
        continue;
      }
      if (t.value === "=") {
        skipping = d;
        continue;
      }
      if (t.kind === "ident" && pattern[k + 1]?.value !== ":") out.push(t.value);
    }
  }
  return out;
}

/**
 * Whether a function in the file binds `name` as a parameter: `function f(name)`,
 * `function f<T>(name: T)`, `(name = x()) =>`, `name =>`, `catch (name)`, an object or class method
 * `f({ name }) {`. Only binding positions count: a default value or a type that mentions the name
 * doesn't bind it. Parameter lists are matched by balanced parentheses in one pass.
 */
export function boundAsParameter(code: string, name: string, options: { jsx?: boolean } = {}): boolean {
  const tokens = scanCode(code, options);
  // Each `(`'s matching `)`, in one pass.
  const match = new Int32Array(tokens.length).fill(-1);
  const open: number[] = [];
  tokens.forEach((t, k) => {
    if (t.value === "(") open.push(k);
    else if (t.value === ")" && open.length) match[open.pop()!] = k;
  });
  const arrowAfter = (end: number): boolean => {
    const next = tokens[end + 1];
    if (next?.value === "=>") return true;
    if (next?.value !== ":") return false;
    // A return type, then the arrow: bounded, so a long file can't make this quadratic.
    let depth = 0;
    for (let k = end + 2; k < Math.min(tokens.length, end + 200); k++) {
      const v = tokens[k]!.value;
      if (v === "(" || v === "{" || v === "[" || v === "<") depth++;
      else if (v === ")" || v === "}" || v === "]" || v === ">") depth--;
      if (depth < 0) return false;
      if (depth === 0 && v === "=>") return true;
      if (depth === 0 && (v === ";" || v === "," || v === "=")) return false;
    }
    return false;
  };
  // `function name<T, U>(`: skip back over type parameters and the name to `function`.
  const isFunction = (paren: number): boolean => {
    let k = paren - 1;
    // `>>` closes two nested type arguments (`View<A, B>>`): it counts twice.
    if (tokens[k]?.value === ">" || tokens[k]?.value === ">>") {
      let depth = 0;
      for (; k >= 0; k--) {
        const v = tokens[k]!.value;
        if (v === ">") depth++;
        else if (v === ">>") depth += 2;
        else if (v === "<" && --depth === 0) break;
      }
      k--;
    }
    if (tokens[k]?.kind === "ident" && tokens[k]!.value !== "function") k--;
    if (tokens[k]?.value === "*") k--;
    return tokens[k]?.value === "function";
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.value === "=>" && tokens[i - 1]?.kind === "ident" && tokens[i - 1]!.value === name && tokens[i - 2]?.value !== ".") return true;
    if (t.value !== "(") continue;
    const end = match[i]!;
    if (end < 0) continue;
    const before = tokens[i - 1];
    const catchClause = before?.value === "catch";
    const method = !catchClause && before?.kind === "ident" && !NOT_METHODS.has(before.value) && (tokens[end + 1]?.value === "{" || (tokens[end + 1]?.value === ":" && !arrowAfter(end)));
    if ((catchClause || isFunction(i) || method || arrowAfter(end)) && boundNames(tokens.slice(i + 1, end)).includes(name)) return true;
  }
  return false;
}
