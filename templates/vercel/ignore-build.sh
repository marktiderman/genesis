#!/usr/bin/env bash
# Vercel "Ignored Build Step": production always builds; a preview builds only when someone asks.
#
# Copy to scripts/vercel-ignore-build.sh in the app and point vercel.json at it (the vercel.json
# beside this file). Replace GENESIS_SHA below with the commit of the Genesis release you copied it
# from (docs/APP-CI.md, "Which ref to call", says how to find it), so the next upgrade can tell
# whether your copy is behind. Edit the copy, not the defaults: set the variables below in the
# Vercel project instead.
#
# Genesis template templates/vercel/ignore-build.sh @ GENESIS_SHA # @marktiderman/genesis@X.Y.Z
#
# Vercel runs this before every build: exit 0 skips the build, exit 1 builds.
#
# 1. Production (VERCEL_ENV=production, the production branch) always builds.
# 2. GENESIS_PREVIEWS=off: no preview builds. GENESIS_PREVIEWS=every-pr: every preview builds.
# 3. GENESIS_PREVIEWS=on-demand (the default) builds a preview only when one of these asks:
#    - the branch starts with GENESIS_PREVIEW_BRANCH_PREFIX (default `preview/`);
#    - the commit message has `[preview]` in it (the commit being deployed, not earlier ones);
#    - the pull request has the label GENESIS_PREVIEW_LABEL (default `preview`, any case), read
#      from the GitHub API with GENESIS_PREVIEW_GITHUB_TOKEN (a fine-grained token with read access
#      to pull requests on this repository). No token, a failed request or a non-GitHub repository
#      skips: an error never starts a build.
#    Everything else skips.
#
# Vercel doesn't redeploy when a label is added: push a commit (or redeploy the latest one) after
# labelling. Vercel passes VERCEL_GIT_* only with "Automatically expose System Environment
# Variables" on in the project's Environment Variables settings.

previews="${GENESIS_PREVIEWS:-on-demand}"
label="${GENESIS_PREVIEW_LABEL-preview}"  # set but empty: no label check
prefix="${GENESIS_PREVIEW_BRANCH_PREFIX-preview/}"  # set but empty: no branch check
token="${GENESIS_PREVIEW_GITHUB_TOKEN:-}"
api="${GENESIS_GITHUB_API_URL:-https://api.github.com}"

ref="${VERCEL_GIT_COMMIT_REF:-}"
message="${VERCEL_GIT_COMMIT_MESSAGE:-}"
pr="${VERCEL_GIT_PULL_REQUEST_ID:-}"

build() {
  echo "genesis previews: build ($1)"
  exit 1
}
skip() {
  echo "genesis previews: skip ($1)"
  exit 0
}

[ "${VERCEL_ENV:-}" = "production" ] && build "production"

case "$previews" in
  off) skip "GENESIS_PREVIEWS=off" ;;
  every-pr) build "GENESIS_PREVIEWS=every-pr" ;;
  on-demand) ;;
  *) echo "genesis previews: unknown GENESIS_PREVIEWS=\"$previews\" (on-demand, every-pr or off); using on-demand" ;;
esac

if [ -n "$prefix" ] && [ -n "$ref" ]; then
  case "$ref" in
    "$prefix"*) build "branch $ref starts with $prefix" ;;
  esac
fi

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

case "$(lower "$message")" in
  *"[preview]"*) build "[preview] in the commit message" ;;
esac

[ -n "$label" ] || skip "no opt-in (GENESIS_PREVIEW_LABEL is empty)"
[ "${VERCEL_GIT_PROVIDER:-github}" = "github" ] || skip "no opt-in (label check needs GitHub, not ${VERCEL_GIT_PROVIDER})"
[ -n "$token" ] || skip "no opt-in (no GENESIS_PREVIEW_GITHUB_TOKEN to read the \"$label\" label)"
owner="${VERCEL_GIT_REPO_OWNER:-}"
repo="${VERCEL_GIT_REPO_SLUG:-}"
[ -n "$owner" ] && [ -n "$repo" ] || skip "no opt-in (VERCEL_GIT_REPO_OWNER or VERCEL_GIT_REPO_SLUG is unset)"

# The pull request (by number, or the open one for this branch when Vercel has no number yet).
if [ -n "$pr" ]; then
  case "$pr" in
    *[!0-9]*) skip "no opt-in (VERCEL_GIT_PULL_REQUEST_ID \"$pr\" isn't a number)" ;;
  esac
  body="$(curl -fsS --max-time 10 \
    -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" \
    "$api/repos/$owner/$repo/pulls/$pr" 2>/dev/null)" || skip "no opt-in (couldn't read pull request #$pr from GitHub)"
else
  [ -n "$ref" ] || skip "no opt-in (no branch or pull request to read a label from)"
  body="$(curl -fsS --max-time 10 --get \
    -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" \
    --data-urlencode "state=open" --data-urlencode "head=$owner:$ref" \
    "$api/repos/$owner/$repo/pulls" 2>/dev/null)" || skip "no opt-in (couldn't read the pull requests for $ref from GitHub)"
fi

# The labels' names, one per line, read with Node (which every Vercel build image has). A pull
# request list (no number) is the open one for this branch, or none.
command -v node >/dev/null 2>&1 || skip "no opt-in (no node to read GitHub's answer)"
names="$(printf '%s' "$body" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    let j = JSON.parse(s);
    if (Array.isArray(j)) j = j[0] ?? {};
    for (const l of j.labels ?? []) console.log(String(l.name ?? ""));
  });
' 2>/dev/null)" || skip "no opt-in (GitHub's answer wasn't the JSON expected)"
want="$(lower "$label")"
while IFS= read -r name; do
  [ "$(lower "$name")" = "$want" ] && build "the pull request has the \"$label\" label"
done <<EOF_NAMES
$names
EOF_NAMES
skip "no opt-in (no $prefix branch, [preview] commit or \"$label\" label)"
