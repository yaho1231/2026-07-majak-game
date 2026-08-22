#!/bin/bash
# QA spectate — 전용 서버(3931)를 향해 스크립트 하나를 돌린다.
cd /Users/skul/majak/.claude/worktrees/qa-team-bug-testing-9be422
QA_WS=ws://127.0.0.1:3931 QA_HTTP=http://127.0.0.1:3931 \
  /Users/skul/majak/node_modules/.bin/tsx "$@"
