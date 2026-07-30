# master 기준선 (baseline) — 커밋 3fd43a5, 2026-07-30 측정
# 게이트는 '전부 통과'가 아니라 '이 기준선보다 나빠지지 않음'이다.
# 갱신 방법: npm test / npm run typecheck:* 재측정 후 이 파일을 덮어쓴다.

TESTS: 87 failed / 907 passed (994), 21 failed files / 99
TYPECHECK: core OK | content 3 errors | server 2 errors | client 3 errors

## 실패 테스트 파일 (실패건수  파일)
  19 packages/server/test/BotPlay.test.ts
  12 packages/content/test/bot_policy_defense.test.ts
   8 packages/content/test/bot_policy_new.test.ts
   6 packages/server/test/RoomManager.test.ts
   6 packages/server/test/BotAgentAugment.test.ts
   5 packages/content/test/riichi_family.test.ts
   4 packages/server/test/BotAgentKan.test.ts
   4 packages/content/test/rule_benders.test.ts
   4 packages/content/test/open_riichi.test.ts
   4 packages/content/test/bot_policy_behavior.test.ts
   2 packages/server/test/BotAgent.test.ts
   2 packages/content/test/silent_pact.test.ts
   2 packages/content/test/disarm_gates.test.ts
   2 packages/content/test/combo_sweep.test.ts
   1 packages/server/test/Resume.test.ts
   1 packages/content/test/draft_diversity.test.ts
   1 packages/content/test/crash_regressions.test.ts
   1 packages/content/test/buff_52_b.test.ts
   1 packages/content/test/backlog_5th_batch2_sweep.test.ts
   1 packages/content/test/backlog_56_batch3.test.ts
   1 packages/content/test/backlog_56_batch1_sweep.test.ts

## 타입 에러
packages/content/src/augments/genesis.ts(45,10): error TS2305: Module '"./botHelpers.js"' has no exported member 'handIsWeak'.
packages/content/src/augments/genesis.ts(246,14): error TS2304: Cannot find name 'handIsPoor'.
packages/content/test/wall_tricks.test.ts(609,43): error TS2345: Argument of type '{ view: PlayerView; options: ActionOption[]; holder: string; rng: { int: () => number; float: () => number; }; tenpai: boolean; }' is not assignable to parameter of type 'BotDecisionContext'.
packages/content/src/augments/genesis.ts(45,10): error TS2305: Module '"./botHelpers.js"' has no exported member 'handIsWeak'.
packages/content/src/augments/genesis.ts(246,14): error TS2304: Cannot find name 'handIsPoor'.
packages/client/src/App.tsx(7947,16): error TS2339: Property 'dealerContinues' does not exist on type 'RoundSettledPayload'.
packages/client/src/App.tsx(7948,21): error TS2339: Property 'dealerContinues' does not exist on type 'RoundSettledPayload'.
packages/client/src/App.tsx(7981,39): error TS2339: Property 'abortReason' does not exist on type 'RoundSettledPayload'.
