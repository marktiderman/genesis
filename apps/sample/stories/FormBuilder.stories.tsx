import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { FormBuilder, type BuilderTab, type FormBuilderHandle } from "@marktiderman/genesis-forms-builder";
import { Button } from "@marktiderman/genesis-ui/button";
import { Tabs, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";

/** The Figma sample: a rating that jumps on a low or a top score, a consent question and two endings. */
const checkIn = (): FormDefinition => ({
  schemaVersion: 1,
  id: "saturday-check-in",
  title: "Saturday check-in",
  layout: { mode: "focus" },
  blocks: [
    { kind: "field", id: "q_score", key: "score", type: "rating", label: "How was today's class?", props: { max: 5, display: "stars", lowLabel: "Rough", highLabel: "Great" } },
    { kind: "field", id: "q_wrong", key: "wrong", type: "short-text", label: "What went wrong?" },
    { kind: "field", id: "q_photo", key: "photo", type: "consent", label: "Photo consent", required: true },
  ],
  logic: [
    { id: "r_low", effect: "jump", from: "q_score", to: "q_wrong", when: { op: "lte", left: { field: "q_score" }, right: { value: 2 } } },
    { id: "r_top", effect: "jump", from: "q_score", to: { ending: "loved" }, when: { op: "eq", left: { field: "q_score" }, right: { value: 5 } } },
  ],
  endings: [
    { id: "default", title: "Thanks for your answers.", description: "We read every response." },
    { id: "loved", title: "Glad you loved it!", description: "Share it with a friend who'd love class." },
  ],
});

const meta: Meta<typeof FormBuilder> = {
  title: "Forms/FormBuilder",
  component: FormBuilder,
  parameters: { layout: "fullscreen" },
  args: { defaultValue: checkIn(), brand: { name: "Hilltop Fitness" } },
  decorators: [(Story) => <div className="p-6">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof FormBuilder>;

/** The builder with its own toolbar and tabs. */
export const Questions: Story = {};

export const LogicAndEndings: Story = { args: { defaultTab: "logic" } };

export const ReadOnly: Story = { args: { readOnly: true } };

/** As a host embeds it: its own header with Undo/Redo, its own tabs, and the builder's toolbar hidden. */
export const HostedWithoutToolbar: Story = {
  render: (args) => {
    const builder = useRef<FormBuilderHandle>(null);
    const [tab, setTab] = useState<BuilderTab>("questions");
    const [history, setHistory] = useState({ canUndo: false, canRedo: false });
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-2xl font-semibold">Saturday check-in</h1>
          <Button variant="ghost" disabled={!history.canUndo} onClick={() => builder.current?.undo?.()}>
            Undo
          </Button>
          <Button variant="ghost" disabled={!history.canRedo} onClick={() => builder.current?.redo?.()}>
            Redo
          </Button>
        </div>
        <Tabs defaultValue="questions" value={tab} onValueChange={(v) => setTab(v as BuilderTab)}>
          <TabsList>
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="logic">Logic and endings</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>
        <FormBuilder {...args} ref={builder} toolbar={false} tabs={false} tab={tab} onTabChange={setTab} onHistoryChange={setHistory} />
      </div>
    );
  },
};
