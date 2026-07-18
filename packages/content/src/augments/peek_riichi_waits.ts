/**
 * 선언 간파 (peek_riichi_waits) — 리치 중인 상대에게 1000점을 지불하고
 * 그 상대의 오름패(대기)를 확인한다 (국당 상대별 1회).
 *
 * 구현 지점:
 * - 커스텀 액션 "peek_waits" {target}: 자기 턴에 리치 중인 상대를 지정.
 * - 커스텀 이벤트 PeekWaitsPerformed {holder, target, waits}: Reducer가
 *   점수 이동(-1000/+1000)과 보유자 전용 뷰 데이터·사용 플래그를 기록한다.
 *   waits는 표시용 kindKey 문자열 배열 (클라이언트가 바로 그린다).
 * - holderTurnOptions: 리치 중인 상대마다 후보 노출 (validate가 거른다).
 */

import {
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  meldCountOf,
  playerAtSeat,
  winningKinds,
  scoringOptionsOf,
  ROUND_STARTED,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
} from "@majak/core";
import { flagOf, roundKey, viewKey } from "../util.js";

const AUGMENT_ID = "peek_riichi_waits";
/** 간파 비용 (상대에게 지불) */
const PEEK_COST = 1000;
/** 증강 id에서 파생한 이벤트 타입 (다른 증강과 충돌 방지) */
const PEEK_WAITS_PERFORMED = "PeekWaitsPerformed";
/** 지난 국에서 간파한 오름패 뷰를 새 국 시작 시 지우는 이벤트 */
const PEEK_WAITS_CLEARED = "PeekWaitsCleared";
/** viewKey(holder, "waits:{target}")의 공통 접두 — 이 접두의 뷰 키를 국마다 정리 */
const waitsViewPrefix = (holder: PlayerId): string => viewKey(holder, "waits:");

interface PeekWaitsPerformedPayload {
  holder: PlayerId;
  target: PlayerId;
  /** 대상의 오름패 kindKey 목록 (표시용) */
  waits: string[];
}

interface PeekWaitsClearedPayload {
  holder: PlayerId;
}

/** 국·상대 단위 사용 플래그 키 */
const usedKey = (
  state: GameState,
  holder: PlayerId,
  target: PlayerId,
): string => `${AUGMENT_ID}:used:${roundKey(state)}:${holder}:${target}`;

const peekWaitsAction: ActionDef<{ target: PlayerId }> = {
  type: "peek_waits",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(AUGMENT_ID)) {
      return "no peek_riichi_waits augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot peek yourself";
    if (state.round.byPlayer[req.payload.target]?.riichi == null) {
      return "target is not in riichi";
    }
    if (flagOf(state, usedKey(state, req.player, req.payload.target))) {
      return "already peeked this player this round";
    }
    if (player.score < PEEK_COST) return "not enough points";
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const target = req.payload.target;
    // 대상 손패의 대기 계산 — 채점 변형 증강(scoring.*)까지 반영
    const waits = winningKinds(
      handIdsOf(state, target).map((id) => kindOf(state, id)),
      meldCountOf(state, target),
      undefined,
      scoringOptionsOf(state, rules, target),
    ).map(kindKey);
    const payload: PeekWaitsPerformedPayload = {
      holder: req.player,
      target,
      waits,
    };
    return [{ type: PEEK_WAITS_PERFORMED, payload }];
  },
};

export const peekRiichiWaits: AugmentDef = defineAugment({
  id: AUGMENT_ID,
  tier: "gold",
  name: "선언 간파",
  description:
    "자기 턴에 리치 중인 상대에게 1000점을 지불하고 그 상대의 오름패를 확인한다 (국당 상대별 1회).",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(PEEK_WAITS_PERFORMED)) {
      engine.reducers.register(PEEK_WAITS_PERFORMED, (state, event) => {
        const p = event.payload as PeekWaitsPerformedPayload;
        return {
          ...state,
          // 비용 이동: 보유자 → 대상
          players: state.players.map((pl) =>
            pl.id === p.holder
              ? { ...pl, score: pl.score - PEEK_COST }
              : pl.id === p.target
                ? { ...pl, score: pl.score + PEEK_COST }
                : pl,
          ),
          augmentData: {
            ...state.augmentData,
            // 보유자 화면에만 대기 노출 + 국·상대 단위 사용 플래그
            [viewKey(p.holder, `waits:${p.target}`)]: p.waits,
            [usedKey(state, p.holder, p.target)]: true,
          },
        };
      });
    }
    if (!engine.actions.has("peek_waits")) {
      engine.actions.register(peekWaitsAction);
    }

    // 간파한 오름패는 그 국의 리치에 한한 정보 — 새 국이 시작되면 지운다.
    // (예전엔 view:{holder}:waits:{target} 키가 계속 남아 국이 지나도 표시됐다.)
    if (!engine.reducers.has(PEEK_WAITS_CLEARED)) {
      engine.reducers.register(PEEK_WAITS_CLEARED, (state, event) => {
        const p = event.payload as PeekWaitsClearedPayload;
        const prefix = waitsViewPrefix(p.holder);
        const augmentData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(state.augmentData)) {
          if (!k.startsWith(prefix)) augmentData[k] = v;
        }
        return { ...state, augmentData };
      });
    }

    // 새 국 시작 시(배패 완료) 지난 국의 간파 결과를 정리 — 남은 게 있을 때만 이벤트 발행
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const prefix = waitsViewPrefix(holder);
      const hasStale = Object.keys(rc.state.augmentData).some((k) =>
        k.startsWith(prefix),
      );
      if (!hasStale) return;
      rc.emit({
        type: PEEK_WAITS_CLEARED,
        payload: { holder } satisfies PeekWaitsClearedPayload,
      });
    });

    // 리치 중인 각 상대에 대해 후보 노출 (사용 여부·점수는 validate가 판정)
    ctx.holderTurnOptions((state) =>
      state.players
        .filter(
          (p) =>
            p.id !== holder && state.round.byPlayer[p.id]?.riichi != null,
        )
        .map((p) => ({ type: "peek_waits", payload: { target: p.id } })),
    );
  },
});
