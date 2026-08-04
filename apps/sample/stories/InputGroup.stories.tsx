import type { Meta, StoryObj } from "@storybook/react";
import { InputGroup, InputGroupInput, InputGroupPrefix, InputGroupSuffix } from "@marktiderman/genesis-ui";
import { Search, DollarSign } from "lucide-react";

const meta: Meta<typeof InputGroup> = {
  title: "UI/InputGroup",
  component: InputGroup,
};
export default meta;
type Story = StoryObj<typeof InputGroup>;

export const WithPrefix: Story = {
  render: () => (
    <InputGroup className="w-64">
      <InputGroupPrefix>
        <Search />
      </InputGroupPrefix>
      <InputGroupInput placeholder="Search..." />
    </InputGroup>
  ),
};

export const WithSuffix: Story = {
  render: () => (
    <InputGroup className="w-64">
      <InputGroupPrefix>
        <DollarSign />
      </InputGroupPrefix>
      <InputGroupInput placeholder="0.00" />
      <InputGroupSuffix>USD</InputGroupSuffix>
    </InputGroup>
  ),
};

export const Default: Story = {
  render: () => (
    <InputGroup className="w-64">
      <InputGroupInput placeholder="Plain input group" />
    </InputGroup>
  ),
};
