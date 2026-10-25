/**
 * Content blocks as flow steps. In focus layout a content block (a heading, a paragraph, a
 * callout) is a step of its own, like a question with nothing to answer: Next moves on. Content
 * kinds are registered in genesis-forms (`registerContentType`), so web, native and the server
 * parse the same definitions; this registry draws them. A kind with no renderer here shows its
 * display text (`contentText`), so a step never disappears.
 */
import { useCallback, type ComponentType } from "react";
import { Text, View } from "react-native";
import { contentText, type ContentBlock, type FormEngine, type Json } from "@marktiderman/genesis-forms";
import { useFormNative } from "./context";
import { useFormStyles } from "./styles";

export interface ContentRendererProps {
  engine: FormEngine;
  block: ContentBlock;
  /** The block's display text (`contentText`) with recall resolved. */
  text: string;
  /** A testID prefix unique to the form. */
  inputId: string;
  /** Attach to the text a screen reader should move to when this step appears. */
  focusRef(node: unknown): void;
}

export interface ContentRendererEntry {
  /** The content kind, as registered with `registerContentType`. */
  type: string;
  /** Highest rank wins. Built-ins use 1. */
  rank?: number | undefined;
  Component: ComponentType<ContentRendererProps>;
}

export interface ContentRendererRegistry {
  register(entry: ContentRendererEntry): ContentRendererRegistry;
  resolve(type: string): ComponentType<ContentRendererProps> | undefined;
  /** A new registry with these entries plus this one's. */
  extend(entries: ContentRendererEntry[]): ContentRendererRegistry;
}

export function createContentRegistry(entries: ContentRendererEntry[] = []): ContentRendererRegistry {
  const list = [...entries];
  const registry: ContentRendererRegistry = {
    register(entry) {
      list.push(entry);
      return registry;
    },
    resolve(type) {
      let best: ContentRendererEntry | undefined;
      for (const entry of list) {
        if (entry.type === type && (!best || (entry.rank ?? 1) >= (best.rank ?? 1))) best = entry;
      }
      return best?.Component;
    },
    extend: (more) => createContentRegistry([...list, ...more]),
  };
  return registry;
}

function Heading({ text, focusRef, inputId }: ContentRendererProps) {
  const s = useFormStyles();
  return (
    <Text ref={focusRef} testID={inputId} accessibilityRole="header" style={s.contentHeading}>
      {text}
    </Text>
  );
}

function Paragraph({ text, focusRef, inputId }: ContentRendererProps) {
  const s = useFormStyles();
  return (
    <Text ref={focusRef} testID={inputId} style={s.contentText}>
      {text}
    </Text>
  );
}

const str = (v: Json | undefined) => (typeof v === "string" && v.trim() ? v : undefined);

/**
 * A callout: a note set apart, with an optional `props.title` and a `props.tone` of `info`
 * (default), `success` or `warning`. Register the kind in genesis-forms on every side that
 * parses the form (see the README), then this draws it.
 */
function Callout({ block, engine, text, focusRef, inputId }: ContentRendererProps) {
  const s = useFormStyles();
  const title = str(block.props?.title);
  const tone = block.props?.tone;
  return (
    <View
      ref={focusRef}
      testID={inputId}
      accessible
      accessibilityLabel={[title ? engine.text(title) : "", text].filter(Boolean).join(". ")}
      style={[s.callout, tone === "warning" ? s.calloutWarning : tone === "success" ? s.calloutSuccess : null]}
    >
      {title ? <Text style={s.bannerTitle}>{engine.text(title)}</Text> : null}
      <Text style={s.contentText}>{text}</Text>
    </View>
  );
}

export const builtInContentRenderers: ContentRendererEntry[] = [
  { type: "heading", Component: Heading },
  { type: "text", Component: Paragraph },
  { type: "callout", Component: Callout },
];

/** The built-in content renderers. `extend()` returns a new registry; `register()` changes this one for every form. */
export const defaultContentRegistry = createContentRegistry(builtInContentRenderers);

/** One content step, drawn by the registry (or as plain text when its kind has no renderer). */
export function ContentStep({ engine, block, registry, inputId }: { engine: FormEngine; block: ContentBlock; registry: ContentRendererRegistry; inputId: string }) {
  const s = useFormStyles();
  const { focus } = useFormNative();
  const id = block.id;
  const focusRef = useCallback((node: unknown) => focus.setQuestion(id, node), [focus, id]);
  const Component = registry.resolve(block.type) ?? Paragraph;
  return (
    <View style={s.content}>
      <Component engine={engine} block={block} text={engine.text(contentText(block))} inputId={inputId} focusRef={focusRef} />
    </View>
  );
}
