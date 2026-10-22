"use client";

/**
 * RichTextEditor — a WYSIWYG editor for formatted content (headings, bold,
 * italic, underline, lists, links, quotes and optional video embeds), built
 * on Tiptap 3 (ProseMirror) with a Genesis `Toolbar`.
 *
 * Lives on its own subpath, `@marktiderman/genesis-ui/rich-text-editor`, so
 * only apps that import it need the `@tiptap/*` peers. The read-only
 * renderer and the server-safe helpers are on `/rich-text`.
 *
 * @stability Beta
 */
import * as React from "react";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
  Video,
} from "lucide-react";

import { cn } from "../../utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
} from "../ui/toolbar";
import { Tooltip } from "../ui/tooltip";
import {
  type RichTextDoc,
  type RichTextHeadingLevel,
  type SanitizeRichTextOptions,
  isRichTextDoc,
  isRichTextEmpty,
  isSafeUrl,
  normalizeLinkUrl,
  parseVideoUrl,
  richTextToHtml,
  richTextToPlainText,
  sanitizeRichTextDoc,
} from "./rich-text-doc";
import { RichText, richTextClassName } from "./rich-text";
import { VideoEmbed } from "./video-embed";

export { VideoEmbed } from "./video-embed";
export type { RichTextDoc, RichTextHeadingLevel } from "./rich-text-doc";

/**
 * What the editor accepts as a value: the document JSON (canonical), or an
 * HTML string. HTML is parsed by the editor in the browser and reduced to
 * the editor's schema, so it is a migration convenience, not a storage
 * format. Output is always JSON plus derived, sanitized HTML.
 */
export type RichTextEditorValue = RichTextDoc | string;

/** Derived forms of the document, computed on first read. */
export interface RichTextChangeDetails {
  /** Sanitized HTML from `richTextToHtml`. */
  readonly html: string;
  /** Plain text from `richTextToPlainText`. */
  readonly text: string;
  /** True when there is no visible text and no embed. */
  readonly isEmpty: boolean;
  /** Character count of the text (what `maxLength` limits). */
  readonly characters: number;
}

export type RichTextToolbarItem =
  | "heading2"
  | "heading3"
  | "heading4"
  | "bold"
  | "italic"
  | "underline"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "link"
  | "video"
  | "undo"
  | "redo";

export interface RichTextEditorLabels {
  toolbar: string;
  blockGroup: string;
  markGroup: string;
  heading2: string;
  heading3: string;
  heading4: string;
  bold: string;
  italic: string;
  underline: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  link: string;
  video: string;
  undo: string;
  redo: string;
  linkUrl: string;
  linkApply: string;
  linkRemove: string;
  linkInvalid: string;
  videoUrl: string;
  videoTitle: string;
  videoInsert: string;
  videoInvalid: string;
  cancel: string;
  characterCount: (count: number, max: number | undefined) => string;
}

const DEFAULT_LABELS: RichTextEditorLabels = {
  toolbar: "Formatting",
  blockGroup: "Paragraph style",
  markGroup: "Text style",
  heading2: "Heading 2",
  heading3: "Heading 3",
  heading4: "Heading 4",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  blockquote: "Quote",
  link: "Link",
  video: "Embed video",
  undo: "Undo",
  redo: "Redo",
  linkUrl: "Link address",
  linkApply: "Apply",
  linkRemove: "Remove link",
  linkInvalid: "Enter a web address (https://…), an email address or a relative path.",
  videoUrl: "YouTube, Vimeo or Loom link",
  videoTitle: "Title (read by screen readers)",
  videoInsert: "Insert",
  videoInvalid: "Paste a YouTube, Vimeo or Loom video link.",
  cancel: "Cancel",
  characterCount: (count, max) =>
    max ? `${count.toLocaleString()} / ${max.toLocaleString()} characters` : `${count.toLocaleString()} characters`,
};

/** Imperative handle exposed through `ref`. */
export interface RichTextEditorHandle {
  /** Move focus into the editable area. */
  focus: () => void;
  /** Replace the content with an empty document (fires `onChange`). */
  clear: () => void;
  /** The current document, sanitized. */
  getJSON: () => RichTextDoc;
  /** The current document as sanitized HTML. */
  getHTML: () => string;
  /** The underlying Tiptap editor, once mounted (null during SSR/first paint). */
  readonly editor: Editor | null;
}

export interface RichTextEditorProps {
  /**
   * Controlled value. Pass back the `doc` from `onChange` synchronously; any
   * other document (including an older one from a debounced or deferred
   * parent) replaces the content and resets the selection.
   */
  value?: RichTextEditorValue;
  /** Initial value for an uncontrolled editor. */
  defaultValue?: RichTextEditorValue;
  /**
   * Called on every edit with the sanitized document. `details` derives HTML
   * and text lazily, so reading only `doc` costs no serialization.
   */
  onChange?: (doc: RichTextDoc, details: RichTextChangeDetails) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /**
   * `id` of the editable element. A `<label htmlFor={id}>` names the editor
   * (wired as `aria-labelledby`, since a contenteditable is not a labelable
   * element) and clicking it focuses the editor.
   */
  id?: string;
  /**
   * Form field name. When set, a hidden input carries the document as JSON
   * so a native `<form>` submission includes it.
   */
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Marks the field invalid (`aria-invalid`, destructive border). */
  invalid?: boolean;
  /** Placeholder shown while the document is empty. */
  placeholder?: string;
  /** Content is visible and selectable but not editable; the toolbar is hidden. */
  readOnly?: boolean;
  /** Not editable, toolbar disabled, dimmed. */
  disabled?: boolean;
  autoFocus?: boolean;
  /** Heading levels offered in the toolbar and kept in the document. Default `[2, 3]`. Read at mount. */
  headingLevels?: readonly RichTextHeadingLevel[];
  /** Enable YouTube / Vimeo / Loom embeds (toolbar button and schema). Default `false`. Read at mount. */
  embeds?: boolean;
  /** Maximum characters. Typing and pasting stop at the limit. Read at mount. */
  maxLength?: number;
  /** Show the character count under the editor. On by default when `maxLength` is set. */
  showCharacterCount?: boolean;
  /** Toolbar items, in groups as listed. `false` hides the toolbar (shortcuts still work). */
  toolbar?: false | readonly RichTextToolbarItem[];
  /** Override any user-facing string (for translation). */
  labels?: Partial<RichTextEditorLabels>;
  /** Classes for the outer frame. */
  className?: string;
  /** Classes for the editable area (for example a taller `min-h-*`). */
  contentClassName?: string;
  /** Stable test/automation selector (emitted as `data-testid` on the frame). */
  testID?: string;
}

// ---------------------------------------------------------------------------
// Toolbar definitions
// ---------------------------------------------------------------------------

type Keys = readonly string[];

interface ToggleDef {
  id: RichTextToolbarItem;
  icon: React.ComponentType<{ className?: string }>;
  keys: Keys;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const MARKS: ToggleDef[] = [
  {
    id: "bold",
    icon: Bold,
    keys: ["Mod", "B"],
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: "italic",
    icon: Italic,
    keys: ["Mod", "I"],
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: "underline",
    icon: Underline,
    keys: ["Mod", "U"],
    isActive: (e) => e.isActive("underline"),
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
];

const heading = (level: RichTextHeadingLevel, icon: ToggleDef["icon"]): ToggleDef => ({
  id: `heading${level}` as RichTextToolbarItem,
  icon,
  keys: ["Mod", "Alt", String(level)],
  isActive: (e) => e.isActive("heading", { level }),
  run: (e) => e.chain().focus().toggleHeading({ level }).run(),
});

const BLOCKS: ToggleDef[] = [
  heading(2, Heading2),
  heading(3, Heading3),
  heading(4, Heading4),
  {
    id: "bulletList",
    icon: List,
    keys: ["Mod", "Shift", "8"],
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "orderedList",
    icon: ListOrdered,
    keys: ["Mod", "Shift", "7"],
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "blockquote",
    icon: Quote,
    keys: ["Mod", "Shift", "B"],
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

const ALL_TOGGLES = [...MARKS, ...BLOCKS];

const PRESSED_CLASS = "h-8 w-8 px-0 aria-pressed:bg-accent aria-pressed:text-accent-foreground";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect Apple platforms after mount, so SSR and first paint agree ("Ctrl"). */
function useIsApple(): boolean {
  const [apple, setApple] = React.useState(false);
  React.useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
    setApple(/mac|iphone|ipad|ipod/i.test(platform));
  }, []);
  return apple;
}

function keyLabel(key: string, apple: boolean): string {
  if (key === "Mod") return apple ? "⌘" : "Ctrl";
  if (key === "Alt") return apple ? "⌥" : "Alt";
  if (key === "Shift") return apple ? "⇧" : "Shift";
  return key;
}

function ariaKeys(keys: Keys, apple: boolean): string {
  return keys
    .map((k) => (k === "Mod" ? (apple ? "Meta" : "Control") : k))
    .join("+");
}

function ShortcutHint({ label, keys, apple }: { label: string; keys?: Keys; apple: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {label}
      {keys && (
        <span className="inline-flex items-center gap-0.5">
          {keys.map((k) => (
            <Kbd key={k}>{keyLabel(k, apple)}</Kbd>
          ))}
        </span>
      )}
    </span>
  );
}

function initialContent(
  value: RichTextEditorValue | undefined,
  opts: SanitizeRichTextOptions,
): RichTextDoc | string {
  if (typeof value === "string") return value;
  return sanitizeRichTextDoc(value ?? null, opts);
}

function detailsFor(doc: RichTextDoc, characters: () => number, opts: SanitizeRichTextOptions): RichTextChangeDetails {
  let html: string | undefined;
  let text: string | undefined;
  return {
    get html() {
      return (html ??= richTextToHtml(doc, opts));
    },
    get text() {
      return (text ??= richTextToPlainText(doc));
    },
    get isEmpty() {
      return isRichTextEmpty(doc);
    },
    get characters() {
      return characters();
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * RichTextEditor — formatted text input for lessons, notes and other
 * long-form content.
 *
 * - **Value:** JSON is canonical (`RichTextDoc`). `onChange` hands you the
 *   sanitized document plus lazily derived `html`/`text`. Store the JSON;
 *   on the server re-run `sanitizeRichTextDoc` and derive HTML with
 *   `richTextToHtml` (both from `/rich-text`, no DOM needed).
 * - **Security:** output goes through the same allow-list as `RichText`;
 *   links keep only http(s)/mailto/tel/relative URLs; embeds are rebuilt
 *   from a validated YouTube/Vimeo/Loom id.
 * - **SSR:** the editor mounts on the client only (Tiptap
 *   `immediatelyRender: false`). Until then a JSON value renders read-only,
 *   so server HTML shows the content instead of an empty box.
 * - **Keyboard:** standard shortcuts (⌘/Ctrl+B, I, U, K for link,
 *   ⌘/Ctrl+Alt+2/3 for headings, ⌘/Ctrl+Shift+7/8 for lists, ⌘/Ctrl+Shift+B
 *   for quote, ⌘/Ctrl+Z / Shift+Z), shown in each toolbar tooltip. The
 *   toolbar is one tab stop with arrow-key navigation (Radix Toolbar).
 *
 * @stability Beta
 */
export const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor(props, ref) {
    const {
      value,
      defaultValue,
      onChange,
      onFocus,
      onBlur,
      id: idProp,
      name,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      "aria-describedby": ariaDescribedBy,
      invalid = false,
      placeholder,
      readOnly = false,
      disabled = false,
      autoFocus = false,
      headingLevels = [2, 3],
      embeds = false,
      maxLength,
      showCharacterCount,
      toolbar,
      labels: labelsProp,
      className,
      contentClassName,
      testID,
    } = props;

    const labels = React.useMemo(() => ({ ...DEFAULT_LABELS, ...labelsProp }), [labelsProp]);
    const generatedId = React.useId();
    const editorId = idProp ?? `rte-${generatedId}`;
    const countId = `${editorId}-count`;
    const apple = useIsApple();

    // Mount-time configuration. The schema (heading levels, embeds) and the
    // character limit are fixed for the editor's lifetime; changing them
    // means remounting (give the component a new `key`).
    const [config] = React.useState(() => ({
      opts: { headingLevels, embeds } satisfies SanitizeRichTextOptions,
      maxLength,
    }));
    const { opts } = config;

    const onChangeRef = React.useRef(onChange);
    const onFocusRef = React.useRef(onFocus);
    const onBlurRef = React.useRef(onBlur);
    const placeholderRef = React.useRef(placeholder);
    const stringControlledRef = React.useRef(typeof value === "string");
    const openLinkRef = React.useRef<() => boolean>(() => false);
    React.useEffect(() => {
      onChangeRef.current = onChange;
      onFocusRef.current = onFocus;
      onBlurRef.current = onBlur;
      placeholderRef.current = placeholder;
      stringControlledRef.current = typeof value === "string";
    });

    // The last document we emitted (reference and HTML), so a controlled
    // parent echoing it back does not reset the selection.
    const lastEmitted = React.useRef<{ doc: RichTextDoc | null; html: string | null }>({
      doc: null,
      html: null,
    });
    const [initial] = React.useState(() => initialContent(value ?? defaultValue, opts));
    const [formValue, setFormValue] = React.useState(() =>
      isRichTextDoc(initial) ? JSON.stringify(initial) : "",
    );

    const extensions = React.useMemo(
      () => [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          strike: false,
          horizontalRule: false,
          heading: { levels: [...opts.headingLevels] },
          link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            defaultProtocol: "https",
            // Same rule as the sanitizer, so a link the editor shows is a link
            // that survives `onChange`.
            isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && isSafeUrl(url),
          },
        }),
        Placeholder.configure({ placeholder: () => placeholderRef.current ?? "" }),
        CharacterCount.configure({ limit: config.maxLength ?? null }),
        ...(opts.embeds ? [VideoEmbed] : []),
        Extension.create({
          name: "genesisLinkShortcut",
          addKeyboardShortcuts: () => ({
            // Only claims the shortcut when the link control is there to open.
            "Mod-k": () => openLinkRef.current(),
          }),
        }),
      ],
      // Mount-time only, by design (see `config` above).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const editor = useEditor({
      extensions,
      content: initial,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: !readOnly && !disabled,
      autofocus: autoFocus ? "end" : false,
      onUpdate: ({ editor: e }) => {
        const doc = sanitizeRichTextDoc(e.getJSON(), opts);
        const details = detailsFor(doc, () => e.storage.characterCount.characters(), opts);
        lastEmitted.current = { doc, html: null };
        if (name) setFormValue(JSON.stringify(doc));
        const cb = onChangeRef.current;
        if (cb) {
          cb(doc, details);
          // Only serialize HTML for string-controlled parents.
          if (stringControlledRef.current) lastEmitted.current.html = details.html;
        }
      },
      onFocus: () => onFocusRef.current?.(),
      onBlur: () => onBlurRef.current?.(),
    });

    const state = useEditorState({
      editor,
      // Reads the `editor` from this render rather than the snapshot's: the
      // snapshot only refreshes on a transaction, so right after mount it
      // still holds `null` and the toolbar (and count) would start blank.
      selector: () => {
        const e = editor;
        if (!e) return null;
        const active: Partial<Record<RichTextToolbarItem, boolean>> = {};
        for (const def of ALL_TOGGLES) active[def.id] = def.isActive(e);
        return {
          active,
          link: e.isActive("link"),
          canUndo: e.can().undo(),
          canRedo: e.can().redo(),
          characters: e.storage.characterCount.characters() as number,
        };
      },
    });

    // Once mounted: the hidden form value reflects the parsed document (an
    // HTML defaultValue is only parsed now), and a string-controlled value is
    // recorded as already applied so the first render does not reset the caret.
    React.useEffect(() => {
      if (!editor) return;
      if (typeof initial === "string") {
        lastEmitted.current = { doc: null, html: initial };
        setFormValue(JSON.stringify(sanitizeRichTextDoc(editor.getJSON(), opts)));
      }
    }, [editor, initial, opts]);

    // `<label htmlFor={id}>`: name the editor and focus it on click.
    const [labelId, setLabelId] = React.useState<string | undefined>(undefined);
    React.useEffect(() => {
      if (!editor || ariaLabel || ariaLabelledBy || typeof document === "undefined") return;
      const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(editorId)}"]`);
      if (!label) return;
      if (!label.id) label.id = `${editorId}-label`;
      setLabelId(label.id);
      const onClick = (event: MouseEvent) => {
        event.preventDefault();
        editor.commands.focus();
      };
      label.addEventListener("click", onClick);
      return () => label.removeEventListener("click", onClick);
    }, [editor, editorId, ariaLabel, ariaLabelledBy]);

    // Editable follows readOnly/disabled.
    React.useEffect(() => {
      editor?.setEditable(!readOnly && !disabled, false);
    }, [editor, readOnly, disabled]);

    // Controlled value: apply only values that differ from what we emitted.
    React.useEffect(() => {
      if (!editor || value === undefined) return;
      const last = lastEmitted.current;
      if (typeof value === "string") {
        if (value === last.html) return;
      } else if (value === last.doc) {
        return;
      }
      const next = initialContent(value, opts);
      if (
        typeof next !== "string" &&
        JSON.stringify(sanitizeRichTextDoc(editor.getJSON(), opts)) === JSON.stringify(next)
      ) {
        return;
      }
      editor.commands.setContent(next, { emitUpdate: false });
      const doc = sanitizeRichTextDoc(editor.getJSON(), opts);
      lastEmitted.current = { doc: typeof value === "string" ? null : value, html: typeof value === "string" ? value : null };
      if (name) setFormValue(JSON.stringify(doc));
    }, [editor, value, opts, name]);

    // ARIA and classes on the editable element follow props.
    const countVisible = showCharacterCount ?? config.maxLength !== undefined;
    const describedBy = [ariaDescribedBy, countVisible ? countId : null].filter(Boolean).join(" ") || undefined;
    const contentClasses = cn(
      richTextClassName,
      "min-h-32 px-3 py-2 outline-none",
      // Placeholder (Tiptap marks the empty first node with data-placeholder).
      "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
      // Embeds are selected and deleted as a whole while editing.
      "[&_[data-video-embed]_iframe]:pointer-events-none [&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-ring",
      contentClassName,
    );
    React.useEffect(() => {
      if (!editor) return;
      const attributes: Record<string, string> = {
        id: editorId,
        role: "textbox",
        "aria-multiline": "true",
        class: contentClasses,
      };
      if (ariaLabel) attributes["aria-label"] = ariaLabel;
      if (ariaLabelledBy ?? labelId) attributes["aria-labelledby"] = (ariaLabelledBy ?? labelId)!;
      if (describedBy) attributes["aria-describedby"] = describedBy;
      if (invalid) attributes["aria-invalid"] = "true";
      if (readOnly) attributes["aria-readonly"] = "true";
      if (disabled) attributes["aria-disabled"] = "true";
      if (placeholder) attributes["aria-placeholder"] = placeholder;
      editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes } });
    }, [editor, editorId, contentClasses, ariaLabel, ariaLabelledBy, labelId, describedBy, invalid, readOnly, disabled, placeholder]);

    React.useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus(),
        clear: () => {
          editor?.commands.clearContent(true);
        },
        getJSON: () => sanitizeRichTextDoc(editor?.getJSON() ?? initial, opts),
        getHTML: () => richTextToHtml(editor?.getJSON() ?? initial, opts),
        get editor() {
          return editor;
        },
      }),
      [editor, initial, opts],
    );

    // ----- Link and video popovers ---------------------------------------
    const [linkOpen, setLinkOpen] = React.useState(false);
    // Opened with Mod-K from the text: Escape should return there too.
    const [linkFromShortcut, setLinkFromShortcut] = React.useState(false);
    const [videoOpen, setVideoOpen] = React.useState(false);
    const interactive = !!editor && !readOnly && !disabled;

    const items = React.useMemo(() => {
      const levels = opts.headingLevels as readonly number[];
      const defaults: RichTextToolbarItem[] = [
        "heading2",
        "heading3",
        "heading4",
        "bold",
        "italic",
        "underline",
        "bulletList",
        "orderedList",
        "blockquote",
        "link",
        "video",
        "undo",
        "redo",
      ];
      return new Set(
        (toolbar || defaults).filter((item) => {
          if (item.startsWith("heading")) return levels.includes(Number(item.slice(7)));
          if (item === "video") return opts.embeds;
          return true;
        }),
      );
    }, [toolbar, opts]);

    const renderToggleGroup = (defs: ToggleDef[], groupLabel: string) => {
      const shown = defs.filter((d) => items.has(d.id));
      if (shown.length === 0) return null;
      const activeIds = shown.filter((d) => state?.active[d.id]).map((d) => d.id);
      return (
        <ToolbarToggleGroup
          type="multiple"
          aria-label={groupLabel}
          value={activeIds}
          disabled={!interactive}
          onValueChange={(next: string[]) => {
            if (!editor) return;
            for (const def of shown) {
              if (next.includes(def.id) !== activeIds.includes(def.id)) def.run(editor);
            }
          }}
        >
          {shown.map((def) => {
            const Icon = def.icon;
            const label = labels[def.id as keyof RichTextEditorLabels] as string;
            return (
              <Tooltip key={def.id} delayDuration={300} content={<ShortcutHint label={label} keys={def.keys} apple={apple} />}>
                <ToolbarToggleItem
                  value={def.id}
                  aria-label={label}
                  aria-keyshortcuts={ariaKeys(def.keys, apple)}
                  // Pressed styling keys off aria-pressed, not data-state:
                  // the Tooltip trigger wrapping this item writes its own
                  // data-state (closed / delayed-open) over the toggle's.
                  className={PRESSED_CLASS}
                >
                  <Icon className="size-4" aria-hidden />
                </ToolbarToggleItem>
              </Tooltip>
            );
          })}
        </ToolbarToggleGroup>
      );
    };

    const groups: React.ReactNode[] = [];
    const blockGroup = renderToggleGroup(BLOCKS, labels.blockGroup);
    const markGroup = renderToggleGroup(MARKS, labels.markGroup);
    if (blockGroup) groups.push(<React.Fragment key="blocks">{blockGroup}</React.Fragment>);
    if (markGroup) groups.push(<React.Fragment key="marks">{markGroup}</React.Fragment>);
    if (items.has("link") || items.has("video")) {
      groups.push(
        <div key="insert" className="flex items-center gap-1">
          {items.has("link") && (
            <LinkPopover
              editor={editor}
              open={linkOpen}
              onOpenChange={setLinkOpen}
              returnToEditor={linkFromShortcut}
              onClosed={() => setLinkFromShortcut(false)}
              disabled={!interactive}
              pressed={!!state?.link}
              labels={labels}
              apple={apple}
            />
          )}
          {items.has("video") && (
            <VideoPopover
              editor={editor}
              open={videoOpen}
              onOpenChange={setVideoOpen}
              disabled={!interactive}
              labels={labels}
            />
          )}
        </div>,
      );
    }
    if (items.has("undo") || items.has("redo")) {
      groups.push(
        <div key="history" className="flex items-center gap-1">
          {items.has("undo") && (
            <Tooltip delayDuration={300} content={<ShortcutHint label={labels.undo} keys={["Mod", "Z"]} apple={apple} />}>
              <ToolbarButton
                aria-label={labels.undo}
                aria-keyshortcuts={ariaKeys(["Mod", "Z"], apple)}
                className="h-8 w-8 px-0"
                disabled={!interactive || !state?.canUndo}
                onClick={() => editor?.chain().focus().undo().run()}
              >
                <Undo2 className="size-4" aria-hidden />
              </ToolbarButton>
            </Tooltip>
          )}
          {items.has("redo") && (
            <Tooltip
              delayDuration={300}
              content={<ShortcutHint label={labels.redo} keys={["Mod", "Shift", "Z"]} apple={apple} />}
            >
              <ToolbarButton
                aria-label={labels.redo}
                aria-keyshortcuts={ariaKeys(["Mod", "Shift", "Z"], apple)}
                className="h-8 w-8 px-0"
                disabled={!interactive || !state?.canRedo}
                onClick={() => editor?.chain().focus().redo().run()}
              >
                <Redo2 className="size-4" aria-hidden />
              </ToolbarButton>
            </Tooltip>
          )}
        </div>,
      );
    }

    const showToolbar = toolbar !== false && !readOnly && groups.length > 0;
    const linkAvailable = interactive && showToolbar && items.has("link");
    React.useLayoutEffect(() => {
      openLinkRef.current = () => {
        if (!linkAvailable) return false;
        setLinkFromShortcut(true);
        setLinkOpen(true);
        return true;
      };
    }, [linkAvailable]);

    return (
      <div
        data-testid={testID}
        data-disabled={disabled ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
        className={cn(
          "w-full overflow-hidden rounded-md border border-input bg-background ring-offset-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          invalid && "border-destructive",
          disabled && "cursor-not-allowed opacity-50",
          readOnly && "border-transparent",
          className,
        )}
      >
        {showToolbar && (
          <Toolbar
            aria-label={labels.toolbar}
            aria-controls={editorId}
            className="flex-wrap rounded-none border-0 border-b border-border"
          >
            {groups.flatMap((group, i) =>
              i === 0 ? [group] : [<ToolbarSeparator key={`sep-${i}`} />, group],
            )}
          </Toolbar>
        )}
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          // Server render and first client paint: show the content read-only
          // so the page is not blank (or shifting) while the editor mounts.
          <RichText
            value={isRichTextDoc(initial) ? initial : null}
            aria-busy="true"
            className={cn("min-h-32 px-3 py-2", contentClassName)}
          />
        )}
        {countVisible && (
          <div id={countId} className="border-t border-border px-3 py-1 text-right text-xs text-muted-foreground">
            {labels.characterCount(state?.characters ?? 0, config.maxLength)}
          </div>
        )}
        {name && <input type="hidden" name={name} value={formValue} />}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// Popovers
// ---------------------------------------------------------------------------

interface PopoverProps {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  labels: RichTextEditorLabels;
}

function LinkPopover({
  editor,
  open,
  onOpenChange,
  disabled,
  pressed,
  labels,
  apple,
  returnToEditor,
  onClosed,
}: PopoverProps & { pressed: boolean; apple: boolean; returnToEditor: boolean; onClosed: () => void }) {
  const inputId = React.useId();
  const errorId = `${inputId}-error`;
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (open && editor) {
      setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
      setError(false);
    }
  }, [open, editor]);

  // After Apply / Remove / Cancel focus returns to the text; after Escape or
  // a click outside, Radix returns it to the toolbar button as usual.
  const toEditor = React.useRef(false);
  const finish = () => {
    toEditor.current = true;
    onOpenChange(false);
  };
  const onCloseAutoFocus = (event: Event) => {
    onClosed();
    if (!toEditor.current && !returnToEditor) return;
    toEditor.current = false;
    event.preventDefault();
    editor?.commands.focus();
  };

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editor) return;
    const href = normalizeLinkUrl(url);
    if (!href) {
      setError(true);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    finish();
  };

  const remove = () => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    finish();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip delayDuration={300} content={<ShortcutHint label={labels.link} keys={["Mod", "K"]} apple={apple} />}>
        <PopoverTrigger asChild>
          <ToolbarButton
            aria-label={labels.link}
            aria-pressed={pressed}
            aria-keyshortcuts={ariaKeys(["Mod", "K"], apple)}
            className={PRESSED_CLASS}
            disabled={disabled}
          >
            <LinkIcon className="size-4" aria-hidden />
          </ToolbarButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-80" onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={apply} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>{labels.linkUrl}</Label>
            <Input
              id={inputId}
              value={url}
              autoFocus
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              aria-invalid={error || undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(false);
              }}
            />
            {error && (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {labels.linkInvalid}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {pressed && (
              <Button type="button" variant="ghost" size="sm" onClick={remove}>
                {labels.linkRemove}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={finish}>
              {labels.cancel}
            </Button>
            <Button type="submit" size="sm">
              {labels.linkApply}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function VideoPopover({ editor, open, onOpenChange, disabled, labels }: PopoverProps) {
  const urlId = React.useId();
  const titleId = React.useId();
  const errorId = `${urlId}-error`;
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUrl("");
      setTitle("");
      setError(false);
    }
  }, [open]);

  // After Apply / Remove / Cancel focus returns to the text; after Escape or
  // a click outside, Radix returns it to the toolbar button as usual.
  const toEditor = React.useRef(false);
  const finish = () => {
    toEditor.current = true;
    onOpenChange(false);
  };
  const onCloseAutoFocus = (event: Event) => {
    if (!toEditor.current) return;
    toEditor.current = false;
    event.preventDefault();
    editor?.commands.focus();
  };

  const insert = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editor) return;
    if (!parseVideoUrl(url)) {
      setError(true);
      return;
    }
    const ok = editor
      .chain()
      .focus()
      .setVideoEmbed({ url, ...(title.trim() ? { title: title.trim() } : {}) })
      .run();
    if (!ok) {
      setError(true);
      return;
    }
    finish();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip delayDuration={300} content={labels.video}>
        <PopoverTrigger asChild>
          <ToolbarButton aria-label={labels.video} className="h-8 w-8 px-0" disabled={disabled}>
            <Video className="size-4" aria-hidden />
          </ToolbarButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-80" onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={insert} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={urlId}>{labels.videoUrl}</Label>
            <Input
              id={urlId}
              value={url}
              autoFocus
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              aria-invalid={error || undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(false);
              }}
            />
            {error && (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {labels.videoInvalid}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={titleId}>{labels.videoTitle}</Label>
            <Input id={titleId} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={finish}>
              {labels.cancel}
            </Button>
            <Button type="submit" size="sm">
              {labels.videoInsert}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
