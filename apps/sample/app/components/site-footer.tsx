import { BUILD, COMMIT_URL } from "../lib/build-info";
import { REPO_URL } from "../lib/site";

/** Version, commit and build date, so a visitor can tell how current the site is. */
export function BuildStamp({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-xs text-muted-foreground"} data-testid="build-stamp">
      Genesis {BUILD.version}
      {BUILD.commit ? (
        <>
          {" · "}
          <a className="underline-offset-2 hover:underline" href={COMMIT_URL}>
            {BUILD.commit}
          </a>
        </>
      ) : null}
      {BUILD.date ? ` · built ${BUILD.date}` : null}
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <BuildStamp />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          <a className="hover:text-foreground" href={REPO_URL}>GitHub</a>
          <a className="hover:text-foreground" href={`${REPO_URL}/releases`}>Changelog</a>
          <a className="hover:text-foreground" href={`${REPO_URL}/blob/main/LICENSE`}>License</a>
          <a className="hover:text-foreground" href={`${import.meta.env.BASE_URL}llms.txt`}>llms.txt</a>
        </nav>
      </div>
    </footer>
  );
}
