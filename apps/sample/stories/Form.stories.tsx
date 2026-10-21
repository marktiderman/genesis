import type { Meta, StoryObj } from "@storybook/react";
import { defineForm, f, when } from "@marktiderman/genesis-forms";
import { Form } from "@marktiderman/genesis-forms-web";

const afterClass = defineForm({
  id: "after-class",
  title: "How was class?",
  layout: { mode: "focus" },
  hidden: { coach: f.hidden.string({ source: "server" }) },
  blocks: [
    f.rating("overall", { label: "How was today's class?", required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [
        { value: "coaching", label: "Coaching" },
        { value: "workout", label: "The workout" },
        { value: "community", label: "Community" },
      ],
    }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:coach|a coach}} to follow up with you?" }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [
    when("contact_me").isNot(true).hide("email"),
    when("overall").lessThan(4).jumpTo("improve"),
  ],
  endings: [{ id: "default", title: "Thanks! See you at the next class." }],
});

const meta: Meta<typeof Form> = {
  title: "Forms/Form",
  component: Form,
  parameters: { layout: "padded" },
  args: { form: afterClass, options: { hidden: { coach: "Sam" } } },
};
export default meta;
type Story = StoryObj<typeof Form>;

/** One question at a time, as members see it on a phone. */
export const Focus: Story = {};

/** Every visible question on one page. */
export const Classic: Story = { args: { layout: "classic" } };
