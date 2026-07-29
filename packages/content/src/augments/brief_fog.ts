/**
 * 박무 (brief_fog, prism) — hidden_river의 "순간 집중형 6순 한정" 형제.
 *
 * 동풍전 1·반장전 2회, 자기 턴에 선언하면 그 순간부터 **6순 동안** 테이블의 모든 바닥에
 * 안개가 낀다. 6순이 지나면 안개는 저절로 걷히고 모든 바닥이 다시 정상으로 보인다.
 * `hidden_river`(선언하면 게임이 끝날 때까지)의 시간 제한판 — 짧고 굵게,
 * 결정적인 한 판의 몇 순 동안만 상대의 현물 읽기를 통째로 지운다.
 *
 * hidden_river와의 유일한 차이는 지속 시간이다:
 * - hidden_river: 선언 플래그가 게임 내내 켜져 있다.
 * - brief_fog:    선언 시점의 turnCount를 저장하고, `turnCount < declaredTurn + 6`
 *                 인 동안에만 안개가 유효하다. 창이 지나면 visibility 모디파이어가
 *                 그냥 원래 값(cur)을 돌려주므로 별도의 "안개 해제" 처리가 필요 없다.
 * - 발동은 **동풍전 1·반장전 2회**다(안개가 걷힌 뒤에도 다시 선언할 수 없다). 그래서
 *   'used' 플래그는 게임 단위로 영구히 남고(roundKey를 섞지 않는다), 안개가 지금
 *   유효한지는 그와 별개의 '시간 계산'이다.
 *
 * 안개 중에도 각 플레이어의 마지막 버림패 한 장은 전원에게 보인다 —
 * 론·후로 판정과 최소한의 현물 수비가 죽지 않도록 hidden_river와 똑같이 유지한다.
 *
 * 구현:
 * - 액션 `declare_brief_fog {}` — turn.act·자기 턴·동풍전 1·반장전 2회(used 플래그).
 * - `visibility.discards`를 `rules.addModifier`로 걸어 **안개가 지금 유효할 때만**
 *   (선언됨 && 6순 창 이내) 비보유자에게 count_only를 돌려준다(state undefined 방어).
 * - 각자의 마지막 버림패 맵을 전원 공개 뷰 채널 + `revealTiles:fog` 코어 채널에 실어
 *   클라이언트가 '진짜 패'로 그리게 한다(안개 유효 중에만 갱신).
 *
 * ⚠ 키 접두는 `brief_fog:`로 hidden_river(`hidden_river:`)와 절대 겹치지 않게 한다.
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
import { counterOf, matchUses, roundKey, viewKey } from "../util.js";

const ID = "brief_fog";
const ACTION = "declare_brief_fog";
/** 안개가 유효한 순 수 — 선언한 순부터 이 수만큼 (turnCount는 오야가 뽑을 때만 +1 = 진짜 순) */
const FOG_TURNS = 6;
/** 리치가 없을 때 봇이 선언을 미루는 최소 순 (첫 순 안개는 가릴 정보가 없다) */
const FOG_MIN_TURN = 5;

/** 매치당 사용 횟수 카운터 — **게임 단위**라 roundKey를 섞지 않는다. 동풍전 1·반장전 2회. */
const usesKey = (holder: PlayerId): string => `${ID}:uses:${holder}`;
const hasUsesLeft = (state: GameState, holder: PlayerId): boolean =>
  counterOf(state, usesKey(holder)) < matchUses(state);
/**
 * 선언한 순간의 turnCount(선언 순) — 6순 창의 기준점.
 *
 * ⚠ **국 스코프여야 한다.** `round.turnCount`는 국마다 0으로 리셋되므로, 기준점을 게임
 * 스코프에 두면 다음 국에서 `0 - 8 < 6`이 영원히 참이 되어 **안개가 영구히 유지되고**
 * 두 번째 사용도 영영 열리지 않는다(2026-07-29 감사). 사용 횟수(usesKey)는 게임 스코프 유지.
 */
const turnKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:turn:${roundKey(state)}:${holder}`;
/** 선언 사실을 전원에게 알리는 공개 뷰 채널 */
const noticeKey = (holder: PlayerId): string => viewKey("*", `${ID}:${holder}`);
/** 각 플레이어의 마지막 버림패 맵 { playerId: tileId } — 전원 공개 */
const lastMapKey = (holder: PlayerId): string =>
  viewKey("*", `${ID}:last:${holder}`);
/**
 * 위 맵의 tileId를 '진짜 패'로 그리게 하는 코어 공개 채널.
 *
 * ⚠ **보유자별로 갈라야 한다.** 예전에는 `revealTiles:fog` 하나를 숨은 강(hidden_river)과
 * 공유해, 한쪽이 선언하면 다른 쪽의 공개 목록을 통째로 덮어썼다(2026-07-29 감사).
 */
const revealKey = (holder: PlayerId): string =>
  viewKey("*", `revealTiles:fog:${holder}`);

/** 이 게임에 한 번이라도 선언했는가 (안개가 걷혔어도 true) */
function fogDeclared(state: GameState, holder: PlayerId): boolean {
  return counterOf(state, usesKey(holder)) > 0;
}

/** 지금 이 순간 안개가 유효한가 — 이번 국에 선언했고, 그 뒤 6순 이내 */
function fogActive(state: GameState, holder: PlayerId): boolean {
  if (!fogDeclared(state, holder)) return false;
  // 이번 국에 선언한 적이 없으면 키 자체가 없다 (0순 선언과 구분하려면 존재 여부를 본다)
  const declaredTurn = state.augmentData[turnKey(state, holder)];
  if (typeof declaredTurn !== "number") return false;
  return state.round.turnCount - declaredTurn < FOG_TURNS;
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

const declareBriefFogAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no brief_fog augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "brief_fog no uses left";
    if (fogActive(state, req.player)) return "fog still active";
    return null;
  },
  toEvents: (req, { state }) => {
    const map = lastDiscardMap(state);
    return [
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      augmentDataSet(turnKey(state, req.player), state.round.turnCount),
      augmentDataSet(noticeKey(req.player), "안개"),
      augmentDataSet(lastMapKey(req.player), map),
      augmentDataSet(revealKey(req.player), Object.values(map)),
    ];
  },
};

export const briefFog: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  name: "박무",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 선언하면 그 순간부터 6순 동안 네 사람 모두의 버림패가 가려지고, 오직 당신만 모든 바닥을 그대로 본다. 6순이 지나면 안개는 저절로 걷힌다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 선언하면 6순 동안 네 사람의 버림패가 다른 사람에게는 장수만 보이고 내용이 가려진다. 보유자만 네 개의 바닥을 그대로 읽는다. 각 플레이어의 마지막 버림패 한 장은 안개 속에서도 전원에게 공개되어 론·후로 판정과 최소한의 현물 수비는 유지된다. 안개가 활성 중에는 다시 선언할 수 없고, 6순이 지나면 모든 바닥이 정상으로 돌아온다.",
  // 봇: 자해 위험이 전혀 없다 — 옵션이 뜨면 곧바로 선언한다.
  /*
   * 봇: 6순짜리 안개를 정보가 거의 없는 첫 순에 태우지 않는다 — 상대가 리치를 걸었거나
   * 어느 정도 순이 지나 현물이 쌓였을 때 걸어야 방해 가치가 산다(2026-07-29 감사).
   */
  bot: {
    choose({ options, view }) {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      const someoneRiichi = Object.values(view.round.byPlayer).some(
        (r) => r.riichiDeclared,
      );
      if (!someoneRiichi && view.round.turnCount < FOG_MIN_TURN) return null;
      return opt;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(declareBriefFogAction);
    }

    // 안개가 지금 유효할 때만(선언됨 && 6순 창 이내) count_only를 돌려준다.
    // 창이 지나면 그냥 cur을 돌려주므로 별도의 '안개 해제' 처리가 필요 없다.
    engine.rules.addModifier<VisibilityRule>("visibility.discards", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (!fogActive(state, holder)) return cur;
        // 뷰어가 보유자가 아니면 어느 바닥이든 장수만 — 보유자만 전부 읽는다
        return rctx.playerId === holder ? cur : "count_only";
      },
    });

    // 버림이 일어날 때마다 "각자의 마지막 버림패" 맵을 갱신한다 (안개 유효 중에만).
    ctx.reaction(TILE_DISCARDED, (_event, rc) => {
      if (!fogActive(rc.state, holder)) return;
      const map = lastDiscardMap(rc.state);
      rc.emit(augmentDataSet(lastMapKey(holder), map));
      rc.emit(augmentDataSet(revealKey(holder), Object.values(map)));
    });

    // 국이 바뀌면 바닥이 비므로 지난 국 tileId가 새지 않게 맵을 비운다
    // (used 플래그는 게임 단위라 그대로 유지된다 — 동풍전 1·반장전 2회).
    // 국 시작에는 **조건 없이** 비운다. 안개 활성 여부로 게이트를 걸면, 안개가 이미
    // 만료된 국에서는 정리가 건너뛰어져 지난 국의 tileId가 전원에게 계속 실물 공개된다.
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const map = rc.state.augmentData[lastMapKey(holder)];
      const revealed = rc.state.augmentData[revealKey(holder)];
      if (map !== undefined && Object.keys(map as object).length > 0) {
        rc.emit(augmentDataSet(lastMapKey(holder), {}));
      }
      if (Array.isArray(revealed) && revealed.length > 0) {
        rc.emit(augmentDataSet(revealKey(holder), []));
      }
    });

    // 사용 횟수가 남았고 안개가 활성 중이 아니면 보유자 턴에 선언 후보를 낸다
    ctx.holderTurnOptions((state) =>
      hasUsesLeft(state, holder) && !fogActive(state, holder)
        ? [{ type: ACTION, payload: {} }]
        : [],
    );
  },
});
