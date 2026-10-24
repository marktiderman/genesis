// @feat:forms-web @feat:option-lists
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { useForm } from "@marktiderman/genesis-forms-react";
import { Form } from "../index";

const locations = [
  { value: "cff", label: "CrossFit Fairfield", description: "12 Main St", image: "https://example.com/cff.png" },
  { value: "cornerstone", label: "Cornerstone Fitness" },
];
const coaches = Array.from({ length: 12 }, (_, i) => ({
  value: `c${i}`,
  label: i === 3 ? "Zoë Park" : `Coach ${i}`,
  attributes: { location: i % 2 ? "cff" : "cornerstone" },
}));

const form = defineForm({
  id: "visit",
  title: "Your visit",
  layout: { mode: "classic" },
  blocks: [
    f.singleChoice("location", {
      label: "Where?",
      optionsFrom: { source: "host", key: "locations" },
      prefill: { param: "location", hideWhenPrefilled: true },
    }),
    f.dropdown("coach", {
      label: "Coach",
      optionsFrom: { source: "host", key: "coaches" },
    }),
    f.multiChoice("helpers", {
      label: "Who helped?",
      optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
      searchable: true,
    }),
  ],
});
const lists = { locations, coaches };

describe("option details", () => {
  it("shows an option's description and picture on its row", () => {
    render(<Form form={form} hostOptions={lists} />);
    const row = screen.getByRole("radio", { name: /CrossFit Fairfield/ }).closest("label")!;
    expect(within(row).getByText("12 Main St")).toBeTruthy();
    expect(row.querySelector("img")?.getAttribute("src")).toBe("https://example.com/cff.png");
  });
});

describe("search for long lists", () => {
  it("draws a list over 10 options with a search box that narrows it, and a pick is the answer", async () => {
    let sent: FormEngine | undefined;
    render(<Form form={form} hostOptions={lists} onSubmit={(e) => void (sent = e)} />);
    const search = screen.getByLabelText("Search: Coach");
    fireEvent.change(search, { target: { value: "zoe" } });
    const picker = search.closest("[data-gf-searchable]") as HTMLElement;
    const items = within(picker).getAllByRole("option");
    expect(items.map((i) => i.textContent)).toEqual(["Zoë Park"]);
    fireEvent.click(items[0]!);
    expect(within(picker).getByText(/Your choice: Zoë Park/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Cornerstone/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/thank/i);
    expect(sent?.answers()).toMatchObject({ coach: "c3", location: "cornerstone" });
  });

  it("stays a plain list at 10 options or fewer", () => {
    const short = { ...lists, coaches: coaches.slice(0, 10) };
    render(<Form form={form} hostOptions={short} />);
    expect((screen.getByLabelText(/^Coach/) as HTMLElement).tagName).toBe("SELECT");
  });
});

describe("lists filtered by another answer", () => {
  it("shows only the options matching the other answer, and clears picks it no longer shows", () => {
    let engine!: FormEngine;
    function Host() {
      engine = useForm(form, { hostOptions: lists });
      return <Form form={form} engine={engine} />;
    }
    render(<Host />);
    const picker = () => screen.getByLabelText("Search: Who helped?").closest("[data-gf-searchable]") as HTMLElement;
    expect(within(picker()).getAllByRole("option")).toHaveLength(12);
    fireEvent.click(screen.getByRole("radio", { name: /CrossFit Fairfield/ }));
    expect(within(picker()).getAllByRole("option").map((o) => o.textContent)).toEqual(
      coaches.filter((c) => c.attributes.location === "cff").map((c) => c.label),
    );
    fireEvent.click(within(picker()).getByRole("option", { name: "Coach 1" }));
    expect(engine.getState().values.helpers).toEqual(["c1"]);
    act(() => engine.setValue("location", "cornerstone"));
    expect(engine.getState().values.helpers).toBeUndefined();
  });
});

describe("preselect from a link", () => {
  it("picks the option and, with hideWhenPrefilled, leaves the question out", async () => {
    let sent: FormEngine | undefined;
    render(
      <Form
        form={form}
        hostOptions={lists}
        linkParams={new URLSearchParams("location=cornerstone")}
        onSubmit={(e) => void (sent = e)}
      />,
    );
    expect(screen.queryByRole("radio", { name: /Cornerstone/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/thank/i);
    expect(sent?.answers()).toEqual({ location: "cornerstone" });
  });

  it("ignores a value that isn't one of the options", () => {
    render(<Form form={form} hostOptions={lists} linkParams={{ location: "nowhere" }} />);
    expect(screen.getByRole("radio", { name: /Cornerstone/ })).toBeTruthy();
  });

  it("starts the focus layout on the first question it shows", () => {
    render(<Form form={form} layout="focus" hostOptions={lists} linkParams={{ location: "cff" }} />);
    expect(screen.getByLabelText("Search: Coach")).toBeTruthy();
    expect(screen.getByText(/1 of 2|Question 1/)).toBeTruthy();
  });
});
