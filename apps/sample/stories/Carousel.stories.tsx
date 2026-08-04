import type { Meta, StoryObj } from "@storybook/react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof Carousel> = {
  title: "UI/Carousel",
  component: Carousel,
};
export default meta;
type Story = StoryObj<typeof Carousel>;

export const Default: Story = {
  render: () => (
    <Carousel className="w-64">
      <CarouselContent>
        {[1, 2, 3, 4, 5].map((n) => (
          <CarouselItem key={n}>
            <div className="flex h-32 items-center justify-center rounded-lg border bg-muted/40 text-2xl font-semibold">
              {n}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
};
