import { Link, useRouter } from "expo-router";

export default function Today() {
  const router = useRouter();
  const open = () => router.push("/settings");
  return <Link href="/items/42">Item</Link>;
}
