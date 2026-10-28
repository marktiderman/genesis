/**
 * Slot class props: the parts a component renders for itself (a modal's backdrop, a table's
 * scroll box) take classes from the caller, like the part the props spread onto.
 *
 * Why: the backdrop and the scroll container were unreachable. A dialog opened over a side
 * panel couldn't lift its backdrop above the panel, and a table couldn't become the scroll box
 * a sticky header needs.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "../alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../sheet";
import { Table, TableBody, TableCell, TableRow } from "../table";

/** The backdrop: the portal's element that isn't the dialog itself. */
function overlay(): HTMLElement {
  const dialog = screen.queryByRole("dialog") ?? screen.getByRole("alertdialog");
  const found = Array.from(document.body.querySelectorAll<HTMLElement>("[data-state=open]")).find(
    (element) => element !== dialog && !dialog.contains(element) && element.className.includes("fixed inset-0"),
  );
  if (!found) throw new Error("no overlay rendered");
  return found;
}

describe("overlayClassName", () => {
  it("styles DialogContent's backdrop, after its defaults", () => {
    render(
      <Dialog open>
        <DialogContent overlayClassName="z-[60] bg-black/80" className="z-[60]">
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const backdrop = overlay();
    expect(backdrop.className).toContain("z-[60]");
    expect(backdrop.className).toContain("bg-black/80");
    // tailwind-merge drops the default it overrides.
    expect(backdrop.className).not.toContain("z-50");
    expect(backdrop.className).not.toContain("bg-black/50");
    expect(screen.getByRole("dialog").className).toContain("z-[60]");
  });

  it("keeps the default backdrop when it isn't set", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(overlay().className).toContain("z-50");
    expect(overlay().className).toContain("bg-black/50");
  });

  it("styles AlertDialogContent's backdrop", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent overlayClassName="z-[70]">
          <AlertDialogTitle>Sure?</AlertDialogTitle>
          <AlertDialogDescription>Body</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(overlay().className).toContain("z-[70]");
  });

  it("styles SheetContent's backdrop", () => {
    render(
      <Sheet open>
        <SheetContent overlayClassName="bg-transparent">
          <SheetTitle>Panel</SheetTitle>
          <SheetDescription>Body</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(overlay().className).toContain("bg-transparent");
  });
});

describe("Table containerClassName", () => {
  function renderTable(props: { containerClassName?: string; className?: string }) {
    render(
      <Table {...props}>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const table = screen.getByRole("table");
    return { table, container: table.parentElement as HTMLElement };
  }

  it("styles the scroll container, and className still styles the table", () => {
    const { table, container } = renderTable({ containerClassName: "max-h-96", className: "table-fixed" });
    expect(container.dataset.slot).toBe("table-container");
    expect(container.className).toContain("max-h-96");
    expect(container.className).toContain("overflow-auto");
    expect(table.className).toContain("table-fixed");
    expect(container.className).not.toContain("table-fixed");
  });

  it("lets the container's defaults be overridden", () => {
    const { container } = renderTable({ containerClassName: "overflow-visible" });
    expect(container.className).toContain("overflow-visible");
    expect(container.className).not.toContain("overflow-auto");
  });
});
