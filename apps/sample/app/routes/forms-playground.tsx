import { redirect } from "react-router";

/** The first playground moved to /forms. */
export function clientLoader() {
  return redirect("/forms");
}

export default function LegacyFormsPlayground() {
  return null;
}
