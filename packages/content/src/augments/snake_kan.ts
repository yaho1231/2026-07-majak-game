/**
 * 장사진 (snake_kan, prism) — "슌쯔로 깡을 한다고?!"
 *
 * 같은 무늬 **연속 4장**(예: 3-4-5-6)을 하나의 **깡**으로 선언한다 — 뱀처럼 이어진 넉 장에
 * 같은 패 4장의 특권(영상패 보충 쯔모 + 새로운 도라 개봉)이 그대로 주어진다.
 *
 * 구현: 코어 규칙 `call.snakeKan`(보유자 전용)을 켜면
 * - `ankan` validate가 `isRunQuad`(같은 수패 무늬 연속 4장)를 안깡 재료로 인정하고,
 * - `FlowController`가 손패에서 연속 4장 조합을 안깡 후보로 생성한다.
 * 바람의 계보의 '동남서북 깡'과 완전히 같은 확장 지점이며, 영상패·새로운 도라·깡 카운트는
 * 표준 깡 경로를 그대로 탄다.
 *
 * ⚠ 채점: **랭크가 서로 다른** 깡은 `WinContext.meldToSet`이 **슌쯔성 몸통**으로 내보낸다
 * (대표 3장 = 랭크 오름차순 앞 3장). 커쯔로 환산하면 또이또이·산안커·삼색동각·부수가
 * 헛성립하기 때문이다. 깡 자체(isKan)는 유지되어 산깡쯔·스깡쯔 카운트는 정상이다.
 * (랭크가 같고 무늬만 섞인 깡 = 동수의 결속의 4만4통4삭4만은 진짜 커쯔라 이 분기에 들지 않는다)
 *
 * ⚠ 리치 중에는 선언할 수 없다 — 4연속 깡은 언제나 대기를 바꾼다(표준 안깡 안전성 규칙).
 */

/*
 * `isRunQuad`는 **코어의 것을 쓴다** — 예전에는 이 파일에 사본이 있어서, 엔진의
 * ankan validate(코어 판정)와 봇 정책(사본 판정)이 서로 다른 규칙을 볼 수 있었다
 * (docs/25 벽패/왕패/깡 #9). 판정의 단일 진실은 코어다.
 */
import { defineAugment, isRunQuad, winningKinds } from "@majak/core";
import type { AugmentDef, TileId, TileKind } from "@majak/core";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "snake_kan";

/** kinds에서 remove의 각 패를 한 장씩 뺀 목록 */
function without(kinds: TileKind[], remove: readonly TileKind[]): TileKind[] {
  const out = [...kinds];
  for (const r of remove) {
    const i = out.findIndex((k) => k.suit === r.suit && k.rank === r.rank);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

export const snakeKan: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  complexity: 3,
  name: "장사진",
  description:
    "(상시) 같은 무늬 연속 4장(예: 3-4-5-6)을 '장사진'으로 선언해 깡으로 낼 수 있다 — 영상패를 뽑고 새로운 도라가 열린다.",
  detail:
    "(상시) 같은 무늬 연속 4장(3-4-5-6 등)을 손에 모으면 장사진으로 선언해 눕힐 수 있고, 영상패 보충 쯔모와 새로운 도라 개봉이 표준 깡과 똑같이 따라온다. 다만 채점에서는 커쯔가 아니라 슌쯔로 취급되어 또이또이·산안커 같은 커쯔 역은 붙지 않으며, 깡 자체로는 세어 산깡쯔·스깡쯔에는 포함된다. 리치 중에는 선언할 수 없다.",
  install(ctx) {
    ctx.setHolderRule("call.snakeKan", true);
  },
  /**
   * 4연속 깡은 **언제나 대기를 바꾼다** — 슌쯔 하나 + 여분 한 장으로 쓰던 넉 장을 통째로
   * 눕히기 때문이다. 그래서 봇은 **텐파이 상태에서 깡을 쳐도 대기가 살아 있을 때**만
   * 선언한다. 그때는 새 도라 한 장과 영상패 쯔모가 공짜로 얹히는 순이득이다.
   *
   * 노텐일 때는 치지 않는다 — 손이 나아가지 않는데 넉 장을 굳혀 형태만 좁아진다.
   * 남이 리치를 걸었을 때도 치지 않는다(새 도라는 그 사람에게도 붙는다).
   *
   * 장사진 깡은 표준 `ankan` 옵션으로 제시되고 BotAgent의 일반 깡 판단은 **같은 패
   * 4장만** 다루므로(서로 다른 패의 깡은 이득 계산이 손패에 달렸다), 여기서 직접 고른다.
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: (ctx) => {
      if (!ctx.tenpai) return null;
      if (ctx.threat >= 0.9) return null;
      const hand = handKindsOf(ctx.view, ctx.holder);
      const meldCount = ctx.view.round.byPlayer[ctx.holder]?.meldCount ?? 0;
      for (const o of ctx.options) {
        if (o.type !== "ankan") continue;
        const ids = (o.payload as { tileIds?: TileId[] }).tileIds ?? [];
        const kinds: TileKind[] = [];
        for (const id of ids) {
          const k = ctx.view.tiles[id]?.kind;
          if (k !== undefined) kinds.push(k);
        }
        if (!isRunQuad(kinds)) continue; // 같은 패 4장은 BotAgent의 일반 규칙 담당
        const rest = without(hand, kinds);
        const waits = winningKinds(rest, meldCount + 1, undefined, ctx.view.scoringOptions);
        if (waits.length > 0) return o;
      }
      return null;
    },
  }),
});
