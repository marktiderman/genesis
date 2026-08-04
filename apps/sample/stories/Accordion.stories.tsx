import type { Meta, StoryObj } from "@storybook/react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof Accordion> = { title: "UI/Accordion", component: Accordion };
export default meta;
type Story = StoryObj<typeof Accordion>;

export const Single: Story = {
  render: () => (
    <Accordion type="single" collapsible style={{ width: 360 }}>
      <AccordionItem value="i1">
        <AccordionTrigger>Is Genesis brand-agnostic?</AccordionTrigger>
        <AccordionContent>
          Yes — Genesis exports a token schema and opinionated primitives;
          consumer brands live in @&lt;consumer&gt;/brand workspace packages.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="i2">
        <AccordionTrigger>Where do brand-specific tokens live?</AccordionTrigger>
        <AccordionContent>
          In @&lt;consumer&gt;/brand under the canonical schema's
          extensions: Record&lt;string, ColorScale&gt; slot (round-4 D8).
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="i3">
        <AccordionTrigger>What's the upgrade cadence?</AccordionTrigger>
        <AccordionContent>
          Pull, never push. Genesis ships breaking changes only at minor on
          0.x; consumers update on their own schedule.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" style={{ width: 360 }}>
      <AccordionItem value="m1">
        <AccordionTrigger>Section one</AccordionTrigger>
        <AccordionContent>Content one.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="m2">
        <AccordionTrigger>Section two</AccordionTrigger>
        <AccordionContent>Content two.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

// Alias so `/showcase/primitives/accordion` has a `ui-accordion--default` story.
export const Default = Single;
