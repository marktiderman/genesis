import { NavLink, Outlet } from "react-router";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { cn } from "@marktiderman/genesis-ui/utils";
import { scenarios } from "../lib/forms";

/** Forms playground: the scenario library, and the selected scenario beside it. */
export default function FormsLayout() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:flex-row">
      <nav aria-label="Scenarios" className="w-full shrink-0 space-y-2 lg:w-64">
        <h1 className="text-xl font-semibold">Forms playground</h1>
        <p className="text-sm text-muted-foreground">Run a form end to end. Nothing is stored.</p>
        <ul className="space-y-1">
          {scenarios.map((s) => (
            <li key={s.id}>
              <NavLink
                to={`/forms/${s.id}`}
                className={({ isActive }) =>
                  cn("block rounded-md px-3 py-2 text-sm hover:bg-accent", isActive && "bg-accent font-medium")
                }
              >
                {s.title}
                <span className="mt-1 flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
