// @feat:native-components
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text } from "react-native";
import { NotificationsPage, type NotificationsPageSlotMap } from "../notifications-page";

describe("NotificationsPage slots", () => {
  it("replaces the empty state", () => {
    const Empty = ({ title }: NotificationsPageSlotMap["empty"]) => <Text>{`custom ${title}`}</Text>;
    render(<NotificationsPage items={[]} slots={{ empty: Empty }} />);
    expect(screen.getByText("custom No notifications")).toBeTruthy();
  });

  it("feeds the default empty state through slotProps", () => {
    render(<NotificationsPage items={[]} slotProps={{ empty: { body: "All caught up." } }} />);
    expect(screen.getByText("All caught up.")).toBeTruthy();
  });

  it("keeps the old emptyState prop working", () => {
    render(<NotificationsPage items={[]} emptyState={<Text>legacy</Text>} />);
    expect(screen.getByText("legacy")).toBeTruthy();
  });
});
