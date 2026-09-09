/**
 * 물러설 수 없는 선언 (no_retreat, prism).
 * "불변으로써 만변에 응한다 — 그것이 리치의 극의."
 *
 * **스텔스 리치와 같은 꼴의 버튼형 액티브 리치다.** 텐파이 상태에서 버릴 패를 골라
 * 선언하면 그 패를 버리며 리치가 서고, 그 국에는 공탁 1000점을 내지 않으며
 * 리치·일발이 각각 2판, 뒷도라는 장당 2판이 된다. 2국에 1회.
 *
 * ## 2026-08-15 (사용자 지시) — 첫 순 제한 삭제 + 버튼형 액티브 리치로
 *
 * 예전에는 **국의 첫 순에만** 누를 수 있는 '선언'이었고, 그 뒤에 따로 평범한 리치를
 * 걸어야 효과가 붙었다. 두 가지가 문제였다.
 *  · 첫 순은 텐파이가 아닌 것이 보통이라 "리치를 걸 손인지" 모르는 채로 태워야 했다.
 *  · 선언과 리치가 분리돼 있어, 선언만 하고 리치를 못 걸면 아무 일도 없이 2국이 지났다.
 * 지금은 **선언이 곧 리치**다 — 리치를 걸 수 있는 어느 순에나 이 버튼으로 걸면 된다.
 *
 * 구현:
 * - 액션 `no_retreat_riichi {tileId}` — 표준 리치와 같은 검증(멘젠·텐파이 유지·패산
 *   잔량·리치 봉인·봉인된 패)을 거쳐 `TILE_DISCARDED{riichi:true, riichiCost:0}`을 낸다.
 *   (스텔스 리치와 같은 배관이다. 다른 점은 **은닉하지 않는다**는 것뿐 — 리치봉이 놓이지
 *   않는 것은 공탁 면제라는 능력의 결과로 전원에게 그대로 보인다.)
 * - `riichi.cost`: 선언한 국에는 0 — 손바닥 뒤집기 등으로 다시 걸어도 공짜다.
 * - `score.extraHan`: 화료 시 실제 채점을 재구성해 뒷도라(uraHan)만큼 한 번 더 더하고
 *   (2배), 리치·일발이 있으면 각 +1(1→2판). 역만에는 적용하지 않는다.
 * - 효과는 전부 **선언한 그 국**에만 산다(declared=roundKey 게이팅).
 */

import {
  TILE_DISCARDED,
  WALL,
  augmentDataSet,
  buildWinContext,
  defineAugment,
  evaluateWin,
  handIdsOf,
  kindOf,
  lockedDiscardIds,
  openMeldCountOf,
  playerAtSeat,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundKey,
  stringOf,
  trackRoundSeq,
} from "../util.js";
import { plan } from "./botPlan.js";

const ID = "no_retreat";
const ACTION = "no_retreat_riichi";
/** 쿨다운 — 한 번 선언하면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;
/** 마지막으로 선언한 국의 roundKey (효과 게이팅용 — 그 국에만 효과가 산다) */
const declaredKey = (h: PlayerId): string => `${ID}:round:${h}`;
/** 마지막으로 선언한 국 시퀀스 (쿨다운 계산용) */
const usedSeqKey = (h: PlayerId): string => `${ID}:usedSeq:${h}`;

/** 이번 국에 no_retreat를 선언한 상태인가 (효과는 선언한 그 국에만 적용) */
function declaredThisRound(state: GameState, holder: PlayerId): boolean {
  return stringOf(state, declaredKey(holder)) === roundKey(state);
}

/**
 * 선언 가능 여부 — 2국에 1회. 선언 이력이 없거나, 마지막 선언 이후 배패가 2번
 * 더 이루어졌을 때만 다시 선언할 수 있다.
 *
 * ⚠ **본장도 한 국으로 센다** — 동1국0본장에 쓰고 동1국1본장을 지나 동2국에 가면
 * 두 국이 지난 것이다(2026-08-01 사용자 확정). 예전엔 roundKey를 자릿수로 쪼개
 * 산술 비교했는데, 국 번호가 오르는 폭과 본장이 오르는 폭이 달라 이 경우가
 * 통째로 쿨다운에 갇혔다. 이제 배패 횟수(util.roundSeqOf)를 직접 센다.
 */
function canDeclare(state: GameState, holder: PlayerId): boolean {
  if (declaredThisRound(state, holder)) return false; // 이번 국엔 이미 걸었다
  return cooldownReady(state, ID, holder, COOLDOWN_ROUNDS);
}

/** tileId를 버려도 텐파이가 유지되는가 (스텔스 리치와 같은 판정) */
function tenpaiAfterDiscard(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
  discardId: TileId,
): boolean {
  const kinds = handIdsOf(state, player)
    .filter((id) => id !== discardId)
    .map((id) => kindOf(state, id));
  const melds = state.round.byPlayer[player]?.melds.length ?? 0;
  return (
    winningKinds(kinds, melds, undefined, scoringOptionsOf(state, rules, player))
      .length > 0
  );
}

/**
 * 선언 = 리치. 표준 리치와 같은 조건을 전부 규칙에서 읽어 검증한다
 * (하드코딩하면 공성계처럼 그 규칙을 내리는 증강이 이 리치에만 닿지 않는다).
 * 공탁을 내지 않으므로 표준 리치의 '점수 1000점 이상' 조건만 보지 않는다.
 */
const declareAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no no_retreat augment";
    }
    // 2국에 1회 — 선언한 국·바로 다음 국은 쿨다운
    if (!canDeclare(state, req.player)) return "on cooldown";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) return "already riichi";
    if (rules.resolve<boolean>("riichi.blocked", { playerId: req.player, state })) {
      return "riichi is sealed this round";
    }
    if (
      rules.resolve<boolean>("riichi.requiresClosed", { playerId: req.player }) &&
      openMeldCountOf(state, req.player) > 0
    ) {
      return "riichi requires a closed hand";
    }
    if (
      (state.zones[WALL]?.tileIds.length ?? 0) <
      rules.resolve<number>("riichi.minWallTiles")
    ) {
      return "not enough wall tiles";
    }
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) return "tile not in hand";
    // 봉인된 패는 이 리치로도 못 버린다 — 표준 리치와 같은 규칙이다
    if (lockedDiscardIds(state, rules, req.player, handIds).has(req.payload.tileId)) {
      return "tile is sealed";
    }
    if (
      rules.resolve<boolean>("riichi.requiresTenpai", { playerId: req.player, state }) &&
      !tenpaiAfterDiscard(state, rules, req.player, req.payload.tileId)
    ) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    // 선언 표식을 **버림보다 먼저** 세운다 — root 이벤트는 하나씩 완전히 처리되므로,
    // 버림을 먼저 내면 그 버림의 리액션이 도는 시점에 riichi.cost 게이트가 아직 없다.
    augmentDataSet(declaredKey(req.player), roundKey(state)),
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: true,
        // 공탁 면제 — riichiCost 0이 곧 "봉을 내지 않는다"
        riichiCost: 0,
      },
    },
  ],
};

export const noRetreat: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  // 난도 2 (2026-08-27 재평가): 리치 계열 용어뿐이고 효과는 '그 판들이 2배' — 규칙이 겹치지 않는다.
  complexity: 2,
  name: "물러설 수 없는 선언",
  description:
    "이 증강으로 리치를 걸면 리치와 일발이 각각 2판, 뒷도라는 장당 2판이 된다. 공탁금도 내지 않는다.",
  detail:
    "텐파이에서 이 증강으로 리치를 걸면 공탁금 1,000점을 내지 않고, 리치와 일발이 각각 2판, 뒷도라는 장당 2판(3장이면 6판)이 된다.\n\n더블리치는 원래대로 2판이고, 역만에는 판이 추가되지 않으므로 공탁 면제만 적용된다.\n\n리치는 국당 한 번이므로 리치 증강을 여럿 가지고 있어도 그 국에는 하나만 사용할 수 있다.",
  // 2026-08-15: 손바닥 뒤집기가 riichi.cost를 더 이상 건드리지 않으므로(대기 교체로 바뀜)
  // "둘 다 공탁을 0으로 만들어 한쪽이 무효"라는 충돌이 사라졌다 — 함께 가질 수 있다.
  install(ctx) {
    const { engine, holder, layer, instanceId } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(declareAction);
    }

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    // 48차 무페널티: "리치를 안 걸면 전 역 봉인(=화료 불가)"이라는 배수진을 삭제했다.
    // 선언은 이제 순수한 상향 — 공탁 면제 + 리치·일발·뒷도라 2배만 남는다.

    // 리치 공탁금 면제 (선언한 국 동안)
    engine.rules.addModifier<number>("riichi.cost", {
      source: instanceId,
      layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !declaredThisRound(state, holder)) return cur;
        return 0;
      },
    });

    // 리치·일발 +1판, 뒷도라 2배 — 실제 채점을 재구성해 정확히 얹는다
    engine.rules.addModifier<number>("score.extraHan", {
      source: instanceId,
      layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !declaredThisRound(state, holder)) return cur;
        if (ctx.yaku === undefined) return cur;

        // 화료 시점의 화료패·화료종류를 현재 페이즈에서 복원
        const phase = state.round.phase;
        let winType: "tsumo" | "ron";
        let tileId: TileId | null;
        if (phase === "turn.act") {
          winType = "tsumo";
          tileId = state.round.lastDrawnTile;
        } else if (phase === "reaction") {
          winType = "ron";
          tileId =
            state.round.lastDiscard?.tileId ??
            state.round.chankan?.tileId ??
            null;
        } else {
          return cur;
        }
        if (tileId === null) return cur;

        const wctx = buildWinContext(state, holder, winType, tileId, {
          includeUra: true,
          rules: engine.rules,
        });
        const ev = evaluateWin(wctx, ctx.yaku);
        if (ev === null || !ev.ok || ev.yakumanCount > 0) return cur;

        const has = (id: string): boolean => ev.yaku.some((y) => y.id === id);
        let bonus = ev.uraHan; // 뒷도라 한 번 더 = 2배
        // "리치 성분을 2판으로" — 더블리치는 이미 2판이므로 더하지 않는다.
        // 예전에는 둘 다 +1을 줘서 뒤늦은 출진(더블리치 강제)과 겹치면 3판이 됐다
        // (안내 문구와 결과가 어긋남, 2026-07-29 감사).
        if (has("riichi") && !has("double_riichi")) bonus += 1; // 리치 1→2
        if (has("ippatsu")) bonus += 1; // 일발 1→2
        return cur + bonus;
      },
    });

    // 아직 리치 전이고 쿨다운이 아니면, 버려도 텐파이가 유지되는 손패만 후보로 낸다.
    // 클라이언트는 이 후보 패를 강조해 손패 클릭·드래그로 발동시킨다(스텔스 리치와 같다).
    ctx.holderTurnOptions((state) => {
      if (state.round.phase !== "turn.act") return [];
      if (!canDeclare(state, holder)) return [];
      if (state.round.byPlayer[holder]?.riichi != null) return [];
      // 텐파이 요구는 validate와 **같은 규칙**에서 읽는다 — 공성계(siege_riichi)가
      // `riichi.requiresTenpai`를 false로 내렸을 때 후보가 0개가 되면 안 된다.
      const needTenpai = engine.rules.resolve<boolean>("riichi.requiresTenpai", {
        playerId: holder,
        state,
      });
      return handIdsOf(state, holder)
        .filter((tileId) => !needTenpai || tenpaiAfterDiscard(state, engine.rules, holder, tileId))
        .map((tileId) => ({ type: ACTION, payload: { tileId } }));
    });
  },
  // 텐파이라면 공탁도 없고 리치·일발·뒷도라가 2판이 되는 순수 이득 — 그냥 건다.
  // (후보로 뜨는 시점이 이미 "버려도 텐파이가 유지되는 패"라 손을 해치지 않는다.)
  bot: plan({
    intent: "score",
    fleeting: true,
    pick: ({ options, tenpai }) =>
      tenpai ? (options.find((o) => o.type === ACTION) ?? null) : null,
  }),
});
