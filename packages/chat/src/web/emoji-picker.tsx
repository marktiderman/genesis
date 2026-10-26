/**
 * @feat:chat
 * The full emoji picker, on frimousse (headless, MIT): a search box, every emoji by category
 * in a virtualised grid, keyboard navigation and screen-reader labels from frimousse, styled
 * here with Genesis tokens. Used for reactions ("+" beside the quick six) and in the composer.
 * The emoji data loads from `emojibaseUrl` (jsDelivr's emojibase-data by default) and is cached.
 */
import { EmojiPicker } from "frimousse";
import { Spinner, cn } from "@marktiderman/genesis-ui";

export interface ChatEmojiPickerProps {
  onSelect: (emoji: string) => void;
  /** Where the Emojibase data is fetched from (self-host it to avoid the CDN). */
  emojibaseUrl?: string;
  locale?: "en";
  columns?: number;
  className?: string;
}

export function ChatEmojiPicker({ onSelect, emojibaseUrl, locale, columns = 8, className }: ChatEmojiPickerProps) {
  return (
    <EmojiPicker.Root
      onEmojiSelect={(e) => onSelect(e.emoji)}
      emojibaseUrl={emojibaseUrl}
      locale={locale}
      columns={columns}
      className={cn("isolate flex h-80 w-[18.5rem] flex-col bg-popover text-popover-foreground", className)}
      data-testid="genesis-chat-emoji-picker"
    >
      <EmojiPicker.Search
        autoFocus
        aria-label="Search emoji"
        placeholder="Search emoji"
        className="m-2 h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" aria-label="Loading emoji" />
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No emoji found</EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-popover px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                type="button"
                className={cn("flex size-8 items-center justify-center rounded-md text-xl", emoji.isActive && "bg-accent")}
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
