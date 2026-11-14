import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChoiceCard, RadioGroup } from "@marktiderman/genesis-ui";

const meta: Meta<typeof ChoiceCard> = { title: "Foundation/UI/ChoiceCard", component: ChoiceCard };
export default meta;
type Story = StoryObj<typeof ChoiceCard>;

const plans = [
  { id: "monthly", title: "Monthly", description: "$20 a month, cancel any time" },
  { id: "yearly", title: "Yearly", description: "$200 a year, two months free" },
];

export const OneOfSeveral: Story = {
  render: () => {
    const [plan, setPlan] = useState("monthly");
    return (
      <RadioGroup aria-label="Plan" value={plan} onValueChange={setPlan} className="flex w-96 flex-col gap-2">
        {plans.map((p) => (
          <ChoiceCard key={p.id} value={p.id} title={p.title} description={p.description} />
        ))}
      </RadioGroup>
    );
  },
};

export const SeveralAtOnce: Story = {
  render: () => {
    const [on, setOn] = useState<string[]>(["towel"]);
    const toggle = (id: string) => setOn((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
    return (
      <div role="group" aria-label="Extras" className="flex w-96 flex-col gap-2">
        <ChoiceCard multiple title="Towel" selected={on.includes("towel")} onSelectedChange={() => toggle("towel")} />
        <ChoiceCard multiple title="Locker" selected={on.includes("locker")} onSelectedChange={() => toggle("locker")} />
        <ChoiceCard multiple invalid title="Waiver" description="Needs an answer" selected={false} onSelectedChange={() => toggle("waiver")} />
      </div>
    );
  },
};
