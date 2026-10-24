// @feat:forms-react @feat:option-lists
import { describe, expect, it, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { useChoiceOptions, useForm, useRespondentPath } from "../index";

afterEach(cleanup);

const form = defineForm({
  id: "t",
  title: "T",
  blocks: [
    f.dropdown("location", {
      label: "Where?",
      options: [{ value: "cff" }, { value: "cs" }],
      prefill: { param: "location", hideWhenPrefilled: true },
    }),
    f.singleChoice("coach", {
      label: "Coach",
      options: [
        { value: "ada", attributes: { location: "cff" } },
        { value: "zoe", attributes: { location: "cs" } },
      ],
      optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
    }),
  ],
});

let renders = 0;
function Coaches({ engine }: { engine: FormEngine }) {
  renders++;
  const options = useChoiceOptions(engine, "coach");
  return <span data-testid="coaches">{options.map((o) => o.value).join(",")}</span>;
}

describe("useChoiceOptions and useRespondentPath", () => {
  it("follow the filtering answer and re-render only when the list changes", () => {
    let engine!: FormEngine;
    function Host() {
      engine = useForm(form);
      return <Coaches engine={engine} />;
    }
    render(<Host />);
    expect(screen.getByTestId("coaches").textContent).toBe("ada,zoe");
    act(() => engine.setValue("location", "cs"));
    expect(screen.getByTestId("coaches").textContent).toBe("zoe");
    const before = renders;
    act(() => engine.setValue("coach", "zoe"));
    expect(renders).toBe(before);
  });

  it("leave out a question the link filled in and hides", () => {
    function Host() {
      const engine = useForm(form, { linkParams: { location: "cff" } });
      return <span data-testid="path">{useRespondentPath(engine).join(",")}</span>;
    }
    render(<Host />);
    expect(screen.getByTestId("path").textContent).toBe("coach");
  });
});
