// A small JavaScript/TypeScript/JSX scanner for the doctor's rules that need to know what is code.
// It tracks code, strings, templates (and their `${…}`), comments, regular expressions and JSX
// (tags, attributes, `{…}` expressions and text), so a name inside a string, a comment or JSX text
// is never taken for a use, and an apostrophe in JSX text ("Don't") is never taken for a quote.
// It isn't a parser: it gives the code's tokens in order, which is what those rules read.

/** One token of code: a name (`ident`), a JSX tag's name (`jsxTag`), or punctuation. */
export interface CodeToken {
  kind: "ident" | "jsxTag" | "punct";
  value: string;
  /** The token before it in code (punctuation included), for the rules' context checks. */
  index: number;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[\w$]/;
const PUNCT3 = ["...", "===", "!==", "**=", "<<=", ">>=", "??=", "&&=", "||="];
const PUNCT2 = ["=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>"];
// After these, `/` starts a regular expression and `<` may start a JSX element.
const EXPRESSION_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"]);

/**
 * The code tokens of a file, in order. `jsx` turns on JSX (`.jsx`, `.tsx`); in plain `.ts` a `<`
 * after `=` is a generic, never an element.
 */
export function scanCode(code: string, options: { jsx?: boolean } = {}): CodeToken[] {
  const jsx = options.jsx ?? true;
  const tokens: CodeToken[] = [];
  const push = (kind: CodeToken["kind"], value: string) => tokens.push({ kind, value, index: tokens.length });
  const last = () => tokens[tokens.length - 1];
  const expressionNext = () => {
    const t = last();
    if (!t) return true;
    if (t.kind === "ident") return EXPRESSION_KEYWORDS.has(t.value);
    if (t.kind === "jsxTag") return false;
    return !(t.value === ")" || t.value === "]" || t.value === "}");
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
  /** Skip whitespace and comments; return the next index. */
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

  // Code until the `}` that closes the brace this call was entered at (`stop`), or the end.
  const codeUntil = (start: number, stop: boolean): number => {
    let i = start;
    let depth = 0;
    while (i < code.length) {
      i = skipTrivia(i);
      if (i >= code.length) break;
      const c = code[i]!;
      if (c === '"' || c === "'") {
        i = skipString(i, c);
        push("punct", "''");
      } else if (c === "`") {
        i = template(i + 1);
        push("punct", "``");
      } else if (IDENT_START.test(c)) {
        let j = i + 1;
        while (j < code.length && IDENT.test(code[j]!)) j++;
        push("ident", code.slice(i, j));
        i = j;
      } else if (/\d/.test(c)) {
        let j = i + 1;
        while (j < code.length && /[\w.]/.test(code[j]!)) j++;
        push("punct", "0");
        i = j;
      } else if (c === "/" && expressionNext()) {
        i = skipRegex(i);
        push("punct", "//");
      } else if (c === "<" && jsx && expressionNext() && /[A-Za-z_$>]/.test(code[i + 1] ?? "")) {
        i = element(i);
        push("punct", "<>");
      } else if (c === "{") {
        depth++;
        push("punct", "{");
        i++;
      } else if (c === "}") {
        if (depth === 0 && stop) return i + 1;
        depth = Math.max(0, depth - 1);
        push("punct", "}");
        i++;
      } else {
        const three = code.slice(i, i + 3);
        const two = code.slice(i, i + 2);
        const p = PUNCT3.includes(three) ? three : PUNCT2.includes(two) ? two : c;
        push("punct", p);
        i += p.length;
      }
    }
    return i;
  };

  // A template's text, from just after its backtick: each `${…}` is code.
  const template = (start: number): number => {
    let i = start;
    while (i < code.length) {
      const c = code[i]!;
      if (c === "\\") i += 2;
      else if (c === "`") return i + 1;
      else if (c === "$" && code[i + 1] === "{") {
        push("punct", "${");
        i = codeUntil(i + 2, true);
      } else i++;
    }
    return i;
  };

  // A JSX element from its `<`: the tag's name, its attributes (`{…}` is code), then its children
  // (text, `{…}`, nested elements) up to its closing tag.
  const element = (start: number): number => {
    let i = start + 1;
    if (code[i] === ">") return children(i + 1);
    let j = i;
    while (j < code.length && /[\w$.:-]/.test(code[j]!)) j++;
    const name = code.slice(i, j);
    if (name) push("jsxTag", name.split(/[.:]/)[0]!);
    i = j;
    while (i < code.length) {
      i = skipTrivia(i);
      const c = code[i];
      if (c === undefined) return i;
      if (c === "/" && code[i + 1] === ">") return i + 2;
      if (c === ">") return children(i + 1);
      if (c === "{") i = codeUntil(i + 1, true);
      else if (c === '"' || c === "'") i = skipString(i, c);
      else if (c === "<") i = element(i);
      else i++; // an attribute's name or `=`: not code
    }
    return i;
  };
  const children = (start: number): number => {
    let i = start;
    while (i < code.length) {
      const c = code[i]!;
      if (c === "<" && code[i + 1] === "/") {
        const end = code.indexOf(">", i);
        return end < 0 ? code.length : end + 1;
      }
      if (c === "<") i = element(i);
      else if (c === "{") i = codeUntil(i + 1, true);
      else i++; // JSX text
    }
    return i;
  };

  codeUntil(0, false);
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
    if (before?.value === "." || before?.value === "?." || before?.value === "as") return false;
    if (after?.value === ":" && (before?.value === "{" || before?.value === ",")) return false;
    // The import line itself: `import { X as Name }` is skipped above; `import Name from` too.
    if (before?.value === "import") return false;
    return true;
  });
}

const NOT_METHODS = new Set(["if", "for", "while", "switch", "catch", "with", "function", "return", "typeof", "await", "new"]);

/**
 * Whether a function in the file takes `name` as a parameter, defaults and destructuring
 * included: `function f(name)`, `(name = x()) =>`, `name =>`, an object or class method
 * `f({ name }) {`. Parameter lists are matched by balanced parentheses.
 */
export function boundAsParameter(code: string, name: string, options: { jsx?: boolean } = {}): boolean {
  const tokens = scanCode(code, options);
  const close = (open: number): number => {
    let depth = 0;
    for (let k = open; k < tokens.length; k++) {
      if (tokens[k]!.value === "(") depth++;
      else if (tokens[k]!.value === ")" && --depth === 0) return k;
    }
    return -1;
  };
  const names = (open: number, end: number) => tokens.slice(open + 1, end).some((t) => t.kind === "ident" && t.value === name);
  const arrowAfter = (end: number): boolean => {
    const next = tokens[end + 1];
    if (next?.value === "=>") return true;
    if (next?.value !== ":") return false;
    // A return type, then the arrow.
    let depth = 0;
    for (let k = end + 2; k < tokens.length; k++) {
      const v = tokens[k]!.value;
      if (v === "(" || v === "{" || v === "[" || v === "<") depth++;
      else if (v === ")" || v === "}" || v === "]" || v === ">") depth--;
      if (depth < 0) return false;
      if (depth === 0 && v === "=>") return true;
      if (depth === 0 && (v === ";" || v === "," || v === "=")) return false;
    }
    return false;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.value === "=>" && tokens[i - 1]?.kind === "ident" && tokens[i - 1]!.value === name) return true;
    if (t.value !== "(") continue;
    const end = close(i);
    if (end < 0) continue;
    const before = tokens[i - 1];
    const fn = tokens.slice(Math.max(0, i - 3), i).some((x) => x.kind === "ident" && x.value === "function");
    const method = before?.kind === "ident" && !NOT_METHODS.has(before.value) && (tokens[end + 1]?.value === "{" || (tokens[end + 1]?.value === ":" && !arrowAfter(end)));
    if ((fn || method || arrowAfter(end)) && names(i, end)) return true;
  }
  return false;
}
