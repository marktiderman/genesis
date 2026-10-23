import { useState, type ComponentType, type ReactNode } from "react";
import { Button, EmptyState, Skeleton, cn } from "@marktiderman/genesis-ui";
import {
  CircleCheck,
  CircleDot,
  Gauge,
  Inbox,
  ListChecks,
  SquareCheck,
  Star,
  Type,
  type LucideProps,
} from "lucide-react";
import { dayLabel } from "./generic/days";
import { SummaryCard } from "./generic/SummaryCard";
import { lowScaleAtMost } from "./summary";
import type { ChoiceSummary, QuestionSummary, ScaleSummary, TextSummary } from "./summary";

const FIRST_TEXT = 5;
const MORE_TEXT = 10;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ICONS: Record<string, ComponentType<LucideProps>> = {
  rating: Star,
  nps: Gauge,
  consent: SquareCheck,
  "yes-no": CircleCheck,
  "single-choice": CircleDot,
  dropdown: CircleDot,
  "multi-choice": ListChecks,
};

/** A bar as wide as its share; low scores in the warning colour. */
function Bar({ share, low = false }: { share: number; low?: boolean }) {
  return (
    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span
        className={cn("block h-full rounded-full", low ? "bg-warning" : "bg-primary")}
        style={{ width: `${Math.max(0, Math.min(100, share))}%` }}
      />
    </span>
  );
}

function ScaleBody({ s }: { s: ScaleSummary }) {
  const most = Math.max(1, ...s.buckets.map((b) => b.count));
  const atMost = lowScaleAtMost(s.type, s.max);
  return (
    <>
      {s.nps ? (
        <p className="text-sm">
          <span className="text-2xl font-semibold tabular-nums">{s.nps.score}</span>{" "}
          <span className="text-muted-foreground">NPS</span>
          <span className="block text-xs text-muted-foreground">
            {plural(s.nps.promoters, "promoter")} (9–10), {plural(s.nps.passives, "passive")} (7–8),{" "}
            {plural(s.nps.detractors, "detractor")} (0–6)
          </span>
        </p>
      ) : null}
      <ul className="space-y-2" aria-label="Answers by score">
        {[...s.buckets].reverse().map((b) => (
          <li key={b.value} className="grid grid-cols-[2.25rem_1fr_2rem] items-center gap-3 text-sm">
            <span className="flex items-center gap-1 tabular-nums">
              {b.value}
              {s.type === "rating" ? <Star className="size-3 fill-current" aria-label="stars" /> : null}
            </span>
            <Bar share={(b.count / most) * 100} low={b.value <= atMost} />
            <span className="text-right tabular-nums text-muted-foreground">{b.count}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Two-way questions (consent, yes/no) as one split bar; others as a bar per option. */
function ChoiceBody({ s }: { s: ChoiceSummary }) {
  if (s.fieldType === "consent" || s.fieldType === "yes-no") {
    const yes = s.options.find((o) => o.value === "true");
    const no = s.options.find((o) => o.value === "false");
    return (
      <>
        <span className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="h-full bg-primary" style={{ width: `${yes?.percent ?? 0}%` }} />
        </span>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {yes ? (
            <span className="text-emerald-700 dark:text-emerald-300">
              {yes.label} · {yes.count} ({Math.round(yes.percent)}%)
            </span>
          ) : null}
          {no ? (
            <span className="text-muted-foreground">
              {no.label} · {no.count}
            </span>
          ) : null}
        </p>
      </>
    );
  }
  const most = Math.max(1, ...s.options.map((o) => o.count));
  return (
    <>
      <ul className="space-y-2">
        {s.options.map((o) => (
          <li key={o.value} className="grid grid-cols-[minmax(2rem,12rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate" title={o.label}>
              {o.label}
            </span>
            <Bar share={(o.count / most) * 100} />
            <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
              {o.count} · {Math.round(o.percent)}%
            </span>
          </li>
        ))}
      </ul>
      {s.multiple ? <p className="text-xs text-muted-foreground">People could pick more than one.</p> : null}
    </>
  );
}

function TextBody({
  s,
  today,
  answerMeta,
}: {
  s: TextSummary;
  today?: string | undefined;
  answerMeta?: ((id: string) => ReactNode) | undefined;
}) {
  const [shown, setShown] = useState(FIRST_TEXT);
  const left = s.answers.length - shown;
  return (
    <>
      <ul className="space-y-3">
        {s.answers.slice(0, shown).map((a) => {
          const meta = answerMeta?.(a.id);
          return (
            <li key={a.id} className="border-l-2 border-border pl-3">
              <p className="whitespace-pre-wrap break-words text-sm">“{a.text}”</p>
              <p className="text-xs text-muted-foreground">
                {dayLabel(a.date, today)}
                {meta ? <> · {meta}</> : null}
              </p>
            </li>
          );
        })}
      </ul>
      {left > 0 ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShown((n) => n + MORE_TEXT)}>
          Show more ({left} more)
        </Button>
      ) : null}
    </>
  );
}

/** One question's card: its type icon, title and answer count, then its spread. */
export function QuestionSummaryCard({
  summary: s,
  today,
  answerMeta,
}: {
  summary: QuestionSummary;
  today?: string | undefined;
  answerMeta?: ((id: string) => ReactNode) | undefined;
}) {
  const Icon = ICONS[s.fieldType] ?? Type;
  const average = s.kind === "scale" && s.average !== null ? ` · average ${s.average.toFixed(1)}` : "";
  return (
    <SummaryCard
      icon={<Icon />}
      title={s.label || "Untitled question"}
      meta={s.count ? `${plural(s.count, "answer")}${average}` : "No answers yet"}
      testID={`summary-${s.key}`}
    >
      {s.count > 0 ? (
        s.kind === "scale" ? (
          <ScaleBody s={s} />
        ) : s.kind === "choice" ? (
          <ChoiceBody s={s} />
        ) : (
          <TextBody s={s} today={today} answerMeta={answerMeta} />
        )
      ) : null}
    </SummaryCard>
  );
}

/**
 * A form's responses question by question (summarizeResponses): each rating or NPS
 * question's spread with low scores marked, counts for each choice, consent and yes/no
 * as one split bar, and the latest written answers.
 */
export function QuestionSummaryCards({
  summaries,
  responses,
  isLoading = false,
  emptyTitle = "No responses yet",
  emptyDescription,
  onClearFilters,
  today,
  answerMeta,
  className,
}: {
  summaries: readonly QuestionSummary[];
  /** How many responses the summaries cover. */
  responses: number;
  isLoading?: boolean | undefined;
  emptyTitle?: string | undefined;
  emptyDescription?: string | undefined;
  /** Given while filters are on: an empty summary then says so, with a way out. */
  onClearFilters?: (() => void) | undefined;
  /** Today (YYYY-MM-DD) on the responses' clock, so written answers say "Today". */
  today?: string | undefined;
  /** Extra words after a written answer's day, by response id: "6:00 WOD · rated 2". */
  answerMeta?: ((id: string) => ReactNode) | undefined;
  className?: string | undefined;
}) {
  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }
  if (!responses) {
    return (
      <EmptyState
        icon={Inbox}
        title={emptyTitle}
        {...(emptyDescription ? { description: emptyDescription } : {})}
        hasFilters={!!onClearFilters}
        {...(onClearFilters ? { onClearFilters } : {})}
      />
    );
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {summaries.map((s) => (
        <QuestionSummaryCard key={s.key} summary={s} today={today} answerMeta={answerMeta} />
      ))}
    </div>
  );
}
