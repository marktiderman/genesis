/**
 * Shared semantic colors used across all Genesis projects.
 * Brand-specific primary colors belong in presets, not here.
 */

export const neutral = {
  50: "#FAFAFA",
  100: "#F4F4F5",
  200: "#E4E4E7",
  300: "#D4D8DD",
  400: "#A1A1AA",
  500: "#71717A",
  600: "#52525B",
  700: "#3F3F46",
  800: "#27272A",
  900: "#18181B",
} as const;

export const semantic = {
  success: { DEFAULT: "#10B981", light: "#D1FAE5", dark: "#065F46" },
  warning: { DEFAULT: "#F59E0B", light: "#FEF3C7", dark: "#92400E" },
  error: { DEFAULT: "#EF4444", light: "#FEE2E2", dark: "#991B1B" },
  info: { DEFAULT: "#3B82F6", light: "#DBEAFE", dark: "#1E40AF" },
} as const;

export const status = {
  active: semantic.success.DEFAULT,
  inactive: neutral[400],
  pending: semantic.warning.DEFAULT,
  blocked: semantic.error.DEFAULT,
  draft: neutral[500],
  archived: neutral[300],
  // Progress/health statuses — the EOS/OKR-style "RAG" (red/amber/green)
  // goal-tracking vocabulary plus common task-lifecycle states. Consumed
  // 1:1 by genesis-ui's `StatusBadge` CVA variants (see components/ui/
  // status-badge.tsx) so a consumer's status string maps straight to a
  // token-backed badge instead of a hand-rolled color lookup.
  onTrack: semantic.success.DEFAULT,
  atRisk: semantic.warning.DEFAULT,
  offTrack: semantic.error.DEFAULT,
  done: semantic.success.DEFAULT,
  inProgress: semantic.info.DEFAULT,
} as const;
