/**
 * 무르기 (take_back, silver).
 * **3턴에 1회**, 쯔모한 패를 전원에게 공개하고 패산 맨 밑에 되돌린 뒤 새로 1장을 뽑는다.
 * 리치 중에는 사용할 수 없다. 패산 총량은 변하지 않는다(정보 유출이 대가).
 *
 * ⚠ 밸런스(2026-07-26): **매 턴 1회 → 3턴에 1회**. 매 턴 리롤은 실질 쯔모 2회라
 * 셰텐 진행 속도가 1.5배가 됐다(docs/20 §7c).
 *
 * 구현: 커스텀 이벤트 TakeBackPerformed + 리듀서 — 쯔모패를 WALL 맨 끝(다음에 뽑힐
 * 순서상 맨 밑)으로 옮기고 WALL 맨 앞의 새 패를 손으로 가져와 lastDrawnTile을 갱신.
 * 되돌린 패 종류는 공개 뷰로 잠깐 노출.
 *
 * ⚠ 리듀서는 `handAlteredMark`도 함께 남긴다 — 손패 1장을 **다른 실물**로 갈아 끼우는
 * 증강의 공통 규약이다(handAltered.ts). 없으면 오야가 첫 순에 쯔모패를 무르고 새로 뽑은
 * 패로 완성해도 코어 게이트가 "배패가 이미 완성돼 있었다"로 읽어 **천화 48,000점**이
 * 나간다(정상 12,000 — 2026-08-22 QA aug-4 확정 2). 쿨다운이 3순이라 첫 순에는 항상
 * 열려 있어 발동 문턱이 가장 낮은 경로였다.
 *
 * ⚠ 되돌릴 수 있는 것은 **패산에서 온 쯔모패**뿐이다(`riverTaken.ts`). 강 회수 3종이
 * 바닥에서 집어 온 패를 쯔모패 자리에 세우는데, 그것까지 무를 수 있어서 "상대 바닥에서
 * 아무 패나 한 장 지워 패산에 묻는" 짓이 성립했다(QA synergy3 handedit 확정 6, 2026-08-23).
 *
 * 쿨다운 게이팅: 보유자의 턴은 정확히 버림 한 번으로 끝나므로 **그 국에서 내가 버린 수**가
 * 곧 턴 번호다. 사용 시점의 버림 수를 국 스코프로 기록해 두고, 그 뒤로 3턴이 지나야
 * (버림 수가 +3 이상) 다시 열린다. 같은 턴 재사용은 버림 수가 그대로라 자동으로 막힌다.
 * 국이 바뀌면 키가 사라져 첫 턴부터 다시 쓸 수 있다.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  kindKey,
  kindOf,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import { handKindsExcept, usefulIn } from "./botHelpers.js";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import {
  cooldownTurnsViewKey,
  replaceDrawnTile,
  roundViewKey,
} from "../util.js";
import { plan } from "./botPlan.js";
import { handAlteredMark } from "./handAltered.js";
import { isRiverTakenTile } from "./riverTaken.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "take_back";
const ACTION = "take_back";
const EVENT = "TakeBackPerformed";
/** 쿨다운 간격 — 마지막 사용 이후 이만큼 턴이 지나야 다시 쓸 수 있다 */
const COOLDOWN_TURNS = 3;
/** 마지막으로 사용한 턴 번호(국 스코프) — 국이 바뀌면 키가 사라져 자동 해제 */
const lastUsedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "last", state, h);

/** 이 국에서 보유자의 현재 턴 번호 (= 내가 버린 수) */
function turnNo(state: GameState, h: PlayerId): number {
  // 누명이 discardedKinds를 남의 이력으로 돌리므로 실제 버림 횟수로 센다(docs/25 P5)
  return state.round.byPlayer[h]?.discardCount ?? 0;
}

/** 쿨다운 중인가 (마지막 사용 이후 3턴이 지나지 않았다) */
function onCooldown(state: GameState, h: PlayerId): boolean {
  const last = state.augmentData[lastUsedKey(state, h)];
  if (typeof last !== "number") return false; // 이 국에 아직 안 썼다
  return turnNo(state, h) - last < COOLDOWN_TURNS;
}
const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

interface TakeBackPayload {
  holder: PlayerId;
  drawnId: TileId;
  revealedKind: string;
  /** 사용한 턴 번호 (쿨다운 기준점) */
  turnNo: number;
}

const takeBackAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no take_back augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: cannot take back";
    }
    if (onCooldown(state, req.player)) return "take back is on cooldown";
    if (state.round.lastDrawnTile == null) return "no drawn tile";
    // 쯔모패가 아직 내 손에 있어야 한다. 손패를 통째로 갈아엎는 증강(밥상 뒤엎기·통째로
    // 바꾸기 등)과 겹치면 lastDrawnTile이 손 밖의 패를 가리킬 수 있고, 그대로 두면
    // 리듀서의 moveTiles가 "not in zone hand:*"로 던져 국이 죽는다.
    if (!handIdsOf(state, req.player).includes(state.round.lastDrawnTile)) {
      return "drawn tile is no longer in hand";
    }
    if (state.round.lastDrawRinshan) return "cannot take back a rinshan tile";
    /*
     * 바닥에서 집어 온 패는 **쯔모한 패가 아니다** — 무를 수 없다.
     * 이 가드가 없어서 "상대 바닥에서 아무 패나 한 장 지워 패산에 묻고, 정적의 손의
     * +2판은 그대로" 가 3순마다 성립했다 (QA synergy3 handedit 확정 6, 2026-08-23).
     */
    if (isRiverTakenTile(state, req.player, state.round.lastDrawnTile)) {
      return "that tile did not come from the wall";
    }
    if (wallLen(state) === 0) return "wall is empty";
    return null;
  },
  toEvents: (req, { state }) => {
    const drawnId = state.round.lastDrawnTile as TileId;
    const payload: TakeBackPayload = {
      holder: req.player,
      drawnId,
      revealedKind: kindKey(kindOf(state, drawnId)),
      turnNo: turnNo(state, req.player),
    };
    return [{ type: EVENT, payload }];
  },
};

export const takeBack: AugmentDef = defineAugment({
  id: ID,
  tier: "silver",
  category: "hand",
  complexity: 1,
  name: "무르기",
  description:
    "(3순에 1회) 쯔모한 패를 전원에게 공개하고 패산 맨 밑에 되돌린 뒤 새로 1장을 뽑는다.",
  detail:
    "쯔모한 패를 전원에게 공개하고 패산 맨 밑으로 되돌린 뒤 새로 1장 뽑는다.\n\n리치 중, 영상패로 뽑은 패, 패산이 비었을 때는 쓸 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    /*
     * 남은 쿨다운(순)을 이름표 pill에 상시로 낸다.
     *
     * 채널이 아예 없어서 **버튼이 사라지는 것으로만** 다시 쓸 수 없다는 걸 알 수 있었다 —
     * 왜 사라졌는지도, 언제 돌아오는지도 화면에 없었다. 값이 같으면 아무것도 내지
     * 않으므로 반응 연쇄는 한 겹에서 멈춘다.
     */
    ctx.reaction("*", (_event, rc) => {
      const last = rc.state.augmentData[lastUsedKey(rc.state, holder)];
      const left =
        typeof last === "number"
          ? Math.max(0, COOLDOWN_TURNS - (turnNo(rc.state, holder) - last))
          : 0;
      if (rc.state.augmentData[cooldownTurnsViewKey(ID, holder)] !== left) {
        rc.emit(augmentDataSet(cooldownTurnsViewKey(ID, holder), left));
      }
    });

    if (!engine.reducers.has(EVENT)) {
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as TakeBackPayload;
        // 쯔모패를 WALL 맨 끝(맨 밑)으로 되돌린다
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, [p.drawnId]);
        const newTop = zones[WALL]?.tileIds[0];
        if (newTop === undefined) return state; // 방어: validate가 보장
        // WALL 맨 앞의 새 패를 손으로
        zones = moveTiles(zones, WALL, handZone(p.holder), [newTop]);
        return {
          ...state,
          zones,
          round: replaceDrawnTile(state.round, newTop),
          augmentData: {
            ...state.augmentData,
            ...handAlteredMark(state, p.holder),
            [lastUsedKey(state, p.holder)]: p.turnNo,
            [roundViewKey("*", `${ID}:${p.holder}`)]: p.revealedKind,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(takeBackAction);
    }

    // 쿨다운 중이면 후보 자체를 내지 않는다 (validate도 막지만 UI에 버튼이 뜨지 않게)
    ctx.holderTurnOptions((state) =>
      onCooldown(state, holder) ? [] : [{ type: ACTION, payload: {} }],
    );
  },
  /**
   * 봇: **쯔모패가 고립패**(짝도 슌쯔 이웃도 없음)일 때만 되돌리고 다시 뽑는다.
   * 손패 장수도 패산 총량도 변하지 않으니 손해는 정보 노출뿐이고, 쓸모없는 패를
   * 새 패로 바꾸는 것은 기댓값이 확실히 양수다. (2026-07-26: 예전엔 BOT_SKIP이라
   * 제시 134회에 발동 0회였다 — "봇이 증강을 안 쓴다"의 대표 사례.)
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      const drawn = view.round.myDrawnTile;
      if (drawn === null) return null;
      const drawnKind = view.tiles[drawn]?.kind;
      if (drawnKind === undefined) return null;
      const rest = handKindsExcept(view, holder, drawn);
      if (usefulIn(rest, drawnKind)) return null;
      return opt;
    },
  }),
});
