import type { Meta, StoryObj } from "@storybook/react-vite";
import { defineForm, f, when } from "@marktiderman/genesis-forms";
import { Form } from "@marktiderman/genesis-forms-web";
import { DEMO_ACCENT, DEMO_BANNER } from "./__fixtures__/form-theme";

const eventFeedback = defineForm({
  id: "event-feedback",
  title: "How was the event?",
  layout: { mode: "focus" },
  hidden: { owner: f.hidden.string({ source: "server" }) },
  blocks: [
    f.rating("overall", { label: "How was today's event?", required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [
        { value: "hosting", label: "Hosting" },
        { value: "content", label: "The content" },
        { value: "community", label: "Community" },
      ],
    }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:owner|someone}} to follow up with you?" }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [
    when("contact_me").isNot(true).hide("email"),
    when("overall").lessThan(4).jumpTo("improve"),
  ],
  endings: [{ id: "default", title: "Thanks! See you next time." }],
});

const meta: Meta<typeof Form> = {
  title: "Forms/Form",
  component: Form,
  parameters: { layout: "padded" },
  args: { form: eventFeedback, options: { hidden: { owner: "Sam" } } },
};
export default meta;
type Story = StoryObj<typeof Form>;

/** One question at a time, as respondents see it on a phone. */
export const Focus: Story = {};

/** Every visible question on one page. */
export const Classic: Story = { args: { layout: "classic" } };

const classBooking = defineForm({
  id: "class-booking",
  title: "Book a class",
  layout: { mode: "classic" },
  blocks: [
    f.dropdown("class", {
      label: "Which class?",
      required: true,
      options: [
        { value: "early", label: "Early morning" },
        { value: "evening", label: "Evening" },
      ],
    }),
    f.date("day", { label: "Which day?", required: true }),
    f.number("guests", { label: "How many guests?", min: 0, max: 5, step: 1 }),
    f.rating("last", { label: "How was your last class?", lowLabel: "Poor", highLabel: "Great" }),
    f.rating("stars", { label: "And as stars?", display: "stars" }),
    f.consent("terms", { label: "Booking terms", text: "I agree to the booking terms", required: true }),
  ],
});

/** Dropdown, date, number, end labels, stars and a consent checkbox, with "* Required". */
export const QuestionTypes: Story = { args: { form: classBooking, options: undefined } };

/** An accent colour and a header image; the accent is adjusted only as far as contrast needs. */
export const Themed: Story = {
  args: {
    form: classBooking,
    options: undefined,
    presentation: "page",
    brand: { name: "Acme Fitness" },
    theme: { accent: DEMO_ACCENT, headerImage: DEMO_BANNER },
  },
};
