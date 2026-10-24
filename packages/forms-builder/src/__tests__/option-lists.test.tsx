// @feat:option-lists
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { parseForm, type ChoiceOption, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import {
  emptyForm,
  FormBuilder,
  hostListAttributes,
  hostOptionsOf,
  mergeOptions,
  moveBlock,
  optionListCsv,
  OptionListEditor,
  parseCsvRows,
  parseOptionListCsv,
  removeBlock,
  setOptions,
  setOptionsFilter,
  setOptionsSource,
  setPrefill,
  slugOptionValue,
  updateBlock,
  type HostOptionList,
  type OptionList,
} from "../index";

const field = (def: FormDefinition | undefined, id: string) => def?.blocks.find((b) => b.id === id) as FieldBlock;

const lists: HostOptionList[] = [
  {
    key: "locations",
    label: "Locations",
    sample: [
      { value: "cff", label: "CrossFit Fairfield", description: "12 Main St", image: "https://example.com/cff.png" },
      { value: "cs", label: "Cornerstone" },
    ],
  },
  {
    key: "coaches",
    label: "Coaches",
    sample: [
      { value: "ada", label: "Ada", attributes: { location: "cff" } },
      { value: "zoe", label: "Zoe", attributes: { location: "cs" } },
    ],
  },
];

const form = (): FormDefinition => ({
  ...emptyForm("f"),
  layout: { mode: "classic" },
  blocks: [
    { kind: "field", id: "q_loc", key: "location", type: "dropdown", label: "Where?", props: { optionsFrom: { source: "host", key: "locations" } } },
    { kind: "field", id: "q_coach", key: "coach", type: "single-choice", label: "Coach", props: { optionsFrom: { source: "host", key: "coaches" } } },
  ],
});

describe("ops for option filters and link prefill", () => {
  it("sets and clears a filter, only on an earlier question", () => {
    const def = setOptionsFilter(form(), "q_coach", { attribute: "location", field: "location" });
    expect(field(def, "q_coach").props?.optionsFrom).toEqual({
      source: "host",
      key: "coaches",
      filter: { attribute: "location", field: "location" },
    });
    expect(parseForm(def).ok).toBe(true);
    expect(setOptionsFilter(form(), "q_loc", { attribute: "x", field: "coach" })).toEqual(form());
    expect(field(setOptionsFilter(def, "q_coach", null), "q_coach").props?.optionsFrom).toEqual({ source: "host", key: "coaches" });
  });

  it("keeps the filter pointing at the question when its key is renamed, and drops it when moved or removed", () => {
    const def = setOptionsFilter(form(), "q_coach", { attribute: "location", field: "location" });
    const renamed = updateBlock(def, "q_loc", { key: "gym" });
    expect(field(renamed, "q_coach").props?.optionsFrom).toMatchObject({ filter: { field: "gym" } });
    expect(parseForm(renamed).ok).toBe(true);
    const moved = moveBlock(def, "q_coach", 0);
    expect(field(moved, "q_coach").props?.optionsFrom).toEqual({ source: "host", key: "coaches" });
    expect(parseForm(moved).ok).toBe(true);
    const removed = removeBlock(def, "q_loc");
    expect(field(removed, "q_coach").props?.optionsFrom).toEqual({ source: "host", key: "coaches" });
  });

  it("keeps a filter on the same list, drops it on another", () => {
    const def = setOptionsFilter(form(), "q_coach", { attribute: "location", field: "location" });
    expect(field(setOptionsSource(def, "q_coach", { key: "locations" }), "q_coach").props?.optionsFrom).toEqual({
      source: "host",
      key: "locations",
    });
  });

  it("sets a link prefill and refuses a malformed parameter", () => {
    const def = setPrefill(form(), "q_loc", { param: "location", hideWhenPrefilled: true });
    expect(field(def, "q_loc").props?.prefill).toEqual({ param: "location", hideWhenPrefilled: true });
    expect(setPrefill(def, "q_loc", { param: "bad name" })).toBe(def);
    expect(field(setPrefill(def, "q_loc", null), "q_loc").props?.prefill).toBeUndefined();
  });

  it("setOptions keeps an option's description, picture and attributes when its label changes", () => {
    const def: FormDefinition = {
      ...emptyForm("g"),
      blocks: [
        {
          kind: "field",
          id: "q",
          key: "q",
          type: "single-choice",
          label: "Q",
          props: { options: [{ value: "a", label: "A", description: "Desc", attributes: { k: "v" } }] },
        },
      ],
    };
    const next = setOptions(def, "q", [{ value: "a", label: "Renamed" }]);
    expect(field(next, "q").props?.options).toEqual([{ value: "a", label: "Renamed", description: "Desc", attributes: { k: "v" } }]);
  });
});

describe("CSV import and export", () => {
  it("reads quoted cells, line breaks and tab-separated pastes", () => {
    expect(parseCsvRows('value,label\r\n"a,1","Say ""hi""\nthere"\n\nb,B\n')).toEqual([
      ["value", "label"],
      ["a,1", 'Say "hi"\nthere'],
      [""],
      ["b", "B"],
    ]);
    expect(parseCsvRows("label\tregion\nNorth\tn")).toEqual([
      ["label", "region"],
      ["North", "n"],
    ]);
  });

  it("previews rows, flagging duplicates, blanks, long values and bad images", () => {
    const csv = [
      "Value,Label,Description,Image,location",
      "cff,CrossFit Fairfield,12 Main St,https://example.com/a.png,north|south",
      "cff,Again,,,",
      ",,just a description,,",
      `${"x".repeat(201)},Long,,,`,
      "cs,Cornerstone,,http://insecure.test/a.png,",
      "zoe,Zoë,,,north",
    ].join("\n");
    const result = parseOptionListCsv(csv);
    expect(result.attributes).toEqual(["location"]);
    expect(result.options).toEqual([
      {
        value: "cff",
        label: "CrossFit Fairfield",
        description: "12 Main St",
        image: "https://example.com/a.png",
        attributes: { location: ["north", "south"] },
      },
      { value: "zoe", label: "Zoë", attributes: { location: "north" } },
    ]);
    const problems = Object.fromEntries(result.rows.filter((r) => r.problems.length).map((r) => [r.line, r.problems[0]]));
    expect(problems).toEqual({
      3: "Same value as line 2.",
      4: "No value or label.",
      5: "The value is longer than 200 characters.",
      6: "The image must be an https:// link.",
    });
  });

  it("makes values from labels for a single label column, or a headerless list of names", () => {
    expect(parseOptionListCsv("label\nZoë's Gym\nNorth Side").options).toEqual([
      { value: "zoes-gym", label: "Zoë's Gym" },
      { value: "north-side", label: "North Side" },
    ]);
    expect(parseOptionListCsv("Ada Lovelace\nSam Hill").options.map((o) => o.value)).toEqual(["ada-lovelace", "sam-hill"]);
    expect(slugOptionValue("  --Hello, World!-- ")).toBe("hello-world");
    expect(parseOptionListCsv("a,b\n1,2").problems[0]).toMatch(/value.*label/);
    expect(parseOptionListCsv("").problems).toEqual(["There are no rows to import."]);
  });

  it("exports CSV that imports back to the same options, with formulas kept as text", () => {
    const options: ChoiceOption[] = [
      { value: "cff", label: "CrossFit, Fairfield", description: 'The "big" one', attributes: { location: ["n", "s"] } },
      { value: "minus", label: "=SUM(A1)" },
    ];
    const csv = optionListCsv(options);
    expect(csv.split("\r\n")[0]).toBe("value,label,description,image,location");
    expect(csv).toContain("'=SUM(A1)");
    expect(parseOptionListCsv(csv).options).toEqual(options);
  });

  it("merges by value: updates in place, adds new ones at the end, removes nothing", () => {
    const existing: ChoiceOption[] = [
      { value: "a", label: "A", description: "Old" },
      { value: "b", label: "B" },
    ];
    const merged = mergeOptions(existing, [
      { value: "b", label: "B2", attributes: { k: "v" } },
      { value: "c", label: "C" },
      { value: "a" },
    ]);
    expect(merged).toEqual([
      { value: "a", label: "A", description: "Old" },
      { value: "b", label: "B2", attributes: { k: "v" } },
      { value: "c", label: "C" },
    ]);
    expect(mergeOptions(existing, [{ value: "a", label: "A" }])).toBe(existing);
  });

  it("hostOptionsOf maps lists by key", () => {
    const list: OptionList = { key: "rooms", label: "Rooms", options: [{ value: "r1" }] };
    expect(hostOptionsOf([list])).toEqual({ rooms: [{ value: "r1" }] });
  });
});

describe("<OptionListEditor>", () => {
  function Host({ initial, spy }: { initial: OptionList; spy: (l: OptionList) => void }) {
    const [list, setList] = useState(initial);
    return (
      <OptionListEditor
        list={list}
        onChange={(next) => {
          spy(next);
          setList(next);
        }}
      />
    );
  }
  const start: OptionList = {
    key: "locations",
    label: "Locations",
    options: [
      { value: "cff", label: "CrossFit Fairfield" },
      { value: "cs", label: "Cornerstone" },
    ],
  };

  it("renames, edits, reorders, adds and removes options", () => {
    let last: OptionList = start;
    render(<Host initial={start} spy={(l) => (last = l)} />);
    fireEvent.change(screen.getByTestId("option-list-name"), { target: { value: "Gyms" } });
    expect(last.label).toBe("Gyms");
    expect(last.key).toBe("locations");
    fireEvent.change(screen.getByTestId("option-list-label-1"), { target: { value: "Cornerstone Fitness" } });
    fireEvent.change(screen.getByLabelText("Description", { selector: "#" + CSS.escape(screen.getAllByLabelText("Description")[0]!.id) }), {
      target: { value: "12 Main St" },
    });
    expect(last.options[0]).toEqual({ value: "cff", label: "CrossFit Fairfield", description: "12 Main St" });
    fireEvent.click(screen.getByRole("button", { name: "Move Cornerstone Fitness up" }));
    expect(last.options.map((o) => o.value)).toEqual(["cs", "cff"]);
    fireEvent.click(screen.getByTestId("option-list-add"));
    expect(last.options[2]).toEqual({ value: "new-option", label: "New option" });
    fireEvent.click(screen.getByTestId("option-list-remove-0"));
    expect(last.options.map((o) => o.value)).toEqual(["cff", "new-option"]);
  });

  it("adds an attribute column and sets list values with |", () => {
    let last: OptionList = start;
    render(<Host initial={start} spy={(l) => (last = l)} />);
    fireEvent.change(screen.getByLabelText("New attribute"), { target: { value: "region" } });
    fireEvent.click(screen.getByTestId("option-list-add-attribute"));
    fireEvent.change(screen.getByTestId("option-list-attr-0-region"), { target: { value: "north|south" } });
    expect(last.options[0]!.attributes).toEqual({ region: ["north", "south"] });
    fireEvent.change(screen.getByTestId("option-list-attr-0-region"), { target: { value: "" } });
    expect(last.options[0]!.attributes).toBeUndefined();
  });

  it("previews a pasted import and merges it on confirm", () => {
    let last: OptionList = start;
    render(<Host initial={start} spy={(l) => (last = l)} />);
    fireEvent.change(screen.getByTestId("option-list-paste"), {
      target: { value: "value,label\ncs,Cornerstone Fitness\nzoe,Zoë's\n,\ncff,Dup\ncff,Dup again" },
    });
    fireEvent.click(screen.getByTestId("option-list-preview"));
    const preview = screen.getByTestId("option-list-import-preview");
    expect(preview.textContent).toContain("1 new, 2 updated, 1 left out");
    expect(within(preview).getByText(/Line 6: Same value as line 5/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("option-list-import"));
    expect(last.options).toEqual([
      { value: "cff", label: "Dup" },
      { value: "cs", label: "Cornerstone Fitness" },
      { value: "zoe", label: "Zoë's" },
    ]);
    expect(screen.queryByTestId("option-list-import-preview")).toBeNull();
  });

  it("reads an uploaded file", async () => {
    render(<Host initial={start} spy={() => undefined} />);
    const file = new File(["label\nNew Gym"], "gyms.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("option-list-file"), { target: { files: [file] } });
    });
    expect((await screen.findByTestId("option-list-import-preview")).textContent).toContain("1 new, 0 updated");
  });
});

describe("builder: filter, prefill and search settings", () => {
  const open = (id: string) => fireEvent.click(screen.getByTestId(`builder-block-toggle-${id}`));

  it("offers the list's attributes and earlier questions as a filter", () => {
    expect(hostListAttributes(lists[1])).toEqual(["location"]);
    render(<FormBuilder defaultValue={setOptionsFilter(form(), "q_coach", { attribute: "location", field: "location" })} hostOptions={lists} />);
    open("q_coach");
    expect(screen.getByTestId("builder-options-filter")).toBeTruthy();
    expect(screen.getByTestId("builder-options-filter-attribute")).toBeTruthy();
    expect(screen.getByTestId("builder-options-filter").textContent).toContain("Options whose “location” is the answer");
  });

  it("sets the link parameter and hiding from the question's settings", () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={form()} hostOptions={lists} onChange={(d) => (last = d)} />);
    open("q_loc");
    expect(screen.queryByTestId("builder-options-filter")).toBeNull();
    const input = screen.getByTestId("builder-options-prefill");
    fireEvent.change(input, { target: { value: "location" } });
    fireEvent.blur(input);
    expect(field(last, "q_loc").props?.prefill).toEqual({ param: "location" });
    fireEvent.click(screen.getByTestId("builder-options-prefill-hide"));
    expect(field(last, "q_loc").props?.prefill).toEqual({ param: "location", hideWhenPrefilled: true });
  });

  it("shows sample descriptions and pictures in the preview", () => {
    render(<FormBuilder defaultValue={form()} hostOptions={lists} />);
    const preview = screen.getByTestId("builder-preview");
    expect(within(preview).getAllByText(/CrossFit Fairfield/).length).toBeGreaterThan(0);
  });
});
