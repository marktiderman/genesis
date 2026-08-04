import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/** Spinner rendered in the leading slot while `loading`. */
function Spinner() {
  return (
    <svg
      className="animate-spin size-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/** Props shared by both the `<button>` and the `asChild` rendering modes. */
interface ButtonOwnProps extends VariantProps<typeof buttonVariants> {
  /**
   * Marks the control busy: renders a spinner in the leading slot and makes
   * the control inert (see `disabled`). In `asChild` mode the spinner is not
   * injected — there is no button chrome to put it in — but the control is
   * still made inert, so a "loading" link can't be activated mid-flight.
   */
  loading?: boolean;
  /** Optional leading icon slot (replaced by the spinner while loading). Ignored when `asChild`. */
  startIcon?: React.ReactNode;
  /** Optional trailing icon slot. Ignored when `asChild`. */
  endIcon?: React.ReactNode;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
  /**
   * Makes the control inert. On a real `<button>` this is the native
   * `disabled` attribute; in `asChild` mode it becomes `aria-disabled` plus
   * activation blocking, because `disabled` is a button-only attribute that
   * anchors and router links ignore entirely. See `asChild`.
   */
  disabled?: boolean;
}

/**
 * Button rendered as a real `<button>` (the default).
 *
 * Kept as an interface extending `ButtonHTMLAttributes<HTMLButtonElement>` so
 * it stays back-compatible for consumers that `extend` it. `asChild` is typed
 * `false` here (not `boolean`) purely so the two overloads below discriminate
 * cleanly — pass `asChild` as a literal, not a computed boolean.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonOwnProps {
  ref?: React.Ref<HTMLButtonElement>;
  asChild?: false;
}

/**
 * Button composed onto a caller-supplied child element via Radix `Slot`
 * instead of rendering a `<button>` — put Button's styling on an `<a>`,
 * router `Link`, or any other element without an extra wrapper node. The
 * child becomes the real DOM node Button's props land on, so it must accept
 * (and forward) a `ref` and spread props — the same contract as every other
 * Radix `asChild` consumer (`PopoverTrigger`, `DropdownMenuTrigger`, ...),
 * and it must be exactly ONE element (Radix `Slot` throws otherwise).
 *
 * Ref and event handlers are typed against `HTMLElement` rather than
 * `HTMLButtonElement` here, because that is what Slot actually forwards them
 * to — this is what lets an anchor ref be passed, and what stops a handler
 * from reaching button-only properties (`.form`, ...) on what is really an
 * anchor at runtime.
 *
 * `disabled` (and `loading`) become `aria-disabled` + activation blocking
 * rather than the button-only `disabled` attribute. Known limitation: Radix
 * `Slot` composes handlers child-first, so if the CHILD carries its own
 * `onClick`/`onKeyDown`, that handler still runs before Button's guard. The
 * default action (following an href) is still prevented, and in a real
 * browser `pointer-events-none` stops the mouse path from firing at all —
 * but don't rely on a disabled asChild Button to suppress side effects the
 * child itself schedules on click.
 */
export interface ButtonAsChildProps
  extends React.HTMLAttributes<HTMLElement>,
    ButtonOwnProps {
  ref?: React.Ref<HTMLElement>;
  asChild: true;
}

/**
 * Button — primary interactive control. Variants: default, secondary,
 * outline, ghost, destructive, link.
 *
 * Overloaded on `asChild`: see {@link ButtonProps} for the default
 * `<button>` mode and {@link ButtonAsChildProps} for Slot composition. The
 * `ButtonProps` signature is declared LAST on purpose —
 * `React.ComponentProps<typeof Button>` infers from the final call
 * signature, so reordering these two silently changes what that resolves to
 * for every consumer.
 *
 * @stability Stable
 */
export function Button(props: ButtonAsChildProps): React.ReactElement;
export function Button(props: ButtonProps): React.ReactElement;
export function Button(
  props: ButtonProps | ButtonAsChildProps
): React.ReactElement {
  if (props.asChild) {
    const {
      asChild: _asChild,
      className,
      variant,
      size,
      ref,
      disabled,
      loading = false,
      startIcon: _startIcon,
      endIcon: _endIcon,
      testID,
      children,
      onClick,
      onKeyDown,
      ...rest
    } = props;

    // `disabled` and `loading` both mean "not actionable right now".
    const inert = Boolean(disabled) || loading;

    return (
      <SlotPrimitive.Root
        ref={ref}
        data-slot="button"
        data-testid={testID}
        aria-busy={loading || undefined}
        // NOT the `disabled` attribute: Slot forwards these onto the child,
        // which is typically an <a> / router Link, and `disabled` is
        // button-only. Anchors neither match `:disabled` nor block
        // activation on it, so a disabled asChild Button would stay fully
        // navigable AND lose its disabled styling. Announce the state via
        // ARIA, block activation below, and hang the styling off `inert`.
        aria-disabled={inert || undefined}
        className={cn(
          buttonVariants({ variant, size }),
          // Mirrors the `disabled:` treatment the cva base applies to a real
          // <button>. `pointer-events-none` is also the primary mouse guard:
          // the click never reaches the element, so the child's own onClick
          // cannot fire either.
          inert && "pointer-events-none opacity-50",
          className
        )}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          if (inert) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
        onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
          // Anchors activate on Enter; role="button" children also on Space.
          // preventDefault stops the navigation/default action even though
          // Slot runs the child's own handler before this one.
          if (inert && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onKeyDown?.(event);
        }}
        {...rest}
      >
        {children}
      </SlotPrimitive.Root>
    );
  }

  const {
    asChild: _asChild,
    className,
    variant,
    size,
    ref,
    loading = false,
    startIcon,
    endIcon,
    disabled,
    type,
    children,
    testID,
    ...rest
  } = props;

  return (
    <button
      ref={ref}
      data-slot="button"
      data-testid={testID}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // Default to "button" so a bare button can't accidentally submit a
      // wrapping <form>; an explicit type still overrides.
      type={type ?? "button"}
      {...rest}
    >
      {loading ? <Spinner /> : startIcon}
      {children}
      {!loading && endIcon}
    </button>
  );
}

export { buttonVariants };
