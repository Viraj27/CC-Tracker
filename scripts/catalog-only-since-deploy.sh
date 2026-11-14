#!/usr/bin/env bash
# CI (push to main): did only catalog/ change since the last successful production deploy?
# Prints `catalog_only=true|false` for $GITHUB_OUTPUT. Anything unusual (no earlier deploy found, an
# unknown commit, a git or API error) answers false, so the deploy waits for the owner's approval.
# Needs GH_TOKEN (deployments: read) and a full-history checkout.
set -uo pipefail
repo="${GITHUB_REPOSITORY:?}"

last=""
for env in production production-catalog; do
  # Newest first; the first deployment whose latest status is success, per environment.
  for row in $(gh api "repos/$repo/deployments?environment=$env&per_page=20" --jq '.[] | "\(.id),\(.sha),\(.created_at)"' 2>/dev/null); do
    IFS=, read -r id sha created <<<"$row"
    state=$(gh api "repos/$repo/deployments/$id/statuses?per_page=1" --jq '.[0].state' 2>/dev/null)
    if [ "$state" = "success" ]; then
      if [ -z "$last" ] || [[ "$created" > "${last#*,}" ]]; then last="$sha,$created"; fi
      break
    fi
  done
done

base="${last%%,*}"
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "No earlier successful production deploy found: the deploy waits for approval." >&2
  echo "catalog_only=false"
  exit 0
fi

changed=$(git diff --name-only "$base" HEAD) || { echo "catalog_only=false"; exit 0; }
echo "Changed since the last production deploy ($base):" >&2
echo "${changed:-  (nothing)}" >&2
if [ -n "$changed" ] && ! grep -qv '^catalog/' <<<"$changed"; then
  echo "catalog_only=true"
else
  echo "catalog_only=false"
fi
