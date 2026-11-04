import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Share, Text } from "react-native";
import { NativeShareSheet } from "../share-sheet";

afterEach(() => vi.restoreAllMocks());

describe("NativeShareSheet", () => {
  it("says it is loading while the link is null", async () => {
    render(<NativeShareSheet open onOpenChange={() => {}} url={null} />);
    expect(await screen.findByTestId("native-share-sheet-loading")).toBeTruthy();
    expect(screen.getByText("Share your page")).toBeTruthy();
  });

  it("shows the link, the host's QR code, and copies through onCopy", async () => {
    const onCopy = vi.fn(async () => {});
    render(
      <NativeShareSheet
        open
        onOpenChange={() => {}}
        noun="form"
        url="https://acme.test/f/1"
        renderQr={(url) => <Text testID="qr">{url}</Text>}
        onCopy={onCopy}
      />,
    );
    expect(await screen.findByText("Share your form")).toBeTruthy();
    expect(screen.getByTestId("qr").textContent).toBe("https://acme.test/f/1");
    await act(async () => {
      fireEvent.click(screen.getByTestId("native-share-sheet-copy"));
    });
    expect(onCopy).toHaveBeenCalledWith("https://acme.test/f/1");
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("shares through the system sheet, which Copy also uses without onCopy", async () => {
    const share = vi.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    render(<NativeShareSheet open onOpenChange={() => {}} url="https://acme.test/p" name="Intake" />);
    fireEvent.click(await screen.findByTestId("native-share-sheet-share"));
    expect(screen.queryByTestId("native-share-sheet-qr")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("native-share-sheet-copy"));
    });
    expect(share).toHaveBeenCalledTimes(2);
    expect(share.mock.calls[0]![0]).toMatchObject({ url: "https://acme.test/p", title: "Intake" });
  });
});
