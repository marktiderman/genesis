import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeHeaderCard } from "../header-card";

describe("NativeHeaderCard", () => {
  it("renders title, body, footer slots", () => {
    render(
      <NativeHeaderCard
        testID="test-card"
        title="Profile"
        description="Account details"
        body={<span data-testid="body-content">Body</span>}
        footer={<button type="button">Save</button>}
      />
    );
    expect(screen.getByTestId("test-card")).toBeTruthy();
    expect(screen.getByTestId("test-card-title").textContent).toBe("Profile");
    expect(screen.getByTestId("test-card-description").textContent).toBe(
      "Account details"
    );
    expect(screen.getByTestId("test-card-body")).toBeTruthy();
    expect(screen.getByTestId("body-content")).toBeTruthy();
    expect(screen.getByTestId("test-card-footer")).toBeTruthy();
  });

  it("omits body and footer when not provided", () => {
    render(<NativeHeaderCard testID="t" title="Title only" />);
    expect(screen.queryByTestId("t-body")).toBeNull();
    expect(screen.queryByTestId("t-footer")).toBeNull();
  });
});
