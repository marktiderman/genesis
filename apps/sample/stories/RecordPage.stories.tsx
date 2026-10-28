import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Button, Input, SettingsRow, ToggleRow } from "@marktiderman/genesis-ui";
import {
  HeadlineNumbers,
  ReadinessChip,
  ResourceHeader,
  ResourceSettingsPage,
  ShareDialog,
  SummaryCard,
  readinessOf,
  type SaveState,
} from "@marktiderman/genesis-ui/resource";
import { BookOpen, Clock, Link2, PlayCircle, Users } from "lucide-react";

// The resource page with a course, not a form: every noun comes from the host.
const meta: Meta = { title: "Patterns/RecordPage" };
export default meta;
type Story = StoryObj;

const findings = [{ level: "warning" as const, code: "lesson-no-video" }];

function Header({ saveState = "saved" }: { saveState?: SaveState }) {
  const [sharing, setSharing] = useState(false);
  return (
    <>
      <ResourceHeader
        title="Intro to strength"
        parent={<a href="#courses">Courses</a>}
        status={{ label: "Live · version 2", tone: "success" }}
        saveState={saveState}
        onUndo={() => {}}
        onRedo={() => {}}
        canRedo={false}
        onPreview={() => {}}
        onShare={() => setSharing(true)}
        publish={{ onClick: () => {}, label: "Publish changes" }}
        actions={<ReadinessChip readiness={readinessOf(findings, { emptyCode: "no-lessons" })} />}
      />
      <ShareDialog
        open={sharing}
        onOpenChange={setSharing}
        noun="course"
        description="Anyone with the link can enrol."
        url="https://app.example.com/c/intro-to-strength"
        name="Intro to strength"
        prefill={[
          {
            key: "location",
            label: "Location",
            anyLabel: "Any location",
            options: [
              { value: "north", label: "North hall" },
              { value: "south", label: "South hall" },
            ],
          },
        ]}
        prefillNote="A prefilled link fills in the location for the person who opens it."
      />
    </>
  );
}

/** A course page: the header with its status, save state and readiness chip, then headline numbers and summary cards. */
export const ResourcePageWithHeader: Story = {
  render: () => (
    <div className="space-y-6">
      <Header />
      <HeadlineNumbers
        numbers={[
          { key: "enrolled", label: "Enrolled", value: 48, detail: "+6 vs last month", tone: "positive" },
          { key: "completed", label: "Completed", value: "62%", detail: "30 of 48" },
          { key: "rating", label: "Average rating", value: "4.4 / 5", detail: "Up 0.2", tone: "positive" },
          { key: "stuck", label: "Stuck on a lesson", value: 5, detail: "Needs a nudge", tone: "warning" },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard icon={<PlayCircle />} title="Lesson 1 · Hinge basics" meta="46 finished · average 4.6">
          <p className="text-sm text-muted-foreground">Most people finish it in one sitting.</p>
        </SummaryCard>
        <SummaryCard icon={<PlayCircle />} title="Lesson 2 · Squat patterns" meta="31 finished · average 4.1">
          <p className="text-sm text-muted-foreground">5 people stopped halfway through the video.</p>
        </SummaryCard>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: "Intro to strength" })).toBeVisible();
    await expect(canvas.getByTestId("readiness")).toHaveTextContent("1 to check");
    await expect(canvas.getByTestId("headline-enrolled")).toHaveTextContent("Enrolled48+6 vs last month");
  },
};

/** The readiness chip in each state, in neutral words (the host can rename any of them). */
export const ReadinessStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ReadinessChip readiness={{ state: "ready", count: 0 }} />
      <ReadinessChip readiness={{ state: "warnings", count: 2 }} />
      <ReadinessChip readiness={{ state: "problems", count: 3 }} onClick={() => {}} />
      <ReadinessChip readiness={{ state: "pending", count: 0 }} />
      <ReadinessChip readiness={{ state: "empty", count: 0 }} />
      <ReadinessChip readiness={{ state: "empty", count: 0 }} labels={{ empty: "Add a lesson" }} />
    </div>
  ),
};

/** A course's settings: jump links on the left, a card per group. */
export const SettingsPage: Story = {
  render: () => (
    <ResourceSettingsPage
      sections={[
        {
          id: "course",
          title: "Course",
          icon: <BookOpen />,
          description: "What people see on the course page.",
          content: (
            <SettingsRow label="Title" description="Shown at the top of the course." htmlFor="c-title">
              <Input id="c-title" defaultValue="Intro to strength" className="w-64" />
            </SettingsRow>
          ),
        },
        {
          id: "sharing",
          title: "Sharing",
          icon: <Link2 />,
          description: "The link people open.",
          content: (
            <SettingsRow label="Link" description="Change the last part here." htmlFor="c-link">
              <Input id="c-link" defaultValue="intro-to-strength" className="w-64" />
            </SettingsRow>
          ),
        },
        {
          id: "enrolment",
          title: "Enrolment",
          icon: <Users />,
          description: "Who can join, and when.",
          content: <ToggleRow label="Open for enrolment" description="Turn off to stop new people joining." defaultChecked />,
        },
        {
          id: "schedule",
          title: "Schedule",
          icon: <Clock />,
          description: "When each lesson unlocks.",
          content: (
            <SettingsRow label="Drip lessons" description="Unlock one lesson a week.">
              <Button variant="outline">Set up</Button>
            </SettingsRow>
          ),
        },
      ]}
    />
  ),
};
