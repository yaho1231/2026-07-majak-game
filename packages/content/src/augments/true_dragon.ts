/**
 * 진짜 용 (true_dragon, prism) — 몸통(멘쯔) 5개 + 머리 1개, 총 17장으로 승부한다.
 * 배패를 16장 받고, 화료하면 +3판을 얻는다.
 *
 * 구현:
 * - deal.handSize=16 — setupRound가 이 규칙으로 배패 장수를 정한다.
 * - scoring.totalSets=5 — scoringOptionsOf를 거치는 모든 판정
 *   (화료·텐파이·후리텐·대기)에 5멘쯔 1작두 형태가 일관 적용된다.
 * - score.extraHan +3 — 다른 extraHan 증강과 합산되도록 교체가 아닌 addModifier.
 *   (역만에는 적용되지 않는다 — sys.settleWin이 보장)
 * - AugmentDisarmed 반응 — 무장해제로 잠기는 순간 손패를 표준 장수로 되돌린다(아래).
 */

import {
  AUGMENT_DISARMED,
  WALL,
  defineAugment,
  handIdsOf,
  handZone,
  isNumberSuit,
  kindKey,
  kindOf,
  tilesMoved,
} from "@majak/core";
import type {
  AugmentDef,
  AugmentDisarmedPayload,
  GameState,
  PlayerId,
  TileId,
  TileKind,
} from "@majak/core";

const ID = "true_dragon";

/** 진짜 용이 표준보다 더 받는 장수 — 무장해제 시 이만큼 반납한다 */
const EXTRA_TILES = 3;

const sameKind = (a: TileKind, b: TileKind): boolean =>
  a.suit === b.suit && a.rank === b.rank;

/**
 * "가장 필요 없는 패" 점수 — 낮을수록 먼저 반납된다.
 *
 * 같은 패의 장수(짝·커쯔 재료)와 슌쯔 이웃(±1·±2)을 세어 쓸모를 매긴다.
 * 자패는 이웃이 없으므로 같은 패 수만 본다. 완전 고립패가 가장 먼저 나간다.
 * 무작위를 쓰지 않는다 — 같은 손이면 항상 같은 3장이라 리플레이·재개가 결정적이다.
 */
function usefulness(kinds: readonly TileKind[], k: TileKind): number {
  let score = 0;
  for (const o of kinds) {
    if (sameKind(o, k)) {
      score += 3; // 같은 패 — 짝·커쯔 재료라 가장 아깝다 (자기 자신 1장 포함)
      continue;
    }
    if (!isNumberSuit(k) || !isNumberSuit(o) || o.suit !== k.suit) continue;
    const d = Math.abs(o.rank - k.rank);
    if (d === 1) score += 2; // 량멘·펜쨩 재료
    else if (d === 2) score += 1; // 칸쨩 재료
  }
  return score;
}

/**
 * 무장해제로 진짜 용이 잠길 때 패산으로 반납할 손패 3장.
 *
 * 규칙(scoring.totalSets)만 4로 돌아가고 손패가 16/17장으로 남으면
 * "4멘쯔+작두(14장)"를 물리적으로 만들 수 없어 그 국이 통째로 하드락이 된다.
 * 그래서 **가장 쓸모없는 3장을 패산 맨 밑으로 반납**해 13/14장으로 되돌린다.
 *
 * - 쯔모패(lastDrawnTile)는 후보에서 뺀다 — "14번째 패" 불변식을 지켜야
 *   반납 후에도 정상적으로 버릴 수 있다.
 * - 바닥이 아니라 **패산 맨 밑**으로 보낸다: 버림패로 가면 없던 방총·후리텐이
 *   생기고 discardedKinds가 오염된다. 애초에 배패에서 3장을 더 받은 것이므로
 *   패산에 돌려주면 그 국의 총 쯔모 수도 표준으로 정확히 복원된다.
 */
function returnTileIds(state: GameState, holder: PlayerId): TileId[] {
  const hand = handIdsOf(state, holder);
  const drawn = state.round.lastDrawnTile;
  const candidates = hand.filter((id) => id !== drawn);
  const kinds = hand.map((id) => kindOf(state, id));

  // 쓸모 오름차순 → 동점이면 kindKey → tileId로 결정적 정렬
  const scored = candidates.map((id) => {
    const k = kindOf(state, id);
    return { id, score: usefulness(kinds, k), key: kindKey(k) };
  });
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) ||
      a.id - b.id,
  );
  return scored.slice(0, EXTRA_TILES).map((s) => s.id);
}

export const trueDragon: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  complexity: 3,
  name: "진짜 용",
  description:
    "(상시) 배패를 16장 받고, 몸통 5개(5멘쯔) + 머리 1개(총 17장)로 화료한다.",
  detail:
    "(상시) 화료·텐파이·후리텐·대기 판정이 모두 5몸통 형태로 바뀌고, 화료에 **+3판**이 붙는다(역만에는 미적용).\n\n무장해제로 잠기면 가장 쓸모없는 패 3장이 패산으로 돌아가 평범한 손패 장수로 복귀한다.",
  // 5멘쯔·17장은 14장/4멘쯔를 전제하는 특수형 증강을 전부 무력화한다
  // (decompose가 치또이·국사를 totalSets===4 && hand===14에서만 열거).
  // 국사/구련류를 잡으면 조용히 죽거나(픽 낭비) 소프트락(우는 국사)이 되므로
  // 드래프트에서 상호 배제한다. 관계는 대칭이라 역방향(그 증강 → 진짜 용)도 함께 막힌다.
  //
  // ⚠ cliff_bloom(절벽 위에 피어난 꽃)·bottom_deal(밑장빼기)은 예전에 같은 이유로 죽었지만
  //    이제 두 파일이 scoringOptionsOf의 totalSets를 읽으므로 **배제하지 않는다**(60차).
  conflicts: [
    "open_kokushi", // kokushi_pon 순간 표준·국사 둘 다 봉인 → 그 국 화료·텐파이 영구 불능
    "giant_god", // 국사 텐파이를 소환하지만 totalSets=5라 화료 불가 → 손 벽돌
    "royal_kokushi", // 국사 분해가 totalSets===4에서만 → 무효
    "async_chiitoi", // 치또이 분해가 totalSets===4에서만 → 무효
    "mixed_nine_gates", // isMixedNineGates가 hand.length===14 요구 → 17장 화료엔 미성립
    "void_kan", // forgeWait가 13-melds*3 텐파이를 하드코딩 → 16장 보유자에겐 영영 미발동
  ],
  install(ctx) {
    // 배패 16장 (보유자만)
    ctx.setHolderRule("deal.handSize", 16);
    // 표준형 멘쯔 수 5개 (보유자만)
    ctx.setHolderRule("scoring.totalSets", 5);
    // 화료 시 +3판 — 보유자에게만 현재 값에 더한다
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) =>
        rctx.playerId === ctx.holder ? current + 3 : current,
    });

    // 무장해제 통보 — 잠기기 직전에 온다(무장해제의 toEvents 순서가 계약).
    // 규칙이 4멘쯔로 돌아가기 전에 손패를 표준 장수로 맞춰 놓는다.
    ctx.reaction(AUGMENT_DISARMED, (event, rc) => {
      const p = event.payload as AugmentDisarmedPayload;
      if (p.augmentId !== ID || p.target !== ctx.holder) return;
      const ids = returnTileIds(rc.state, ctx.holder);
      if (ids.length === 0) return;
      // 패산 맨 밑으로 반납 — 방금 돌려준 패를 곧바로 되뽑지 않는다
      // (개벽·통째로 바꾸기·밥상 뒤엎기와 같은 규약).
      rc.emit(tilesMoved({ from: handZone(ctx.holder), to: WALL, tileIds: ids }));
    });
  },
});
