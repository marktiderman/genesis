// The items in a slot's children, as a person wrote them: arrays and Fragments opened up (a
// screen's `<>{a}{b}</>` is two stat tiles, not one), and nothing (null, false, "") left out.
// `Children.toArray` alone opens arrays but keeps a Fragment as a single child.
import { Children, Fragment, isValidElement, type ReactNode } from "react";

export function flattenChildren(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  for (const child of Children.toArray(children)) {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) out.push(...flattenChildren(child.props.children));
    else if (child !== "") out.push(child);
  }
  return out;
}
