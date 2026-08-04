/**
 * Shared spacing and layout tokens for all Genesis projects.
 */

export const borderRadius = {
  sm: "calc(var(--radius) - 4px)",
  md: "calc(var(--radius) - 2px)",
  lg: "var(--radius)",
  xl: "calc(var(--radius) + 4px)",
  full: "9999px",
} as const;

export const spacing = {
  page: { x: "1rem", sm: "1.5rem", lg: "2rem" },
  card: { padding: "1.25rem" },
  section: { gap: "2rem" },
} as const;
