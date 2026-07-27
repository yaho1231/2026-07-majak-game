/**
 * 안개 덮인 바닥 (hidden_river, prism) — 게임당 1회 선언하는 액티브.
 * 선언한 순간부터 게임이 끝날 때까지 테이블의 **모든** 바닥에 안개가 낀다.
 *
 * 55차(사용자 피드백): 상시 패시브였던 것을 **자기 턴에 한 번 선언하는 액티브**로 바꿨다.
 * 선언 전에는 바닥이 정상적으로 보이고, `declare_fog`를 누른 그 순간 테이블 전체가
 * 뒷면으로 덮인다 — 발동이 눈에 보이는 사건이 된다(도파민 리트머스 ①).
 * 선언은 **게임 단위**다(국이 바뀌어도 유지) — 그래서 플래그 키에 roundKey를 섞지 않는다.
 *
 * 또한 피드백대로 "가장 최근 1장"이 아니라 **각 플레이어의 마지막 버림패**가
 * 안개 속에서도 보인다. 현물 한 장씩은 남겨 두어 수비가 완전히 죽지 않게 하고,
 * 론·후로 반응 판정도 자연스럽게 유지된다.
 *
 * 구현:
 * - 액션 `declare_fog {}` — turn.act·자기 턴·게임당 1회.
 * - `visibility.discards`는 `setHolderRule`(상시 고정)이 아니라 `rules.addModifier`로
 *   걸어 **선언 플래그가 켜져 있을 때만** count_only를 돌려준다(state undefined 방어).
 * - 각자의 마지막 버림패 맵은 전원 공개 뷰 채널에 싣고, 같은 tileId를
 *   `revealTiles:fog`에도 실어 클라이언트가 '진짜 패'로 그릴 수 있게 한다
 *   (PlayerView의 revealTiles:{tag} 채널 — 봉인술사가 쓰는 코어 범용 통로).
 */

import {
  ROUND_STARTED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  discardsZone,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  VisibilityRule,
} from "@majak/core";
import { flagOf, viewKey } from "../util.js";

const ID = "hidden_river";
const ACTION = "declare_fog";

/** 안개 선언 플래그 — **게임 단위**라 roundKey를 섞지 않는다 */
const fogKey = (holder: PlayerId): string => `${ID}:fog:${holder}`;
/** 선언 사실을 전원에게 알리는 공개 뷰 채널 */
const noticeKey = (holder: PlayerId): string => viewKey("*", `${ID}:${holder}`);
/** 각 플레이어의 마지막 버림패 맵 { playerId: tileId } — 전원 공개 */
const lastMapKey = (holder: PlayerId): string =>
  viewKey("*", `${ID}:last:${holder}`);
/** 위 맵의 tileId를 '진짜 패'로 그리게 하는 코어 공개 채널 */
const REVEAL_KEY = viewKey("*", "revealTiles:fog");

/** 안개가 선언되어 있는가 */
function fogDeclared(state: GameState, holder: PlayerId): boolean {
  return flagOf(state, fogKey(holder));
}

/** 네 사람 각자의 마지막 버림패 { playerId: tileId } */
function lastDiscardMap(state: GameState): Record<PlayerId, TileId> {
  const out: Record<PlayerId, TileId> = {};
  for (const p of state.players) {
    const last = state.zones[discardsZone(p.id)]?.tileIds.at(-1);
    if (last !== undefined) out[p.id] = last;
  }
  return out;
}

const declareFogAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no hidden_river augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (fogDeclared(state, req.player)) return "fog already declared";
    return null;
  },
  toEvents: (req, { state }) => {
    const map = lastDiscardMap(state);
    return [
      augmentDataSet(fogKey(req.player), true),
      augmentDataSet(noticeKey(req.player), "안개"),
      augmentDataSet(lastMapKey(req.player), map),
      augmentDataSet(REVEAL_KEY, Object.values(map)),
    ];
  },
};

export const hiddenRiver: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  name: "안개 덮인 바닥",
  description:
    "(게임 내 1회) 자기 순에 선언하면 그 순간부터 게임이 끝날 때까지 네 사람 모두의 버림패가 가려지고, 오직 당신만 모든 바닥을 그대로 본다.",
  detail:
    "(게임 내 1회) 선언하기 전에는 바닥이 평소대로 보이지만, 자기 순에 한 번 선언하면 게임이 끝날 때까지 네 사람 모두의 버림패가 다른 사람에게는 장수만 보이고 내용이 가려진다. 보유자만 네 개의 바닥을 그대로 읽는다. 각 플레이어의 마지막 버림패 한 장씩은 안개 속에서도 전원에게 공개되어 론·후로 판정과 최소한의 현물 수비는 유지된다. 선언은 국이 바뀌어도 풀리지 않는다.",
  // 봇: 자해 위험이 전혀 없다 — 옵션이 뜨면 곧바로 선언한다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) engine.actions.register(declareFogAction);

    // 선언 후에만 안개가 낀다 — setHolderRule은 상시 고정이라 쓸 수 없다.
    engine.rules.addModifier<VisibilityRule>("visibility.discards", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!fogDeclared(state, holder)) return cur;
        // 뷰어가 보유자가 아니면 어느 바닥이든 장수만 — 보유자만 전부 읽는다
        return rctx.playerId === holder ? cur : "count_only";
      },
    });

    // 버림이 일어날 때마다 "각자의 마지막 버림패" 맵을 갱신한다 (선언 후에만).
    ctx.reaction(TILE_DISCARDED, (_event, rc) => {
      if (!fogDeclared(rc.state, holder)) return;
      const map = lastDiscardMap(rc.state);
      rc.emit(augmentDataSet(lastMapKey(holder), map));
      rc.emit(augmentDataSet(REVEAL_KEY, Object.values(map)));
    });

    // 국이 바뀌면 바닥이 비므로 지난 국 tileId가 새지 않게 맵을 비운다
    // (선언 플래그는 게임 단위라 그대로 유지된다).
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (!fogDeclared(rc.state, holder)) return;
      rc.emit(augmentDataSet(lastMapKey(holder), {}));
      rc.emit(augmentDataSet(REVEAL_KEY, []));
    });

    // 아직 선언하지 않았다면 보유자 턴에 선언 후보를 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      fogDeclared(state, holder) ? [] : [{ type: ACTION, payload: {} }],
    );
  },
});
