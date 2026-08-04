import type { Meta, StoryObj } from "@storybook/react";
import { H1, H2, H3, H4, P, Lead, Large, Small, Muted } from "@marktiderman/genesis-ui";

const meta: Meta = { title: "UI/Typography" };
export default meta;
type Story = StoryObj;

export const All: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 540 }}>
      <H1>Heading 1</H1>
      <H2>Heading 2</H2>
      <H3>Heading 3</H3>
      <H4>Heading 4</H4>
      <Lead>
        A lead paragraph stands out — useful for hero sections or article
        intros.
      </Lead>
      <P>
        Body paragraph text uses the default body preset. Genesis ships eight
        typography presets: h1-h4, body, body-sm, label, caption.
      </P>
      <Large>Large emphasis text</Large>
      <Small>Small caption text for footnotes.</Small>
      <Muted>Muted helper text for low-emphasis copy.</Muted>
    </div>
  ),
};
