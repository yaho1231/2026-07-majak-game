/**
 * standardActions — 표준 리치마작 액션 (플레이어 + 시스템).
 * 모든 합법성 판정은 여기 validate에 있다 — 프롬프트도 여기서 유도된다.
 *
 * 설계: docs/11_GAME_FLOW.md §3
 */

import type { ActionDef, ActionRegistry } from "../../engine/actions/ActionRegistry.js";
import {
  doraIndicatorIndex,
  rinshanRemaining,
} from "../../engine/state/GameState.js";
import type { GameState } from "../../engine/state/GameState.js";
import type { RuleRegistry } from "../../engine/rules/RuleRegistry.js";
import { DEAD_WALL, WALL } from "../../engine/zones/Zone.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import { Suits, isTerminalOrHonor, kindKey, sameKind } from "../tiles/Tile.js";
import type { TileId, TileKind } from "../tiles/Tile.js";
import { calculateScore } from "../scoring/score.js";
import { evaluateWin } from "../scoring/evaluate.js";
import type { WinEvaluation } from "../scoring/evaluate.js";
import { winningKinds } from "../scoring/waits.js";
import { DEFAULT_SEQUENCE_SUITS, isHonorRun } from "../scoring/decompose.js";
import type { DecomposeOptions } from "../scoring/decompose.js";
import type { YakuRegistry } from "../scoring/YakuRegistry.js";
import {
  CALL_MADE,
  ROUND_SETTLED,
  ROUND_STARTED,
  TILE_DISCARDED,
  TILE_DRAWN,
  TURN_PASSED,
  WIN_DECLARED,
  KAN_DECLARED,
  DORA_FLIPPED,
  FURITEN_MARKED,
} from "./flowEvents.js";
import type {
  AbortReason,
  RoundSettledPayload,
  WinDeclaredPayload,
  WinInfo,
} from "./flowEvents.js";
import {
  SYSTEM_PLAYER,
  buildWinContext,
  handIdsOf,
  handKindsOf,
  isFuriten,
  kindOf,
  meldCountOf,
  openMeldCountOf,
  nextSeat,
  playerAtSeat,
  playerOf,
  scoringOptionsOf,
  sameCallKind,
  mixedTripletsFor,
  polarEndsFor,
  honorRunsFor,
  isFourWinds,
  isRunQuad,
  snakeKanFor,
  winHandKindsOf,
} from "./helpers.js";

const wallIds = (state: GameState): readonly TileId[] =>
  state.zones[WALL]?.tileIds ?? [];

const deadWallIds = (state: GameState): readonly TileId[] =>
  state.zones[DEAD_WALL]?.tileIds ?? [];

const isTurnPlayer = (state: GameState, player: PlayerId): boolean =>
  playerAtSeat(state, state.round.turnSeat).id === player;

function sameKindSet(a: readonly TileKind[], b: readonly TileKind[]): boolean {
  const ak = new Set(a.map(kindKey));
  const bk = new Set(b.map(kindKey));
  return ak.size === bk.size && [...ak].every((key) => bk.has(key));
}

function isRiichiSafeAnkan(
  state: GameState,
  player: PlayerId,
  tileIds: readonly TileId[],
  opts?: DecomposeOptions,
): boolean {
  const drawn = state.round.lastDrawnTile;
  if (drawn === null || !tileIds.includes(drawn)) return false;
  const hand = handIdsOf(state, player);
  const meldCount = meldCountOf(state, player);
  const before = winningKinds(
    hand.filter((id) => id !== drawn).map((id) => kindOf(state, id)),
    meldCount,
    undefined,
    opts,
  );
  const after = winningKinds(
    hand.filter((id) => !tileIds.includes(id)).map((id) => kindOf(state, id)),
    meldCount + 1,
    undefined,
    opts,
  );
  return sameKindSet(before, after);
}

/** 세 rank가 슌쯔를 이루는가 (wrap이면 8-9-1, 9-1-2도 허용) */
function isRunRanks(ranks: readonly number[], wrap: boolean): boolean {
  const sorted = [...ranks].sort((a, b) => a - b);
  const [a, b, c] = sorted as [number, number, number];
  if (b === a + 1 && c === a + 2) return true;
  if (!wrap) return false;
  // 순환: {8,9,1} → [1,8,9], {9,1,2} → [1,2,9]
  return (a === 1 && b === 8 && c === 9) || (a === 1 && b === 2 && c === 9);
}

function isKokushiEvaluation(ev: WinEvaluation): boolean {
  return ev.yaku.some((y) => y.id === "kokushi" || y.id === "kokushi_13");
}

/**
 * 최소 판 게이트(win.minHan — 격/rank_gate)에 걸리는가.
 * 역만은 면제한다 — 막고 싶은 것은 "싼 손 속공"이지 최상급 손이 아니다.
 * 증강이 얹는 추가 판(score.extraHan)도 함께 세어, 판을 올려 주는 증강과 모순되지 않게 한다.
 */
function belowMinHan(
  ev: WinEvaluation,
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): boolean {
  if (ev.yakumanCount > 0) return false;
  const min = rules.resolve<number>("win.minHan", { playerId: player, state });
  if (min <= 0) return false;
  const extra = Math.max(
    0,
    rules.resolve<number>("score.extraHan", { playerId: player, state }),
  );
  return ev.han + extra < min;
}

// ─────────────────────────── 플레이어 액션 ───────────────────────────

const discardAction: ActionDef<{ tileId: TileId }> = {
  type: "discard",
  validate: (req, { state, rules }) => {
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (!isTurnPlayer(state, req.player)) return "not your turn";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    const rs = state.round.byPlayer[req.player];
    if (rs?.riichi != null && req.payload.tileId !== state.round.lastDrawnTile) {
      return "riichi: must discard the drawn tile";
    }
    // 봉인된 패 (discard.blockedKinds 규칙, kindKey 목록).
    // 손패 전부가 봉인이면 소프트락 방지를 위해 허용한다.
    const blocked = rules.resolve<string[]>("discard.blockedKinds", {
      playerId: req.player,
      state,
    });
    if (blocked.length > 0 && rs?.riichi == null) {
      const blockedSet = new Set(blocked);
      if (blockedSet.has(kindKey(kindOf(state, req.payload.tileId)))) {
        const hasFree = hand.some(
          (id) => !blockedSet.has(kindKey(kindOf(state, id))),
        );
        if (hasFree) return "tile kind is sealed";
      }
    }
    return null;
  },
  toEvents: (req) => [
    {
      type: TILE_DISCARDED,
      payload: { player: req.player, tileId: req.payload.tileId, riichi: false, riichiCost: 0 },
    },
  ],
};

const riichiAction: ActionDef<{ tileId: TileId }> = {
  type: "riichi",
  validate: (req, { state, rules }) => {
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (!isTurnPlayer(state, req.player)) return "not your turn";
    const rs = state.round.byPlayer[req.player];
    if (rs?.riichi != null) return "already riichi";
    // 리치 봉인 — 다른 사람이 먼저 리치를 걸어 이 국의 리치가 잠겼다
    if (rules.resolve<boolean>("riichi.blocked", { playerId: req.player, state })) {
      return "riichi is sealed this round";
    }
    if (
      rules.resolve<boolean>("riichi.requiresClosed", { playerId: req.player }) &&
      openMeldCountOf(state, req.player) > 0
    ) {
      return "riichi requires a closed hand";
    }
    const cost = rules.resolve<number>("riichi.cost", {
      playerId: req.player,
      state,
    });
    if (playerOf(state, req.player).score < cost) return "not enough points";
    if (wallIds(state).length < rules.resolve<number>("riichi.minWallTiles")) {
      return "not enough wall tiles";
    }
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) return "tile not in hand";
    const after = handIds
      .filter((t) => t !== req.payload.tileId)
      .map((t) => kindOf(state, t));
    const melds = meldCountOf(state, req.player);
    const opts = scoringOptionsOf(state, rules, req.player);
    // 공성계(riichi.requiresTenpai=false)는 텐파이가 아니어도 리치를 걸 수 있다 — 블러프용.
    if (
      rules.resolve<boolean>("riichi.requiresTenpai", { playerId: req.player, state }) &&
      winningKinds(after, melds, undefined, opts).length === 0
    ) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => [
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: true,
        riichiCost: rules.resolve<number>("riichi.cost", {
          playerId: req.player,
          state,
        }),
      },
    },
  ],
};

function winAction(yaku: YakuRegistry): ActionDef<Record<string, never>> {
  return {
    type: "win",
    validate: (req, { state, rules }) => {
      // state를 함께 넘긴다 — "누구의 버림패인가·어느 국인가"에 따라 달라지는
      // 조건부 규칙(복수자의 원수 한정 화료 등)을 증강이 표현할 수 있게 하는 통로.
      const needYaku = rules.resolve<boolean>("win.requiresYaku", {
        playerId: req.player,
        state,
      });
      if (state.round.phase === "turn.act") {
        if (!isTurnPlayer(state, req.player)) return "not your turn";
        if (state.round.lastDrawnTile === null) return "no drawn tile";
        const ev = evaluateWin(
          buildWinContext(state, req.player, "tsumo", state.round.lastDrawnTile, {
            rules,
          }),
          yaku,
        );
        if (ev === null) return "not a winning hand";
        if (needYaku && !ev.ok) return "no yaku";
        if (belowMinHan(ev, state, rules, req.player)) return "below minimum han";
        return null;
      }
      if (state.round.phase === "reaction") {
        const last = state.round.lastDiscard;
        const chankan = state.round.chankan;
        if (last === null && chankan === null) return "nothing to ron";
        if (chankan !== null && chankan.player === req.player) {
          return "cannot ron own kan";
        }
        if (last?.player === req.player) return "cannot ron own discard";
        // 이 사람의 버림은 론당하지 않는다 (천하무적) — playerId는 '쏘일 사람'
        const source = last?.player ?? chankan?.player;
        if (
          source !== undefined &&
          rules.resolve<boolean>("win.ronImmune", { playerId: source, state })
        ) {
          return "discarder is immune to ron";
        }
        if (
          rules.resolve<boolean>("win.furiten.enabled", {
            playerId: req.player,
            state,
          }) &&
          isFuriten(state, req.player, scoringOptionsOf(state, rules, req.player), rules)
        ) {
          return "furiten";
        }
        const ev = evaluateWin(
          buildWinContext(state, req.player, "ron", last?.tileId ?? chankan!.tileId, {
            rules,
          }),
          yaku,
        );
        if (ev === null) return "not a winning hand";
        // 안깡 챤깡은 표준상 국사만 — 성립하지 않는 깡(void_kan)이 이 예외를 연다
        if (
          chankan?.closedKan === true &&
          !isKokushiEvaluation(ev) &&
          !rules.resolve<boolean>("win.closedKanRobbable", {
            playerId: req.player,
            state,
          })
        ) {
          return "closed kan can only be robbed by kokushi";
        }
        if (needYaku && !ev.ok) return "no yaku";
        if (belowMinHan(ev, state, rules, req.player)) return "below minimum han";
        return null;
      }
      return "not a winning phase";
    },
    toEvents: (req, { state }) => {
      const tsumo = state.round.phase === "turn.act";
      const tileId = tsumo
        ? (state.round.lastDrawnTile as TileId)
        : ((state.round.lastDiscard?.tileId ?? state.round.chankan?.tileId) as TileId);
      const from = tsumo
        ? null
        : ((state.round.lastDiscard?.player ?? state.round.chankan?.player) as PlayerId);
      const payload: WinDeclaredPayload = {
        winner: req.player,
        from,
        tileId,
        winType: tsumo ? "tsumo" : "ron",
      };
      return [{ type: WIN_DECLARED, payload }];
    },
  };
}

const ponAction: ActionDef<{ tileIds: [TileId, TileId] }> = {
  type: "pon",
  validate: (req, { state, rules }) => {
    if (state.round.phase !== "reaction") return "not in reaction phase";
    if (wallIds(state).length === 0) return "no calls on the last discard";
    const last = state.round.lastDiscard;
    if (last === null) return "nothing to call";
    if (last.player === req.player) return "cannot call own discard";
    if (!rules.resolve<boolean>("call.pon.enabled", { playerId: req.player })) {
      return "pon is disabled";
    }
    if (rules.resolve<boolean>("call.blocked", { playerId: req.player, state })) {
      return "calls are sealed";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const [a, b] = req.payload.tileIds;
    if (a === b) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(a) || !hand.includes(b)) return "tiles not in hand";
    const target = kindOf(state, last.tileId);
    // 동수의 결속(mixedTriplets)이면 무늬를 안 가리고 랭크만, 양극(polarEnds)이면 같은
    // 무늬의 1·9를 같은 패로 보고 펑을 허용한다.
    const mixedTri = mixedTripletsFor(state, rules, req.player);
    const polar = polarEndsFor(state, rules, req.player);
    if (
      !sameCallKind(kindOf(state, a), target, mixedTri, polar) ||
      !sameCallKind(kindOf(state, b), target, mixedTri, polar)
    ) {
      return "tiles do not match the discard";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const last = state.round.lastDiscard as { player: PlayerId; tileId: TileId };
    return [
      {
        type: CALL_MADE,
        payload: {
          caller: req.player,
          from: last.player,
          meldKind: "pon",
          handTileIds: [...req.payload.tileIds],
          calledTileId: last.tileId,
        },
      },
    ];
  },
};

const chiAction: ActionDef<{ tileIds: [TileId, TileId] }> = {
  type: "chi",
  validate: (req, { state, rules }) => {
    if (state.round.phase !== "reaction") return "not in reaction phase";
    if (wallIds(state).length === 0) return "no calls on the last discard";
    const last = state.round.lastDiscard;
    if (last === null) return "nothing to call";
    if (last.player === req.player) return "cannot call own discard";
    const discarderSeat = playerOf(state, last.player).seat;
    const direction = rules.resolve<number>("turn.direction", { state });
    const fromAnyone = rules.resolve<boolean>("call.chi.fromAnyone", {
      playerId: req.player,
      state,
    });
    if (
      !fromAnyone &&
      playerOf(state, req.player).seat !== nextSeat(state, discarderSeat, direction)
    ) {
      return "chi is only allowed from the left player";
    }
    if (!rules.resolve<boolean>("call.chi.enabled", { playerId: req.player })) {
      return "chi is disabled";
    }
    if (rules.resolve<boolean>("call.blocked", { playerId: req.player, state })) {
      return "calls are sealed";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const [a, b] = req.payload.tileIds;
    if (a === b) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(a) || !hand.includes(b)) return "tiles not in hand";
    const kinds = [kindOf(state, a), kindOf(state, b), kindOf(state, last.tileId)];
    const opts = scoringOptionsOf(state, rules, req.player);
    // 바람의 계보(honorRuns)면 자패도 몸통이 된다 — 동남서·남서북·백발중을 칠 수 있다.
    // 손 안에서만 슌쯔로 인정되고 울 수는 없으면 "되는데 안 되는" 규칙이 되므로,
    // 분해와 같은 판정(isHonorRun)을 그대로 쓴다.
    if (opts.honorRuns === true && isHonorRun(kinds)) return null;
    // 무너진 국경(mixedRuns)이면 무늬가 섞여도 슌쯔다 — 수패이기만 하면 된다
    const mixedRun = opts.mixedRuns === true;
    if (!kinds.every((k) => DEFAULT_SEQUENCE_SUITS.has(k.suit))) {
      return "tiles cannot form a run";
    }
    if (!mixedRun) {
      const suit = kinds[0]?.suit as string;
      if (!kinds.every((k) => k.suit === suit)) return "tiles cannot form a run";
    }
    const wrap = opts.wrapRuns === true;
    if (!isRunRanks(kinds.map((k) => k.rank), wrap)) {
      return "tiles cannot form a run";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const last = state.round.lastDiscard as { player: PlayerId; tileId: TileId };
    return [
      {
        type: CALL_MADE,
        payload: {
          caller: req.player,
          from: last.player,
          meldKind: "chi",
          handTileIds: [...req.payload.tileIds],
          calledTileId: last.tileId,
        },
      },
    ];
  },
};

const ankanAction: ActionDef<{ tileIds: [TileId, TileId, TileId, TileId] }> = {
  type: "ankan",
  validate: (req, { state, rules }) => {
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (!isTurnPlayer(state, req.player)) return "not your turn";
    if (!rules.resolve<boolean>("call.kan.enabled", { playerId: req.player, state })) {
      return "kan is disabled";
    }
    if (wallIds(state).length === 0) return "cannot kan with empty wall";
    if (state.round.kanCount >= 4) return "kan limit reached";
    // 보충할 영상패가 없으면 깡을 칠 수 없다. 보통은 위 4회 상한이 먼저 걸리지만,
    // 왕패를 소모하는 증강(뒤집힌 모래시계)이 끼면 상한 전에 영상패가 마를 수 있다 —
    // 그때 깡을 허용하면 FlowController의 sys.drawRinshan이 실패해 국이 터진다.
    if (rinshanRemaining(state) === 0) return "no rinshan tiles left";
    const ids = req.payload.tileIds;
    if (new Set(ids).size !== 4) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!ids.every((id) => hand.includes(id))) return "tiles not in hand";
    const k = kindOf(state, ids[0]!);
    const mixedTri = mixedTripletsFor(state, rules, req.player);
    const kinds = ids.map((id) => kindOf(state, id));
    const allSame = ids.every((id) => sameCallKind(kindOf(state, id), k, mixedTri));
    // 바람의 계보(honorRuns) 보유자는 동·남·서·북 각 한 장을 '동남서북 깡'으로 낼 수 있다.
    const fourWinds =
      honorRunsFor(state, rules, req.player) && isFourWinds(kinds);
    // 장사진(call.snakeKan) 보유자는 같은 무늬 연속 4장(3-4-5-6)을 한 깡으로 낼 수 있다.
    const snake = snakeKanFor(state, rules, req.player) && isRunQuad(kinds);
    if (!allSame && !fourWinds && !snake) {
      return "tiles are not identical";
    }
    // 리치 중 안깡: 사풍깡은 항상 대기를 바꾸므로 리치 중엔 불가. 동일패 안깡만 안전성 판정.
    if (state.round.byPlayer[req.player]?.riichi != null) {
      if (
        fourWinds ||
        snake ||
        !isRiichiSafeAnkan(
          state,
          req.player,
          ids,
          scoringOptionsOf(state, rules, req.player),
        )
      ) {
        return "riichi: kan changes waits";
      }
    }
    return null;
  },
  toEvents: (req) => [
    {
      type: KAN_DECLARED,
      payload: {
        player: req.player,
        kanKind: "kan_closed",
        handTileIds: req.payload.tileIds,
      },
    },
  ],
};

const minkanAction: ActionDef<{ tileIds: [TileId, TileId, TileId] }> = {
  type: "minkan",
  validate: (req, { state, rules }) => {
    if (state.round.phase !== "reaction") return "not in reaction phase";
    if (!rules.resolve<boolean>("call.kan.enabled", { playerId: req.player, state })) {
      return "kan is disabled";
    }
    if (wallIds(state).length === 0) return "no calls on the last discard";
    if (state.round.kanCount >= 4) return "kan limit reached";
    // 보충할 영상패가 없으면 깡을 칠 수 없다. 보통은 위 4회 상한이 먼저 걸리지만,
    // 왕패를 소모하는 증강(뒤집힌 모래시계)이 끼면 상한 전에 영상패가 마를 수 있다 —
    // 그때 깡을 허용하면 FlowController의 sys.drawRinshan이 실패해 국이 터진다.
    if (rinshanRemaining(state) === 0) return "no rinshan tiles left";
    const last = state.round.lastDiscard;
    if (last === null) return "nothing to call";
    if (last.player === req.player) return "cannot call own discard";
    if (rules.resolve<boolean>("call.blocked", { playerId: req.player, state })) {
      return "calls are sealed";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const ids = req.payload.tileIds;
    if (new Set(ids).size !== 3) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!ids.every((id) => hand.includes(id))) return "tiles not in hand";
    const k = kindOf(state, last.tileId);
    const mixedTri = mixedTripletsFor(state, rules, req.player);
    if (!ids.every((id) => sameCallKind(kindOf(state, id), k, mixedTri))) {
      return "tiles do not match the discard";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const last = state.round.lastDiscard!;
    return [
      {
        type: KAN_DECLARED,
        payload: {
          player: req.player,
          kanKind: "kan_open",
          handTileIds: req.payload.tileIds,
          calledFrom: last.player,
          calledTileId: last.tileId,
        },
      },
    ];
  },
};

const shouminkanAction: ActionDef<{ tileId: TileId, targetMeldTileId: TileId }> = {
  type: "shouminkan",
  validate: (req, { state, rules }) => {
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (!isTurnPlayer(state, req.player)) return "not your turn";
    if (!rules.resolve<boolean>("call.kan.enabled", { playerId: req.player, state })) {
      return "kan is disabled";
    }
    if (wallIds(state).length === 0) return "cannot kan with empty wall";
    if (state.round.kanCount >= 4) return "kan limit reached";
    // 보충할 영상패가 없으면 깡을 칠 수 없다. 보통은 위 4회 상한이 먼저 걸리지만,
    // 왕패를 소모하는 증강(뒤집힌 모래시계)이 끼면 상한 전에 영상패가 마를 수 있다 —
    // 그때 깡을 허용하면 FlowController의 sys.drawRinshan이 실패해 국이 터진다.
    if (rinshanRemaining(state) === 0) return "no rinshan tiles left";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(req.payload.tileId)) return "tile not in hand";
    const rs = state.round.byPlayer[req.player];
    const mIdx = rs?.melds.findIndex((m) => m.kind === "pon" && m.tileIds.includes(req.payload.targetMeldTileId));
    if (mIdx === undefined || mIdx < 0) return "target pon meld not found";
    const k = kindOf(state, req.payload.tileId);
    const tk = kindOf(state, req.payload.targetMeldTileId);
    if (!sameCallKind(k, tk, mixedTripletsFor(state, rules, req.player))) {
      return "tile does not match the meld";
    }
    return null;
  },
  toEvents: (req) => [
    {
      type: KAN_DECLARED,
      payload: {
        player: req.player,
        kanKind: "kan_added",
        handTileIds: [req.payload.tileId],
        targetMeldTileId: req.payload.targetMeldTileId,
      },
    },
  ],
};

const kyushuKyuhaiAction: ActionDef<{}> = {
  type: "kyushuKyuhai",
  validate: (req, { state }) => {
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (!isTurnPlayer(state, req.player)) return "not your turn";
    if (!state.round.firstTurn) return "not the first turn";
    // 자신의 첫 쯔모(버림 이력 없음)에서만 선언 가능
    if ((state.round.byPlayer[req.player]?.discardedKinds.length ?? 0) > 0) {
      return "not your first draw";
    }
    const hand = handKindsOf(state, req.player);
    const termHonors = new Set(hand.filter(k => isTerminalOrHonor(k)).map(kindKey));
    if (termHonors.size < 9) return "less than 9 distinct terminals/honors";
    return null;
  },
  toEvents: () => [],
};

const passAction: ActionDef<{}> = {
  type: "pass",
  validate: (req, { state }) => {
    if (state.round.phase !== "reaction") return "not in reaction phase";
    return null;
  },
  toEvents: () => [],
};

// ─────────────────────────── 시스템 액션 ───────────────────────────

const sysOnly = (player: PlayerId): string | null =>
  player === SYSTEM_PLAYER ? null : "system action";

const sysStartRound: ActionDef<Record<string, never>> = {
  type: "sys.startRound",
  validate: (req, { state }) => {
    const guard = sysOnly(req.player);
    if (guard !== null) return guard;
    return state.round.phase === "setup" || state.round.phase === "round.over"
      ? null
      : "round already running";
  },
  toEvents: () => [{ type: ROUND_STARTED, payload: {} }],
};

const sysDraw: ActionDef<Record<string, never>> = {
  type: "sys.draw",
  validate: (req, { state }) => {
    const guard = sysOnly(req.player);
    if (guard !== null) return guard;
    if (state.round.phase !== "turn.draw") return "not in draw phase";
    if (wallIds(state).length === 0) return "wall is empty";
    return null;
  },
  toEvents: (_req, { state }) => [
    {
      type: TILE_DRAWN,
      payload: {
        player: playerAtSeat(state, state.round.turnSeat).id,
        tileId: wallIds(state)[0] as TileId,
        rinshan: false,
      },
    },
  ],
};

const sysDrawRinshan: ActionDef<Record<string, never>> = {
  type: "sys.drawRinshan",
  validate: (req, { state }) => {
    const guard = sysOnly(req.player);
    if (guard !== null) return guard;
    if (state.round.phase !== "turn.draw" && state.round.chankan === null) {
      return "not in draw phase";
    }
    // 영상패는 보충되지 않으므로 남은 장수로 판정한다 (깡 4회 = 영상패 4장이 상한).
    // 배열 길이로 보면 표시패 10장을 영상패로 착각해 도라 표시패를 손에 넣게 된다.
    if (rinshanRemaining(state) === 0) return "no rinshan tiles left";
    return null;
  },
  toEvents: (_req, { state }) => [
    {
      type: TILE_DRAWN,
      payload: {
        player: playerAtSeat(state, state.round.turnSeat).id,
        tileId: deadWallIds(state)[0] as TileId,
        rinshan: true,
      },
    },
  ],
};

const sysFlipDora: ActionDef<Record<string, never>> = {
  type: "sys.flipDora",
  validate: (req, { state }) => {
    const guard = sysOnly(req.player);
    if (guard !== null) return guard;
    // 표시패 자리는 왕패 뒤에서부터 센다 — 깡으로 앞이 비면 인덱스가 당겨지기 때문
    const nextIndicatorIndex = doraIndicatorIndex(state, state.round.doraIndicators.length);
    if (deadWallIds(state)[nextIndicatorIndex] === undefined) return "no tiles left for dora";
    return null;
  },
  toEvents: (_req, { state }) => {
    // 표시패 자리는 왕패 뒤에서부터 센다 — 깡으로 앞이 비면 인덱스가 당겨지기 때문
    const nextIndicatorIndex = doraIndicatorIndex(state, state.round.doraIndicators.length);
    return [
      {
        type: DORA_FLIPPED,
        payload: {
          tileId: deadWallIds(state)[nextIndicatorIndex] as TileId,
        },
      },
    ];
  },
};

const sysAdvanceTurn: ActionDef<Record<string, never>> = {
  type: "sys.advanceTurn",
  validate: (req, { state }) => {
    const guard = sysOnly(req.player);
    if (guard !== null) return guard;
    return state.round.phase === "reaction" ? null : "not in reaction phase";
  },
  toEvents: (_req, { state, rules }) => [
    {
      type: TURN_PASSED,
      payload: {
        nextSeat: nextSeat(
          state,
          state.round.turnSeat,
          rules.resolve<number>("turn.direction", { state }),
        ),
      },
    },
  ],
};

const sysMarkFuriten: ActionDef<{ player: PlayerId; permanent: boolean }> = {
  type: "sys.markFuriten",
  validate: (req, { state }) => {
    const guard = sysOnly(req.player);
    if (guard !== null) return guard;
    if (state.round.byPlayer[req.payload.player] === undefined) {
      return "unknown player";
    }
    return null;
  },
  toEvents: (req) => [
    {
      type: FURITEN_MARKED,
      payload: req.payload,
    },
  ],
};

export interface SettleWinRequest {
  wins: { winner: PlayerId; from: PlayerId | null; tileId: TileId; winType: "tsumo" | "ron" }[];
}

function advanceRound(
  state: GameState,
  direction: number,
): {
  roundNumber: number;
  prevalentWind: number;
  dealerSeat: number;
} {
  const roundNumber = state.round.roundNumber + 1;
  return {
    roundNumber: roundNumber > state.players.length ? 1 : roundNumber,
    prevalentWind:
      roundNumber > state.players.length
        ? state.round.prevalentWind + 1
        : state.round.prevalentWind,
    dealerSeat: nextSeat(state, state.round.dealerSeat, direction),
  };
}

function sysSettleWin(yaku: YakuRegistry): ActionDef<SettleWinRequest> {
  return {
    type: "sys.settleWin",
    validate: (req) => {
      const guard = sysOnly(req.player);
      if (guard !== null) return guard;
      return req.payload.wins.length > 0 ? null : "no wins to settle";
    },
    toEvents: (req, { state, rules }) => {
      const deltas: Record<PlayerId, number> = {};
      for (const p of state.players) deltas[p.id] = 0;
      let dealerWon = false;
      // 만년 오야가 자로서 연장을 가져온 경우의 새 오야 자리 (없으면 null)
      let keepDealerSeat: number | null = null;
      const winInfos: WinInfo[] = [];

      req.payload.wins.forEach((w, i) => {
        const ev = evaluateWin(
          buildWinContext(state, w.winner, w.winType, w.tileId, {
            includeUra: true,
            rules,
            ...(w.from != null ? { from: w.from } : {}),
          }),
          yaku,
        );
        const needYaku = rules.resolve<boolean>("win.requiresYaku", {
          playerId: w.winner,
          state,
        });
        if (ev === null || (needYaku && !ev.ok)) {
          throw new Error(`Invalid win by ${w.winner}`);
        }
        const isDealer =
          playerOf(state, w.winner).seat === state.round.dealerSeat;
        // 연장(렌짱) — 실제 오야이거나, 오야 자리를 가져오는 증강(만년 오야)이 켠 경우
        if (isDealer) {
          dealerWon = true;
        } else if (
          rules.resolve<boolean>("round.keepDealer", {
            playerId: w.winner,
            state,
          })
        ) {
          dealerWon = true;
          /*
           * 자(子)로서 화료했는데 연장이 켜졌다 = **오야 자리를 가져온다**.
           *
           * ⚠ 예전에는 dealerWon만 세워서 `dealerSeat`가 **그 국의 실제 오야 그대로** 남았다.
           * 그러면 화료한 보유자가 자기 연장 횟수를 소모해 **남의 오야를 늘려 주는** 꼴이었다
           * (2026-07-29 감사). 만년 오야는 자기 자리를 오야로 만드는 능력이므로 좌석을 옮긴다.
           */
          keepDealerSeat = playerOf(state, w.winner).seat;
        }
        // 오야 취급 증강 (win.treatAsDealer) — 점수 계산만 오야, 연장은 실제 오야만
        const scoresAsDealer =
          isDealer ||
          rules.resolve<boolean>("win.treatAsDealer", {
            playerId: w.winner,
            state,
          });
        // 증강이 더하는 추가 판 (score.extraHan) — 역만에는 적용하지 않는다
        const extraHan =
          ev.yakumanCount > 0
            ? 0
            : Math.max(
                0,
                rules.resolve<number>("score.extraHan", {
                  playerId: w.winner,
                  state,
                }),
              );
        const totalHan = ev.han + extraHan;
        const score = calculateScore({
          han: totalHan,
          fu: ev.fu,
          yakumanCount: ev.yakumanCount,
          isDealer: scoresAsDealer,
          winType: w.winType,
        });
        // 본장 1개당 지불액 — 본장 사냥꾼이 자기 화료에만 올린다 (기본 300)
        const honbaPerStick = Math.max(
          0,
          rules.resolve<number>("score.honbaPerStick", {
            playerId: w.winner,
            state,
          }),
        );
        if (w.winType === "ron") {
          const honbaBonus = i === 0 ? state.round.honba * honbaPerStick : 0;
          const total = score.total + honbaBonus;
          deltas[w.winner] = (deltas[w.winner] ?? 0) + total;
          if (w.from !== null) deltas[w.from] = (deltas[w.from] ?? 0) - total;
        } else {
          const honbaEach = Math.round((state.round.honba * honbaPerStick) / 3);
          for (const p of state.players) {
            if (p.id === w.winner) continue;
            const share =
              (scoresAsDealer
                ? score.payments.others
                : p.seat === state.round.dealerSeat
                  ? score.payments.dealer
                  : score.payments.others) ?? 0;
            deltas[p.id] = (deltas[p.id] ?? 0) - share - honbaEach;
            deltas[w.winner] = (deltas[w.winner] ?? 0) + share + honbaEach;
          }
        }
        winInfos.push({
          winner: w.winner,
          from: w.from,
          winType: w.winType,
          winningTileId: w.tileId,
          han: totalHan,
          fu: ev.fu,
          yakumanCount: ev.yakumanCount,
          extraHan,
          yaku: ev.yaku.map((y) => ({ id: y.id, name: y.name, han: y.han })),
          doraHan: ev.doraHan,
          uraHan: ev.uraHan,
          redHan: ev.redHan,
          points: score.total,
          limit: score.limit,
        });
      });

      // 리치 선언패가 그대로 론당하면 리치 불성립 — 공탁 1000점을 선언자에게
      // 반환한다 (표준 룰). 선언 직후(ippatsu 유효)의 자기 버림패 론이 그 경우다.
      const first = req.payload.wins[0] as {
        winner: PlayerId;
        from: PlayerId | null;
        winType: "tsumo" | "ron";
      };
      let riichiRefund = 0;
      if (
        first.winType === "ron" &&
        first.from !== null &&
        state.round.chankan === null
      ) {
        const fromRs = state.round.byPlayer[first.from];
        if (fromRs?.riichi != null && fromRs.riichi.ippatsu) {
          riichiRefund = Math.min(
            rules.resolve<number>("riichi.cost", {
              playerId: first.from,
              state,
            }),
            state.round.riichiPot,
          );
          deltas[first.from] = (deltas[first.from] ?? 0) + riichiRefund;
        }
      }
      const firstWinner = first.winner;
      deltas[firstWinner] =
        (deltas[firstWinner] ?? 0) + state.round.riichiPot - riichiRefund;

      const next = dealerWon
        ? {
            roundNumber: state.round.roundNumber,
            prevalentWind: state.round.prevalentWind,
            dealerSeat: keepDealerSeat ?? state.round.dealerSeat,
          }
        : advanceRound(state, rules.resolve<number>("turn.direction", { state }));

      const payload: RoundSettledPayload = {
        outcome: "win",
        deltas,
        dealerSeat: next.dealerSeat,
        honba: dealerWon ? state.round.honba + 1 : 0,
        riichiPot: 0,
        roundNumber: next.roundNumber,
        prevalentWind: next.prevalentWind,
        winInfos,
        dealerContinues: dealerWon,
      };
      return [{ type: ROUND_SETTLED, payload }];
    },
  };
}

const sysSettleDraw: ActionDef<Record<string, never>> = {
  type: "sys.settleDraw",
  validate: (req, { state }) => {
    const guard = sysOnly(req.player);
    if (guard !== null) return guard;
    if (state.round.phase !== "turn.draw") return "not in draw phase";
    return wallIds(state).length === 0 ? null : "wall is not empty";
  },
  toEvents: (_req, { state, rules }) => {
    const tenpai = state.players.filter(
      (p) =>
        // 승승장구: 유국 시 항상 텐파이 취급 (실제 손과 무관)
        rules.resolve<boolean>("draw.treatAsTenpai", {
          playerId: p.id,
          state,
        }) ||
        winningKinds(
          winHandKindsOf(state, rules, p.id),
          meldCountOf(state, p.id),
          undefined,
          scoringOptionsOf(state, rules, p.id),
        ).length > 0,
    );
    const noten = state.players.filter((p) => !tenpai.includes(p));
    const deltas: Record<PlayerId, number> = {};
    for (const p of state.players) deltas[p.id] = 0;
    // 노텐 면제 증강 (draw.notenExempt): 벌점을 내지 않고 분배에서도 빠진다
    const payingNoten = noten.filter(
      (p) =>
        !rules.resolve<boolean>("draw.notenExempt", { playerId: p.id, state }),
    );
    if (tenpai.length > 0 && payingNoten.length > 0) {
      const penalty = rules.resolve<number>("draw.notenPenalty");
      for (const p of payingNoten) deltas[p.id] = -penalty / payingNoten.length;
      for (const p of tenpai) deltas[p.id] = penalty / tenpai.length;
    }
    const dealerTenpai = tenpai.some((p) => p.seat === state.round.dealerSeat);
    const next = dealerTenpai
      ? {
          roundNumber: state.round.roundNumber,
          prevalentWind: state.round.prevalentWind,
          dealerSeat: state.round.dealerSeat,
        }
      : advanceRound(state, rules.resolve<number>("turn.direction", { state }));
    const payload: RoundSettledPayload = {
      outcome: "draw",
      deltas,
      dealerSeat: next.dealerSeat,
      honba: state.round.honba + 1,
      riichiPot: state.round.riichiPot,
      roundNumber: next.roundNumber,
      prevalentWind: next.prevalentWind,
      // 유국 증강이 "누가 노텐인가"를 delta 부호로 추정하지 않도록 실제 집계를 싣는다
      tenpaiPlayers: tenpai.map((p) => p.id),
      dealerContinues: dealerTenpai,
    };
    return [{ type: ROUND_SETTLED, payload }];
  },
};

/** 도중유국 요청 — 사유는 판정한 FlowController가 넣는다 (결과 화면 표시용) */
export interface SettleAbortRequest {
  reason?: AbortReason;
}

const sysSettleAbort: ActionDef<SettleAbortRequest> = {
  type: "sys.settleAbort",
  validate: (req) => sysOnly(req.player),
  toEvents: (req, { state }) => {
    const reason = req.payload?.reason;
    const payload: RoundSettledPayload = {
      outcome: "abort",
      deltas: Object.fromEntries(state.players.map((p) => [p.id, 0])),
      dealerSeat: state.round.dealerSeat,
      honba: state.round.honba + 1,
      riichiPot: state.round.riichiPot,
      roundNumber: state.round.roundNumber,
      prevalentWind: state.round.prevalentWind,
      // 도중유국은 친이 넘어가지 않는다 (연장이 아니라 같은 국을 다시 치는 것)
      dealerContinues: true,
      // 구 리플레이(사유 없는 로그)와 섞이므로 값이 있을 때만 싣는다
      ...(reason !== undefined ? { abortReason: reason } : {}),
    };
    return [{ type: ROUND_SETTLED, payload }];
  },
};

// ─────────────────────────── 등록 ───────────────────────────

export function defineStandardFlowRules(rules: RuleRegistry): void {
  rules.define("riichi.cost", 1000);
  rules.define("riichi.minWallTiles", 4);
  rules.define("riichi.requiresClosed", true);
  rules.define<"beforeRinshan" | "afterDiscard">("dora.kanTiming", "beforeRinshan");
  rules.define("call.pon.enabled", true);
  rules.define("call.chi.enabled", true);
  /**
   * 이 플레이어가 깡(안깡·대명깡·가깡)을 칠 수 있는가.
   *
   * 깡은 멘쯔 수를 늘려 **손패 장수 방정식을 바꾼다**. 리치 시점의 손패를 스냅샷으로
   * 고정해 대기를 판정하는 증강(자유 선언)은 스냅샷이 멘쯔 수 변화를 모르므로,
   * 그 상태에서 깡을 허용하면 분해가 어긋나 대기가 통째로 사라진다(소프트락).
   * 그런 증강이 보유자에 한해 false로 잠근다.
   */
  rules.define("call.kan.enabled", true);
  rules.define("draw.notenPenalty", 3000);
  rules.define("win.requiresYaku", true);
  rules.define("win.furiten.enabled", true);

  // ── 증강 확장 지점 (기본값 = 표준 리치마작) ──
  /** 성립 금지 역 id 목록 (혼일 봉인 등) */
  rules.define<string[]>("win.blockedYaku", []);
  /** 점수 계산 시 오야 취급 (연장은 실제 오야만) */
  rules.define("win.treatAsDealer", false);
  /** 화료 시 추가 판 (역만 제외) — 동적 Modifier가 state에서 계산한다 */
  rules.define("score.extraHan", 0);
  /** 리치를 걸지 않은 손도 뒷도라를 센다 (숨은 칼날). ctx에 winType·isClosed가 온다 */
  rules.define("scoring.uraWithoutRiichi", false);
  /** 이 사람의 버림패는 론당하지 않는다 (천하무적). playerId는 '쏘일 사람' */
  rules.define("win.ronImmune", false);
  /** 버릴 수 없는 패 kindKey 목록 (전부 봉인이면 소프트락 방지 허용) */
  rules.define<string[]>("discard.blockedKinds", []);
  /** 치를 아무에게서나 (우선순위: 펑 > 원격 치 > 일반 치) */
  rules.define("call.chi.fromAnyone", false);
  /** 유국 시 노텐 벌점 면제 */
  rules.define("draw.notenExempt", false);
  /** 혼색 슌쯔 (2만-3통-4삭) 허용 — 무너진 국경 */
  rules.define("scoring.mixedRuns", false);
  /** 혼색 커쯔 (2만-2통-2삭) 허용 — 무너진 국경. 치뿐 아니라 펑·깡도 무늬를 안 가린다 */
  rules.define("scoring.mixedTriplets", false);
  /** 순환 슌쯔 (8-9-1, 9-1-2) 허용 — 부숴진 벽 */
  rules.define("scoring.wrapRuns", false);
  /** 표준형에 필요한 멘쯔 수 (진짜 용 = 5) */
  rules.define("scoring.totalSets", 4);
  /** 요구패 펑 1개를 국사 구성으로 인정 */
  rules.define("scoring.kokushiMeldAssist", false);
  /** 국사무쌍에서 빠져도 되는 요구패 종류 수 (왕의 징표 = 중복 허용). 기본 0 = 표준 13종 */
  rules.define("scoring.kokushiDupes", 0);
  /** 1·9만으로 커쯔 몸통(199·191·911) 허용 — 양극 */
  rules.define("scoring.polarEnds", false);
  /** 치또이 쌍을 무늬 무관 rank로 인정(1만+1통) — 비대칭 치또이 */
  rules.define("scoring.chiitoiMixedPairs", false);
  /** 자패 슌쯔 허용(동남서·남서북·백발중) — 바람의 계보 */
  rules.define("scoring.honorRuns", false);
  /** 같은 무늬 연속 4장(3-4-5-6)을 한 깡으로 — 장사진 */
  rules.define("call.snakeKan", false);
  /** 리치 선언에 텐파이를 요구한다 (공성계 = 가짜 리치 허용 시 false) */
  rules.define("riichi.requiresTenpai", true);
  /** 즉시 우승 문턱 점수 (천하통일 = 60000). 0 = 비활성. shouldEnd가 정산 직후 확인 */
  rules.define("match.instantWinScore", 0);
  /** 배패 장수 (진짜 용 = 16) */
  rules.define("deal.handSize", 13);
  /**
   * 화료·대기·후리텐·텐파이 판정에 쓸 손패 타일 id 대체 목록 (기본 null = 실제 손패).
   * 자유 선언(free_riichi_discard)이 리치 시점 손패 스냅샷을 보유자에게만 얹어,
   * 이후 물리 손패를 자유롭게 버려도 오름패·화료형이 첫 리치 손패로 고정되게 한다.
   */
  rules.define<readonly TileId[] | null>("hand.winTileIds", null);
  /** 턴 진행 방향 (1=표준, -1=역방향) */
  rules.define("turn.direction", 1);
  /**
   * 게임 종료 시 플레이어 최종 점수에 더해지는 보정값 (기본 0).
   * 순위 계산(calcRankings) 직전에 playerId·state를 넘겨 resolve하며, 계약 위약금·
   * 가불 상환·이면 장부 등 "게임 끝에 정산되는" 증강이 동적 Modifier로 얹는다.
   */
  rules.define("score.finalAdjust", 0);

  // ── 52차(2026-07-22) 신규 훅 — docs/16 §1b·§1c 증강이 쓰는 확장 지점 ──
  /**
   * 이 사람은 리치를 선언할 수 없다 (리치 봉인). playerId = **선언하려는 사람**.
   * 표준 riichi는 물론 커스텀 리치 액션(오픈 리치·올인 리치)도 같은 규칙을 봐야 한다.
   */
  rules.define("riichi.blocked", false);
  /**
   * 화료에 필요한 최소 판 수 (기본 0 = 제한 없음). playerId = 화료하려는 사람.
   * 역만은 이 검사를 받지 않는다 — 격(rank_gate)이 "싼 손 속공"만 막게 하기 위함.
   */
  rules.define("win.minHan", 0);
  /**
   * 이 사람의 리치를 타인 뷰에서 감춘다 (스텔스 리치). playerId = 리치한 사람.
   * PlayerView가 riichiDeclared·doubleRiichi·riichiTileIndex를 타인에게 숨긴다.
   */
  rules.define("riichi.hidden", false);
  /**
   * 안깡도 창깡으로 잡을 수 있다 (기본 false = 국사만 가능하다는 표준 예외).
   * playerId = 챤깡하려는 사람.
   */
  rules.define("win.closedKanRobbable", false);
  /**
   * 본장 1개당 지불액 (론 기준, 기본 300 — 쯔모는 1/3씩 나눠 낸다).
   * playerId = 화료자. 본장 사냥꾼이 자기 화료에만 올린다.
   */
  rules.define("score.honbaPerStick", 300);
  /**
   * 채점상의 자풍 고정값 (1=동 … 4=북, 기본 null = 실제 자리에서 계산).
   * playerId = 화료자. 만년 오야가 자풍을 동으로 고정한다.
   */
  rules.define<number | null>("scoring.seatWind", null);
  /**
   * 이 사람이 화료하면 오야가 유지된다(연장). playerId = 화료자.
   * 실제 오야가 아니어도 연장을 가져오는 만년 오야용.
   */
  rules.define("round.keepDealer", false);

  // ── 5차 §2b(2026-07-25) 신규 훅 — docs/16 §2b 증강이 쓰는 확장 지점 ──
  /**
   * 유국 정산에서 이 사람을 항상 텐파이로 취급한다 (승승장구). playerId = 그 사람.
   * 실제 손이 노텐이어도 텐파이 분배를 받고 노텐 벌점을 내지 않는다. 노텐 벌점 총액은
   * `draw.notenPenalty`(기본 3000) 그대로다.
   */
  rules.define("draw.treatAsTenpai", false);
  /**
   * 이 사람은 후로(치·펑·깡)할 수 없다 (함구령). playerId = **울려는 사람**.
   * 각 콜 validate가 이 규칙을 보고 거부하며, FlowController 후보 생성도 함께 건너뛴다.
   */
  rules.define("call.blocked", false);
}

export function registerStandardActions(
  actions: ActionRegistry,
  yaku: YakuRegistry,
): void {
  actions.register(discardAction);
  actions.register(riichiAction);
  actions.register(winAction(yaku));
  actions.register(ponAction);
  actions.register(chiAction);
  actions.register(ankanAction);
  actions.register(minkanAction);
  actions.register(shouminkanAction);
  actions.register(kyushuKyuhaiAction);
  actions.register(passAction);
  actions.register(sysStartRound);
  actions.register(sysDraw);
  actions.register(sysDrawRinshan);
  actions.register(sysFlipDora);
  actions.register(sysAdvanceTurn);
  actions.register(sysMarkFuriten);
  actions.register(sysSettleWin(yaku));
  actions.register(sysSettleDraw);
  actions.register(sysSettleAbort);
}
