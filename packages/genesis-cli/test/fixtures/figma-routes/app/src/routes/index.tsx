// figma: 2:10
import { Link, useNavigate } from "@tanstack/react-router";

export function Home() {
  const navigate = useNavigate();
  const go = () => navigate({ to: "/admin/decks" });
  return <Link to="/courses/$courseId">Course</Link>;
}
