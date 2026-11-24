#!/usr/bin/env bash
# Runs the coding agent (Claude Code) with no person, on a prompt file.
#
#   bash /tmp/agentic-ci-tools/run-agent.sh <prompt file> device
#
# What `device` mode enforces (Claude Code's permission rules, in dontAsk mode, so whatever no
# rule allows is denied):
# - Shell: only `bash /tmp/agentic-ci-tools/device.sh …`, the read-only copy of device.sh, which
#   runs a fixed list of agent-device commands (see its header). A command with $, a backtick, a
#   redirect (> or <), a pipe, ; or & is denied before it runs.
# - Reading: the project's files only (Read(./**); Glob and Grep search the project), never a .env
#   file, /proc, /tmp (the session file and the tools) or the home folder.
# - Writing: only under agent-output/evidence (Edit rules also govern Write).
# The agent's own key (CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY, from the job's EAS
# environment) stays in its environment, which is why the shell is limited to device.sh, and
# device.sh refuses an argument holding it. The job unsets EXPO_TOKEN, EXPO_TOKEN_SIMULATOR and
# GITHUB_TOKEN before this runs. AGENT_MODEL picks a model. The log goes to
# agent-output/evidence/agent-log.jsonl, which the job redacts before upload.
#
# Genesis template (templates/eas/agents/run-agent.sh), after Expo's agentic-workflows setup.
set -euo pipefail

case "${2:-}" in
  device)
    tools='Read(./**),Edit(./agent-output/evidence/**),Bash(bash /tmp/agentic-ci-tools/device.sh *)'
    denied='Read(//proc/**),Read(//tmp/**),Read(//private/**),Read(//dev/**),Read(//etc/**),Read(~/**),Read(./.env*),Read(./**/.env*),Bash(*$*),Bash(*`*),Bash(*>*),Bash(*<*),Bash(*|*),Bash(*;*),Bash(*&*),Bash(* /proc/*)'
    ;;
  *)
    echo "Unknown mode \"${2:-}\". Use device." >&2
    exit 1
    ;;
esac

mkdir -p agent-output/evidence
model=()
[ -n "${AGENT_MODEL:-}" ] && model=(--model "$AGENT_MODEL")
npx --yes @anthropic-ai/claude-code@2.1.330 -p "Do the task that standard input describes." \
  ${model[@]+"${model[@]}"} --allowedTools "$tools" --disallowedTools "$denied" --permission-mode dontAsk --max-turns 80 \
  --output-format stream-json --verbose < "$1" > agent-output/evidence/agent-log.jsonl || {
  tail -n 1 agent-output/evidence/agent-log.jsonl >&2
  exit 1
}
