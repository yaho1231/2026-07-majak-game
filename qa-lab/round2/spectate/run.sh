#!/bin/bash
# QA spectate — 전용 서버(3931)를 향해 스크립트 하나를 돌린다.
cd ~/majak/.claude/worktrees/qa-team-bug-testing-9be422
QA_WS=ws://127.0.0.1:3931 QA_HTTP=http://127.0.0.1:3931 \
  ~/majak/node_modules/.bin/tsx "$@"
