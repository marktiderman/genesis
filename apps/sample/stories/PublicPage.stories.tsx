import type { Meta, StoryObj } from "@storybook/react-vite";
import { defineForm, f } from "@marktiderman/genesis-forms";
import { Form } from "@marktiderman/genesis-forms-web";
import { PublicPage } from "@marktiderman/genesis-ui/layout";
import { Button } from "@marktiderman/genesis-ui";
import { LOW_CONTRAST_BRAND, PASSING_BRAND } from "./__fixtures__/public-brands";
import { PUBLIC_VIEWPORTS } from "./__fixtures__/viewports";

const meta: Meta<typeof PublicPage> = {
  title: "Foundation/Layout/PublicPage",
  component: PublicPage,
  parameters: { layout: "fullscreen", viewport: { options: PUBLIC_VIEWPORTS } },
};
export default meta;
type Story = StoryObj<typeof PublicPage>;

const booking = defineForm({
  id: "public-booking",
  title: "Book a first appointment",
  layout: { mode: "classic" },
  blocks: [
    f.shortText("name", { label: "Your name", required: true }),
    f.email("email", { label: "Email", required: true }),
    f.dropdown("reason", {
      label: "What brings you in?",
      options: [
        { value: "injury", label: "A recent injury" },
        { value: "pain", label: "Ongoing pain" },
        { value: "other", label: "Something else" },
      ],
    }),
    f.longText("notes", { label: "Anything we should know?" }),
  ],
});

const footerLinks = (
  <span className="flex gap-4">
    <a href="#privacy" className="hover:underline">Privacy</a>
    <a href="#terms" className="hover:underline">Terms</a>
  </span>
);

const publicForm = (embedded = false) => (
  <PublicPage
    brand={PASSING_BRAND}
    poweredBy={<a href="#genesis" className="font-medium hover:underline">Genesis</a>}
    footer={footerLinks}
    embedded={embedded}
  >
    <Form form={booking} />
  </PublicPage>
);

/** A public form at 1440px: brand header, one column, "Powered by" footer. */
export const PublicForm: Story = {
  name: "Public form (1440px)",
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: () => publicForm(),
};

/** The same form at 375px. */
export const PublicFormPhone: Story = {
  name: "Public form (375px)",
  globals: { viewport: { value: "phone375", isRotated: false } },
  render: () => publicForm(),
};

/** `embedded` (a host sets it from `?embed=1`): no chrome, transparent, as tall as its content. */
export const Embedded: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">The dashed box stands in for the host's iframe.</p>
      <div className="rounded-lg border-2 border-dashed border-border">{publicForm(true)}</div>
    </div>
  ),
};

/**
 * Emerald (Tailwind emerald-500) is 2.5:1 with white. The page keeps it for the header
 * rule and uses a darker shade of the same green for the button and links.
 */
export const LowContrastAccent: Story = {
  name: "Branded, low-contrast accent",
  render: () => (
    <PublicPage
      brand={LOW_CONTRAST_BRAND}
      title="Scan to book"
      description="Point your phone's camera at the code, or use the button."
      poweredBy="Genesis"
    >
      <div className="flex flex-col items-start gap-4">
        <Button testID="book">Book an appointment</Button>
        <a href="#prices" className="font-medium text-primary underline underline-offset-4">
          See prices
        </a>
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-block h-6 w-16 rounded bg-[hsl(var(--brand-accent))]" aria-hidden />
          brand accent as given (decoration only)
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-block h-6 w-16 rounded bg-primary" aria-hidden />
          the accessible shade used for text and buttons
        </div>
      </div>
    </PublicPage>
  ),
};
