/**
 * Convert a key string to title case.
 *   "created_at" -> "Created At"
 *   "firstName"  -> "First Name"
 */
export function titleCase(str: string): string {
  // Split on underscores, hyphens, and camelCase boundaries
  const words = str
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase -> camel Case
    .replace(/[_-]/g, " ") // snake_case / kebab-case -> spaces
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
