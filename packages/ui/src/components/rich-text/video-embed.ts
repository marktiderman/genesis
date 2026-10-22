"use client";

/**
 * VideoEmbed — a Tiptap node for YouTube, Vimeo and Loom players.
 *
 * The node stores only `{ provider, id, hash?, title? }`, never a URL, and
 * rebuilds the player URL from those validated parts every time it renders.
 * A pasted `<iframe>` is accepted only when its `src` parses as one of the
 * three hosts; any other iframe is dropped by the editor's schema.
 *
 * Exported for apps that assemble their own Tiptap editor and want the same
 * embed node `RichTextEditor` uses.
 */
import { Node } from "@tiptap/core";
import {
  type VideoEmbedAttrs,
  VIDEO_IFRAME_ATTRS,
  parseVideoUrl,
  sanitizeVideoEmbedAttrs,
  videoEmbedSrc,
  videoEmbedTitle,
} from "./rich-text-doc";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoEmbed: {
      /**
       * Insert a video embed from a YouTube, Vimeo or Loom URL. Fails (returns
       * false, inserts nothing) for any other URL.
       */
      setVideoEmbed: (options: { url: string; title?: string }) => ReturnType;
    };
  }
}

const noRender = { renderHTML: () => ({}) };

/**
 * Tiptap node for YouTube, Vimeo and Loom players, stored as
 * `{ provider, id, hash?, title? }` and rebuilt from those parts on render.
 * Adds the `setVideoEmbed({ url, title })` command.
 *
 * @stability Beta
 */
export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: { default: null, ...noRender },
      id: { default: null, ...noRender },
      hash: { default: null, ...noRender },
      title: { default: null, ...noRender },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-video-embed]",
        priority: 60,
        getAttrs: (el) => {
          const attrs = sanitizeVideoEmbedAttrs({
            provider: el.getAttribute("data-provider"),
            id: el.getAttribute("data-id"),
            hash: el.getAttribute("data-hash") ?? undefined,
            title: el.getAttribute("data-title") ?? undefined,
          });
          return attrs ? { ...attrs } : false;
        },
      },
      {
        tag: "iframe[src]",
        getAttrs: (el) => {
          const parsed = parseVideoUrl(el.getAttribute("src") ?? "");
          if (!parsed) return false;
          const attrs = sanitizeVideoEmbedAttrs({ ...parsed, title: el.getAttribute("title") ?? undefined });
          return attrs ? { ...attrs } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs = sanitizeVideoEmbedAttrs(node.attrs);
    if (!attrs) return ["div", { "data-video-embed-invalid": "" }];
    const title = videoEmbedTitle(attrs);
    return [
      "div",
      {
        "data-video-embed": "",
        "data-provider": attrs.provider,
        "data-id": attrs.id,
        ...(attrs.hash ? { "data-hash": attrs.hash } : {}),
        ...(attrs.title ? { "data-title": attrs.title } : {}),
      },
      [
        "iframe",
        {
          src: videoEmbedSrc(attrs),
          title,
          allow: VIDEO_IFRAME_ATTRS.allow,
          allowfullscreen: "true",
          loading: VIDEO_IFRAME_ATTRS.loading,
          referrerpolicy: VIDEO_IFRAME_ATTRS.referrerPolicy,
          sandbox: VIDEO_IFRAME_ATTRS.sandbox,
          // Inside the editor the frame is not a tab stop: the node is
          // selected and deleted as a whole, and playback happens in the
          // read-only view.
          tabindex: "-1",
        },
      ],
    ];
  },

  addCommands() {
    return {
      setVideoEmbed:
        ({ url, title }) =>
        ({ commands, state }) => {
          const parsed = parseVideoUrl(url);
          if (!parsed) return false;
          const attrs: VideoEmbedAttrs | null = sanitizeVideoEmbedAttrs({ ...parsed, title });
          if (!attrs) return false;
          const node = { type: this.name, attrs: { ...attrs } };
          // Insert BETWEEN top-level blocks rather than at the caret, which
          // would split the paragraph or heading the caret is in. An empty
          // paragraph is replaced instead of being left behind.
          const { $from } = state.selection;
          if ($from.depth === 0) return commands.insertContent(node);
          const block = $from.node(1);
          if (block.type.name === "paragraph" && block.content.size === 0) {
            return commands.insertContentAt({ from: $from.before(1), to: $from.after(1) }, node);
          }
          return commands.insertContentAt($from.after(1), node);
        },
    };
  },
});
