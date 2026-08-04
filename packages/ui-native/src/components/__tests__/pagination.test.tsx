import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativePagination } from "../pagination";

function Wrapper({ count = 5 }: { count?: number }) {
  const [page, setPage] = useState(0);
  return (
    <NativePagination
      testID="pg"
      pageCount={count}
      page={page}
      onChange={setPage}
    />
  );
}

describe("NativePagination", () => {
  it("renders prev/next + numbered buttons", () => {
    render(<Wrapper />);
    expect(screen.getByTestId("pg-prev")).toBeTruthy();
    expect(screen.getByTestId("pg-next")).toBeTruthy();
    expect(screen.getByTestId("pg-page-0")).toBeTruthy();
    expect(screen.getByTestId("pg-page-4")).toBeTruthy();
  });

  it("disables prev on the first page", () => {
    render(<Wrapper />);
    expect(screen.getByTestId("pg-prev").getAttribute("aria-disabled")).toBe("true");
  });

  it("advances on next press", () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByTestId("pg-next"));
    expect(screen.getByTestId("pg-page-1").getAttribute("aria-selected")).toBe("true");
  });

  it("shows trailing ellipsis when count exceeds maxVisible", () => {
    render(<Wrapper count={20} />);
    expect(screen.getByTestId("pg-page-0")).toBeTruthy();
    expect(screen.queryByTestId("pg-page-19")).toBeNull();
  });
});
