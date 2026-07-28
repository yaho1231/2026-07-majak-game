/**
 * 바닥의 족보 (bottom_yaku, prism) — "내 바닥이 역을 만든다".
 *
 * 유국역만(nagashi_yakuman)의 거울상이다. 유국이 아니라 **실제 화료**에 얹히는 역으로,
 * 화료 순간 내 바닥(버림패) zone을 읽어 두 갈래로 판을 더한다.
 *   - 한 무늬(만·통·삭 중 하나)의 1~9가 **모두** 내 바닥에 있으면 '역류 통관' **2판**.
 *   - 같은 패를 3장 이상 버렸으면(어느 종류든) '미련 없음' **1판**.
 * 두 조건은 겹칠 수 있다 — 둘 다 붙으면 **+3판**. 유국이면 화료가 없으니 무용지물이다.
 *
 * 부수는 상식: 역은 손에서 나온다 — 여기선 **버린 패가** 역을 만든다. 내가 흘려보낸
 * 한 무늬의 처음부터 끝까지, 미련 없이 겹쳐 버린 자리가 그대로 점수가 된다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §2 (원안: 역류/yaku-break).
 *
 * 구현 — 커스텀 역 두 개(ctx.yaku):
 *   ① `bottom_flow`(역류 통관, 2판) ② `bottom_letgo`(미련 없음, 1판).
 *   엔진의 YakuDef는 판수가 고정(closedHan/openHan)이고 check는 boolean이라, 한 역이
 *   상황에 따라 2·1·3판을 오갈 수 없다. 그래서 스펙이 이미 이름을 붙여 나눠 둔 두
 *   보조역으로 등록한다 — 둘이 동시에 매칭되면 evaluate가 자연히 +3판으로 합산한다.
 *   보조가 아니라 **실역**(auxiliary 미설정)이라, 다른 역이 없어도 이 바닥만으로 화료가
 *   성립한다("내 바닥이 역을 만든다"). 멘젠 무관 — 후로해도 openHan을 같게 두어 붙는다.
 *
 * 바닥 읽기: WinContext는 손패·화료패만 실을 뿐 버림 zone을 노출하지 않는다. 그래서
 * check 클로저가 install 시점의 `ctx.engine`을 붙잡아 채점 시점의 `engine.state`에서
 * 화료자(wctx.winnerId)의 버림 zone을 discardsZone으로 읽는다. 화료 채점은 언제나 그
 * 시점 state에 대해 동기적으로 돌므로 engine.state가 곧 그 국의 바닥이다. 여러 명이
 * 보유해도 역 등록은 게임당 1회(yakuHolders), 나머지는 holders 집합에만 더한다.
 */

import {
  defineAugment,
  discardsZone,
  isNumberSuit,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameEngine,
  GameState,
  PlayerId,
} from "@majak/core";
import { yakuHolders } from "../util.js";

const ID = "bottom_yaku";
/** 역류 통관 — 한 무늬 1~9가 모두 바닥에 (2판) */
const FLOW = "bottom_flow";
/** 미련 없음 — 같은 패 3장 이상을 바닥에 (1판) */
const LETGO = "bottom_letgo";

/** 화료자의 버림 zone tileId 목록 (없으면 빈 배열) */
function discardIds(state: GameState, holder: PlayerId): readonly number[] {
  return state.zones[discardsZone(holder)]?.tileIds ?? [];
}

/** 어느 수패 무늬(만·통·삭)든 1~9가 전부 내 바닥에 있는가 */
function hasFullSuitRun(state: GameState, holder: PlayerId): boolean {
  const ranksBySuit = new Map<string, Set<number>>();
  for (const id of discardIds(state, holder)) {
    const kind = kindOf(state, id);
    if (!isNumberSuit(kind)) continue; // 자패는 순창(1~9) 대상이 아니다
    let ranks = ranksBySuit.get(kind.suit);
    if (ranks === undefined) {
      ranks = new Set();
      ranksBySuit.set(kind.suit, ranks);
    }
    ranks.add(kind.rank);
  }
  for (const ranks of ranksBySuit.values()) {
    let complete = true;
    for (let r = 1; r <= 9; r++) {
      if (!ranks.has(r)) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }
  return false;
}

/** 같은 종류(kindKey)를 3장 이상 버렸는가 — 무늬·자패 무관 */
function hasTripleDiscard(state: GameState, holder: PlayerId): boolean {
  const counts = new Map<string, number>();
  for (const id of discardIds(state, holder)) {
    const key = kindKey(kindOf(state, id));
    const next = (counts.get(key) ?? 0) + 1;
    if (next >= 3) return true;
    counts.set(key, next);
  }
  return false;
}

export const bottomYaku: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  name: "바닥의 족보",
  description:
    "(상시) 화료 시 내 바닥(버림패)이 역을 대신 만들어 준다 — 한 무늬의 1~9를 모두 버렸으면 '역류 통관' 2판, 같은 패를 3장 이상 버렸으면 '미련 없음' 1판. 둘은 겹쳐 최대 3판.",
  detail:
    "(상시) 쯔모·론으로 화료하는 순간 자신의 버림패를 판정해 역을 붙여 준다. 만·통·삭 중 한 무늬의 1~9가 모두 내 바닥에 있으면 '역류 통관' 2판, 같은 패를 3장 이상 버렸으면 종류를 가리지 않고 '미련 없음' 1판으로 취급되며, 두 조건이 함께 성립하면 3판이다. 이 역들은 실역이라 다른 역이 하나도 없어도 화료가 성립하며 멘젠·후로를 가리지 않는다. 다만 화료형(표준형·치또이·국사 등)은 스스로 완성해야 하고, 유국에는 적용되지 않는다.",
  install(ctx) {
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    const engine: GameEngine = ctx.engine;

    if (yaku.get(FLOW) === undefined) {
      yaku.register({
        id: FLOW,
        name: "역류 통관",
        closedHan: 2,
        openHan: 2, // 바닥은 멘젠과 무관하다 — 후로해도 붙는다
        check: (_variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, FLOW).has(wctx.winnerId) &&
          hasFullSuitRun(engine.state, wctx.winnerId),
      });
    }
    if (yaku.get(LETGO) === undefined) {
      yaku.register({
        id: LETGO,
        name: "미련 없음",
        closedHan: 1,
        openHan: 1,
        check: (_variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, LETGO).has(wctx.winnerId) &&
          hasTripleDiscard(engine.state, wctx.winnerId),
      });
    }
    yakuHolders(yaku, FLOW).add(ctx.holder);
    yakuHolders(yaku, LETGO).add(ctx.holder);
  },
});
