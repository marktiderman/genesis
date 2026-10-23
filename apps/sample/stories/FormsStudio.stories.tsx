import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, DefaultLink, Input, ToggleRow, SettingsRow } from "@marktiderman/genesis-ui";
import { SubNavTabs } from "@marktiderman/genesis-ui/layout";
import {
  FollowUpList,
  HeadlineNumbers,
  QuestionSummaryCards,
  ReadinessChip,
  ResourceHeader,
  ResourceSettingsPage,
  ResponsesFilters,
  ResponsesToolbar,
  ShareDialog,
  comparisonFilter,
  dayLabel,
  filterResponses,
  formCounts,
  formNavItems,
  formStatusChip,
  headlineCards,
  headlineNumbers,
  highestRating,
  isFiltered,
  lowRatingLabel,
  needsFollowUp,
  NO_FILTERS,
  summarizeResponses,
  toResponseFilter,
  type FiltersValue,
  type FormTab,
  type ResponsesView,
} from "@marktiderman/genesis-forms-studio";
import { Bell, Clock, Download, FileText, Link2, Plug, Sheet, User, Users } from "lucide-react";
import { checkIn, items, TODAY } from "./__fixtures__/forms-studio";

const items_ = items;

const meta: Meta = { title: "Forms/Studio" };
export default meta;
type Story = StoryObj;

function Header() {
  return (
    <ResourceHeader
      title="E2E Saturday check-in"
      parent={<a href="#forms">Forms</a>}
      status={formStatusChip("live", 1)}
      saveState="saved"
      onUndo={() => {}}
      onRedo={() => {}}
      canRedo={false}
      onPreview={() => {}}
      onShare={() => {}}
      publish={{ onClick: () => {}, label: "Publish changes" }}
    />
  );
}

function Tabs({ tab, onTab }: { tab: FormTab; onTab: (t: FormTab) => void }) {
  const counts = formCounts(checkIn);
  const items = formNavItems("/form", { ...counts, responses: items_.length });
  const active = items.find((i) => i.id === tab)!;
  // In an app the shell renders this row (useAppShellSubNav, AppShellSubNavEnd).
  return (
    <div onClickCapture={(e) => {
      const a = (e.target as HTMLElement).closest("a");
      const hit = a && items.find((i) => a.getAttribute("href") === i.to);
      if (hit) {
        e.preventDefault();
        onTab(hit.id);
      }
    }}>
      <SubNavTabs
        items={items}
        activePath={active.to}
        linkComponent={DefaultLink}
        label="Form"
        end={<ReadinessChip readiness={{ state: "ready", count: 0 }} />}
      />
    </div>
  );
}

/** The header and the form's row of tabs (the shell's SubNavTabs), with the readiness chip. */
export const HeaderAndTabs: Story = {
  render: function Render() {
    const [tab, setTab] = useState<FormTab>("questions");
    return (
      <div className="space-y-4">
        <Header />
        <Tabs tab={tab} onTab={setTab} />
      </div>
    );
  },
};

function Responses() {
  const [view, setView] = useState<ResponsesView>("summary");
  const [filters, setFilters] = useState<FiltersValue>({ ...NO_FILTERS, when: "week" });
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const definitions = [checkIn];
  const filter = toResponseFilter(filters, TODAY);
  const shown = filterResponses(items, filter);
  const before = comparisonFilter(filters, TODAY);
  const headline = headlineNumbers(shown, definitions, before ? { previous: filterResponses(items, before.filter) } : {});
  const follow = useMemo(
    () => needsFollowUp(shown, { isHandled: (i) => handled.has(i.id) }),
    [shown, handled],
  );
  const extra = (id: string) => items.find((i) => i.id === id)?.extra ?? {};
  return (
    <div className="space-y-4">
      <ResponsesToolbar
        view={view}
        onViewChange={setView}
        filters={
          <ResponsesFilters
            value={filters}
            onChange={setFilters}
            filtered={isFiltered(filter)}
            ratingMax={highestRating(definitions)}
            lowLabel={lowRatingLabel(definitions)}
            choices={[
              { key: "class", label: "Class", allLabel: "Any class", options: ["5:30 WOD", "6:00 WOD", "Noon WOD"] },
              { key: "coach", label: "Coach", allLabel: "Any coach", options: ["Casey", "Leo"], icon: <User /> },
            ]}
          />
        }
        actions={
          <>
            <Button variant="outline" startIcon={<Sheet className="size-4" />} testID="studio-sheet">Sheet</Button>
            <Button variant="outline" startIcon={<Download className="size-4" />} testID="studio-csv">Download CSV</Button>
          </>
        }
      />
      <HeadlineNumbers numbers={headlineCards(headline, { period: before?.label })} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <QuestionSummaryCards
          summaries={summarizeResponses(shown, definitions)}
          responses={shown.length}
          today={TODAY}
          answerMeta={(id) => `${extra(id)["class"]} · rated ${items.find((i) => i.id === id)?.answers["r"]}`}
        />
        <FollowUpList
          className="lg:self-start"
          entries={follow.map((f) => {
            const x = f.item.extra ?? {};
            return {
              id: f.item.id,
              name: String(x["name"] || "Anonymous"),
              ...(x["who"] ? { tag: { label: String(x["who"]), tone: x["who"] === "Member" ? ("success" as const) : ("muted" as const) } } : {}),
              meta: `${dayLabel(f.item.date, TODAY)} · ${x["class"]} · ${x["coach"]}`,
              comment: f.comment,
              rating: f.rating,
            };
          })}
          actions={(e) => (
            <>
              <Button variant="outline" size="sm" testID={`studio-reply-${e.id}`}>Reply</Button>
              <Button variant="outline" size="sm" testID={`studio-handled-${e.id}`} onClick={() => setHandled((s) => new Set(s).add(e.id))}>
                Mark handled
              </Button>
            </>
          )}
        />
      </div>
    </div>
  );
}

/** The Responses tab: toolbar, headline numbers, question cards and Needs a follow-up. */
export const ResponsesTab: Story = {
  render: () => (
    <div className="space-y-4">
      <Header />
      <Tabs tab="responses" onTab={() => {}} />
      <Responses />
    </div>
  ),
};

/** The Settings tab: one page with jump links and a card per group. */
export const SettingsTab: Story = {
  render: () => (
    <ResourceSettingsPage
      sections={[
        { id: "form", title: "Form", icon: <FileText />, description: "What people see at the top, and how the questions are laid out.", content: (
          <SettingsRow label="Title" description="Shown at the top of the form." htmlFor="s-title">
            <Input id="s-title" defaultValue="E2E Saturday check-in" className="w-64" />
          </SettingsRow>
        ) },
        { id: "sharing", title: "Sharing", icon: <Link2 />, description: "The link people open, and other ways to send it.", content: (
          <SettingsRow label="Link" description="Change the last part here." htmlFor="s-link">
            <Input id="s-link" defaultValue="e2e-saturday-check-in" className="w-64" />
          </SettingsRow>
        ) },
        { id: "open", title: "When it's open", icon: <Clock />, description: "Pause, schedule or cap responses.", content: (
          <ToggleRow label="Taking responses" description="Turn off to pause the form." defaultChecked />
        ) },
        { id: "who", title: "Who can answer", icon: <Users />, description: "Privacy and how many times people can respond.", content: (
          <>
            <ToggleRow label="Anonymous" description="Don't ask for name, email or phone." />
            <ToggleRow label="One response per person" description="People who already answered can't send another." />
          </>
        ) },
        { id: "notify", title: "Notifications", icon: <Bell />, description: "Who hears about new responses.", content: (
          <ToggleRow label="Email respondents a copy" description="Needs an email question." />
        ) },
        { id: "connections", title: "Connections", icon: <Plug />, description: "Send every response somewhere else as well.", content: (
          <SettingsRow label="Google Sheet" description="Each response becomes a new row within seconds.">
            <Button testID="studio-connect-sheet">Connect a Google Sheet</Button>
          </SettingsRow>
        ) },
      ]}
    />
  ),
};

/** The Share dialog, open on its link. */
export const Share: Story = {
  render: () => (
    <ShareDialog
      open
      onOpenChange={() => {}}
      url="https://feedback.example.com/f/e2e-saturday-check-in"
      name="E2E Saturday check-in"
      prefill={[{ key: "class", label: "Class", anyLabel: "Any class", options: [{ value: "6:00 WOD", label: "6:00 WOD" }] }]}
      prefillNote="Responses through it are marked with that class."
    />
  ),
};
