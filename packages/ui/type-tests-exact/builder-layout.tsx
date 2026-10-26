/**
 * Consumer type test for BuilderLayout, against the BUILT package with
 * `exactOptionalPropertyTypes` on: a host's own optional props pass straight through.
 */
import type { ReactNode } from "react";
import { BuilderLayout, type BuilderLayoutSlotProps } from "@marktiderman/genesis-ui/builder-layout";
import { BuilderLayout as FromLayout } from "@marktiderman/genesis-ui/layout";
import { BuilderLayout as FromRoot } from "@marktiderman/genesis-ui";

declare const maybe: {
  outline?: ReactNode;
  preview?: ReactNode;
  outlineLabel?: string;
  previewLabel?: string;
  previewHidden?: boolean;
  scrollSticky?: boolean;
  previewProps?: BuilderLayoutSlotProps;
};

export const all = (
  <BuilderLayout
    outline={maybe.outline}
    editor={<div />}
    preview={maybe.preview}
    outlineLabel={maybe.outlineLabel}
    previewLabel={maybe.previewLabel}
    previewHidden={maybe.previewHidden}
    sticky={{ preview: true }}
    scrollSticky={maybe.scrollSticky}
    previewProps={maybe.previewProps}
    outlineProps={{ className: "space-y-3", "data-testid": "outline" }}
  />
);
export const layout = <FromLayout editor="e" sticky />;
export const root = <FromRoot editor="e" />;

// @ts-expect-error: the editor is required.
export const missing = <BuilderLayout preview="p" />;
