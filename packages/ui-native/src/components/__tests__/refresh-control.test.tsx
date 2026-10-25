// @feat:inbox-thread
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { GenesisThemeProvider } from "@marktiderman/genesis-design-system/theme";
import { NativeRefreshControl } from "../refresh-control";
import { useThemeRoles } from "../../hooks/use-theme-roles";

function Tint() {
  const tint = useThemeRoles().tint;
  return <span data-testid="tint">{String(tint)}</span>;
}

describe("NativeRefreshControl", () => {
  it("renders under the native app shell's theme provider (it threw: it read another theme context)", () => {
    const onRefresh = vi.fn();
    render(
      <GenesisThemeProvider brand={genesisBrand}>
        <NativeRefreshControl refreshing={false} onRefresh={onRefresh} testID="rc" />
        <Tint />
      </GenesisThemeProvider>,
    );
    const rc = screen.getByTestId("rc");
    expect(rc.dataset.refreshing).toBe("false");
    expect(rc.dataset.tintColor).toBe(screen.getByTestId("tint").textContent);
    fireEvent.click(rc);
    expect(onRefresh).toHaveBeenCalled();
  });

  it("renders with no theme provider at all, and a given tint wins", () => {
    render(<NativeRefreshControl refreshing onRefresh={() => {}} tintColor="#ff0000" testID="rc" />);
    expect(screen.getByTestId("rc").dataset.tintColor).toBe("#ff0000");
    expect(screen.getByTestId("rc").dataset.refreshing).toBe("true");
  });
});
