import { useState } from "react";

/**
 * State that starts from a prop and follows it when the prop changes: an uncontrolled default
 * that a parent can still move (a new `anchor` or `layout`).
 */
export function useFollowedState<V>(prop: V | undefined, initial: () => V): [V, (v: V) => void] {
  const [own, setOwn] = useState<V>(() => prop ?? initial());
  const [seen, setSeen] = useState(prop);
  if (prop !== seen) {
    setSeen(prop);
    if (prop !== undefined) setOwn(prop);
  }
  return [own, setOwn];
}
