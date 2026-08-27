/**
 * 바람의 계보 (wind_lineage, prism) — "바람과 삼원패에 족보가 생긴다".
 *
 * 자패에 순서가 부여되어 **슌쯔**를 만들 수 있다:
 *  - 바람: 동→남→서→북 (동남서 · 남서북)
 *  - 삼원: 백→발→중 (백발중)
 * 같은 자패 계열 안에서 연속 3장이면 하나의 몸통이다. 자패로 대기가 서고, 화료 공개에서
 * 동·남·서 석 장이 슌쯔 자리에 눕는다 — "그게 멘쯔라고?"
 *
 * 값(2026-08-27 사용자 지시로 **몸통마다 1판**이 됐다 — 예전에는 갈래마다 1판이었다):
 * **자풍이 든 바람 몸통이 N개면 N판, 장풍이 든 바람 몸통이 M개면 M판, 백발중 몸통이
 * K개면 K판**이다(합 N+M+K). 세 갈래는 겹칠 수 있고, 자풍과 장풍이 같은 좌석
 * (동1국 오야 등)은 한 몸통에 두 갈래가 걸려 2판이다 — 표준 더블 동과 같은 셈이다.
 * 동남서 + 남서북을 함께 들면 서가 두 몸통에 들어 자풍 몫만 2판이고, 백발중을 둘
 * 만들면 2판이다.
 *
 * ⚠ 구현 주의: `YakuDef`는 `closedHan`이 고정 number라 **역 하나로는 가변 판수를 낼 수
 * 없다.** 그래서 갈래마다 "몸통 n개 이상"을 보는 역을 `RUN_TIERS`(=4, 이론 상한)까지
 * 겹쳐 등록한다 — 몸통이 2개면 1단·2단이 함께 성립해 2판이 된다. 추가분을
 * `score.extraHan`으로 얹지 않은 이유는 (a) 그 규칙의 해석 문맥에 **채택된 변형
 * (ScoringVariant)이 없어** 몸통 수를 셀 수 없고, (b) 역 줄로 남아야 결과창에서
 * 몇 몸통이 값했는지 그대로 읽히며, (c) 커스텀 역은 `source`로 무장해제에 함께
 * 잠기기 때문이다(extraHan 경로는 별도 배선이 필요하다).
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

import { Suits, defineAugment, isHonorRun, setKinds } from "@majak/core";
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
/** 자풍/장풍이 낀 바람 슌쯔에 붙는 역 id (몸통 하나당 1판 — 표준 역패와 같은 꼴) */
const SEAT_YAKU = "wind_lineage_seat";
const PREVALENT_YAKU = "wind_lineage_prevalent";
/** 백발중(삼원 슌쯔)에 붙는 역 id — 몸통 하나당 1판 */
const DRAGON_YAKU = "wind_lineage_dragon";

/**
 * 한 갈래가 낼 수 있는 몸통 수의 상한.
 * 같은 슌쯔를 넷까지 만들 수 있다(동남서 ×4 = 12장 + 아무 짝 = 14장). 그 위는 패가
 * 모자라 존재할 수 없으므로 4단까지만 등록한다.
 */
const RUN_TIERS = 4;

/** 2단 이상의 역 id — 1단은 기존 id 그대로 둔다(리플레이·문서 호환) */
const tierYakuId = (base: string, tier: number): string =>
  tier === 1 ? base : `${base}_x${tier}`;

/** 결과창에 뜨는 이름 — 몇 번째 몸통이 값했는지 그대로 읽히게 적는다 */
const tierYakuName = (base: string, tier: number): string =>
  tier === 1 ? base : `${base} (${tier}몸통째)`;

/**
 * 이 몸통이 **그 바람이 낀 바람 슌쯔**인가 — 동남서·남서북 안의 한 장이 자풍/장풍이면 참.
 *
 * 표준 역패는 커쯔(같은 패 3장)만 본다. 그래서 계보로 만든 동남서는, 그 안에 내 자풍이
 * 버젓이 들어 있어도 값이 0이었다 — 자패 셋을 모아 울고도 손이 싸다는 뜻이라
 * "너무 약하다"는 말이 나왔다(2026-08-12 사용자 지적). 슌쯔 안의 역패도 커쯔와 같이
 * 한 장당 1판으로 센다.
 *
 * 2026-08-27부터는 **개수를 센다** — 동남서와 남서북을 함께 들면 서(자풍)가 두 몸통에
 * 들어 자풍 몫이 2판이다. 예전에는 "있으면 1판"이라 둘째 몸통이 공짜였다.
 */
function windRunCount(variant: ScoringVariant, rank: number): number {
  return variant.sets.filter((s) => {
    if (s.type !== "run" || !isHonorRun(s.tiles)) return false;
    /*
     * ⚠ 동남서북 **안깡**의 채점 대표는 앞 3장(동·남·서)이라, 대표만 훑으면
     * 북(rank 4)이 존재하지 않는 것이 된다 — 북가/북장만 같은 깡을 하고도 1판을
     * 못 받았다(qa-lab shape 확정 3). `setKinds`가 대표에서 빠진 네 번째 바람을
     * 되돌려 준다.
     */
    const kinds = setKinds(s);
    return (
      kinds.every((t) => t.suit === Suits.Wind) && kinds.some((t) => t.rank === rank)
    );
  }).length;
}

/**
 * 백발중(삼원 슌쯔) 몸통의 개수.
 *
 * 삼원패는 셋 다 역패라 "낀 역패마다 1판"을 그대로 적용하면 몸통 하나에 3판이 되는데,
 * 백발중은 대삼원 계열의 값을 따로 받는 몸통이라 값이 두 겹으로 붙는다. 그래서 장수가
 * 아니라 **몸통 하나에 1판**으로 센다(2026-08-12 사용자 지시). 다만 몸통이 둘이면
 * 2판이다 — 개수는 센다(2026-08-27 사용자 지시).
 */
function dragonRunCount(variant: ScoringVariant): number {
  return variant.sets.filter(
    (s) =>
      s.type === "run" &&
      isHonorRun(s.tiles) &&
      s.tiles.every((t) => t.suit === Suits.Dragon),
  ).length;
}

/** 이 화료자가 계보 보유자인가 (보유자가 아니면 어떤 갈래도 세지 않는다) */
const isHolderWin = (holders: Set<PlayerId>, ctx: WinContext): boolean =>
  ctx.winnerId !== undefined && holders.has(ctx.winnerId);

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
    "(상시) 자패로 슌쯔를 만든다 — 동남서·남서북·백발중도 한 몸통이 된다. 자풍·장풍이 든 몸통과 백발중 몸통은 하나당 1판씩 쌓인다.",
  detail:
    "동→남→서→북, 백→발→중으로 이어지는 석 장이 슌쯔가 된다. 치로도 만들고, 네 바람을 한 장씩 모으면 안깡으로 선언해 영상패도 뽑는다.\n\n판은 **몸통마다** 붙는다 — ① 자풍이 들어간 바람 몸통 하나에 1판 ② 장풍이 들어간 바람 몸통 하나에 1판 ③ 백발중 몸통 하나에 1판. 세 갈래는 겹쳐서 센다. 동1국의 서가가 동남서를 만들면 동(장풍)·서(자풍) 둘이 걸려 2판이고, 오야처럼 자풍과 장풍이 같으면 그 한 몸통에 2판이 붙는다(더블 동과 같은 셈).\n\n몸통이 늘면 판도 는다 — 동남서와 남서북을 함께 들면 서가 두 몸통에 들어 그만큼 더 세고, 백발중을 둘 만들면 2판이다. 후로해도 판수는 같다. 자패 슌쯔는 청일색·삼색동순·일기통관에는 값하지 않는다.",
  install(ctx) {
    ctx.setHolderRule("scoring.honorRuns", true);

    /*
     * 자풍·장풍이 낀 바람 슌쯔, 백발중 슌쯔 = **몸통 하나당 1판**
     * (2026-08-12 사용자 상향으로 갈래마다 1판 → 2026-08-27 사용자 지시로 몸통마다 1판).
     *
     * 표준 역패(`yakuhai_seat`/`yakuhai_prevalent`)를 슌쯔로 넓힌 것이라 **보조역이
     * 아니다** — 동남서를 울어 만든 손도 역패 커쯔를 울어 만든 손처럼 그 자체로 역이
     * 선다. 동1국의 서가가 동남서를 만들면 동(장풍)·서(자풍) 둘이 걸려 2판이다.
     *
     * 가변 판수를 내는 방법: `YakuDef.closedHan`은 고정 number라 역 하나로는 못 낸다.
     * 그래서 갈래마다 "몸통 n개 **이상**"을 보는 1판짜리 역을 RUN_TIERS까지 겹쳐
     * 등록한다 — 몸통이 2개면 1단·2단이 함께 성립해 합이 2판이 되고, 결과창에는
     * "계보 자풍패"·"계보 자풍패 (2몸통째)" 두 줄이 그대로 뜬다(발동이 눈에 보인다).
     * 전부 커스텀 역이라 `source`가 붙어 무장해제(disarm)에 함께 잠기고, 역만에서는
     * 코어가 일반 역을 통째로 버리므로 추가분만 새어 나갈 길도 없다.
     */
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    /** 갈래 하나를 RUN_TIERS 단까지 등록하고, 등록한 역 id들을 돌려준다 */
    const registerTiers = (
      baseId: string,
      baseName: string,
      count: (variant: ScoringVariant, wctx: WinContext) => number,
    ): string[] => {
      const ids: string[] = [];
      for (let tier = 1; tier <= RUN_TIERS; tier++) {
        const id = tierYakuId(baseId, tier);
        ids.push(id);
        if (yaku.get(id) !== undefined) continue;
        const holders = yakuHolders(yaku, id);
        yaku.register({
          source: ctx.instanceId,
          id,
          name: tierYakuName(baseName, tier),
          closedHan: 1,
          openHan: 1,
          check: (variant, wctx) =>
            isHolderWin(holders, wctx) && count(variant, wctx) >= tier,
        });
      }
      return ids;
    };

    const ids = [
      ...registerTiers(SEAT_YAKU, "계보 자풍패", (variant, wctx) =>
        windRunCount(variant, wctx.seatWind),
      ),
      ...registerTiers(PREVALENT_YAKU, "계보 장풍패", (variant, wctx) =>
        windRunCount(variant, wctx.prevalentWind),
      ),
      ...registerTiers(DRAGON_YAKU, "계보 삼원패", (variant) =>
        dragonRunCount(variant),
      ),
    ];
    addYakuHolder(ctx, yaku, ...ids);
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
