import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  NativeAccordion,
  NativeAccordionContent,
  NativeAccordionItem,
  NativeAccordionTrigger,
} from "../accordion";

describe("NativeAccordion", () => {
  it("expands a single item by default and collapses on second press", () => {
    render(
      <NativeAccordion testID="acc">
        <NativeAccordionItem value="a">
          <NativeAccordionTrigger>A</NativeAccordionTrigger>
          <NativeAccordionContent>Body A</NativeAccordionContent>
        </NativeAccordionItem>
        <NativeAccordionItem value="b">
          <NativeAccordionTrigger>B</NativeAccordionTrigger>
          <NativeAccordionContent>Body B</NativeAccordionContent>
        </NativeAccordionItem>
      </NativeAccordion>
    );
    expect(screen.queryByTestId("accordion-content-a")).toBeNull();
    fireEvent.click(screen.getByTestId("accordion-trigger-a"));
    expect(screen.getByTestId("accordion-content-a")).toBeTruthy();
    fireEvent.click(screen.getByTestId("accordion-trigger-a"));
    expect(screen.queryByTestId("accordion-content-a")).toBeNull();
  });

  it("only allows one open at a time in single mode", () => {
    render(
      <NativeAccordion>
        <NativeAccordionItem value="a">
          <NativeAccordionTrigger>A</NativeAccordionTrigger>
          <NativeAccordionContent>Body A</NativeAccordionContent>
        </NativeAccordionItem>
        <NativeAccordionItem value="b">
          <NativeAccordionTrigger>B</NativeAccordionTrigger>
          <NativeAccordionContent>Body B</NativeAccordionContent>
        </NativeAccordionItem>
      </NativeAccordion>
    );
    fireEvent.click(screen.getByTestId("accordion-trigger-a"));
    fireEvent.click(screen.getByTestId("accordion-trigger-b"));
    expect(screen.queryByTestId("accordion-content-a")).toBeNull();
    expect(screen.getByTestId("accordion-content-b")).toBeTruthy();
  });

  it("auto-applies isLast to the final accordion item", () => {
    // Auto-detection: the last <NativeAccordionItem> renders without
    // border-b, the others keep it. We assert via accessible labels +
    // by checking the className prop on the rendered DOM nodes.
    render(
      <NativeAccordion testID="acc">
        <NativeAccordionItem value="a">
          <NativeAccordionTrigger>A</NativeAccordionTrigger>
          <NativeAccordionContent>Body A</NativeAccordionContent>
        </NativeAccordionItem>
        <NativeAccordionItem value="b">
          <NativeAccordionTrigger>B</NativeAccordionTrigger>
          <NativeAccordionContent>Body B</NativeAccordionContent>
        </NativeAccordionItem>
        <NativeAccordionItem value="c">
          <NativeAccordionTrigger>C</NativeAccordionTrigger>
          <NativeAccordionContent>Body C</NativeAccordionContent>
        </NativeAccordionItem>
      </NativeAccordion>
    );
    // The trigger Pressable is inside an item View; walk to that
    // grandparent to inspect its className.
    const triggerA = screen.getByTestId("accordion-trigger-a");
    const triggerC = screen.getByTestId("accordion-trigger-c");
    const itemA = triggerA.parentElement as HTMLElement;
    const itemC = triggerC.parentElement as HTMLElement;
    // First two items keep the divider; the auto-detected last item drops it.
    // Use a word-boundary regex so `border-border` (which textually contains
    // `border-b` as a substring) doesn't false-match.
    expect(itemA?.className).toMatch(/(^|\s)border-b(\s|$)/);
    expect(itemC?.className).not.toMatch(/(^|\s)border-b(\s|$)/);
  });

  it("respects explicit isLast={false} on the trailing child", () => {
    // Manual override should win over auto-detection so consumers can
    // keep the bottom border on the last item (e.g. when the accordion
    // is followed by other content with its own top border).
    render(
      <NativeAccordion>
        <NativeAccordionItem value="a">
          <NativeAccordionTrigger>A</NativeAccordionTrigger>
          <NativeAccordionContent>Body A</NativeAccordionContent>
        </NativeAccordionItem>
        <NativeAccordionItem value="b" isLast={false}>
          <NativeAccordionTrigger>B</NativeAccordionTrigger>
          <NativeAccordionContent>Body B</NativeAccordionContent>
        </NativeAccordionItem>
      </NativeAccordion>
    );
    const triggerB = screen.getByTestId("accordion-trigger-b");
    const itemB = triggerB.parentElement as HTMLElement;
    expect(itemB?.className).toMatch(/(^|\s)border-b(\s|$)/);
  });

  it("multiple mode keeps both open", () => {
    render(
      <NativeAccordion type="multiple">
        <NativeAccordionItem value="a">
          <NativeAccordionTrigger>A</NativeAccordionTrigger>
          <NativeAccordionContent>Body A</NativeAccordionContent>
        </NativeAccordionItem>
        <NativeAccordionItem value="b">
          <NativeAccordionTrigger>B</NativeAccordionTrigger>
          <NativeAccordionContent>Body B</NativeAccordionContent>
        </NativeAccordionItem>
      </NativeAccordion>
    );
    fireEvent.click(screen.getByTestId("accordion-trigger-a"));
    fireEvent.click(screen.getByTestId("accordion-trigger-b"));
    expect(screen.getByTestId("accordion-content-a")).toBeTruthy();
    expect(screen.getByTestId("accordion-content-b")).toBeTruthy();
  });
});
