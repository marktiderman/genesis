// A paged carousel: which slide a scroll offset shows, and the offset of a slide.

/** The slide a scroll `offset` rests on, for slides `pageSize` wide, kept inside `count`. */
export function carouselIndex(offset: number, pageSize: number, count: number): number {
  if (!(pageSize > 0) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(offset / pageSize)));
}

/** The scroll offset that shows slide `index`. */
export function carouselOffset(index: number, pageSize: number): number {
  return Math.max(0, index) * pageSize;
}
