import type { RowPicture } from "@marktiderman/genesis-core/resource-view";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";

/**
 * A row's picture from `rowPicture(view.summary(row))`: the image, or initials when there is no
 * safe image or it fails to load. Decorative unless the view gave `alt`: the row's title beside it
 * already names the row.
 */
export function RowAvatar({ picture }: { picture: RowPicture }) {
  const decorative = picture.kind === "initials" || picture.alt === "";
  return (
    <Avatar className="size-7 text-xs" data-testid="resource-view-avatar" aria-hidden={decorative || undefined}>
      {picture.kind === "image" ? <AvatarImage src={picture.src} alt={picture.alt} /> : null}
      <AvatarFallback>{picture.kind === "image" ? picture.fallback : picture.text}</AvatarFallback>
    </Avatar>
  );
}
