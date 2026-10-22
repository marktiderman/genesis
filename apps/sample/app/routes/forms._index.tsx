import { redirect } from "react-router";
import { scenarios } from "../lib/forms";

export function clientLoader() {
  return redirect(`/forms/${scenarios[0]!.id}`);
}

export default function FormsIndex() {
  return null;
}
