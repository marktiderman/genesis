// Read two pieces of Postgres catalog text the catalog doesn't expose as rows:
// where a view's columns come from (its stored query's target list) and which
// values a CHECK constraint allows. Both are pure, so they're tested without a
// database. Anything they don't recognise comes back as "unknown", never a guess.

/** A view column that is a plain reference to a column of another relation. */
export interface ViewColumnOrigin {
  /**
   * The view column's number (`pg_attribute.attnum`): the entry's `resno`. Never match on the
   * stored `resname`, which `alter view … rename column` doesn't update.
   */
  position: number;
  /** The column's name when the view was created (it may have been renamed since). */
  name: string;
  /** The relation the column comes from (`pg_class.oid`). */
  relation: number;
  /** Its column number there (`pg_attribute.attnum`). */
  column: number;
}

type Token = { kind: "open"; char: string } | { kind: "close"; char: string } | { kind: "atom"; text: string };

/** Split a `pg_node_tree` into braces, parens and atoms, honouring backslash escapes. */
function tokenize(tree: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < tree.length) {
    const ch = tree[i]!;
    if (ch === " " || ch === "\n" || ch === "\t") {
      i++;
    } else if (ch === "{" || ch === "(") {
      tokens.push({ kind: "open", char: ch });
      i++;
    } else if (ch === "}" || ch === ")") {
      tokens.push({ kind: "close", char: ch });
      i++;
    } else {
      let text = "";
      while (i < tree.length) {
        const c = tree[i]!;
        if (c === "\\" && i + 1 < tree.length) {
          text += tree[i + 1];
          i += 2;
          continue;
        }
        if (c === " " || c === "\n" || c === "\t" || c === "{" || c === "}" || c === "(" || c === ")") break;
        text += c;
        i++;
      }
      tokens.push({ kind: "atom", text });
    }
  }
  return tokens;
}

/**
 * The columns of a view's stored query (`pg_rewrite.ev_action` of its `_RETURN`
 * rule) that are plain column references, with the relation and column each
 * comes from (Postgres's own `resorigtbl`/`resorigcol`). Only the top-level
 * query's target list is read; a computed column has no origin and is left out.
 */
export function viewColumnOrigins(evAction: string): ViewColumnOrigin[] {
  const tokens = tokenize(evAction);
  // The tree is `({QUERY ... :targetList ({TARGETENTRY ...} ...) ...})`: the top
  // query's fields sit at depth 2, its target entries' fields at depth 4.
  let depth = 0;
  let start = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === "open") depth++;
    else if (t.kind === "close") depth--;
    else if (depth === 2 && t.text === ":targetList") {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return [];
  const origins: ViewColumnOrigin[] = [];
  depth = 2;
  let entry: Map<string, string> | null = null;
  let lastKey: string | null = null;
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === "open") {
      depth++;
      if (depth === 4 && t.char === "{") {
        entry = new Map();
        lastKey = null;
      }
      continue;
    }
    if (t.kind === "close") {
      if (depth === 4 && entry) {
        const relation = Number(entry.get(":resorigtbl"));
        const column = Number(entry.get(":resorigcol"));
        const position = Number(entry.get(":resno"));
        const name = entry.get(":resname") ?? "";
        if (entry.get(":resjunk") !== "true" && position > 0 && relation > 0 && column > 0) {
          origins.push({ position, name, relation, column });
        }
        entry = null;
      }
      depth--;
      if (depth <= 2) break;
      continue;
    }
    if (depth !== 4 || !entry) continue;
    if (t.text === "TARGETENTRY") continue;
    if (t.text.startsWith(":")) lastKey = t.text;
    else if (lastKey) {
      entry.set(lastKey, t.text);
      lastKey = null;
    }
  }
  return origins;
}

/** Strip parentheses that wrap the whole expression. */
function unwrap(expr: string): string {
  let s = expr.trim();
  for (;;) {
    if (!s.startsWith("(") || !s.endsWith(")")) return s;
    let depth = 0;
    let inQuote = false;
    let wrapsAll = true;
    for (let i = 0; i < s.length; i++) {
      const c = s[i]!;
      if (c === "'") inQuote = !inQuote;
      if (inQuote) continue;
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0 && i < s.length - 1) {
          wrapsAll = false;
          break;
        }
      }
    }
    if (!wrapsAll) return s;
    s = s.slice(1, -1).trim();
  }
}

/** Split on `separator` where it isn't inside parentheses or a quoted string. */
function splitTopLevel(expr: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let from = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    if (c === "'") inQuote = !inQuote;
    if (inQuote) continue;
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && expr.startsWith(separator, i)) {
      parts.push(expr.slice(from, i));
      from = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(expr.slice(from));
  return parts;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A type cast as `pg_get_constraintdef` prints it: `::text`, `::character varying(10)`. */
const CAST = String.raw`::[a-z][a-z ]*(?:\(\d+(?:,\d+)?\))?`;
const LITERAL = String.raw`'((?:[^']|'')*)'${CAST}`;

/**
 * The values a column's CHECK constraint lists, from its definition as
 * `pg_get_constraintdef` prints it: `col IN ('a', 'b')` (printed as
 * `col = ANY (ARRAY[...])`), `col = 'a'`, either one or'd with `col IS NULL`.
 * Anything else, including a check that isn't about `column`, is `undefined`.
 */
export function checkEnumValues(definition: string, column: string): string[] | undefined {
  const outer = /^CHECK \((.*)\)(?: NOT VALID)?$/s.exec(definition.trim());
  if (!outer) return undefined;
  // Postgres quotes an identifier that isn't plain lower-case; accept either spelling.
  const ident = `(?:${escapeRegExp(column)}|${escapeRegExp(`"${column.replace(/"/g, '""')}"`)})`;
  const ref = String.raw`(?:${ident}|\(${ident}\)${CAST})`;
  let body = unwrap(outer[1]!);
  const parts = splitTopLevel(body, " OR ");
  if (parts.length === 2) {
    const isNull = new RegExp(`^${ref} IS NULL$`);
    const nullAt = parts.findIndex((p) => isNull.test(unwrap(p)));
    if (nullAt < 0) return undefined;
    body = unwrap(parts[1 - nullAt]!);
  } else if (parts.length !== 1) {
    return undefined;
  }
  const single = new RegExp(`^${ref} = ${LITERAL}$`).exec(body);
  if (single) return [single[1]!.replace(/''/g, "'")];
  const any = new RegExp(String.raw`^${ref} = ANY \((.*)\)$`).exec(body);
  if (!any) return undefined;
  const list = /^\(?ARRAY\[(.*?)\](?:\)(?:::[a-z][a-z ]*(?:\(\d+\))?\[\]))?$/s.exec(unwrap(any[1]!));
  if (!list) return undefined;
  const items = splitTopLevel(list[1]!, ", ");
  const values: string[] = [];
  const literal = new RegExp(`^${LITERAL}$`);
  for (const item of items) {
    const m = literal.exec(item.trim());
    if (!m) return undefined;
    values.push(m[1]!.replace(/''/g, "'"));
  }
  return values.length ? values : undefined;
}
