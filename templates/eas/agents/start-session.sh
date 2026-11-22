#!/usr/bin/env bash
# Starts one Expo Simulators session for the agent, with agent-device as the controller.
#
#   source .eas/agents/start-session.sh <ios|android> <build id> <session name> <tag>
#
# Sourced, so the job keeps the session and its EXIT trap: the recording is saved and the session
# stopped when the step ends, however it ends. Every session gets a maximum duration
# (AGENT_MAX_MINUTES, default 25) and an idle limit (AGENT_IDLE_MINUTES, default 5), so one that
# is never stopped still ends. It writes agent-output/device.md, which the job adds to the prompt.
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

export EXPO_TOKEN="${EXPO_TOKEN_SIMULATOR:-${EXPO_TOKEN:-}}"
$EAS simulator:start --platform "$1" --type agent-device \
  --build-id "$2" --name "$3" --tag "$4" \
  --max-duration-minutes "${AGENT_MAX_MINUTES:-25}" --max-idle-time-minutes "${AGENT_IDLE_MINUTES:-5}" \
  --json > /tmp/session.json
trap agentic_ci_stop EXIT

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

    npx --yes eas-cli@27.11.0 simulator:exec npx --yes agent-device@0.21.41 <command>

Run each command alone. Do not join commands with ;, &&, or |. The folder agent-output/evidence already exists. If a command is denied, run it again alone one time before you stop. Write files, such as the verdict, with your file tools, not with shell commands. The screen is already being recorded: do not start or stop a recording.

Use these agent-device commands:

- snapshot -i lists the elements on the screen, with references such as @e2. The references change on each screen, so run snapshot -i again after each action.
- snapshot without -i also lists the plain text on the screen.
- press @e2 taps an element.
- fill @e4 "text" types text into a field.
- keyboard enter presses the Enter key of the keyboard.
- scroll down scrolls the screen.
- screenshot agent-output/evidence/<number>-<name>.png saves a screenshot.
- open $APP_ID --platform $1 opens the app again.
EOF

if [ -f .eas/agents/app-facts.md ]; then
  printf '\n## App facts\n\n' >> agent-output/device.md
  cat .eas/agents/app-facts.md >> agent-output/device.md
fi
