/**
 * 바닥의 족보 (bottom_yaku, prism) — "내 바닥이 역을 만든다".
 *
 * 유국역만(nagashi_yakuman)의 거울상이다. 유국이 아니라 **실제 화료**에 얹히는 역으로,
 * 화료 순간 내가 **버린 패의 이력**을 읽어 두 갈래로 판을 더한다.
 *   - 한 무늬(만·통·삭 중 하나)의 숫자 **7종 이상**이 내 바닥에 있으면 '역류 통관' **2판**.
 *   - 같은 패를 3장 이상 버렸으면(어느 종류든) '미련 없음' **1판**.
 * 두 조건은 겹칠 수 있다 — 둘 다 붙으면 **+3판**. 유국이면 화료가 없으니 무용지물이다.
 *
 * 부수는 상식: 역은 손에서 나온다 — 여기선 **버린 패가** 역을 만든다. 내가 한 무늬를
 * 통째로 흘려보낸 자리, 미련 없이 겹쳐 버린 자리가 그대로 점수가 된다.
 *
 * ⚠ 밸런스 2026-08-27: 역류 통관의 문턱을 **1~9 전부(9종) → 같은 무늬 7종**으로 낮췄다.
 * 아래 `FLOW_RANKS` 주석 참고.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §2 (원안: 역류/yaku-break).
 *
 * 구현 — 커스텀 역 두 개(ctx.yaku):
 *   ① `bottom_flow`(역류 통관, 2판) ② `bottom_letgo`(미련 없음, 1판).
 *   엔진의 YakuDef는 판수가 고정(closedHan/openHan)이고 check는 boolean이라, 한 역이
 *   상황에 따라 2·1·3판을 오갈 수 없다. 그래서 스펙이 이미 이름을 붙여 나눠 둔 두
 *   보조역으로 등록한다 — 둘이 동시에 매칭되면 evaluate가 자연히 +3판으로 합산한다.
 *   둘 다 **보조역**(`auxiliary: true`)이다 — 도라처럼 판만 더하고 "역 있음" 판정에는
 *   세지 않는다. 즉 **이 바닥 역만으로는 화료할 수 없고**, 손에서 나온 진짜 역이
 *   하나라도 있어야 판이 붙는다(2026-08-02 사용자 확정). 예전에는 실역이라 역 없는
 *   손이 바닥만으로 화료했는데, 그건 "역 없이도 이긴다"는 별개의 능력이었다.
 *   멘젠 무관 — 후로해도 openHan을 같게 두어 붙는다.
 *
 * 바닥 읽기: WinContext는 손패·화료패만 실을 뿐 버림 이력을 노출하지 않는다. 그래서
 * check 클로저가 install 시점의 `ctx.engine`을 붙잡아 채점 시점의 `engine.state`에서
 * 화료자(wctx.winnerId)의 `round.byPlayer[…].ownDiscards`를 읽는다 —
 * 바닥 zone이 아니라 **버린 사실 자체**다(울려 나간 패도 내가 버린 패다). 화료 채점은 언제나 그
 * 시점 state에 대해 동기적으로 돌므로 engine.state가 곧 그 국의 바닥이다. 여러 명이
 * 보유해도 역 등록은 게임당 1회(yakuHolders), 나머지는 holders 집합에만 더한다.
 */

import { defineAugment, isNumberSuit, ownDiscardKindsOf } from "@majak/core";
import type {
  AugmentDef,
  GameEngine,
  GameState,
  PlayerId,
  TileKind,
} from "@majak/core";
import { addYakuHolder, yakuHolders } from "../util.js";

const ID = "bottom_yaku";
/** 역류 통관 — 한 무늬 1~9가 모두 바닥에 (2판) */
const FLOW = "bottom_flow";
/** 미련 없음 — 같은 패 3장 이상을 바닥에 (1판) */
const LETGO = "bottom_letgo";

/**
 * `discardedKinds`의 kindKey("man1"·"wind3")를 TileKind로 되돌린다.
 * 이력은 버림 시점의 문자열 스냅샷이라 tileId가 없다 — 종류만 알면 충분하다.
 * (유국역만이 같은 이유로 같은 헬퍼를 쓴다 — nagashi_yakuman.ts)
 */
function kindFromKey(key: string): TileKind | null {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return null;
  return { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
}

/**
 * 화료자가 그 국에 **버린 패의 종류 이력** (없으면 빈 배열).
 *
 * ⚠ 바닥 zone(`state.zones[discardsZone(holder)]`)이 아니라 이력을 본다.
 * 코어는 남이 치·펑·깡을 하면 그 패를 버린 사람의 바닥에서 **빼서** 운 사람의
 * 멘쯔로 옮긴다(flow/flowEvents.ts). 그래서 zone만 보면 "5만을 버렸는데 상대가
 * 퐁해 갔다"는 이유로 역류 통관이 조용히 무효가 됐다 — 조건을 잘 채울수록
 * (같은 패를 3장 버릴수록) 남이 울 확률이 높아 더 잘 깨지는 구조였다.
 * `round.byPlayer[x].discardedKinds`는 후리텐 판정이 쓰는 append-only 스냅샷이라
 * 울려 나가도 남는다 — detail이 약속하는 것은 "무엇을 버렸는가"이지
 * "그게 바닥에 남았는가"가 아니다(2026-08-20 QA 확정).
 */
function myDiscardKinds(state: GameState, holder: PlayerId): readonly string[] {
  /*
   * ⚠ 후리텐 이력(`discardedKinds`)이 아니라 **실제로 내가 버린 패**를 읽는다.
   *
   * 누명(frame_up)의 `creditTo`는 후리텐 이력만 지목당한 사람에게 새긴다. 그래서
   * 남이 심어 준 9만 한 장이 **피해자**의 역류 통관을 완성시켰고(3판 → 5판, 만관
   * 문턱을 넘는 자리다), 정작 보유자가 자기 9만을 누명으로 흘리면 자기 통관이
   * 조용히 무산됐다 (QA synergy3 handedit 확정 3, 2026-08-23).
   * detail 이 약속하는 것은 "**내** 버림패가 판을 얹어 준다"이다.
   */
  return ownDiscardKindsOf(state, holder);
}

/**
 * 어느 수패 무늬(만·통·삭)든 **서로 다른 숫자 7종 이상**을 버렸는가.
 *
 * ⚠ 밸런스 2026-08-27: **9종(1~9 전부) → 7종**. 1~9 전부는 한 무늬를 통째로 흘리고도
 * 화료까지 해야 하는 조건이라, 실전 표본에서 '역류 통관'이 거의 붙지 않았다. 어느
 * 7종이든(1~7이든 3~9든 흩어져 있든) 같은 무늬 안에서 서로 다른 숫자 7개면 성립한다 —
 * "한 무늬를 미련 없이 흘렸다"는 그림은 그대로 남고 문턱만 두 칸 내려온다.
 */
const FLOW_RANKS = 7;

function hasFullSuitRun(state: GameState, holder: PlayerId): boolean {
  const ranksBySuit = new Map<string, Set<number>>();
  for (const key of myDiscardKinds(state, holder)) {
    const kind = kindFromKey(key);
    if (kind === null) continue;
    if (!isNumberSuit(kind)) continue; // 자패는 순창(1~9) 대상이 아니다
    let ranks = ranksBySuit.get(kind.suit);
    if (ranks === undefined) {
      ranks = new Set();
      ranksBySuit.set(kind.suit, ranks);
    }
    ranks.add(kind.rank);
  }
  for (const ranks of ranksBySuit.values()) {
    // 숫자 종류 수만 센다 — 연속일 필요도, 1이나 9를 포함할 필요도 없다
    if (ranks.size >= FLOW_RANKS) return true;
  }
  return false;
}

/** 같은 종류(kindKey)를 3장 이상 버렸는가 — 무늬·자패 무관 */
function hasTripleDiscard(state: GameState, holder: PlayerId): boolean {
  const counts = new Map<string, number>();
  for (const key of myDiscardKinds(state, holder)) {
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
  complexity: 3,
  name: "바닥의 족보",
  description:
    "(상시) 화료할 때 내 버림패에 따라 판이 붙는다. 한 무늬의 숫자 7종을 버렸으면 2판, 같은 패를 3장 이상 버렸으면 1판, 둘 다면 3판이다.",
  detail:
    "화료할 때 내 버림패에 따라 판이 붙는다. 한 무늬의 서로 다른 숫자 7종 이상을 버렸으면 2판, 같은 패 3장 이상을 버렸으면 1판, 둘 다면 3판이다.\n\n7종은 연속일 필요가 없고, 남이 울어서 가져간 버림패도 포함한다.\n\n도라처럼 판만 더하므로 다른 역이 없으면 화료할 수 없다.",
  install(ctx) {
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    const engine: GameEngine = ctx.engine;

    if (yaku.get(FLOW) === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: FLOW,
        name: "역류 통관",
        closedHan: 2,
        openHan: 2, // 바닥은 멘젠과 무관하다 — 후로해도 붙는다
        auxiliary: true, // 판만 더한다 — 이것만으로는 화료 불가
        check: (_variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, FLOW).has(wctx.winnerId) &&
          hasFullSuitRun(engine.state, wctx.winnerId),
      });
    }
    if (yaku.get(LETGO) === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: LETGO,
        name: "미련 없음",
        closedHan: 1,
        openHan: 1,
        auxiliary: true, // 판만 더한다 — 이것만으로는 화료 불가
        check: (_variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, LETGO).has(wctx.winnerId) &&
          hasTripleDiscard(engine.state, wctx.winnerId),
      });
    }
    addYakuHolder(ctx, yaku, FLOW, LETGO);
  },
});
