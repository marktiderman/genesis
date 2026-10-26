// @feat:native-modules
/**
 * NativeResourcePage on FlashList v2 (the opt-in) and FlatList (the
 * fallback), and the lucide icon set covering every semantic name.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "../native-modules";
import { NATIVE_ICON_NAMES } from "../icon-names";
import { fakeFlashList } from "./fake-modules";

const refetch = vi.fn(() => Promise.resolve());
vi.mock("@marktiderman/genesis-core/hooks", () => ({
  useResource: () => ({
    list: {
      data: { data: [{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }] },
      isLoading: false,
      isError: false,
      refetch,
    },
    setSearch: () => {},
    setFilters: () => {},
  }),
}));

vi.mock("lucide-react-native", () => {
  const icon = (name: string) => () => <svg data-lucide={name} />;
  const names = [
    "ArrowLeft", "Bell", "Calendar", "Check", "ChevronDown", "ChevronLeft", "ChevronRight", "ChevronUp", "CircleCheck",
    "CircleX", "Clock", "Ellipsis", "ExternalLink", "Funnel", "Heart", "House", "Info", "Lock", "LogOut", "Mail", "Menu",
    "Minus", "Pencil", "Plus", "RefreshCw", "Search", "Settings", "Share", "Star", "Trash2", "TriangleAlert", "User", "X",
    "ArrowUp", "Camera", "Copy", "File", "Image", "MessageCircle", "Mic", "Paperclip", "Pause", "Pin", "Play", "Reply", "SquarePen",
    "Download", "Smile", "Maximize2", "Square", "SwitchCamera", "Video", "Volume2", "VolumeX",
  ];
  return Object.fromEntries(names.map((n) => [n, icon(n)]));
});

const { NativeResourcePage } = await import("../data/NativeResourcePage");
const { lucideIcons } = await import("../icons/lucide");

describe("NativeResourcePage", () => {
  it("renders its rows in FlashList when the app passed it, with pull-to-refresh", () => {
    const FlashList = fakeFlashList();
    render(
      <GenesisModulesProvider modules={{ list: FlashList }}>
        <NativeResourcePage resource="people" title="People" cardFields={["name"]} />
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("native-resource-page-list").dataset.flashList).toBe("true");
    expect(screen.getByText("Ada")).toBeTruthy();
    const props = FlashList.mock.calls[0]![0];
    expect(props).not.toHaveProperty("estimatedItemSize");
    // FlashList's content container takes padding only.
    expect(props.contentContainerStyle).toEqual({ paddingBottom: 24 });
    expect(props.keyExtractor!({ id: 2 }, 0)).toBe("2");
    props.onRefresh!();
    expect(refetch).toHaveBeenCalled();
  });

  it("falls back to FlatList", () => {
    render(<NativeResourcePage resource="people" title="People" cardFields={["name"]} />);
    expect(screen.getByTestId("native-resource-page-list").dataset.flashList).toBeUndefined();
    expect(screen.getByText("Grace")).toBeTruthy();
  });
});

describe("lucideIcons", () => {
  it("has an icon for every semantic name", () => {
    expect(Object.keys(lucideIcons).sort()).toEqual([...NATIVE_ICON_NAMES].sort());
    for (const name of NATIVE_ICON_NAMES) expect(typeof lucideIcons[name]).toBe("function");
  });
});
