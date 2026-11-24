#!/usr/bin/env bash
# The only shell command the agent may run: one agent-device command on the session's device,
# from a fixed list, with arguments of a fixed shape.
#
#   bash /tmp/agentic-ci-tools/device.sh <command> [arguments]
#
# Commands:
#   snapshot [-i]                    the elements on the screen (-i: interactive ones, with @refs)
#   press <target> [--settle]        tap an element
#   longpress <target> [ms]          press and hold
#   fill <target> <text> [--settle]  replace a field's text
#   type <text>                      type into the focused field
#   keyboard <key>                   enter, return, dismiss, hide, delete, backspace, tab or space
#   scroll <up|down|left|right>      scroll the screen
#   swipe <x1> <y1> <x2> <y2>        drag between two points
#   back                             the system back action
#   wait <ms> | wait text <text> [ms]
#   screenshot <name>.png            saved as agent-output/evidence/<name>.png
#   open                             opens the app under test again (its ID only, never a URL)
#
# A target is @e<number> or a selector such as label="Send" or id="submit". Everything else is
# refused: other commands (install, save-script, replay, metro, record, test, logs, network…), any
# flag not listed, paths, URLs, and any argument with $, a backtick or a line break. An argument
# that holds the agent's own key is refused too, in case a shell expanded it.
#
# agent-device runs through `eas simulator:exec` (which loads the session's .env.eas-simulator)
# under `env -i`: none of the job's variables reach it, only PATH, HOME, the proxy and CA
# settings, and CI. The agent can't change this file: the job runs it from a read-only copy
# outside the project (/tmp/agentic-ci-tools), which the agent's file tools may not read or write.
#
# Genesis template (templates/eas/agents/device.sh).
set -euo pipefail

refuse() {
  printf 'Refused: %s. Run `bash %s` with one of the commands its header lists.\n' "$1" "$0" >&2
  exit 2
}

: "${AGENTIC_CI_APP_ID:?AGENTIC_CI_APP_ID is not set: start-session.sh sets it.}"
: "${AGENTIC_CI_PLATFORM:?AGENTIC_CI_PLATFORM is not set: start-session.sh sets it.}"
: "${AGENTIC_CI_PROJECT:?AGENTIC_CI_PROJECT is not set: start-session.sh sets it.}"

[ "$#" -ge 1 ] || refuse "no command"
for arg in "$@"; do
  case "$arg" in
    *'$'* | *'`'* | *$'\n'* | *$'\r'*) refuse "an argument has \$, a backtick or a line break" ;;
  esac
  for name in CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY; do
    value="${!name:-}"
    if [ "${#value}" -ge 8 ] && [[ "$arg" == *"$value"* ]]; then refuse "an argument holds a secret"; fi
  done
done

is_target() { [[ "$1" =~ ^@e[0-9]{1,5}$ ]] || [[ "$1" =~ ^(label|id|text|role)=\"[^\"]{1,200}\"( (label|id|text|role)=\"[^\"]{1,200}\")*$ ]]; }
is_ms() { [[ "$1" =~ ^[0-9]{1,5}$ ]]; }
is_coord() { [[ "$1" =~ ^[0-9]{1,4}$ ]]; }
is_text() { [ "${#1}" -le 500 ] && [[ "$1" != -* ]]; }

command="$1"
shift
args=()
case "$command" in
  snapshot)
    if [ "$#" -eq 0 ]; then args=(snapshot); elif [ "$#" -eq 1 ] && [ "$1" = "-i" ]; then args=(snapshot -i); else refuse "snapshot takes only -i"; fi
    ;;
  press)
    { [ "$#" -ge 1 ] && is_target "$1"; } || refuse "press needs a target (@e2 or label=\"…\")"
    if [ "$#" -eq 1 ]; then args=(press "$1"); elif [ "$#" -eq 2 ] && [ "$2" = "--settle" ]; then args=(press "$1" --settle); else refuse "press takes a target and --settle only"; fi
    ;;
  longpress)
    { [ "$#" -ge 1 ] && [ "$#" -le 2 ] && is_target "$1"; } || refuse "longpress takes a target and a duration in ms"
    if [ "$#" -eq 2 ]; then is_ms "$2" || refuse "longpress's duration is a number of ms"; fi
    args=(longpress "$@")
    ;;
  fill)
    { [ "$#" -ge 2 ] && [ "$#" -le 3 ] && is_target "$1" && is_text "$2"; } || refuse "fill takes a target and a text"
    if [ "$#" -eq 3 ]; then [ "$3" = "--settle" ] || refuse "fill takes --settle only"; fi
    args=(fill "$@")
    ;;
  type)
    { [ "$#" -eq 1 ] && is_text "$1"; } || refuse "type takes one text"
    args=(type "$1")
    ;;
  keyboard)
    { [ "$#" -eq 1 ] && [[ "$1" =~ ^(enter|return|dismiss|hide|delete|backspace|tab|space)$ ]]; } || refuse "keyboard takes one key name"
    args=(keyboard "$1")
    ;;
  scroll)
    { [ "$#" -eq 1 ] && [[ "$1" =~ ^(up|down|left|right)$ ]]; } || refuse "scroll takes up, down, left or right"
    args=(scroll "$1")
    ;;
  swipe)
    { [ "$#" -eq 4 ] && is_coord "$1" && is_coord "$2" && is_coord "$3" && is_coord "$4"; } || refuse "swipe takes four coordinates"
    args=(swipe "$@")
    ;;
  back)
    [ "$#" -eq 0 ] || refuse "back takes no arguments"
    args=(back)
    ;;
  wait)
    if [ "$#" -eq 1 ] && is_ms "$1"; then
      args=(wait "$1")
    elif [ "$#" -ge 2 ] && [ "$#" -le 3 ] && [ "$1" = "text" ] && is_text "$2"; then
      if [ "$#" -eq 3 ]; then is_ms "$3" || refuse "wait's timeout is a number of ms"; fi
      args=(wait "$@")
    else
      refuse "wait takes a number of ms, or text and a text"
    fi
    ;;
  screenshot)
    { [ "$#" -eq 1 ] && [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\.png$ ]]; } || refuse "screenshot takes a file name such as 01-inbox.png (no folder)"
    args=(screenshot "agent-output/evidence/$1")
    ;;
  open)
    [ "$#" -eq 0 ] || refuse "open takes no arguments: it opens the app under test"
    args=(open "$AGENTIC_CI_APP_ID" --platform "$AGENTIC_CI_PLATFORM")
    ;;
  *)
    refuse "\"$command\" is not an allowed command"
    ;;
esac

cd "$AGENTIC_CI_PROJECT"
keep=(PATH="$PATH" HOME="$HOME" CI=1)
for name in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy NODE_EXTRA_CA_CERTS SSL_CERT_FILE TMPDIR; do
  if [ -n "${!name:-}" ]; then keep+=("$name=${!name}"); fi
done
exec env -i "${keep[@]}" npx --yes eas-cli@27.11.0 simulator:exec npx --yes agent-device@0.21.41 "${args[@]}"
