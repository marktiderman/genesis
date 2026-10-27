// /rules describes a form's child navigation items by shape, without importing genesis-ui.
// Compiled against the built .d.ts: they stay assignable to genesis-ui's SubNavItem, with or
// without icons, so `useAppShellSubNav(formNavItems(...))` keeps working.
import type { SubNavItem } from "@marktiderman/genesis-ui/layout";
import type { LucideIcon } from "lucide-react";
import { FORM_NAV_ICONS } from "@marktiderman/genesis-forms-studio";
import {
  formNavItems,
  type FormNavItem,
  type NavItemShape,
} from "@marktiderman/genesis-forms-studio/rules";

declare const plain: FormNavItem;
declare const withIcons: FormNavItem<LucideIcon>;
declare const sub: SubNavItem;

export const a: SubNavItem = plain;
export const b: SubNavItem = withIcons;
export const c: SubNavItem[] = formNavItems("/forms/f1", { questions: 2 });
export const d: SubNavItem[] = formNavItems("/forms/f1", {}, FORM_NAV_ICONS);
export const e: SubNavItem[] = formNavItems((tab) => `/forms/f1/${tab}`, {}, { settings: FORM_NAV_ICONS.settings });
// The shape is no stricter than SubNavItem: every SubNavItem is one.
export const f: NavItemShape<LucideIcon> = sub;

// An icon that isn't a LucideIcon does not pass for a SubNavItem.
declare const odd: FormNavItem<string>;
// @ts-expect-error a string icon is not a LucideIcon
export const g: SubNavItem = odd;
