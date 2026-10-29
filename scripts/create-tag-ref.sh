#!/usr/bin/env bash
# Creates the tag <name> at commit <sha> on GitHub through the REST API (POST git/refs), never
# `git push`. Used by .github/workflows/release.yml.
#
# Why not `git push`: GitHub refuses a push from the workflow's GITHUB_TOKEN when the ref it
# creates brings in commits that touch .github/workflows ("refusing to allow a GitHub App to
# create or update workflow ... without `workflows` permission"), and GITHUB_TOKEN can never hold
# that permission. A tag on a main commit can hit it (run 40875804950). Creating the ref through
# the API pushes no commits, so it needs only `contents: write`.
#
# Idempotent: a tag already at <sha> is success (a re-run); a tag at another commit is an error.
#
#   GH_TOKEN=... GITHUB_REPOSITORY=owner/repo scripts/create-tag-ref.sh <name> <sha>
set -euo pipefail

name=${1:?usage: create-tag-ref.sh <tag name> <commit sha>}
sha=${2:?usage: create-tag-ref.sh <tag name> <commit sha>}
repo=${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}

if gh api -X POST "repos/$repo/git/refs" -f ref="refs/tags/$name" -f sha="$sha" --silent 2> "${RUNNER_TEMP:-/tmp}/create-tag-ref.err"; then
  echo "Tagged $name at $sha"
  exit 0
fi

# The usual failure is "Reference already exists". Check where it points (an annotated tag's ref
# points at a tag object; follow it to the commit).
if ! ref=$(gh api "repos/$repo/git/ref/tags/$name" --jq '"\(.object.type) \(.object.sha)"' 2> /dev/null); then
  echo "::error::Could not create tag $name: $(head -c 300 "${RUNNER_TEMP:-/tmp}/create-tag-ref.err")"
  exit 1
fi
type=${ref%% *}
at=${ref#* }
if [ "$type" = tag ] && ! at=$(gh api "repos/$repo/git/tags/$at" --jq .object.sha); then
  echo "::error::Couldn't read the annotated tag $name to find its commit."
  exit 1
fi
if [ "$at" = "$sha" ]; then
  echo "Tag $name is already at $sha"
  exit 0
fi
echo "::error::Tag $name already exists at $at, not $sha"
exit 1
