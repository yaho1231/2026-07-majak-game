/**
 * 영상 정찰 (rinshan_preview) — 남은 영상패를 전부 보고, 국당 1회 순서를 다시 짜고
 * 원하면 그중 한 장을 내 쯔모패와 맞바꾼다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b C (52차 버프)
 *
 * 2026-08-27 (사용자 지시) 버프: **열람 1장 → 남은 영상패 전부(최대 4장)**,
 * **끌어오기 1회 → 순서지정 + 선택적 1회 교환**.
 *   원문: "국당 순서지정도 가능하고, 1회 교환도 가능하게(사용시 순서를 마음대로
 *   드래그해서 수정하고, 하나를 선택하면 그 패와 내 쯔모패를 바꿈. 선택안하기
 *   버튼누르면 그냥 순서지정만)".
 *
 * ① 열람(상시): visibility.deadWall 규칙에 Modifier를 얹어, 보유자가 볼 때만
 *    {mode:"peek",count:n}을 돌려준다. n = rinshanRemaining(state) — 깡으로 소모된
 *    자리는 보충되지 않으므로 남은 영상패는 최대 4장이고, 다 떨어지면 0이다.
 *    여러 장을 열어도 거짓 정보가 되지 않는다: 채널이 아니라 **왕패 Zone 자체를**
 *    여는 열람이라 깡으로 앞이 당겨지면 화면도 함께 당겨진다.
 * ② 순서지정 + 교환(국당 1회): 액션 `rinshan_arrange { order, take }`.
 *    - `order` : 남은 영상패 n장의 순열. 새 i번째 자리에 올 **기존 인덱스**다
 *      (예지 foresight_order와 같은 규약). 항등도 허용한다.
 *    - `take`  : 재배열 **후** 순서에서 내 쯔모패와 맞바꿀 자리. `null`이면
 *      교환 없이 순서만 확정한다("선택 안 하기").
 *    깡을 하지 않고도 영상패를 손에 넣는다는 성격은 그대로다.
 *    - "깡할 때만" 열리는 절벽 위에 피어난 꽃(cliff_bloom)과도,
 *      왕패 14장을 전부 보는 왕패의 주인(dead_wall_master)과도,
 *      **패산** 밑을 보는 밑장빼기(bottom_deal)와도 겹치지 않는다.
 *
 * ⚠ 왕패 장수 보존이 이 자리의 핵심 불변식이다. 왕패는 [영상패 n장][표시패 10장]이고
 *    `rinshanRemaining()`은 `길이 − INDICATOR_BLOCK_SIZE`로 그 경계를 센다. 이 파일은
 *    **앞 n장만** 건드린다:
 *      - 교환은 예전과 같이 «영상패 한 장을 손으로 → 쯔모패를 index 0에» 라서
 *        길이가 변하지 않는다(뒤 10장은 밀리지 않는다).
 *      - 재배열은 앞 n장을 순열로 갈아 끼우고 `slice(n)` 꼬리를 그대로 붙인다.
 *    리듀서에 **다중집합 동일성 가드**를 두어, 앞 n장의 구성이 달라지면 그 자리에서
 *    던진다 — 도라 표시패가 한 칸이라도 밀리면 도라가 통째로 바뀌기 때문이다.
 *
 * ⚠ `lastDrawRinshan: false` — 깡을 하지 않고 끌어온 패로 영상개화(+1판)가 잘못
 *    붙던 2026-07-29 감사 건. 교환이 일어난 경우에만 쯔모패를 갈아 끼우므로 그때
 *    함께 내린다.
 *
 * 전원 공개: 교환이든 재배열이든 **판을 바꾸므로 전원에게 알린다.** 다음에 깡을 치는
 * 사람이 뽑는 패가 달라진다는 점에서 둘은 같다 — 재배열만 숨기면 "공개가 없었으니
 * 영상패는 그대로겠지"라는 잘못된 확신을 주게 된다. 넣은 패의 정체·바뀐 순서는
 * 공개하지 않는다(왕패는 원래 안 보이는 것이 맞다).
 */

import {
  DEAD_WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  moveTiles,
  playerAtSeat,
  rinshanRemaining,
  shantenOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  TileKind,
  VisibilityRule,
} from "@majak/core";
import {
  flagOf,
  publishUsesLeft,
  roundViewKey,
  widenPeek,
} from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "rinshan_preview";
const ACTION_ARRANGE = "rinshan_arrange";
const RINSHAN_ARRANGED = "RinshanArranged";

/** 국당 1회 사용 플래그 (roundKey를 섞어 국마다 자동 만료) */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

/**
 * 전원 공개: 이번 국에 이 사람이 영상패를 손댔다는 사실.
 *
 * 열람은 본인 정보라 숨겨도 되지만 **순서지정·교환은 판을 바꾼다** — 다음에 깡을
 * 치는 사람은 자기가 뽑는 패가 남이 짜 놓은 자리라는 걸 모른 채 뽑았다. 인과가
 * 테이블에서 안 보이면 증강이 아니다(Rule #2). 무엇을 넣었는지·어떤 순서인지는
 * 밝히지 않는다 — 그건 그 사람의 손패였고, 왕패는 원래 안 보이는 것이 맞다.
 */
const arrangeViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);

interface RinshanArrangedPayload {
  player: PlayerId;
  /** 새 i번째 자리에 올 기존 인덱스 (남은 영상패 n장의 순열) */
  order: number[];
  /** 재배열 후 순서에서 쯔모패와 맞바꿀 자리 (null = 교환 없음) */
  take: number | null;
  /** 손에서 왕패로 밀어 넣는 쯔모패 (교환할 때만) */
  drawnTileId: TileId | null;
  /** 왕패에서 가져오는 영상패 (교환할 때만) */
  takenTileId: TileId | null;
}

/** 남은 영상패의 tileId (왕패 앞 n장) */
function rinshanIds(state: GameState): TileId[] {
  const n = rinshanRemaining(state);
  return (state.zones[DEAD_WALL]?.tileIds ?? []).slice(0, n);
}

/** 0~n-1의 모든 순열 (재배열 후보 생성용 — n ≤ 4라 최대 24개) */
function permutations(n: number): number[][] {
  if (n <= 0) return [];
  const out: number[][] = [];
  const rec = (rest: number[], acc: number[]): void => {
    if (rest.length === 0) {
      out.push([...acc]);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      const next = [...rest];
      const [picked] = next.splice(i, 1);
      rec(next, [...acc, picked as number]);
    }
  };
  rec(
    Array.from({ length: n }, (_v, i) => i),
    [],
  );
  return out;
}

/** order가 0~n-1의 순열인가 (항등도 허용 — '그대로 두기') */
function isValidOrder(order: unknown, n: number): order is number[] {
  if (!Array.isArray(order) || order.length !== n) return false;
  const seen = new Set<number>();
  for (const v of order) {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= n) return false;
    seen.add(v as number);
  }
  return seen.size === n;
}

/** 지금 이 증강을 쓸 수 있는가 (자기 턴 · 국당 1회 · 남은 영상패 존재) */
function canArrange(state: GameState, h: PlayerId): boolean {
  if (flagOf(state, usedKey(state, h))) return false;
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== h) return false;
  // 남은 **영상패**로 판정한다 — 깡으로 뽑힌 자리는 보충되지 않으므로 배열 길이로 보면
  // 영상패가 다 떨어진 뒤에도 도라 표시패를 끌어오게 된다 (2026-07-26).
  return rinshanRemaining(state) > 0;
}

const arrangeAction: ActionDef<{ order: number[]; take: number | null }> = {
  type: ACTION_ARRANGE,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no rinshan_preview augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    const n = rinshanRemaining(state);
    if (n === 0) return "no rinshan tiles left";
    if (!isValidOrder(req.payload.order, n)) return "invalid order";
    const take = req.payload.take;
    if (take !== null) {
      if (!Number.isInteger(take) || take < 0 || take >= n) return "invalid take";
      // 교환할 때만 쯔모패가 필요하다 — 순서지정만이면 울고 난 순에도 쓸 수 있다.
      const drawn = state.round.lastDrawnTile;
      if (drawn === null) return "no drawn tile to trade";
      if (!handIdsOf(state, req.player).includes(drawn)) return "drawn tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const front = rinshanIds(state);
    const order = [...req.payload.order];
    const take = req.payload.take;
    // take는 **재배열 후** 자리이므로, 실제로 빠져나가는 패는 order[take]번째 원본이다.
    const takenTileId =
      take === null ? null : (front[order[take] as number] as TileId);
    const drawnTileId = take === null ? null : (state.round.lastDrawnTile as TileId);
    return [
      {
        type: RINSHAN_ARRANGED,
        payload: {
          player: req.player,
          order,
          take,
          drawnTileId,
          takenTileId,
        } satisfies RinshanArrangedPayload,
      },
      augmentDataSet(usedKey(state, req.player), true),
      // 전원 공개 — 다음 깡을 치는 사람이 "영상패가 손대졌다"를 알고 뽑는다
      augmentDataSet(
        arrangeViewKey(req.player),
        take === null
          ? "영상패 순서를 다시 짰다"
          : "영상패 순서를 다시 짜고 한 장을 자기 쯔모패와 맞바꿨다",
      ),
    ];
  },
};

export const rinshanPreview: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "info",
  complexity: 3,
  name: "영상 정찰",
  description:
    "(상시 열람 · 매 국 1회) 남은 영상패를 항상 나만 볼 수 있고, 자기 순에 그 순서를 마음대로 다시 짠다. 그때 한 장을 고르면 내 쯔모패와 맞바꾸고, 고르지 않으면 순서만 확정된다.",
  detail:
    "남은 영상패(최대 4장)를 항상 나만 보고, 자기 순에 그 순서를 다시 짠다. 그때 한 장을 고르면 내 쯔모패와 맞바꾼다.\n\n발동 사실은 전원에게 공개된다(바뀐 순서와 넣은 패는 비공개). 맞바꾼 패로는 영상개화가 붙지 않고, 영상패가 다 떨어지면 닫힌다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    // 액션·리듀서는 게임당 한 번만 등록 (여러 명이 같은 증강을 가질 수 있다)
    if (!engine.actions.has(ACTION_ARRANGE)) {
      engine.actions.register(arrangeAction);
      engine.reducers.register(RINSHAN_ARRANGED, (state, event) => {
        const p = event.payload as RinshanArrangedPayload;
        const n = p.order.length;
        const before = rinshanIds(state);
        if (before.length !== n) throw new Error("rinshan_preview: 영상패 장수가 달라졌다");

        // ① 교환(선택) — 예전과 같은 손놀림이라 왕패 장수가 변하지 않는다:
        //    영상패 한 장이 손으로 나가고, 그 자리(index 0)에 쯔모패가 들어간다.
        let zones = state.zones;
        if (p.takenTileId !== null && p.drawnTileId !== null) {
          zones = moveTiles(zones, DEAD_WALL, handZone(p.player), [p.takenTileId]);
          zones = moveTiles(zones, handZone(p.player), DEAD_WALL, [p.drawnTileId], 0);
        }

        // ② 재배열 — 앞 n장만 순열로 갈아 끼우고 꼬리(표시패 블록 10장)는 그대로 붙인다.
        const reordered = p.order.map((i) =>
          p.take !== null && i === p.order[p.take] ? (p.drawnTileId as TileId) : (before[i] as TileId),
        );
        const dw = zones[DEAD_WALL];
        if (dw === undefined) throw new Error("rinshan_preview: no dead wall zone");
        const tail = dw.tileIds.slice(n);
        /*
         * ⚠ 다중집합 동일성 가드 — 앞 n장의 구성이 달라지면 그 자리에서 던진다.
         * 여기서 한 장이라도 새거나 겹치면 꼬리가 밀려 **도라 표시패가 통째로**
         * 바뀐다. 조용히 어긋나느니 즉시 실패하는 편이 낫다.
         */
        const head = dw.tileIds.slice(0, n);
        const same =
          reordered.length === head.length &&
          [...reordered].sort((a, b) => a - b).join() ===
            [...head].sort((a, b) => a - b).join();
        if (!same) throw new Error("rinshan_preview: 영상패 구성이 깨졌다");
        zones = { ...zones, [DEAD_WALL]: { ...dw, tileIds: [...reordered, ...tail] } };

        if (p.takenTileId === null) {
          // 순서만 바꿨다 — 손패도 쯔모패도 그대로다.
          return { ...state, zones };
        }
        return {
          ...state,
          zones,
          // 새 쯔모패는 끌어온 영상패 — 리치 중 쯔모기리도 이 패를 기준으로 판정된다.
          // 다만 **깡을 하지 않았으므로 영상개화는 성립하지 않는다** — 플래그를 끄지 않으면
          // 깡 직후에 끌어온 패로 +1판이 잘못 붙었다(2026-07-29 감사).
          round: {
            ...state.round,
            lastDrawnTile: p.takenTileId,
            lastDrawRinshan: false,
          },
        };
      });
    }

    ctx.engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      // 보유자 시점에만 **남은 영상패 전부**를 공개 (2026-08-27 버프).
      // 영상패가 다 떨어졌으면 아무것도 열지 않는다 — 맨 앞이 도라 표시패가 되기 때문.
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return widenPeek(cur, { mode: "peek", count: 1 });
        const n = rinshanRemaining(state);
        if (n === 0) return cur;
        // widenPeek 필수 — cur를 무시하고 덮으면 왕패를 더 넓게 여는 다른 증강
        // (왕패의 주인 14장, 이면투시 전체 공개)을 좁혀 버린다.
        // 최종 열람 범위가 드래프트 픽 순서로 갈리던 원인이다(docs/25 P7).
        return widenPeek(cur, { mode: "peek", count: n });
      },
    });

    /*
     * 후보 열거 — 순열(최대 24) × 교환 자리(n+1, null 포함) = 최대 120개.
     * 예지(foresight_order)와 같은 규약이다: 클라이언트가 드래그로 만든 순서를
     * **후보 중에서 골라** 제출하므로, 리플레이는 payload만으로 같은 순서를 재현한다.
     */
    ctx.holderTurnOptions((state) => {
      if (!canArrange(state, holder)) return [];
      const n = rinshanRemaining(state);
      const drawn = state.round.lastDrawnTile;
      const canTake = drawn !== null && handIdsOf(state, holder).includes(drawn);
      const out: { type: string; payload: { order: number[]; take: number | null } }[] = [];
      for (const order of permutations(n)) {
        out.push({ type: ACTION_ARRANGE, payload: { order: [...order], take: null } });
        if (!canTake) continue;
        for (let take = 0; take < n; take++) {
          out.push({ type: ACTION_ARRANGE, payload: { order: [...order], take } });
        }
      }
      return out;
    });
  },
  /**
   * 봇: **순서는 그대로 두고(항등), 교환만 판단한다.**
   *
   * 재배열의 값은 "다음에 누가 깡을 치는가"에 달려 있어 봇이 읽을 근거가 없다 —
   * 잘못 섞으면 자기 영상패까지 나빠지므로 항등이 안전한 기본값이다. 교환은
   * 반대로 근거가 뚜렷하다: 쯔모패를 영상패로 갈아 샹텐이 **실제로 줄 때만** 한다.
   * (예전 정책 "제시되면 항상 발동"은 순서지정이 생긴 지금 그대로 두면 국당 1회를
   * 아무 이득 없이 태우게 된다.)
   */
  bot: plan({
    intent: "advance",
    pick: (bctx) => {
      const mine = bctx.options.filter((o) => o.type === ACTION_ARRANGE);
      if (mine.length === 0) return null;
      const identity = (p: unknown): boolean => {
        const ord = (p as { order?: unknown }).order;
        return Array.isArray(ord) && ord.every((v, i) => v === i);
      };
      const view = bctx.view;
      const handIds = view.zones[handZone(bctx.holder)]?.tileIds ?? [];
      const kindAt = (id: number): TileKind | undefined => view.tiles[id]?.kind;
      const handKinds = handIds
        .map(kindAt)
        .filter((k): k is TileKind => k !== undefined);
      const drawn = view.round.myDrawnTile;
      const meldCount = view.round.byPlayer[bctx.holder]?.melds.length ?? 0;
      /** 14장 손의 «가장 좋은 한 장을 버렸을 때» 샹텐 — 두 후보를 같은 잣대로 잰다 */
      const best = (kinds: readonly TileKind[]): number => {
        let out = 99;
        for (let i = 0; i < kinds.length; i++) {
          const rest = kinds.filter((_k, j) => j !== i);
          out = Math.min(out, shantenOf(rest, meldCount));
        }
        return out;
      };
      const skip = mine.find(
        (o) => identity(o.payload) && (o.payload as { take: number | null }).take === null,
      );
      if (drawn === null || handKinds.length !== handIds.length) return skip ?? null;
      const drawnKind = kindAt(drawn);
      if (drawnKind === undefined) return skip ?? null;
      const baseline = best(handKinds);
      const dead = view.zones[DEAD_WALL]?.tileIds ?? [];
      let bestOpt = skip ?? null;
      let bestScore = baseline;
      for (const o of mine) {
        const take = (o.payload as { take: number | null }).take;
        if (take === null || !identity(o.payload)) continue;
        // 항등 순서이므로 take는 곧 왕패 앞의 인덱스다
        const candKind = kindAt(dead[take] ?? -1);
        if (candKind === undefined) continue;
        const swapped = [
          ...handKinds.filter((_k, i) => handIds[i] !== drawn),
          candKind,
        ];
        const s = best(swapped);
        if (s < bestScore) {
          bestScore = s;
          bestOpt = o;
        }
      }
      // 샹텐이 줄지 않으면 국당 1회를 태우지 않는다 (null = 이번 순엔 안 쓴다)
      return bestScore < baseline ? bestOpt : null;
    },
  }),
});
