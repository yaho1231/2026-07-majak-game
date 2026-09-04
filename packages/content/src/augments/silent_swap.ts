/**
 * 정적의 손 (silent_swap, prism) — "아무도 리치를 걸지 않은 조용한 국에서만 열리는 창".
 *
 * 그 국에 리치가 단 하나도 없을 때, 자기 턴에 **상대 세 명의 바닥(버림패 더미)**에서
 * 아무 패나 1장을 골라 손으로 가져온다. 국당 1회.
 *
 * 2026-08-27 (사용자 지시, 밸런스 웨이브): **발동 국 화료 +2판을 삭제**하고, 대신
 * **후리텐이라도 집어 온 그 패로는 쯔모 화료할 수 있게** 풀었다. 판수 보너스는
 * "보이지 않는 정산 보정"이라 이 카드의 재미가 아니었고, 후리텐 봉쇄는 카드의 유일한
 * 발동을 자주 무의미하게 만들었다. 이제 순수하게 "남의 바닥에서 한 장 가져오는" 카드다.
 *
 * 설계 결정:
 * - **이 증강만은 무페널티 원칙의 명시적 예외다**(사용자 지정). 리스크는 방총이다 —
 *   가져오기만 하고 버림은 소비하지 않으므로 같은 턴의 프롬프트가 곧바로 다시 열리고,
 *   거기서 **표준 discard**로 한 장을 버리게 된다. 그 버림에 상대의 론이 붙는 것이
 *   이 증강의 도박성이다 (커스텀 액션이 직접 화료·정산을 만들지 않는다 — 함정 6).
 * - **손패 장수는 보존한다.** 이번 턴의 쯔모패는 패산 맨 밑으로 되돌리고 무덤에서
 *   꺼낸 패가 새 쯔모패가 된다(날치기 pond_snatch·무덤 도굴 grave_rob과 같은 계열).
 *   손패가 영구히 한 장 늘면 13장 전제의 화료 분해가 통째로 깨져 화료 자체가
 *   불가능해지므로, 엔진 불변식을 지키는 이 형태로 구현했다.
 * - **대상은 내 바닥을 제외한 상대 세 명의 바닥.**(2026-08-20 사용자 설계 변경) 예전에는
 *   자기 바닥도 후보라, "방금 버린 내 오름패를 도로 집어 후리텐인 채로 화료"가 이 증강의
 *   가장 쉬운 사용법이 되어 있었다. 후보가 수십 장이 되므로 클라이언트는 전용 모달로
 *   바닥을 통째로 펼쳐 보여준다 — payload는 `{ tileId }` 하나로 유지한다.
 * - **후리텐 봉쇄는 이 카드에만 없다** (2026-08-27). 날치기(pond_snatch)·무덤 도굴
 *   (grave_rob)은 집은 패가 지금의 쯔모패인 동안 `win.tsumoFuriten`을 켜서 후리텐이면
 *   쯔모 화료를 막는다 — **그 둘의 동작은 그대로다.** 이 카드는 그 모디파이어를 아예
 *   등록하지 않아 표준 쯔모와 같은 판정을 받는다(후리텐은 론만 막는다).
 *   악용 경로는 규칙이 아니라 **후보 단계**에서 이미 막혀 있다: 자기 바닥은 대상이
 *   아니고(`cannot take from your own pond`), 누명(frame_up)으로 남의 바닥에 심은
 *   내 버림패도 `discardedByPlayer`가 걸러낸다. 즉 "방금 내가 버린 오름패를 도로
 *   집어 후리텐 화료"는 여전히 불가능하다.
 * - 집어 온 패의 표식(`takenKey`)은 **남긴다** — 무르기(take_back)가 `riverTaken.ts`로
 *   이 값을 읽어 "바닥에서 온 쯔모패는 패산에 묻을 수 없다"를 지킨다.
 * - 원주인의 바닥 기록(discardedKinds)은 **건드리지 않는다** — 바닥에서 패가 빠져도
 *   후리텐 판정은 이 이력을 쓰므로 그대로 둬야 안전하다.
 * - 리치가 하나라도 걸린 국에서는 발동할 수 없다. "정적"이 이 증강의 조건이다.
 */

import {
  WALL,
  defineAugment,
  discardedByPlayer,
  discardsZone,
  handIdsOf,
  handZone,
  kindKey,
  kindOf,
  moveTiles,
  playerAtSeat,
  visibleTileIdsIn,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import {
  flagOf,
  publishUsesLeft,
  replaceDrawnTile,
  riichiHidden,
  roundViewKey,
} from "../util.js";
import { handKindsOf, usefulIn } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "silent_swap";
const ACTION = "silent_take";
const EVENT = "SilentSwapTaken";
/*
 * ⚠ 삭제됨 (2026-08-27, 사용자 지시): `WIN_BONUS_HAN = 2` — 발동 국 화료 +2판.
 * 구 +4500점 → 3판 → 2판(2026-07-26)을 거쳐 0으로. 되살리지 말 것.
 */

/** 국당 1회 — roundKey가 섞여 국이 바뀌면 자동 만료 */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

/**
 * 이 국에서 **집어 온 패**의 id. 지금의 `lastDrawnTile`과 같을 때만 "손에 든 쯔모패가
 * 남의 바닥에서 온 패"라는 뜻이다 — 다음 쯔모가 오면 자연히 어긋난다(날치기와 같은 규약).
 */
const takenKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "taken", state, h);

/**
 * 이번 국에 리치를 건 사람이 하나라도 있는가.
 *
 * ⚠ **숨은 리치(스텔스 리치)는 세지 않는다.** 이 증강은 "누가 리치를 걸었을 때"만
 * 버튼이 열리므로, 스텔스 리치로 열어 버리면 버튼이 켜지는 것만으로 "누군가 리치다"가
 * 새어 나간다 — 아무도 모르는 것이 그 증강의 전부다(2026-08-02 감사).
 */
function anyRiichi(
  rules: Parameters<typeof riichiHidden>[0],
  state: GameState,
): boolean {
  return state.players.some(
    (p) =>
      state.round.byPlayer[p.id]?.riichi != null && !riichiHidden(rules, state, p.id),
  );
}

/** 그 패가 놓여 있는 바닥의 주인 (어느 바닥에도 없으면 null) */
function pondOwnerOf(state: GameState, tileId: TileId): PlayerId | null {
  for (const p of state.players) {
    if ((state.zones[discardsZone(p.id)]?.tileIds ?? []).includes(tileId)) {
      return p.id;
    }
  }
  return null;
}

interface SilentSwapPayload {
  holder: PlayerId;
  /** 패산 맨 밑으로 되돌릴 쯔모패 */
  drawnId: TileId;
  /** 바닥에서 손으로 가져오는 패 */
  takenId: TileId;
  /** 그 바닥의 주인 */
  fromPlayer: PlayerId;
}

const silentTakeAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no silent_swap augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    if (anyRiichi(rules, state)) return "riichi declared: the room is not silent";
    const drawn = state.round.lastDrawnTile;
    if (drawn === null) return "no drawn tile to trade";
    if (!handIdsOf(state, req.player).includes(drawn)) return "drawn tile not in hand";
    const owner = pondOwnerOf(state, req.payload.tileId);
    if (owner === null) return "tile is not in any pond";
    // 자기 바닥은 대상이 아니다 — 방금 버린 오름패를 도로 집는 길을 막는다
    if (owner === req.player) return "cannot take from your own pond";
    /*
     * 바닥의 **물리적 주인**만 보면 누명(frame_up) 한 장으로 이 가드가 통째로 뚫린다.
     * 내가 버릴 오름패를 누명으로 남의 바닥에 심으면 내 후리텐도 안 걸리고
     * 그 패를 도로 집어 화료까지 됐다 (QA synergy3 handedit 확정 2, 2026-08-23).
     * 판정 근거를 "어느 바닥에 놓였나"에서 **"누가 실제로 버렸나"**로 옮긴다.
     */
    if (discardedByPlayer(state, req.player, req.payload.tileId)) {
      return "cannot take a tile you discarded";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: EVENT,
      payload: {
        holder: req.player,
        drawnId: state.round.lastDrawnTile as TileId,
        takenId: req.payload.tileId,
        fromPlayer: pondOwnerOf(state, req.payload.tileId) as PlayerId,
      } satisfies SilentSwapPayload,
    },
  ],
};

export const silentSwap: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 2,
  name: "정적의 손",
  description:
    "(매 국 1회) 아무도 리치를 걸지 않은 국에 한해, 쯔모패 대신 상대 바닥에서 1장을 가져온다. 후리텐이어도 가져온 패로 쯔모 화료할 수 있다.",
  detail:
    "내 바닥은 대상이 아니고, 원래 주인의 후리텐은 그대로 남는다. 가져온 패는 그 순의 쯔모패가 되어 쯔모 화료로 값한다.\n\n후리텐이 이 화료를 막지 않는 것은 이 카드뿐이다 — 날치기나 무덤 도굴로 주워 온 패에는 여전히 후리텐이 걸린다. 다만 내가 버린 패는 남의 바닥에 놓여 있더라도 가져올 수 없다.",
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
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(silentTakeAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as SilentSwapPayload;
        // 쯔모패는 패산 맨 밑으로 → 바닥의 패를 손으로 (손패 장수 보존).
        // 바닥의 패 1장이 패산으로 옮겨 간 셈이라 패산이 1장 늘어 국이 1쯔모 길어진다
        // (날치기 pond_snatch와 동일한 성질 — 손패 13장 전제를 지키기 위한 대가다).
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, [p.drawnId]);
        zones = moveTiles(zones, discardsZone(p.fromPlayer), handZone(p.holder), [
          p.takenId,
        ]);
        return {
          ...state,
          zones,
          // 가져온 패가 새 쯔모패 — 이어지는 버림 흐름 유지.
          // 영상 쯔모 직후에 집었더라도 바닥 패는 영상패가 아니므로 플래그도 내린다.
          round: {
            ...replaceDrawnTile(state.round, p.takenId),
            // 바닥에서 걷어 간 패가 마지막 버림패였다면 그 표식을 비운다 —
            // 후로가 패를 가져갈 때 CALL_MADE가 하는 것과 같은 처리다
            // (2026-08-20 QA hand 확정 7). 비우지 않으면 `round.lastDiscard`가
            // 이미 바닥에 없는 패를 가리켜, 세 좌석 뷰에 어느 가시 존에도 없는 패의
            // 정체가 실리고 `lastDiscardFrom` 낡은 표식도 걸러지지 않는다.
            lastDiscard:
              state.round.lastDiscard?.tileId === p.takenId
                ? null
                : state.round.lastDiscard,
          },
          augmentData: {
            ...state.augmentData,
            // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고)
            ...handAlteredMark(state, p.holder),
            [usedKey(state, p.holder)]: true,
            // 이 패로 화료하면 후리텐 판정을 받는다 (아래 win.tsumoFuriten 모디파이어)
            [takenKey(state, p.holder)]: p.takenId,
            // 전원 공개 — 누구의 바닥에서 무엇이 걸어 나왔는지가 이 증강의 구경거리다.
            // ⚠ 좌석 id를 `from`으로 실으면 안 된다 — 사건 컷인(App.tsx augEventTiles)에서
            // `{kind, from}`의 `from`은 "바뀌기 전 패"라는 뜻이라, 좌석 id "p1"이 패 키로
            // 읽혀 컷인에 `p1`이라 적힌 패가 한 장 더 떴다(2026-08-13 사용자 보고).
            [roundViewKey("*", `${ID}:${p.holder}`)]: {
              fromPlayer: p.fromPlayer,
              kind: kindKey(kindOf(state, p.takenId)),
            },
          },
        };
      });
    }

    /*
     * 보유자 턴 후보: **상대 세 명**의 바닥 중 보유자에게 실제로 보이는 패만.
     *
     * 안개 계열(박무·숨은 강)이 가려 놓은 바닥까지 후보로 내면, 보유자는 뒷면인
     * 패를 집게 되어 "무엇을 가져오는지 보고 고른다"는 이 능력이 제비뽑기가 된다
     * (클라이언트는 뷰에 없는 tileId를 빈 패로 그린다). 보이지 않는 바닥에는
     * 손을 넣지 않는다 — 정보와 규칙을 같은 선에 맞춘다(2026-08-02 감사).
     */
    ctx.holderTurnOptions((state) => {
      if (flagOf(state, usedKey(state, holder))) return [];
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      if (anyRiichi(engine.rules, state)) return [];
      const out: { type: string; payload: { tileId: TileId } }[] = [];
      for (const p of state.players) {
        // 내 바닥은 제외 — 내가 버린 오름패를 도로 집는 것은 이 증강의 용도가 아니다
        if (p.id === holder) continue;
        for (const tileId of visibleTileIdsIn(
          state,
          engine.rules,
          holder,
          discardsZone(p.id),
        )) {
          out.push({ type: ACTION, payload: { tileId } });
        }
      }
      return out;
    });

    /*
     * ⚠ **`win.tsumoFuriten` 모디파이어를 일부러 등록하지 않는다** (2026-08-27 사용자 지시).
     *
     * 날치기(pond_snatch)·무덤 도굴(grave_rob)은 각자 자기 파일에서 이 모디파이어를
     * 등록해 "집은 패로는 후리텐 쯔모 불가"를 지킨다 — 규칙 자체는 코어에 그대로 있고,
     * 그 둘의 동작도 그대로다. 이 카드만 그 등록을 빼서 후리텐이어도 집어 온 패로
     * 쯔모 화료할 수 있다. 규칙을 전역으로 끄는 것이 아니라 **이 배선만 없는** 형태다.
     *
     * 판수 보너스(addWinHanBonus)도 같은 날 함께 삭제했다 — 파일 상단 주석 참고.
     */
  },
  /**
   * 봇: 상대 세 바닥을 통틀어 **내 손을 진전시키는 패**(짝을 만들거나 슌쯔 이웃)가 있으면
   * 가져온다 — 날치기(pond_snatch)와 같은 판단이다. 텐파이면 대기를 흐트러뜨리지
   * 않도록 손대지 않는다.
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
      if (tenpai) return null;
      const kinds = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const tileId = (o.payload as { tileId?: number }).tileId;
        const k = tileId !== undefined ? view.tiles[tileId]?.kind : undefined;
        if (k === undefined) continue;
        if (usefulIn(kinds, k)) return o;
      }
      return null;
    },
  }),
});
