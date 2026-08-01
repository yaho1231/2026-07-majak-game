/**
 * 절벽 위에 피어난 꽃 (cliff_bloom, prism) — 48차 재설계.
 *
 * 이전: 2국당 1회, "깡 후 텐파이가 될 때만" 열리는 버튼으로 확정 영상개화.
 * 지금: **횟수 제한 없음. 조건도 없다.**
 *   ① 깡을 할 때마다 영상패를 운에 맡기지 않는다 — 왕패 앞 4장을 보고 **원하는 것을 고른다**
 *      (전용 선택 모달, `bloom_pick`).
 *   ② 같은 국에서 **두 번째 깡을 완성하는 순간 손이 만개한다** — 손패가 그 자리에서
 *      완성형으로 다시 피어나(conjured) **패와 상관없이 즉시 영상개화로 화료**할 수 있다.
 *      텐파이였는지, 무엇을 들고 있었는지는 전혀 상관없다.
 *
 * 리미트는 "한 국에 깡을 두 번 해야 한다"는 조건 자체다 — 페널티는 붙이지 않는다
 * (10_AUGMENT_SYSTEM §0 "리미트는 횟수로 준다").
 *
 * 구현 메모:
 * - 깡은 **표준 깡 흐름을 그대로 쓴다**(전용 깡 액션 없음). KAN_DECLARED를 세고,
 *   이어지는 영상패 TILE_DRAWN에 반응할 뿐이라 안깡·가깡·대명깡이 전부 자동 지원된다.
 * - 만개는 손패 kind를 통째로 완성형으로 덮어쓴다(tileKindChanged, conjured). 4장 한도를
 *   넘는 패가 생길 수 있다 — 프리즘의 상식 파괴.
 * - `rinshan` 플래그는 state.round.lastDrawRinshan에서 오므로, 패를 바꿔치기해도
 *   영상개화는 그대로 성립한다. 만개 국의 보상은 **그 영상개화를 4판으로 취급**하는 것
 *   하나뿐이다(BLOOM_RINSHAN_HAN) — 실제로 영상개화가 붙은 화료에만 적용된다.
 */

import {
  DEAD_WALL,
  KAN_DECLARED,
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  kindKey,
  meldCountOf,
  moveTiles,
  playerAtSeat,
  rinshanRemaining,
  scoringOptionsOf,
  tileKindChanged,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  KanDeclaredPayload,
  PlayerId,
  RuleRegistry,
  Suit,
  TileDrawnPayload,
  TileId,
  TileKind,
  TileKindChangedPayload,
  VisibilityRule,
} from "@majak/core";
import {
  counterOf,
  flagOf,
  roundKey,
  roundViewKey,
  widenPeek,
} from "../util.js";
import { handKindsOf, hasNeighbor } from "./botHelpers.js";

const ID = "cliff_bloom";
const ACTION_PICK = "bloom_pick";
const BLOOM_PICK_TAKEN = "BloomPickTaken";

/** 만개까지 필요한 깡 횟수 */
const KANS_TO_BLOOM = 2;
/**
 * 만개 화료의 **영상개화를 몇 판으로 취급하는가** (2026-07-26 사용자 확정).
 *
 * 표준 영상개화는 1판이다. 만개한 국의 화료에서는 그것을 **4판짜리 역으로 취급**한다 —
 * 손패가 눈앞에서 다시 피어나 그 자리에서 오르는 장면의 마감을, 정산에서도 "영상개화 4판"
 * 하나로 읽히게 하는 것이 이 증강의 보상 전부다.
 *
 * 연혁: 52차 "+3판 환산 + 6000점"(docs/16 §1c) → 2026-07-26 확정 보상 단위 통일로 합 7판 →
 * 같은 날 **영상개화 4판 취급(= +3판)**으로 정리. 판수는 만관/하네만 상한에서 비선형이라
 * 3판+4판 중복이 저판 손에서 과하게 터졌다.
 *
 * 구현: 커스텀 역은 GameState를 못 읽어 "만개했는가"를 볼 수 없으므로, 표준 영상개화 1판은
 * 그대로 두고 **차이(4 − 1 = 3판)만** 정산 보정으로 얹는다.
 *
 * ⚠ 붙는 조건: 이 증강의 하이라이트는 어디까지나 **만개**다(깡마다 영상패를 고르는 것은
 * 상시 편의 기능이라 국마다 몇 번이고 일어난다). 깡 한 번만 한 국의 평범한 화료까지
 * 붙으면 "깡하면 +3판"이라는 보이지 않는 패시브가 되어 §0에 정면으로 걸린다.
 * 따라서 **만개(bloomed)한 국 + 실제로 영상개화가 붙은 화료** 한정이다.
 */
const BLOOM_RINSHAN_HAN = 4;
/** 표준 영상개화 판수 — 정산에 얹는 것은 BLOOM_RINSHAN_HAN과의 차이뿐이다 */
const STANDARD_RINSHAN_HAN = 1;

/** 이번 국에 이 보유자가 선언한 깡 수 */
const kanCountKey = (state: GameState, h: PlayerId): string =>
  `${ID}:kans:${roundKey(state)}:${h}`;
/** 이번 국에 이미 만개했는가 */
const bloomedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:bloomed:${roundKey(state)}:${h}`;
/**
 * 지금 고를 수 있는 영상패의 대상 쯔모패 (tileId + 1, 0 = 없음).
 * "지금 쯔모패가 그 영상패일 때만 유효"하므로 플래그가 스스로 만료된다 —
 * 깡을 연달아 하거나 만개해도 지난 깡의 선택권이 남지 않는다.
 *
 * ⚠ 그래도 **국 스코프**여야 한다. tileId 비교만으로는 국이 바뀐 뒤 같은 tileId를
 * 정상 쯔모했을 때 되살아나, 깡도 없이 쯔모패를 왕패와 맞바꿀 수 있었다(2026-07-29 감사).
 */
const pickKey = (state: GameState, h: PlayerId): string =>
  `${ID}:pick:${roundKey(state)}:${h}`;

/** 지금 이 플레이어가 영상패를 고를 수 있는가 */
function canPick(state: GameState, h: PlayerId): boolean {
  const drawn = state.round.lastDrawnTile;
  if (drawn === null) return false;
  return counterOf(state, pickKey(state, h)) === drawn + 1;
}

interface BloomPickPayload {
  player: PlayerId;
  index: number;
  drawnTileId: TileId;
  takenTileId: TileId;
}

/**
 * 손패를 완성형으로 다시 짠다 — 머리(자패) 1개 + 남은 멘쯔 수만큼의 슌쯔.
 * 무늬·숫자를 흩어 배치해 삼색·일기통관 같은 역이 우연히 붙지 않게 한다
 * (만개의 보상은 판수가 아니라 '확정 화료'다).
 */
function bloomChanges(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): TileKindChangedPayload["changes"] | null {
  const concealed = handIdsOf(state, holder);
  // ⚠ 멘쯔 수를 4로 하드코딩하면 안 된다 — 진짜 용(scoring.totalSets=5, 손패 16/17장)
  //    보유자는 `sets*3+2`가 영원히 안 맞아 만개가 **한 번도 일어나지 않았다**(60차 수정).
  //    화료형의 단일 진실은 scoringOptionsOf다.
  const totalSets = scoringOptionsOf(state, rules, holder).totalSets ?? 4;
  const sets = totalSets - meldCountOf(state, holder);
  if (sets < 0) return null;
  // 완성형은 머리 2장 + 멘쯔 3장씩 — 장수가 맞지 않으면 손대지 않는다(방어)
  if (concealed.length !== sets * 3 + 2) return null;

  const changes: TileKindChangedPayload["changes"] = [];
  const pair: TileKind = { suit: "wind", rank: 1 };
  changes.push({ tileId: concealed[0] as TileId, kind: pair, attrs: { conjured: true } });
  changes.push({ tileId: concealed[1] as TileId, kind: pair, attrs: { conjured: true } });

  const suits: readonly Suit[] = ["man", "pin", "sou"];
  for (let i = 0; i < sets; i++) {
    const suit = suits[i % 3] as Suit;
    const start = 1 + (i % 3) * 2; // 123 / 345 / 567 — 삼색·일통 회피
    for (let j = 0; j < 3; j++) {
      changes.push({
        tileId: concealed[2 + i * 3 + j] as TileId,
        kind: { suit, rank: start + j },
        attrs: { conjured: true },
      });
    }
  }
  return changes;
}

const bloomPickAction: ActionDef<{ index: number }> = {
  type: ACTION_PICK,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no cliff_bloom augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!canPick(state, req.player)) return "no rinshan pick available";
    const idx = req.payload.index;
    // 고를 수 있는 건 **아직 남은 영상패**뿐이다. 깡으로 뽑은 자리는 보충되지 않으므로
    // 상수 4로 잡으면 이미 빈 자리를 지나 도라 표시패를 집게 된다(2026-07-26).
    if (!Number.isInteger(idx) || idx < 0 || idx >= rinshanRemaining(state)) {
      return "invalid rinshan index";
    }
    if ((state.zones[DEAD_WALL]?.tileIds ?? [])[idx] === undefined) {
      return "no tile at that index";
    }
    const drawn = state.round.lastDrawnTile;
    if (drawn === null) return "no drawn tile to trade";
    if (!handIdsOf(state, req.player).includes(drawn)) return "drawn tile not in hand";
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: BLOOM_PICK_TAKEN,
      payload: {
        player: req.player,
        index: req.payload.index,
        drawnTileId: state.round.lastDrawnTile as TileId,
        takenTileId: (state.zones[DEAD_WALL]?.tileIds ?? [])[
          req.payload.index
        ] as TileId,
      } satisfies BloomPickPayload,
    },
  ],
};

export const cliffBloom: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "call",
  name: "절벽 위에 피어난 꽃",
  description:
    "(상시) 깡을 할 때마다 영상패를 왕패 앞 4장 중에서 직접 고른다. 그리고 한 국에 깡을 두 번 하면 손패와 상관없이 그 자리에서 손이 만개해 즉시 영상개화로 화료하며, 그 영상개화는 4판으로 취급된다.",
  detail:
    "(상시) 깡할 때마다 왕패 앞 4장을 모두 보고 영상패를 직접 고른다. 같은 국에서 두 번째 깡을 완성하면 텐파이였는지 무엇을 쥐고 있었는지와 무관하게 손패가 완성형으로 재구성되어 영상개화로 즉시 화료한다. 만개한 국의 화료에서는 영상개화가 1판이 아니라 4판으로 계산된다. 만개하지 않은 국의 화료에는 아무것도 얹히지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION_PICK)) {
      engine.actions.register(bloomPickAction);
      engine.reducers.register(BLOOM_PICK_TAKEN, (state, event) => {
        const p = event.payload as BloomPickPayload;
        // 고른 영상패를 손으로 → 비워진 자리에 쯔모패를 밀어 넣는다 (왕패 장수 보존)
        let zones = moveTiles(state.zones, DEAD_WALL, handZone(p.player), [
          p.takenTileId,
        ]);
        zones = moveTiles(zones, handZone(p.player), DEAD_WALL, [p.drawnTileId], p.index);
        return {
          ...state,
          zones,
          // 새 쯔모패는 고른 패 — pickKey는 옛 쯔모패를 가리키므로 자동으로 만료된다
          round: { ...state.round, lastDrawnTile: p.takenTileId },
        };
      });
    }

    // 보유자에게 **남은 영상패만** 공개 — 무엇을 고를지 보고 정한다.
    // 상수 4로 두면 깡으로 영상패가 줄어든 뒤 그 뒤의 도라 표시패까지 새어 보인다.
    ctx.engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        return widenPeek(cur, {
          mode: "peek",
          count: state === undefined ? 4 : rinshanRemaining(state),
        });
      },
    });

    // 만개 국의 영상개화는 4판으로 취급한다 — 표준 1판과의 차이(+3판)만 얹는다.
    //
    // ⚠ 예전에는 이 차액을 addWinPointBonus로 **점수에만** 얹었다. 그러면 정산창에는
    //    "영상개화 1판"만 남아 4판 취급이 화면 어디에도 나타나지 않는다(2026-08-01
    //    사용자 보고: "깡 두 번 치고 화료했는데 영상개화 1판으로 취급됨").
    //    score.extraHan은 코어가 총 판수에 합산하고 WinInfo.extraHan으로도 실어 주므로
    //    정산창이 "증강 보너스 3판"으로 보여 준다 — 보이지 않던 보상이 보이게 된다.
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!flagOf(state, bloomedKey(state, holder))) return cur;
        // 영상개화의 성립 조건과 같은 판정(쯔모 + 마지막 뽑기가 영상패)을 그대로 쓴다.
        // 만개는 영상 쯔모 직후에 일어나므로, 그 화료가 아니면 아무것도 얹지 않는다.
        if (!state.round.lastDrawRinshan) return cur;
        const drawn = state.round.lastDrawnTile;
        if (drawn === null || !handIdsOf(state, holder).includes(drawn)) return cur;
        return cur + (BLOOM_RINSHAN_HAN - STANDARD_RINSHAN_HAN);
      },
    });

    // 이번 국의 깡 수를 센다 (안깡·가깡·대명깡 전부)
    ctx.reaction(KAN_DECLARED, (event, rc) => {
      const p = event.payload as KanDeclaredPayload;
      if (p.player !== holder) return;
      const key = kanCountKey(rc.state, holder);
      rc.emit(augmentDataSet(key, counterOf(rc.state, key) + 1));
    });

    // 영상패를 뽑는 순간 — 두 번째 깡이면 만개, 아니면 선택 모달을 연다
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || !p.rinshan) return;
      const state = rc.state;
      const kans = counterOf(state, kanCountKey(state, holder));

      if (kans >= KANS_TO_BLOOM && !flagOf(state, bloomedKey(state, holder))) {
        const changes = bloomChanges(state, rc.rules, holder);
        if (changes !== null) {
          rc.emit(tileKindChanged(changes));
          rc.emit(augmentDataSet(bloomedKey(state, holder), true));
          rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), "만개"));
          return; // 만개했으면 영상패를 고를 이유가 없다
        }
      }
      rc.emit(augmentDataSet(pickKey(rc.state, holder), p.tileId + 1));
    });

    // 선택 모달용 후보 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!canPick(state, holder)) return [];
      return Array.from({ length: rinshanRemaining(state) }, (_v, index) => ({
        type: ACTION_PICK,
        payload: { index },
      }));
    });
  },
  // 깡의 영상패를 왕패 앞 4장에서 고른다(홀더에겐 공개). 오름패가 있으면 그걸 골라
  // 영상개화로 화료하고, 없으면 짝·슌쯔가 되는 패를, 그래도 없으면 첫 후보를 고른다
  // (아무거나 고르는 편이 무작위 영상패보다 낫다).
  bot: {
    choose({ options, view, holder }) {
      const picks = options.filter((o) => o.type === ACTION_PICK);
      if (picks.length === 0) return null;
      const dead = view.zones[DEAD_WALL]?.tileIds ?? [];
      const kinds = handKindsOf(view, holder);
      const meldCount = view.round.byPlayer[holder]?.meldCount ?? 0;
      const wins = new Set(
        winningKinds(kinds, meldCount, undefined, view.scoringOptions).map(kindKey),
      );
      const kindAt = (o: (typeof picks)[number]): TileKind | undefined => {
        const idx = (o.payload as { index?: number }).index;
        const id = idx !== undefined ? dead[idx] : undefined;
        return id !== undefined ? view.tiles[id]?.kind : undefined;
      };
      // 1) 오름패면 즉시 화료
      for (const o of picks) {
        const k = kindAt(o);
        if (k !== undefined && wins.has(kindKey(k))) return o;
      }
      // 2) 손을 진전시키는 패(짝·이웃)
      for (const o of picks) {
        const k = kindAt(o);
        if (k === undefined) continue;
        if (kinds.some((x) => x.suit === k.suit && x.rank === k.rank) || hasNeighbor(kinds, k)) {
          return o;
        }
      }
      // 3) 아무거나 (무작위 영상패보다 나음)
      return picks[0] ?? null;
    },
  },
});
