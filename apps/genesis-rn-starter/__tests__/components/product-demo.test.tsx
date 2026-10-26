import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent, within } from "@testing-library/react-native";
import { copy } from "@/copy";
import { expectPathname, renderApp } from "./render-app";

// This file's app has `features.productDemo` on (it is off by default); every other switch is the starter's own.
jest.mock("../../starter.config", () => {
  const actual = jest.requireActual<{ default: { features: object } }>("../../starter.config").default;
  return { __esModule: true, default: { ...actual, features: { ...actual.features, productDemo: true } } };
});

const t = copy.productDemo;

describe("product demo", () => {
  it("opens from Settings: the idea board votes at once, and the roadmap switches to Next", async () => {
    const app = await renderApp("/settings", "person@example.com");
    const user = userEvent.setup();
    await user.press(await screen.findByTestId("open-product-demo"));
    await expectPathname(app, "/settings/product");
    expect(await screen.findByText(t.ideas.darkMode.title)).toBeOnTheScreen();
    const row = screen.getByTestId("product-ideas-idea-dark-mode");
    expect(within(row).getByText("12 votes · Planned")).toBeOnTheScreen();
    await user.press(screen.getByTestId("product-ideas-vote-dark-mode"));
    expect(await within(row).findByText("13 votes · Planned")).toBeOnTheScreen();

    await user.press(screen.getByTestId("product-demo-tab-option-roadmap"));
    expect(await screen.findByText(t.roadmap.search.title)).toBeOnTheScreen();
    await user.press(screen.getByTestId("product-roadmap-horizon-option-next"));
    expect(await screen.findByText(t.roadmap.offline.title)).toBeOnTheScreen();
    expect(screen.queryByText(t.roadmap.search.title)).toBeNull();
  });
});
