/**
 * The value of a picker's "None" choice (the words are `messages.link.none`), which sets a field
 * that can be empty back to empty. Radix's Select and cmdk can't hold "" as an item value, so every
 * picker in this package uses this one sentinel and turns it into `null` before it leaves the picker.
 */
export const NONE_CHOICE = "__genesis_link_none__";
