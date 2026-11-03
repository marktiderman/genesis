import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, GalleryCard, LiveIndicator } from "@marktiderman/genesis-ui";

const meta: Meta<typeof GalleryCard> = {
  title: "Patterns/GalleryCard",
  component: GalleryCard,
  args: {
    src: "https://picsum.photos/seed/1/800/600",
    alt: "Mountain lake",
    title: "Mountain lake",
    subtitle: "12 photos",
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GalleryCard>;

export const Default: Story = {};
export const Clickable: Story = { args: { onClick: () => {} } };
export const Loading: Story = { args: { loading: true } };
export const NoCover: Story = { args: { src: undefined } };
export const WithBadges: Story = {
  args: {
    badges: (
      <>
        <Badge>New</Badge>
        <LiveIndicator />
      </>
    ),
    ratio: 16 / 9,
  },
};
