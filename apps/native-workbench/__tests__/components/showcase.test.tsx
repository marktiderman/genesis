import { describe, expect, it } from "@jest/globals";
import { act, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { expectPathname, renderApp } from "./render-app";
import { tabTitles } from "./tabs";

describe("the showcase", () => {
  it("opens on Standards with no sign-in, one tab per section", async () => {
    const app = await renderApp("/", null);
    expect(await screen.findByTestId("workbench-standards")).toBeOnTheScreen();
    await expectPathname(app, "/standards");
    expect(tabTitles()).toEqual(["Standards", "Components", "Layouts", "Messages"]);
  });

  it("opens a screen from its section", async () => {
    const app = await renderApp("/", null);
    await screen.findByTestId("workbench-standards");
    await act(async () => router.push("/standards/header-drilldown"));
    expect(await screen.findByTestId("workbench-header-drilldown")).toBeOnTheScreen();
    await expectPathname(app, "/standards/header-drilldown");
  });
});
