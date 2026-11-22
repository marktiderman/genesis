#!/usr/bin/env bash
# Runs the coding agent (Claude Code) with no person, on a prompt file.
#
#   bash .eas/agents/run-agent.sh <prompt file> device
#
# `device` mode allows only the file tools and agent-device through `eas simulator:exec`: the
# agent can read the project and drive the device, and can't run anything else. It reads
# CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`) or ANTHROPIC_API_KEY from the job's EAS
# environment; AGENT_MODEL picks a model. The log goes to agent-output/evidence/agent-log.jsonl.
#
# Genesis template (templates/eas/agents/run-agent.sh), after Expo's agentic-workflows setup.
set -euo pipefail

case "${2:-}" in
  device) tools='Read,Glob,Grep,Write,Bash(npx --yes eas-cli@27.11.0 simulator:exec npx --yes agent-device@0.21.41 *)' ;;
  *)
    echo "Unknown mode \"${2:-}\". Use device." >&2
    exit 1
    ;;
esac

mkdir -p agent-output/evidence
model=()
[ -n "${AGENT_MODEL:-}" ] && model=(--model "$AGENT_MODEL")
npx --yes @anthropic-ai/claude-code@2.1.330 -p "Do the task that standard input describes." \
  ${model[@]+"${model[@]}"} --allowedTools "$tools" --permission-mode dontAsk --max-turns 80 \
  --output-format stream-json --verbose < "$1" > agent-output/evidence/agent-log.jsonl || {
  tail -n 1 agent-output/evidence/agent-log.jsonl >&2
  exit 1
}
