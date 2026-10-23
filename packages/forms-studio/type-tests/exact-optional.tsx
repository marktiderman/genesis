// Compiled against the built .d.ts with exactOptionalPropertyTypes on: a host's own
// optional props pass straight through to the studio's components.
import type { ReactNode } from "react";
import {
  FollowUpList,
  HeadlineNumbers,
  QuestionSummaryCards,
  ReadinessChip,
  ResourceHeader,
  ResourceSettingsPage,
  ResponsesFilters,
  ResponsesToolbar,
  SettingsSection,
  ShareDialog,
  SummaryCard,
  type FiltersValue,
  type QuestionSummary,
  type SaveState,
} from "@marktiderman/genesis-forms-studio";
import { formNavItems, headlineNumbers, needsFollowUp } from "@marktiderman/genesis-forms-studio/rules";

declare const filters: FiltersValue;
declare const summaries: QuestionSummary[];
declare const maybe: {
  className?: string;
  saveState?: SaveState;
  onUndo?: () => void;
  canUndo?: boolean;
  onPreview?: () => void;
  isLoading?: boolean;
  today?: string;
  lowLabel?: string | null;
  ratingMax?: number | null;
  answerMeta?: (id: string) => ReactNode;
  defaultTab?: "link" | "qr" | "embed";
  noun?: string;
  onClick?: () => void;
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
    <ReadinessChip readiness={{ state: "ready", count: 0 }} onClick={maybe.onClick} />
    <ResponsesToolbar view="summary" onViewChange={() => {}} className={maybe.className} />
    <ResponsesFilters value={filters} onChange={() => {}} filtered={false} lowLabel={maybe.lowLabel} ratingMax={maybe.ratingMax} />
    <HeadlineNumbers numbers={[]} isLoading={maybe.isLoading} />
    <SummaryCard title="A" className={maybe.className} />
    <QuestionSummaryCards summaries={summaries} responses={1} today={maybe.today} answerMeta={maybe.answerMeta} />
    <FollowUpList entries={[]} isLoading={maybe.isLoading} />
    <ShareDialog open onOpenChange={() => {}} url={null} name="A" defaultTab={maybe.defaultTab} noun={maybe.noun} />
    <SettingsSection title="A" className={maybe.className} />
    <ResourceSettingsPage sections={[{ id: "a", title: "A" }]} className={maybe.className} />
  </>
);

export const numbers = headlineNumbers([], []);
export const list = needsFollowUp([]);
export const nav = formNavItems("/forms/f1");
