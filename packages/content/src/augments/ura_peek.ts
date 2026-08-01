/**
 * 이면투시 (ura_peek, silver) — 뒷도라를 보고, 마음에 안 들면 바꿔치기한다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b C (52차 버프)
 *
 * ① 확인(기존): 국당 1회, 자기 턴에 뒷도라 표시패를 본인만 확인한다. 한 번 열어 두면
 *    그 국에 깡으로 뒷도라가 늘어날 때마다 새 표시패도 자동으로 보인다.
 * ② 바꿔치기(신규): 이면투시를 이미 발동한 국에 한해 **국당 1회**, 뒷도라 표시패
 *    (첫 번째 것)를 왕패의 다른 패와 자리째 맞바꾼다 — 알고도 아무것도 못 하던
 *    정보형에서 "내 손에 맞는 뒷도라를 직접 고르는" 능동형이 된다.
 *
 * 구현: peek_riichi_waits 패턴. 커스텀 액션 + 리듀서가 왕패의 뒷도라 표시패 kind를
 * 읽어 viewKey(holder,"ura")에 기록. 국당 1회 플래그. 새 국에 지운다.
 * 바꿔치기 리듀서는 왕패 배열의 두 자리를 그대로 맞바꾸므로 왕패 장수·도라 표시패의
 * 절대 인덱스가 보존되고, 교환 직후 보유자의 뒷도라 뷰를 새 패로 갱신한다.
 */

import {
  DEAD_WALL,
  DORA_FLIPPED,
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  kindKey,
  kindOf,
  playerAtSeat,
  uraIndicatorIds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";
import type { VisibilityRule } from "@majak/core";
import { flagOf, roundKey, roundViewKey, viewKey, widenPeek } from "../util.js";

const ID = "ura_peek";
const ACTION = "ura_peek_reveal";
const ACTION_SWAP = "ura_swap";
const EVENT = "UraPeeked";
const EVENT_SWAP = "UraSwapped";
const uraViewKey = (h: PlayerId): string => roundViewKey(h, "ura");
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;
/** 국당 1회 바꿔치기 플래그 */
const swappedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:swapped:${roundKey(state)}:${h}`;

interface UraPeekedPayload {
  holder: PlayerId;
  kinds: string[];
  usedKey: string;
}

interface UraSwappedPayload {
  holder: PlayerId;
  /** 지금 뒷도라 표시패 자리에 있는 패 */
  uraTileId: TileId;
  /** 그 자리로 밀어 넣을 왕패의 다른 패 */
  otherTileId: TileId;
  viewKey: string;
  swappedKey: string;
}

/** 손대면 안 되는 왕패 자리 (도라 표시패 자신과 그 바로 뒤 = 뒷도라 표시패) */
function lockedIndices(state: GameState): Set<number> {
  const deadWall = state.zones[DEAD_WALL]?.tileIds ?? [];
  const locked = new Set<number>();
  for (const indicator of state.round.doraIndicators) {
    const idx = deadWall.indexOf(indicator);
    if (idx < 0) continue;
    locked.add(idx);
    locked.add(idx + 1);
  }
  return locked;
}

const uraPeekAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no ura_peek augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    return null;
  },
  toEvents: (req, { state }) => {
    const kinds = uraIndicatorIds(state).map((id) => kindKey(kindOf(state, id)));
    const payload: UraPeekedPayload = {
      holder: req.player,
      kinds,
      usedKey: usedKey(state, req.player),
    };
    return [{ type: EVENT, payload }];
  },
};

const uraSwapAction: ActionDef<{ deadIndex: number }> = {
  type: ACTION_SWAP,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no ura_peek augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 본 적 없는 뒷도라는 바꿀 수 없다 — 이면투시를 발동한 국에만 열린다
    if (!flagOf(state, usedKey(state, req.player))) return "ura not revealed yet";
    if (flagOf(state, swappedKey(state, req.player))) {
      return "already swapped this round";
    }
    if (uraIndicatorIds(state)[0] === undefined) return "no ura indicator";
    const deadWall = state.zones[DEAD_WALL]?.tileIds ?? [];
    const idx = req.payload.deadIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= deadWall.length) {
      return "invalid dead wall index";
    }
    // 도라 표시패와 뒷도라 표시패 자리 자체는 건드리지 않는다 (도라가 통째로 흔들린다)
    if (lockedIndices(state).has(idx)) return "cannot swap with an indicator slot";
    return null;
  },
  toEvents: (req, { state }) => {
    const payload: UraSwappedPayload = {
      holder: req.player,
      uraTileId: uraIndicatorIds(state)[0] as TileId,
      otherTileId: (state.zones[DEAD_WALL]?.tileIds ?? [])[
        req.payload.deadIndex
      ] as TileId,
      viewKey: uraViewKey(req.player),
      swappedKey: swappedKey(state, req.player),
    };
    return [{ type: EVENT_SWAP, payload }];
  },
};

export const uraPeek: AugmentDef = defineAugment({
  id: ID,
  tier: "silver",
  category: "info",
  name: "이면투시",
  description:
    "(매 국 1회 + 바꿔치기 1회) 자기 순에 뒷도라 표시패를 본인만 확인한다. 확인한 국에는 1회, 그 뒷도라 표시패를 왕패의 다른 패와 바꿔치기할 수 있다.",
  detail:
    "(매 국 1회 + 바꿔치기 1회) 자기 순에 이번 국의 뒷도라 표시패를 자신만 확인한다. 한 번 열면 그 국 동안 유지되어 깡으로 뒷도라가 늘어나면 새 표시패도 자동으로 보인다. 확인한 국에는 추가로 1회, 뒷도라 표시패를 왕패의 다른 패와 통째로 맞바꿔 내 손에 맞는 뒷도라를 직접 만들 수 있다(도라 표시패 자리는 건드릴 수 없다). 고를 수 있도록 바꿔치기를 쓰기 전까지 왕패 전체가 자신에게만 보인다. 국이 바뀌면 확인한 정보는 지워진다.",
  // 봇: 텐파이일 때 확인한다 — 리치를 걸지 다마텐으로 갈지 판단할 정보가 가장 필요한 시점.
  //     (바꿔치기는 내 손패와 맞춰 골라야 해서 봇에게 맡기지 않는다.)
  bot: {
    choose({ options, tenpai }) {
      if (!tenpai) return null;
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.reducers.has(EVENT)) {
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as UraPeekedPayload;
        return {
          ...state,
          augmentData: {
            ...state.augmentData,
            [uraViewKey(p.holder)]: p.kinds,
            [p.usedKey]: true,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(uraPeekAction);
    }
    if (!engine.actions.has(ACTION_SWAP)) {
      engine.actions.register(uraSwapAction);
      engine.reducers.register(EVENT_SWAP, (state, event) => {
        const p = event.payload as UraSwappedPayload;
        const zone = state.zones[DEAD_WALL];
        if (zone === undefined) throw new Error("UraSwapped: no dead wall");
        const ids = [...zone.tileIds];
        const i = ids.indexOf(p.uraTileId);
        const j = ids.indexOf(p.otherTileId);
        if (i < 0 || j < 0) throw new Error("UraSwapped: tile not in dead wall");
        ids[i] = p.otherTileId;
        ids[j] = p.uraTileId;
        const next: GameState = {
          ...state,
          zones: { ...state.zones, [DEAD_WALL]: { ...zone, tileIds: ids } },
        };
        // 바뀐 뒷도라를 보유자 뷰에 즉시 반영 — 무엇으로 바뀌었는지 그 자리에서 본다
        return {
          ...next,
          augmentData: {
            ...next.augmentData,
            [p.viewKey]: uraIndicatorIds(next).map((id) =>
              kindKey(kindOf(next, id)),
            ),
            [p.swappedKey]: true,
          },
        };
      });
    }

    // 바꿔치기 상대를 고르려면 왕패가 **보여야 한다** — 안 보이면 클라이언트의
    // 교환 모달이 빈 칸만 띄우고(왕패는 기본 hidden) 눈 감고 바꾸는 꼴이 된다
    // (2026-08-01 사용자 보고). 그래서 이면투시를 발동한 국에, 아직 바꿔치기를
    // 쓰지 않은 동안만 보유자에게 왕패 전체를 연다. 바꾸고 나면 다시 닫힌다.
    engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!flagOf(state, usedKey(state, holder))) return cur;
        if (flagOf(state, swappedKey(state, holder))) return cur;
        return widenPeek(cur, {
          mode: "peek",
          count: state.zones[DEAD_WALL]?.tileIds.length ?? 0,
        });
      },
    });

    // 새 국 시작 시 지난 국의 뒷도라 정보를 지운다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const v = rc.state.augmentData[uraViewKey(holder)];
      if (Array.isArray(v) && v.length > 0) {
        rc.emit(augmentDataSet(uraViewKey(holder), []));
      }
    });

    // 발동한 뒤 깡으로 새 도라 표시패가 뒤집히면 새로 생긴 뒷도라도 함께 보인다.
    // (예전엔 발동 시점의 뒷도라만 기록해, 이후 깡으로 늘어난 뒷도라가 영영 안 보였다.
    //  "이번 국의 뒷도라를 본다"가 능력이므로 국 안에서는 계속 최신이어야 한다.)
    ctx.reaction(DORA_FLIPPED, (_event, rc) => {
      if (!flagOf(rc.state, usedKey(rc.state, holder))) return;
      const kinds = uraIndicatorIds(rc.state).map((id) =>
        kindKey(kindOf(rc.state, id)),
      );
      const shown = rc.state.augmentData[uraViewKey(holder)];
      const same =
        Array.isArray(shown) &&
        shown.length === kinds.length &&
        kinds.every((k, i) => shown[i] === k);
      if (same) return;
      rc.emit(augmentDataSet(uraViewKey(holder), kinds));
    });

    ctx.holderTurnOptions((state) => {
      const options: { type: string; payload: unknown }[] = [
        { type: ACTION, payload: {} },
      ];
      // 이미 확인했고 아직 안 바꿨으면 왕패 자리별 교환 후보 (validate가 최종 판정)
      if (
        flagOf(state, usedKey(state, holder)) &&
        !flagOf(state, swappedKey(state, holder))
      ) {
        const locked = lockedIndices(state);
        const size = state.zones[DEAD_WALL]?.tileIds.length ?? 0;
        for (let i = 0; i < size; i++) {
          if (locked.has(i)) continue;
          options.push({ type: ACTION_SWAP, payload: { deadIndex: i } });
        }
      }
      return options;
    });
  },
});
