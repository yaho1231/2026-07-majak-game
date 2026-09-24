/**
 * 빌린 증강 — 남의 증강을 **이번 국 동안** 가져와 **한 번** 쓴다 (카피 `copy`가 쓴다).
 *
 * 상태 쪽은 `events.ts`가 맡는다: `AUGMENT_BORROWED`가 보유 목록에 id를 얹고 기록
 * (`augmentBorrowKey`)을 남기며, 국 정산 리듀서가 둘을 함께 걷어낸다
 * (`stripBorrowedAugments`). 이 파일은 **상태 밖**의 두 가지를 맡는다.
 *
 * 1. **설치 동기화** (`syncBorrowedAugments`) — 설치는 레지스트리에 대한 부수효과라
 *    이벤트로 표현되지 않는다. 기록이 생기면(빌린 순간의 리액션) 설치하고, 기록이
 *    사라지면(다음 요청 직전 훅) 걷어낸다. 해제를 정산 **리액션**이 아니라 다음 요청
 *    직전에 하는 이유: 정산 이벤트를 처리하는 도중에 효과를 지우면, 빌린 증강의 정산
 *    리액션이 돌지 말지가 등록 순서에 달린다.
 * 2. **1회 소진** — 빌린 증강의 액션이 한 번 통과하면 같은 트랜잭션에
 *    `AUGMENT_BORROW_SPENT`를 붙인다(`GameEngine.registerFollowUp`). 이후 그 증강의
 *    선택지는 `installAugment`의 옵션 래퍼가 비운다. 이미 켜 둔 효과(이번 국 동안
 *    지속되는 것들)는 국이 끝날 때까지 그대로 산다.
 *
 * 재구성(이어하기)에서는 `rebuildAugments`가 빌린 id를 드래프트 슬롯에서 빼고 맨 마지막에
 * 이 동기화로 설치한다 — 원본에서도 빌린 증강은 그 국의 모든 드래프트 **뒤에** 설치됐다.
 */

import type { GameEngine } from "../engine/GameEngine.js";
import { RuleLayer } from "../engine/rules/RuleRegistry.js";
import type { GameState } from "../engine/state/GameState.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import type { AugmentExtras } from "./Augment.js";
import { augmentIdForActionType, installAugment, uninstallAugment } from "./Augment.js";
import {
  AUGMENT_BORROWED,
  AUGMENT_BORROW_SPENT,
  borrowedOf,
} from "./events.js";

/** 엔진별 «지금 설치해 둔 빌린 증강» (보유자 → 증강 id). 엔진이 사라지면 함께 사라진다 */
const INSTALLED = new WeakMap<GameEngine, Map<PlayerId, string>>();

function installedOf(engine: GameEngine): Map<PlayerId, string> {
  let m = INSTALLED.get(engine);
  if (m === undefined) {
    m = new Map();
    INSTALLED.set(engine, m);
  }
  return m;
}

/**
 * 레지스트리를 `state`의 빌린 증강 기록에 맞춘다 (멱등).
 * 카탈로그가 없는 경로(최소 테스트 게임)에서는 아무 일도 하지 않는다.
 */
export function syncBorrowedAugments(
  engine: GameEngine,
  state: GameState,
  extras: AugmentExtras,
): void {
  const catalog = extras.catalog;
  if (catalog === undefined) return;
  const installed = installedOf(engine);
  for (const player of state.players) {
    const want = borrowedOf(state, player.id)?.augmentId;
    const have = installed.get(player.id);
    if (have === want) continue;
    if (have !== undefined) {
      const def = catalog.get(have);
      if (def !== undefined) uninstallAugment(engine, def, player.id);
      installed.delete(player.id);
    }
    if (want !== undefined) {
      const def = catalog.get(want);
      if (def === undefined) continue;
      installAugment(engine, def, player.id, extras);
      installed.set(player.id, want);
    }
  }
}

/** 빌린 증강 지원을 엔진에 건다 (`createStandardGameFromState`가 부른다) */
export function registerBorrowSupport(engine: GameEngine, extras: AugmentExtras): void {
  // 빌린 순간 곧바로 설치한다 — 같은 순의 다음 프롬프트에 그 증강의 버튼이 떠야 한다.
  // source는 증강 인스턴스가 아니다: 무장해제로 잠길 수 없는 코어 배선이다.
  engine.effects.register({
    source: "core:borrow",
    layer: RuleLayer.Base,
    on: AUGMENT_BORROWED,
    react: (_event, rc) => syncBorrowedAugments(engine, rc.state, extras),
  });
  // 기록이 사라졌으면(국 정산) 다음 요청 전에 설치를 걷어낸다
  engine.registerPreSubmit((state) => syncBorrowedAugments(engine, state, extras));
  // 빌린 증강의 액션이 통과하면 그 자리에서 1회 소진을 기록한다
  engine.registerFollowUp((request, state) => {
    const r = borrowedOf(state, request.player);
    if (r === null || r.spent) return [];
    if (augmentIdForActionType(request.type) !== r.augmentId) return [];
    return [
      {
        type: AUGMENT_BORROW_SPENT,
        payload: { player: request.player, augmentId: r.augmentId },
      },
    ];
  });
}
