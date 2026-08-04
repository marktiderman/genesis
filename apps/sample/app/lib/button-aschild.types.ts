/**
 * Compile-time guard for `Button`'s `asChild` typing.
 *
 * `packages/ui` has no `typecheck` script of its own (its types are only
 * exercised through tsup's dts build, which covers the emitted surface, not
 * usage). This file lives in `apps/sample` — which CI DOES typecheck — so
 * the consumer-facing contract below is enforced on every PR rather than
 * spot-checked once.
 *
 * What it locks in: in `asChild` mode Slot forwards ref/handlers to the
 * CHILD element, so they must be typed against `HTMLElement`, not
 * `HTMLButtonElement`. Otherwise an anchor ref is rejected outright, and —
 * the dangerous direction — a handler typechecks against button-only
 * members like `.form` while actually receiving an anchor at runtime.
 *
 * Type-only: no runtime export, nothing imports this at runtime.
 */
import { createRef } from "react";
import type { ButtonAsChildProps, ButtonProps } from "@marktiderman/genesis-ui";

// ---------------------------------------------------------------------------
// asChild: ref follows the rendered child element.
// ---------------------------------------------------------------------------

const anchorRef = createRef<HTMLAnchorElement>();

// An anchor ref is valid for an asChild Button (this is what Slot forwards to).
export const asChildAnchorRef: ButtonAsChildProps["ref"] = anchorRef;

// ---------------------------------------------------------------------------
// asChild: handlers must NOT expose button-only members.
// ---------------------------------------------------------------------------

export const asChildClick: ButtonAsChildProps["onClick"] = (event) => {
  // Generic HTMLElement members stay available.
  void event.currentTarget.className;
  // @ts-expect-error `.form` is button-only; the runtime target here is
  // whatever element the consumer slotted in (typically an anchor).
  void event.currentTarget.form;
};

// ---------------------------------------------------------------------------
// Default (<button>) mode keeps the precise button typing it always had.
// ---------------------------------------------------------------------------

export const buttonRef: ButtonProps["ref"] = createRef<HTMLButtonElement>();

export const buttonClick: ButtonProps["onClick"] = (event) => {
  // Still a real HTMLButtonElement here, so `.form` is legitimately reachable.
  void event.currentTarget.form;
};

// `disabled` is accepted in BOTH modes — in asChild mode Button converts it
// to aria-disabled + activation blocking rather than the inert attribute.
export const asChildDisabled: ButtonAsChildProps["disabled"] = true;
export const buttonDisabled: ButtonProps["disabled"] = true;
