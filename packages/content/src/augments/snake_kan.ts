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
 * 채점: 4연속 깡은 **슌쯔로도 커쯔로도** 셀 수 있다 — `WinContext.meldToSetChoices`가
 * 두 해석을 다 내놓고 `evaluateWin`이 비싼 쪽을 고른다. 그래서 또이또이·산안커·스안커도
 * 성립하고(2026-08-19 사용자 지시), 일기통관·삼색동순도 그대로 산다. 깡 자체(isKan)는
 * 어느 해석에서도 유지되어 산깡쯔·스깡쯔 카운트와 부수는 같다.
 * 랭크·무늬를 요구하는 커쯔 역(삼색동각 등)은 대표 3장이 3-4-5라 저절로 걸러진다.
 * (사풍깡 = 바람의 계보의 동남서북은 연속이 아니라 이 확장에 들지 않는다 — 커쯔로 세면
 *  역패·사희가 헛성립한다)
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
    "같은 무늬 연속 4장(3-4-5-6)을 깡으로 낼 수 있다 — 영상패를 뽑고 깡도라가 열린다.\n\n슌쯔로도 커쯔로도 세어 비싼 쪽이 잡히지만, 삼색동각처럼 같은 숫자를 요구하는 역에는 들어가지 않는다. 리치 중에는 선언할 수 없다. 끝없는 윤회를 함께 들면 9-1을 넘는 연속도 된다.",
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
        // 끝없는 윤회를 함께 들고 있으면 8-9-1-2 같은 순환 4연속도 이 정책이 맡는다
        if (!isRunQuad(kinds, ctx.view.scoringOptions?.wrapRuns === true)) continue;
        // (같은 패 4장은 BotAgent의 일반 규칙 담당)
        const rest = without(hand, kinds);
        const waits = winningKinds(rest, meldCount + 1, undefined, ctx.view.scoringOptions);
        if (waits.length > 0) return o;
      }
      return null;
    },
  }),
});
