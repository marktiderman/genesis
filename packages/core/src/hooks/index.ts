// HOOK NAMESPACE CONVENTION (PRD-07 Phase A1.8 — locked at v0.1.1 publish)
//
// Hooks are grouped by domain. New hook categories live under
// `src/hooks/<category>/` (e.g., haptics, motion, theme, forms) and re-export
// from this root index. Consumers can import flat or by-category subpath:
//
//   import { useResource } from "@marktiderman/genesis-core";              // root
//   import { useResource } from "@marktiderman/genesis-core/hooks";        // category subpath
//
// FUTURE categories (planned per PRD-07 Track D):
//   - haptics  → src/hooks/haptics/   (haptics.useTier — useHaptics, etc.)
//   - motion   → src/hooks/motion/    (motion.useReducedMotion, spring presets)
//   - theme    → src/hooks/theme/     (theme.useScheme, theme.useColorMode)
//   - forms    → src/hooks/forms/     (forms.useField, useResourceForm migrates here)
//
// When adding a new hook, place it in the matching category directory and
// re-export from this index. Don't add hooks at the flat root — categorize
// them so the surface stays discoverable as the count grows.
//
// Today's hooks are data/form-shaped (resource fetching, form state, wizard
// flows). They live flat at `./` until forms category lands; at that point
// useResourceForm + useWizard migrate to `./forms/`.

export { useResource, type UseResourceOptions, type UseResourceReturn } from "./use-resource";
export { useOne, type UseOneOptions } from "./use-one";
export { useResourceForm, buildArrayItemDefaults, type UseResourceFormOptions, type UseResourceFormReturn } from "./use-resource-form";
export { useWizard, type WizardStep, type UseWizardReturn } from "./use-wizard";
