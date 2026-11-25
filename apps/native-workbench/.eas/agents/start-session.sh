#!/usr/bin/env bash
# Starts one Expo Simulators session for the agent, with agent-device as the controller.
#
#   source /tmp/agentic-ci-tools/start-session.sh <ios|android> <build id> <session name> <tag>
#
# Sourced, so the job keeps the session and its EXIT trap: the recording is saved and the session
# stopped when the step ends, however it ends. The trap is set before the session starts, so a
# start that creates a session and then fails still stops it. Every session gets a maximum
# duration (AGENT_MAX_MINUTES, default 25) and an idle limit (AGENT_IDLE_MINUTES, default 5), so
# one that is never stopped still ends. It writes the app ID, the platform and the project folder
# to /tmp/agentic-ci-session/target (read-only) for device.sh, and agent-output/device.md, which
# the job adds to the prompt.
#
# Genesis template (templates/eas/agents/start-session.sh), after Expo's agentic-workflows setup.

case "$1" in
  android) APP_ID_KEY=package ;;
  ios) APP_ID_KEY=bundleIdentifier ;;
  *)
    echo "Unknown platform \"$1\". Use android or ios." >&2
    exit 1
    ;;
esac
APP_ID=$(npx --no expo config --json | node -e 'const config = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(config[process.argv[1]]?.[process.argv[2]] ?? "")' "$1" "$APP_ID_KEY")
: "${APP_ID:?The app config has no app ID for $1. Add it to app.json or app.config.ts.}"
mkdir -p agent-output/evidence

EAS="npx --yes eas-cli@27.11.0"
DEVICE="$EAS simulator:exec npx --yes agent-device@0.21.41"

agentic_ci_stop() {
  if [ -n "${AGENTIC_CI_RECORDING:-}" ]; then
    $DEVICE record stop > /dev/null 2>&1 || true
    AGENTIC_CI_RECORDING=""
  fi
  $EAS simulator:stop --non-interactive > /dev/null 2>&1 || true
}

# device.sh reads what it drives from a read-only file, never from its environment, so a command
# line can't point it at another app or folder.
AGENTIC_CI_TARGET=/tmp/agentic-ci-session/target
if [ -e /tmp/agentic-ci-session ]; then chmod -R u+w /tmp/agentic-ci-session && rm -rf /tmp/agentic-ci-session; fi
mkdir -p /tmp/agentic-ci-session
printf '%s\n%s\n%s\n' "$APP_ID" "$1" "$PWD" > "$AGENTIC_CI_TARGET"
chmod a-w "$AGENTIC_CI_TARGET" /tmp/agentic-ci-session
export EXPO_TOKEN="${EXPO_TOKEN_SIMULATOR:-${EXPO_TOKEN:-}}"
# A session file committed or left over would point simulator:exec and simulator:stop at another
# session: start from none.
rm -f .env.eas-simulator /tmp/session.json
trap agentic_ci_stop EXIT
$EAS simulator:start --platform "$1" --type agent-device \
  --build-id "$2" --name "$3" --tag "$4" \
  --max-duration-minutes "${AGENT_MAX_MINUTES:-25}" --max-idle-time-minutes "${AGENT_IDLE_MINUTES:-5}" \
  --json > /tmp/session.json

$DEVICE open "$APP_ID" --platform "$1" > /dev/null
if $DEVICE record start agent-output/evidence/recording.mp4 > /dev/null 2>&1; then
  AGENTIC_CI_RECORDING=1
fi
node -e 'const s = require("/tmp/session.json"); console.log(`Session: ${s.id ?? ""} ${s.deviceRunSessionUrl ?? ""}`)' > agent-output/evidence/session.txt || true

cat > agent-output/device.md << EOF
## Device

- Platform: $1
- App ID: $APP_ID

Control the device only with this shell command:

    bash /tmp/agentic-ci-tools/device.sh <command>

Run each command alone. Do not join commands with ;, &&, or |, and do not use \$, backticks, > or <. The folder agent-output/evidence already exists. If a command is refused, read the reason and use an allowed command. Write files, such as the verdict, with your file tools, not with shell commands. The screen is already being recorded: do not start or stop a recording.

The commands:

- snapshot -i lists the elements on the screen, with references such as @e2. The references change on each screen, so run snapshot -i again after each action.
- snapshot without -i also lists the plain text on the screen.
- press @e2 taps an element. Add --settle to wait for the screen to settle. press label="Send" taps the element labeled Send; put several selectors in single quotes: press 'role=button label="Follow"'.
- longpress @e2 800 presses and holds an element.
- fill @e4 "text" replaces the text of a field. type "text" types into the focused field.
- keyboard enter presses the Enter key of the keyboard (also dismiss, delete, tab, space).
- scroll down scrolls the screen (also up, left, right). swipe 300 500 40 500 drags between two points.
- back goes back. wait 1000 waits a second; wait text "Saved" 3000 waits for a text.
- screenshot 01-home.png saves a screenshot as agent-output/evidence/01-home.png.
- open opens the app again.
EOF

if [ -f .eas/agents/app-facts.md ]; then
  printf '\n## App facts\n\n' >> agent-output/device.md
  cat .eas/agents/app-facts.md >> agent-output/device.md
fi
