/**
 * 바람의 계보 (wind_lineage, prism) — "바람과 삼원패에 족보가 생긴다".
 *
 * 자패에 순서가 부여되어 **슌쯔**를 만들 수 있다:
 *  - 바람: 동→남→서→북 (동남서 · 남서북)
 *  - 삼원: 백→발→중 (백발중)
 * 같은 자패 계열 안에서 연속 3장이면 하나의 몸통이다. 자패로 대기가 서고, 화료 공개에서
 * 동·남·서 석 장이 슌쯔 자리에 눕는다 — "그게 멘쯔라고?"
 *
 * 구현: 순수 패시브. 코어 규칙 `scoring.honorRuns`(보유자 전용)를 켜면 `decompose`가
 * 자패 suit(바람 rank 1-4, 삼원 rank 1-3) 안에서 (r, r+1, r+2) 슌쯔를 열거한다. 화료·텐파이·
 * 대기·후리텐이 전부 이 분해를 통과하므로 한 곳만 열면 전 판정에 일관 적용된다(broken_border 계열).
 * 클라이언트 대기 표시(`waitDecompOptions`)도 같은 옵션을 미러링한다.
 *
 * **치도 열린다** — 손 안에서만 몸통이고 울 수는 없으면 반쪽짜리 규칙이라, 후보 생성
 * (FlowController.chiCandidates)과 판정(chiAction.validate)이 같은 `isHonorRun`을 본다.
 * 자패는 무늬 혼합(mixedRuns)·순환(wrapRuns) 없이 계열 안 rank 상한(바람 4 / 삼원 3)만 지킨다.
 *
 * 밸런스 메모: 자패 슌쯔는 청일/삼색/일기통관 같은 수패 역과 무관하고, 오히려 찬타·혼노두·
 * 자일색 쪽으로 값이 붙는다. 삼색동순·일기통관은 NUMBER_SUITS로 게이트돼 자패 슌쯔에
 * 헛성립하지 않는다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, TileKind } from "@majak/core";
import { handKindsOf } from "./botHelpers.js";

const ID = "wind_lineage";

/** 이 옵션이 '동남서북 깡'(서로 다른 네 바람 한 장씩)인가 */
function isFourWindKan(kinds: TileKind[]): boolean {
  if (kinds.length !== 4) return false;
  if (!kinds.every((k) => k.suit === "wind")) return false;
  return new Set(kinds.map((k) => k.rank)).size === 4;
}

export const windLineage: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  name: "바람의 계보",
  description:
    "(상시) 자패로 슌쯔를 만든다 — 동→남→서→북, 백→발→중이 연속으로 이어져 동남서·남서북·백발중이 하나의 몸통이 된다. 동·남·서·북 네 장을 모으면 하나의 깡으로 낼 수도 있다.",
  detail:
    "(상시) 자패에 순서가 생겨 동→남→서→북, 백→발→중으로 이어지는 석 장이 슌쯔로 인정된다 — 동남서, 남서북, 백발중이 각각 하나의 몸통이다. 이 몸통은 손 안에서만이 아니라 상가(왼쪽)의 버림패를 치해서도 만들 수 있다. 여기에 더해 동·남·서·북 네 바람을 각각 한 장씩 모으면 그 넷을 하나의 안깡(동남서북 깡)으로 선언할 수 있고 영상패도 정상적으로 뽑는다. 자패 슌쯔는 청일색·삼색·일기통관에는 관여하지 않고 찬타·혼노두·자일색 쪽으로 값이 붙는다.",
  install(ctx) {
    ctx.setHolderRule("scoring.honorRuns", true);
  },
  /**
   * 봇: 분해 규칙 자체는 패시브지만 **동남서북 깡**은 표준 `ankan` 옵션으로 제시된다.
   * BotAgent의 일반 깡 규칙은 "같은 패 4장"만 판단하고 서로 다른 패의 깡은 여기로 넘기므로
   * (안 그러면 봇은 이 깡을 영영 치지 않는다), 네 바람이 전부 **고립**일 때 — 즉 짝·자패
   * 슌쯔 재료로 더 쓸 데가 없을 때 — 깡으로 바꿔 영상패와 새로운 도라를 챙긴다.
   */
  bot: {
    choose({ options, view, holder }) {
      const hand = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== "ankan") continue;
        const ids = (o.payload as { tileIds?: number[] }).tileIds ?? [];
        const kinds = ids
          .map((id) => view.tiles[id]?.kind)
          .filter((k): k is TileKind => k !== undefined);
        if (!isFourWindKan(kinds)) continue;
        // 깡에 쓸 네 장을 한 장씩만 뺀 나머지에 같은 바람이 또 있으면(커쯔 재료) 참는다
        const rest = [...hand];
        for (const k of kinds) {
          const i = rest.findIndex((x) => x.suit === k.suit && x.rank === k.rank);
          if (i >= 0) rest.splice(i, 1);
        }
        if (kinds.some((k) => rest.some((x) => x.suit === k.suit && x.rank === k.rank))) {
          continue;
        }
        return o;
      }
      return null;
    },
  },
});
