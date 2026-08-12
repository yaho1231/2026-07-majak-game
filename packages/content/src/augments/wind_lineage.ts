/**
 * 바람의 계보 (wind_lineage, prism) — "바람과 삼원패에 족보가 생긴다".
 *
 * 자패에 순서가 부여되어 **슌쯔**를 만들 수 있다:
 *  - 바람: 동→남→서→북 (동남서 · 남서북)
 *  - 삼원: 백→발→중 (백발중)
 * 같은 자패 계열 안에서 연속 3장이면 하나의 몸통이다. 자패로 대기가 서고, 화료 공개에서
 * 동·남·서 석 장이 슌쯔 자리에 눕는다 — "그게 멘쯔라고?"
 *
 * 구현: 코어 규칙 `scoring.honorRuns`(보유자 전용)를 켜면 `decompose`가
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

import { Suits, defineAugment, isHonorRun } from "@majak/core";
import type {
  AugmentDef,
  PlayerId,
  ScoringVariant,
  TileKind,
  WinContext,
} from "@majak/core";
import { addYakuHolder, yakuHolders } from "../util.js";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "wind_lineage";
/** 자풍/장풍이 낀 바람 슌쯔에 붙는 역 id (자풍·장풍 각각 1판 — 표준 역패와 같은 꼴) */
const SEAT_YAKU = "wind_lineage_seat";
const PREVALENT_YAKU = "wind_lineage_prevalent";
/** 백발중(삼원 슌쯔)에 붙는 역 id — 몸통이 몇 개든 1판이다 */
const DRAGON_YAKU = "wind_lineage_dragon";

/**
 * 이 몸통이 **그 바람이 낀 바람 슌쯔**인가 — 동남서·남서북 안의 한 장이 자풍/장풍이면 참.
 *
 * 표준 역패는 커쯔(같은 패 3장)만 본다. 그래서 계보로 만든 동남서는, 그 안에 내 자풍이
 * 버젓이 들어 있어도 값이 0이었다 — 자패 셋을 모아 울고도 손이 싸다는 뜻이라
 * "너무 약하다"는 말이 나왔다(2026-08-12 사용자 지적). 슌쯔 안의 역패도 커쯔와 같이
 * 한 장당 1판으로 센다.
 */
function windRunHas(variant: ScoringVariant, rank: number): boolean {
  return variant.sets.some(
    (s) =>
      s.type === "run" &&
      isHonorRun(s.tiles) &&
      s.tiles.every((t) => t.suit === Suits.Wind) &&
      s.tiles.some((t) => t.rank === rank),
  );
}

/**
 * 백발중(삼원 슌쯔)을 몸통으로 들고 있는가.
 *
 * 삼원패는 셋 다 역패라 "낀 역패마다 1판"을 그대로 적용하면 3판이 되는데, 백발중은
 * 대삼원 계열의 값을 따로 받는 몸통이라 값이 두 겹으로 붙는다. 그렇다고 0판이면
 * 자패 셋을 모으고도 손이 싸다 — **몸통 하나에 1판**으로 못을 박는다
 * (2026-08-12 사용자 지시).
 */
function hasDragonRun(variant: ScoringVariant): boolean {
  return variant.sets.some(
    (s) =>
      s.type === "run" &&
      isHonorRun(s.tiles) &&
      s.tiles.every((t) => t.suit === Suits.Dragon),
  );
}

/** 이 화료자가 계보 보유자이고, 지정한 바람이 낀 바람 슌쯔를 들고 있는가 */
const holderHasWindRun = (
  holders: Set<PlayerId>,
  variant: ScoringVariant,
  ctx: WinContext,
  rank: number,
): boolean =>
  ctx.winnerId !== undefined && holders.has(ctx.winnerId) && windRunHas(variant, rank);

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
  complexity: 2,
  name: "바람의 계보",
  description:
    "(상시) 자패로 슌쯔를 만든다 — 동→남→서→북, 백→발→중이 연속으로 이어져 동남서·남서북·백발중이 하나의 몸통이 된다. 바람 슌쯔에 낀 자풍·장풍은 각각 1판, 백발중은 1판으로 값한다. 동·남·서·북 네 장을 모으면 하나의 깡으로 낼 수도 있다.",
  detail:
    "(상시) 자패에 순서가 생겨 동→남→서→북, 백→발→중으로 이어지는 석 장이 슌쯔로 인정된다 — 동남서, 남서북, 백발중이 각각 하나의 몸통이다. 이 몸통은 손 안에서만이 아니라 상가(왼쪽)의 버림패를 치해서도 만들 수 있다. 여기에 더해 동·남·서·북 네 바람을 각각 한 장씩 모으면 그 넷을 하나의 안깡(동남서북 깡)으로 선언할 수 있고 영상패도 정상적으로 뽑는다. 바람 슌쯔 안에 자풍(내 바람)이나 장풍(그 국의 바람)이 들어 있으면 커쯔로 낸 역패와 똑같이 **각각 1판**이 붙는다 — 동1국의 서가가 동남서를 만들면 장풍 동·자풍 서가 함께 걸려 2판이다(같은 바람은 몸통이 몇 개든 한 번만 센다). 백발중은 삼원패 셋이 모두 역패지만 **몸통 하나에 1판**으로 값한다. 자패 슌쯔는 청일색·삼색·일기통관에는 관여하지 않고 찬타·혼노두·자일색 쪽으로 값이 붙는다.\n\n리치 중에는 이 안깡을 선언할 수 없다 — 깡이 대기를 바꾸기 때문이다.",
  install(ctx) {
    ctx.setHolderRule("scoring.honorRuns", true);

    /*
     * 자풍·장풍이 낀 바람 슌쯔 = 1판씩 (2026-08-12 사용자 상향).
     *
     * 표준 역패(`yakuhai_seat`/`yakuhai_prevalent`)를 슌쯔로 넓힌 것이라 **보조역이
     * 아니다** — 동남서를 울어 만든 손도 역패 커쯔를 울어 만든 손처럼 그 자체로 역이
     * 선다. 동1국의 서가가 동남서를 만들면 동(장풍)·서(자풍) 둘이 걸려 2판이다.
     * 백발중(삼원 슌쯔)도 **1판**이다(2026-08-12 사용자 지시). 삼원패는 셋 다 역패지만
     * 한 장당 1판으로 세면 3판이 되고, 백발중은 대삼원 계열의 값을 따로 받는 몸통이라
     * 값이 두 겹으로 붙는다 — 그래서 장수를 세지 않고 몸통 하나에 1판으로 고정한다.
     *
     * 한 바람은 몸통이 몇 개든 한 번만 센다(동남서 + 남서북을 함께 들어도 서는 1판).
     * 표준 역패도 커쯔 하나가 곧 1판이고, 바람 슌쯔 둘을 세우려면 자패 여섯 장이라
     * 실전에서 갈리는 자리가 아니다.
     */
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    if (yaku.get(SEAT_YAKU) === undefined) {
      const holders = yakuHolders(yaku, SEAT_YAKU);
      yaku.register({
        source: ctx.instanceId,
        id: SEAT_YAKU,
        name: "계보 자풍패",
        closedHan: 1,
        openHan: 1,
        check: (variant, wctx) =>
          holderHasWindRun(holders, variant, wctx, wctx.seatWind),
      });
    }
    if (yaku.get(PREVALENT_YAKU) === undefined) {
      const holders = yakuHolders(yaku, PREVALENT_YAKU);
      yaku.register({
        source: ctx.instanceId,
        id: PREVALENT_YAKU,
        name: "계보 장풍패",
        closedHan: 1,
        openHan: 1,
        check: (variant, wctx) =>
          holderHasWindRun(holders, variant, wctx, wctx.prevalentWind),
      });
    }
    if (yaku.get(DRAGON_YAKU) === undefined) {
      const holders = yakuHolders(yaku, DRAGON_YAKU);
      yaku.register({
        source: ctx.instanceId,
        id: DRAGON_YAKU,
        name: "계보 삼원패",
        closedHan: 1,
        openHan: 1,
        check: (variant, wctx) =>
          wctx.winnerId !== undefined &&
          holders.has(wctx.winnerId) &&
          hasDragonRun(variant),
      });
    }
    addYakuHolder(ctx, yaku, SEAT_YAKU, PREVALENT_YAKU, DRAGON_YAKU);
  },
  /**
   * 봇: 분해 규칙 자체는 패시브지만 **동남서북 깡**은 표준 `ankan` 옵션으로 제시된다.
   * BotAgent의 일반 깡 규칙은 "같은 패 4장"만 판단하고 서로 다른 패의 깡은 여기로 넘기므로
   * (안 그러면 봇은 이 깡을 영영 치지 않는다), 네 바람이 전부 **고립**일 때 — 즉 짝·자패
   * 슌쯔 재료로 더 쓸 데가 없을 때 — 깡으로 바꿔 영상패와 새로운 도라를 챙긴다.
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
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
  }),
});
