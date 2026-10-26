/**
 * Consumer type test for the resource workspace, compiled against the BUILT package
 * (`dist`, through the package's own `exports`) with `exactOptionalPropertyTypes` on, as
 * a strict app sees it: a host's own optional props (`T | undefined`) pass straight
 * through. `pnpm --filter @marktiderman/genesis-ui typecheck` after a build.
 */
import type { ReactNode } from "react";
import {
  FollowUpList,
  HeadlineNumbers,
  ReadinessChip,
  ResourceHeader,
  ResourceSettingsPage,
  ResponsesToolbar,
  SettingsSection,
  ShareDialog,
  SummaryCard,
  type ReadinessLabels,
  type SaveState,
} from "@marktiderman/genesis-ui/resource";
import { dayLabel, readinessChip, readinessOf } from "@marktiderman/genesis-ui/resource/rules";
// The root barrel carries the family too.
import { ResourceHeader as RootHeader } from "@marktiderman/genesis-ui";

declare const maybe: {
  className?: string;
  saveState?: SaveState;
  onUndo?: () => void;
  canUndo?: boolean;
  onPreview?: () => void;
  isLoading?: boolean;
  defaultTab?: "link" | "qr" | "embed";
  noun?: string;
  description?: ReactNode;
  onClick?: () => void;
  labels?: ReadinessLabels;
  each?: string;
  noComment?: string;
  emptyCode?: string;
  pending?: boolean;
  today?: string;
};

export const views = (
  <>
    <ResourceHeader
      title="A"
      saveState={maybe.saveState}
      onUndo={maybe.onUndo}
      canUndo={maybe.canUndo}
      onPreview={maybe.onPreview}
      className={maybe.className}
    />
    <RootHeader title="A" />
    <ReadinessChip readiness={{ state: "ready", count: 0 }} onClick={maybe.onClick} labels={maybe.labels} />
    <ResponsesToolbar view="summary" onViewChange={() => {}} className={maybe.className} labels={{ each: maybe.each }} />
    <HeadlineNumbers numbers={[]} isLoading={maybe.isLoading} />
    <SummaryCard title="A" className={maybe.className} />
    <FollowUpList entries={[]} isLoading={maybe.isLoading} noComment={maybe.noComment} />
    <ShareDialog
      open
      onOpenChange={() => {}}
      url={null}
      name="A"
      defaultTab={maybe.defaultTab}
      noun={maybe.noun}
      description={maybe.description}
    />
    <SettingsSection title="A" className={maybe.className} />
    <ResourceSettingsPage sections={[{ id: "a", title: "A" }]} className={maybe.className} />
  </>
);

export const readiness = readinessChip(
  readinessOf([{ level: "error", code: maybe.emptyCode }], { emptyCode: maybe.emptyCode, pending: maybe.pending }),
  maybe.labels,
);
export const day: string = dayLabel("2026-10-26", maybe.today);
