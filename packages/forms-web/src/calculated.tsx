import { formatCalculated } from "@marktiderman/genesis-forms";
import type { FieldRendererProps, RendererEntry } from "@marktiderman/genesis-forms-react";
import { cn } from "@marktiderman/genesis-ui/utils";
import { describedBy, FieldChrome } from "./chrome";
import { useFormPresentation } from "./presentation";

/**
 * A `calculated` field: the value the engine worked out, read-only. It is an
 * `<output>` named by the question, and polite live region, so a screen
 * reader hears the new value as the answers it reads change.
 */
function CalculatedField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const { presentation, layout } = useFormPresentation();
  const pageFocus = presentation === "page" && layout === "focus";
  const text = formatCalculated(binding.value, binding.field);
  return (
    <FieldChrome props={props}>
      <output
        id={inputId}
        aria-labelledby={`${inputId}-label`}
        aria-describedby={describedBy(props)}
        aria-live="polite"
        data-gf-calculated=""
        className={cn(
          "block rounded-md border border-dashed bg-muted/40 px-3 py-2 font-medium tabular-nums",
          pageFocus ? "text-2xl sm:text-3xl" : "text-base",
          !text && "text-muted-foreground",
        )}
      >
        {text || "—"}
      </output>
    </FieldChrome>
  );
}

export const calculatedRenderers: RendererEntry[] = [{ type: "calculated", Component: CalculatedField }];
