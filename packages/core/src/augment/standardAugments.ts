/**
 * standardAugments — 표준 증강 4종. 등록 API가 엔진 수정 없이 작동함을 실증한다.
 *
 * 각 증강은 서로 다른 등록 지점을 쓴다:
 *   Rule Modifier(3) / 새 프롬프트 액션(1).
 *
 * 2026-07-22 (48차) 도파민 리디자인: 순수 패시브 점수 보너스였던 3종을 삭제했다 —
 * 가벼운 선언(cheap_riichi, Rule Modifier)·쯔모의 기쁨(tsumo_bonus, Effect Reaction)·
 * 설욕(vengeance, Effect Interceptor). 삭제된 두 등록 지점(Reaction·Interceptor)은
 * 콘텐츠 팩이 이미 대량으로 실증하고 있어 여기서 표본을 유지할 이유가 없다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §5 · 판정 근거: docs/16_AUGMENT_REDESIGN.md §1
 */

import type { GameState } from "../engine/state/GameState.js";
import type { PlayerId } from "../engine/zones/Zone.js";
import { discardsZone, handZone, moveTiles } from "../engine/zones/Zone.js";
import type { TileId, TileKind } from "../mahjong/tiles/Tile.js";
import { kindKey } from "../mahjong/tiles/Tile.js";
import type { ActionDef } from "../engine/actions/ActionRegistry.js";
import { ROUND_SETTLED } from "../mahjong/flow/flowEvents.js";
import type {
  AugPointNote,
  RoundSettledPayload,
  WinInfo,
} from "../mahjong/flow/flowEvents.js";
import {
  isFuriten,
  openMeldCountOf,
  playerAtSeat,
  scoringOptionsOf,
} from "../mahjong/flow/helpers.js";
import { calculateScore } from "../mahjong/scoring/score.js";
import { defineAugment } from "./Augment.js";
import { SETTLE_LAYER, SETTLE_STAGE, settlePriority, settleSeatAxis } from "./settleStages.js";
import type { AugmentContext, AugmentDef } from "./Augment.js";
import type { PlayerView } from "../information/PlayerView.js";

/**
 * 보유자가 화료한 국의 정산에 **보너스 판수**를 얹는다
 * (content util의 addWinHanBonus와 같은 구조 — 그쪽이 규약의 단일 진실이다).
 *
 * 지급 자체는 "+N판으로 다시 계산한 점수 − 실제 점수"만큼의 **뱅크 점수**라,
 * 판이 올랐어도 상대가 더 내지는 않는다 — 무페널티 원칙.
 * 승자의 실제 부수·역만·오야 여부를 그대로 쓰므로 만관/하네만 상한도 정확히 반영된다.
 *
 * 52차(2026-07-22): "조용한 규칙 완화"(docs/16 §1b E)로 판정된 표준 증강 3종에 쓴다.
 * 발동은 이미 눈에 보이는데 보상이 안 보이던 것들이라, 확정 보상으로 마감을 붙였다.
 * (§0 노잼 조항의 예외가 아니라 "보이는 발동 + 확정 보상"의 조합이다.)
 *
 * 2026-07-26: 확정 보상 단위를 점수 → **판수**로 통일했다
 * (구 +2000 → 2판 · +4500 → 3판 · +6000 → 4판. docs/17 §3.4).
 */
function addWinHanBonus(
  ctx: AugmentContext,
  han: (state: GameState, info: WinInfo) => number,
): void {
  /*
   * ⚠ 정산 인터셉터는 **반드시** SETTLE_LAYER + 단계(priority)로 등록한다.
   * 그냥 `ctx.interceptor(ROUND_SETTLED, …)`를 부르면 실행 순서가 증강의 tier와
   * 드래프트 픽 순서에 끌려가, deltas를 이어서 고쳐 쓰는 다른 정산 증강들과의 결과가
   * 픽 순서로 갈린다(settleStages.ts가 없애려던 바로 그 문제, 2026-07-29 감사).
   * 이 보너스는 뱅크가 발행하는 가산이므로 `BankTopUp` 단계다 — 배수(Multiply) 뒤.
   * (content/util.ts의 settleInterceptor와 동일한 규약. 코어는 그 헬퍼를 쓸 수 없어
   *  같은 layer·priority를 직접 지정한다.)
   *
   * ⚠ priority는 반드시 `settlePriority`로 만든다. 예전에는 단계 번호만 그대로 썼는데,
   * 콘텐츠 쪽은 `단계 + 자리`라 이 인터셉터가 **모든 좌석의 BankTopUp보다 항상 먼저**
   * 돌았고(자기 자신보다도), 개문선언·무형화료를 둘이 나눠 가지면 서로 완전히 동률이라
   * 픽 순서로 갈렸다.
   */
  /*
   * **같은 함수를 규칙으로도 한 번 더 내놓는다** (`score.settleHanBonus`).
   *
   * 지급 자체는 아래 인터셉터가 하고, 이 모디파이어는 **질의 전용**이다 — 관전 패널이
   * 「이 손으로 화료하면 실제로 얼마를 받나」를 물을 때 인터셉터를 부작용 없이 태울
   * 방법이 없어서다. 예전에는 그래서 무형화료 좌석의 형식텐파이가 관전에 「0판 500점」,
   * 실제 정산에는 2,000점으로 나갔다 (2026-08-23 검수 실측, 4배).
   *
   * ⚠ 두 등록이 **같은 `han` 함수**를 쓰는 것이 요점이다. 각자 계산식을 들면 그 순간
   * 조용히 갈라지고, 이 파일이 없애려던 상태가 그대로 돌아온다.
   */
  ctx.engine.rules.addModifier<number>("score.settleHanBonus", {
    source: ctx.instanceId,
    layer: ctx.layer,
    apply: (cur, rctx) => {
      if (rctx.playerId !== ctx.holder) return cur;
      const state = rctx.state as GameState | undefined;
      const info = rctx.winInfo as WinInfo | undefined;
      if (state === undefined || info === undefined) return cur;
      return cur + Math.max(0, Math.round(han(state, info)));
    },
  });

  // ⚠ player.seat이 아니라 배열 인덱스다 — 자리 바꿈 뒤 재구성이 순서를 바꾸지 않게.
  //   (settleSeatAxis 주석 참고)
  const seat = settleSeatAxis(ctx.engine.state, ctx.holder);
  ctx.interceptor(
    ROUND_SETTLED,
    (event, ic) => {
    const p = event.payload as RoundSettledPayload;
    if (p.outcome !== "win") return event;
    const info = (p.winInfos ?? []).find((w) => w.winner === ctx.holder);
    if (info === undefined) return event;
    const extraHan = Math.max(0, Math.round(han(ic.state, info)));
    if (extraHan === 0) return event;
    /*
     * 오야 취급 증강(만년 오야·찬탈자)을 함께 본다.
     *
     * 예전에는 좌석만 비교했다. 그래서 오야 배율로 채점된 화료에 이 보너스를 얹으면서
     * 다시 자(子) 배율로 계산해, `boosted`가 실제 `info.points`보다 작아지고
     * `Math.max(0, …)`가 **보너스를 통째로 0으로 만들었다** — 철벽 +3판, 개문선언·
     * 무형화료의 2판 취급이 그 조합에서 한 푼도 안 붙었다.
     * (채점 본체는 standardActions가 `win.treatAsDealer`를 함께 보므로, 여기만 어긋나 있었다.)
     */
    const isDealer =
      playerAtSeat(ic.state, ic.state.round.dealerSeat).id === ctx.holder ||
      ic.rules.resolve<boolean>("win.treatAsDealer", {
        playerId: ctx.holder,
        state: ic.state,
      });
    const boosted = calculateScore({
      han: info.han + extraHan,
      fu: info.fu,
      yakumanCount: info.yakumanCount,
      isDealer,
      winType: info.winType,
    }).total;
    const bonus = Math.max(0, boosted - info.points);
    if (bonus === 0) return event;
    /*
     * 결과 화면에 "이 증강이 +N판을 얹었다" 한 줄을 남긴다 (content/util.ts withAugPoint와
     * 같은 규약). 예전에는 deltas만 고치고 지나가, 무형화료로 역 없이 화료하면 화면에는
     * "0판 30부 500점"만 뜨고 실제로 받은 2판어치는 어디에도 안 적혔다 —
     * 사용자가 "2판이 적용 안 된다"고 읽은 것이 이 자리다(2026-08-17).
     */
    const prev = p.augPoints ?? [];
    const at = prev.findIndex((n) => n.player === ctx.holder && n.augId === ctx.augmentId);
    const note: AugPointNote = {
      player: ctx.holder,
      augId: ctx.augmentId,
      points: (at >= 0 ? (prev[at]?.points ?? 0) : 0) + bonus,
      han: (at >= 0 ? (prev[at]?.han ?? 0) : 0) + extraHan,
    };
    return {
      type: event.type,
      payload: {
        ...p,
        deltas: { ...p.deltas, [ctx.holder]: (p.deltas[ctx.holder] ?? 0) + bonus },
        augPoints: at < 0 ? [...prev, note] : prev.map((n, i) => (i === at ? note : n)),
      },
    };
    },
    {
      layer: SETTLE_LAYER,
      priority: settlePriority(SETTLE_STAGE.BankTopUp, seat, ctx.augmentId),
    },
  );
}

/** 표준 리치의 판수 — 개문선언은 이것과의 차이만 얹는다 */
const STANDARD_RIICHI_HAN = 1;
/** 개문선언: 후로 리치를 몇 판으로 취급하는가 (2026-07-26 사용자 확정) */
const OPEN_RIICHI_HAN = 2;
/** 무형화료: 역 0개 화료를 몇 판으로 취급하는가 */
const YAKULESS_HAN = 2;

export const ironWall = defineAugment({
  id: "iron_wall",
  tier: "gold",
  category: "shape",
  complexity: 2,
  name: "철벽",
  description:
    "(상시) 후리텐이어도 론할 수 있다. 실제로 후리텐 상태에서 론하면 +3판을 얻는다.",
  detail:
    "자신이 이미 버린 패로도 론할 수 있다. 실제로 후리텐 상태에서 론으로 화료하면 +3판을 얻는다. 후리텐이 아닌 보통의 론에는 추가 판이 없다.",
  install(ctx) {
    ctx.setHolderRule("win.furiten.enabled", false);
    // 후리텐 상황 자체가 드물어 "대부분의 국에 아무 일도 안 일어난다"는 판정(docs/16 §1b D).
    // 발동 빈도는 규칙상 못 올리므로, 실제로 후리텐 론이 터진 그 순간에 보상을 붙여
    // "내가 버린 패로 잡았다"는 사건을 정산에서도 확실히 마감한다.
    addWinHanBonus(ctx, (state, info) => {
      if (info.winType !== "ron") return 0;
      // 정산 전 상태이므로 버림 이력·대기가 그대로 남아 있다.
      // isFuriten은 규칙과 무관하게 이력만 보므로, 철벽으로 뚫은 경우를 정확히 집어낸다.
      const opts = scoringOptionsOf(state, ctx.engine.rules, ctx.holder);
      return isFuriten(state, ctx.holder, opts, ctx.engine.rules) ? 3 : 0;
    });
  },
});

export const openRiichi = defineAugment({
  id: "open_riichi",
  tier: "prism",
  category: "riichi",
  complexity: 2,
  name: "개문선언",
  description:
    "(상시) 후로한 손으로도 리치를 선언할 수 있다. 후로한 채 리치로 화료하면 그 리치를 2판으로 취급한다. 일발·뒷도라는 붙지만, 손이 멘젠이 되는 것은 아니다.",
  detail:
    "치·퐁·깡을 한 뒤에도 리치를 선언할 수 있다. 후로한 상태에서 선언한 리치로 화료하면 그 리치를 2판으로 취급한다. 원래 가능한 멘젠 리치에는 추가 판이 없다.\n\n일발·뒷도라·더블리치는 후로한 손에서도 붙는다. 다만 손이 멘젠이 되는 것은 아니므로, 멘젠쯔모·핑후·치또이처럼 멘젠이어야 성립하는 역과 멘젠론 부수는 붙지 않는다.",
  install(ctx) {
    ctx.setHolderRule("riichi.requiresClosed", false);
    // 조용한 규칙 완화 — 울어 놓고 리치봉을 내미는 장면은 보이는데 보상이 없었다.
    // 표기는 "리치를 2판으로 취급" — 표준 리치 1판과의 차이(+1판)만 얹는다.
    // (후로 손에서도 리치 역 1판이 붙는다는 전제 — standardYaku.ts의 openHan 주석 참고.
    //  예전에는 그 1판이 0이라 "2판 취급"이 실제로는 1판이었고, 다른 역이 없으면
    //  화료 자체가 '역 없음'으로 거부됐다.)
    addWinHanBonus(ctx, (state, info) => {
      const rs = state.round.byPlayer[ctx.holder];
      if (rs?.riichi == null) return 0;
      // 멘젠 리치는 원래 되는 것이므로, 이 증강이 실제로 열어 준 경우(후로 상태)만 준다.
      return openMeldCountOf(state, ctx.holder) > 0 ? OPEN_RIICHI_HAN - STANDARD_RIICHI_HAN : 0;
    });
  },
});

export const yakulessWin = defineAugment({
  id: "yakuless_win",
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "무형화료",
  description:
    "(상시) 머리 1개와 몸통 4개가 완성되면 역이 없어도 화료할 수 있다. 역 없이 화료하면 그 화료를 2판으로 취급한다.",
  detail:
    "머리 1개와 몸통 4개(4멘쯔)로 손이 완성되면 역이 하나도 없어도 화료할 수 있다. 역 없이 화료하면 그 화료는 2판으로 취급한다. 역이 있는 손에는 추가 판이 없다.",
  install(ctx) {
    ctx.setHolderRule("win.requiresYaku", false);
    // 역 없는 손은 싸구려라 폭발력이 중간급이라는 판정(docs/16 §1b E).
    // 이 증강이 실제로 성립시킨 화료(실역 0개)에만 확정 보상을 붙인다.
    // 판정은 `yakuless` 플래그로 한다 — 역 목록이 비었는지로는 이제 알 수 없다.
    // 역 없는 손도 도라·적도라·보조역으로 판을 세므로 목록에 줄이 설 수 있다.
    addWinHanBonus(ctx, (_state, info) => (info.yakuless === true ? YAKULESS_HAN : 0));
  },
});

// ─────────────────────────── 새 프롬프트 액션 증강 ───────────────────────────

/** 회수가 만들어내는 이벤트 (매국 1회, 여러 보유자가 있어도 한 번만 등록) */
const RECALL_PERFORMED = "RecallPerformed";
/** 국을 식별하는 키 — roundKey가 들어가 국이 바뀌면 사용 플래그가 자동 초기화된다 */
const recallUsedKey = (state: GameState, player: PlayerId): string => {
  const r = state.round;
  return `recall_used:${r.prevalentWind}-${r.roundNumber}-${r.honba}:${player}`;
};

interface RecallPayload {
  player: PlayerId;
  drawnTileId: TileId;
  recallTileId: TileId;
}

const recallAction: ActionDef<{ recallTileId: TileId }> = {
  type: "recall",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("discard_recall")) return "no discard_recall augment";
    if (state.augmentData[recallUsedKey(state, req.player)] === true) return "recall already used this round";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (state.round.turnSeat !== player.seat) return "not your turn";
    // 리치 중에는 손이 잠긴다 — 손패를 바꾸는 증강의 공통 규약(content/util의
    // riichiBlocksSwap과 같은 판단). 가드가 없어 리치를 걸어 둔 채로 손을 갈 수 있었다.
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: hand is frozen";
    if (state.round.lastDrawnTile === null) return "no drawn tile to trade";
    const discards = state.zones[discardsZone(req.player)]?.tileIds ?? [];
    if (discards.length === 0) return "no discards to recall";
    if (!discards.includes(req.payload.recallTileId)) return "tile not in your discards";
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: RECALL_PERFORMED,
      payload: {
        player: req.player,
        drawnTileId: state.round.lastDrawnTile as TileId,
        recallTileId: req.payload.recallTileId,
      } satisfies RecallPayload,
    },
  ],
};


/**
 * 뷰에서 이 패가 손패에 "쓸모 있는가" — 같은 패가 또 있거나(짝) 슌쯔 이웃(±1·±2)이 있다.
 * 회수(discard_recall) 봇 정책이 쯔모패와 바닥패의 가치를 비교하는 데 쓴다.
 */
function usefulInHand(handKinds: TileKind[], k: TileKind): boolean {
  return handKinds.some(
    (x) =>
      (x.suit === k.suit && x.rank === k.rank) ||
      (x.suit === k.suit &&
        (k.suit === "man" || k.suit === "pin" || k.suit === "sou") &&
        Math.abs(x.rank - k.rank) <= 2),
  );
}

/** 뷰 기준 홀더의 감춰진 손패 kind 목록 (쯔모패는 exclude로 뺄 수 있다) */
function viewHandKinds(
  view: PlayerView,
  holder: PlayerId,
  exclude?: TileId | null,
): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[handZone(holder)]?.tileIds ?? []) {
    if (exclude !== undefined && exclude !== null && id === exclude) continue;
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/**
 * 회수 (버림패 회수) — 차터의 대표 예시.
 * 새 플레이어 액션을 "엔진 수정 없이" 프롬프트에 노출하는 것을 실증한다.
 * 쯔모패를 버림패로 내보내고 자신의 과거 버림패 하나를 골라 손으로 되가져온다 (매 국 1회).
 * 손패 수는 보존되며, 되가져온 뒤 정상적으로 버림을 이어간다.
 */
export const discardRecall = defineAugment({
  id: "discard_recall",
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "회수",
  description:
    "(매 국 1회) 자기 순에 쯔모한 패를 내 바닥에 버리고, 자신의 과거 버림패 중 하나를 골라 손으로 가져온다. 리치 중에는 사용할 수 없다.",
  detail:
    "자기 순에 방금 쯔모한 패를 내 바닥에 버리고, 그 대신 내가 예전에 버린 패 하나를 손으로 가져온다. 손패 수는 변하지 않는다.\n\n리치 중에는 사용할 수 없다. 버린 쯔모패는 내 버림패로 남으므로 그 종류로는 후리텐이 되어 론할 수 없다. 가져온 패도 한 번 버린 패이므로 후리텐은 풀리지 않는다.",
  /**
   * 봇: **쯔모패가 쓸모없고**(짝도 이웃도 없음) 내 바닥에 손을 진전시키는 패가 있을 때만
   * 회수한다. 회수는 매 국 1회뿐이라 아무 때나 쓰면 정작 필요한 순간에 없다.
   */
  bot: {
    choose({ options, view, holder }) {
      const mine = options.filter((o) => o.type === "recall");
      if (mine.length === 0) return null;
      const drawn = view.round.myDrawnTile;
      if (drawn === null) return null;
      const drawnKind = view.tiles[drawn]?.kind;
      if (drawnKind === undefined) return null;
      const handKinds = viewHandKinds(view, holder, drawn);
      if (usefulInHand(handKinds, drawnKind)) return null; // 쯔모패가 이미 쓸모 있다
      for (const o of mine) {
        const tileId = (o.payload as { recallTileId?: TileId }).recallTileId;
        const k = tileId !== undefined ? view.tiles[tileId]?.kind : undefined;
        if (k !== undefined && usefulInHand(handKinds, k)) return o;
      }
      return null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(RECALL_PERFORMED)) {
      engine.reducers.register(RECALL_PERFORMED, (state, event) => {
        const p = event.payload as RecallPayload;
        let zones = moveTiles(
          state.zones,
          handZone(p.player),
          discardsZone(p.player),
          [p.drawnTileId],
        );
        zones = moveTiles(zones, discardsZone(p.player), handZone(p.player), [
          p.recallTileId,
        ]);
        /*
         * **내 바닥으로 내보낸 패는 후리텐 이력에 남는다.**
         *
         * 예전에는 존(바닥)에만 넣고 `discardedKinds`를 건드리지 않았다. 후리텐은
         * 이 이력으로 판정되므로, 화면상 내 바닥에 뻔히 놓인 그 패로 **내가 론했다**
         * (qa-lab text 확정 3). 설명이 "내 바닥으로 내보내고"라고 말하는 이상 바닥과
         * 판정 근거가 갈라져서는 안 된다.
         *
         * 되가져온 패의 이력은 **지우지 않는다** — 한 번 버린 패의 후리텐은 그 패가
         * 바닥을 떠나도 유지된다는 것이 표준 룰이고(후로로 사라진 버림패와 같다),
         * 이 필드의 계약이기도 하다(GameState.discardedKinds 주석).
         */
        const drawnKind = state.tiles[p.drawnTileId]?.kind;
        const rs = state.round.byPlayer[p.player];
        const byPlayer =
          drawnKind === undefined || rs === undefined
            ? state.round.byPlayer
            : {
                ...state.round.byPlayer,
                [p.player]: {
                  ...rs,
                  discardedKinds: [...rs.discardedKinds, kindKey(drawnKind)],
                  /*
                   * `ownDiscards`("실제로 **내가** 버린 패")에도 남긴다 — 누명(frame_up)이
                   * 남의 바닥에 심은 패와 내 것을 가르는 단일 진실이라(2026-08-23 QA
                   * synergy3 handedit 확정 2), 여기만 빠지면 이 경로로 내보낸 한 장이
                   * 바닥의 족보·자패 회수 판정에서 통째로 빠진다.
                   */
                  ownDiscards: [
                    ...rs.ownDiscards,
                    { tileId: p.drawnTileId, kind: kindKey(drawnKind) },
                  ],
                },
              };
        return {
          ...state,
          zones,
          round: {
            ...state.round,
            byPlayer,
            lastDrawnTile: p.recallTileId,
            // 바닥에서 되가져온 패는 **영상패가 아니다.** 이 플래그를 끄지 않아,
            // 깡 직후에 회수하면 되가져온 패로도 영상개화(+1판)가 붙었다.
            lastDrawRinshan: false,
          },
          augmentData: { ...state.augmentData, [recallUsedKey(state, p.player)]: true },
        };
      });
    }
    if (!engine.actions.has("recall")) {
      engine.actions.register(recallAction);
    }

    // 보유자 턴에 자기 버림패마다 회수 후보를 프롬프트에 노출
    ctx.holderTurnOptions((state) => {
      const discards = state.zones[discardsZone(holder)]?.tileIds ?? [];
      return discards.map((recallTileId) => ({
        type: "recall",
        payload: { recallTileId },
      }));
    });
  },
});

export const standardAugments: AugmentDef[] = [
  ironWall,
  openRiichi,
  yakulessWin,
  discardRecall,
];
