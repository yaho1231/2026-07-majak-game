/**
 * standardActions — 표준 리치마작 액션 (플레이어 + 시스템).
 * 모든 합법성 판정은 여기 validate에 있다 — 프롬프트도 여기서 유도된다.
 *
 * 설계: docs/11_GAME_FLOW.md §3
 */

import type { ActionDef, ActionRegistry } from "../../engine/actions/ActionRegistry.js";
import { FIRST_DORA_INDEX } from "../../engine/state/GameState.js";
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
import { DEFAULT_SEQUENCE_SUITS } from "../scoring/decompose.js";
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
import type { RoundSettledPayload, WinDeclaredPayload, WinInfo } from "./flowEvents.js";
import {
  SYSTEM_PLAYER,
  buildWinContext,
  handIdsOf,
  handKindsOf,
  isFuriten,
  kindOf,
  meldCountOf,
  nextSeat,
  playerAtSeat,
  playerOf,
  scoringOptionsOf,
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

/** 세 rank가 순자를 이루는가 (wrap이면 8-9-1, 9-1-2도 허용) */
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
    if (
      rules.resolve<boolean>("riichi.requiresClosed", { playerId: req.player }) &&
      meldCountOf(state, req.player) > 0
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
    if (winningKinds(after, melds, undefined, opts).length === 0) {
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
      const needYaku = rules.resolve<boolean>("win.requiresYaku", {
        playerId: req.player,
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
        if (
          rules.resolve<boolean>("win.furiten.enabled", { playerId: req.player }) &&
          isFuriten(state, req.player, scoringOptionsOf(state, rules, req.player))
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
        if (chankan?.closedKan === true && !isKokushiEvaluation(ev)) {
          return "closed kan can only be robbed by kokushi";
        }
        if (needYaku && !ev.ok) return "no yaku";
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
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const [a, b] = req.payload.tileIds;
    if (a === b) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(a) || !hand.includes(b)) return "tiles not in hand";
    const target = kindOf(state, last.tileId);
    if (!sameKind(kindOf(state, a), target) || !sameKind(kindOf(state, b), target)) {
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
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const [a, b] = req.payload.tileIds;
    if (a === b) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(a) || !hand.includes(b)) return "tiles not in hand";
    const kinds = [kindOf(state, a), kindOf(state, b), kindOf(state, last.tileId)];
    const suit = kinds[0]?.suit as string;
    if (!kinds.every((k) => k.suit === suit) || !DEFAULT_SEQUENCE_SUITS.has(suit)) {
      return "tiles cannot form a run";
    }
    const wrap = scoringOptionsOf(state, rules, req.player).wrapRuns === true;
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
    if (wallIds(state).length === 0) return "cannot kan with empty wall";
    if (state.round.kanCount >= 4) return "kan limit reached";
    const ids = req.payload.tileIds;
    if (new Set(ids).size !== 4) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!ids.every((id) => hand.includes(id))) return "tiles not in hand";
    const k = kindOf(state, ids[0]!);
    if (!ids.every((id) => sameKind(kindOf(state, id), k))) return "tiles are not identical";
    if (
      state.round.byPlayer[req.player]?.riichi != null &&
      !isRiichiSafeAnkan(
        state,
        req.player,
        ids,
        scoringOptionsOf(state, rules, req.player),
      )
    ) {
      return "riichi: kan changes waits";
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
  validate: (req, { state }) => {
    if (state.round.phase !== "reaction") return "not in reaction phase";
    if (wallIds(state).length === 0) return "no calls on the last discard";
    if (state.round.kanCount >= 4) return "kan limit reached";
    const last = state.round.lastDiscard;
    if (last === null) return "nothing to call";
    if (last.player === req.player) return "cannot call own discard";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const ids = req.payload.tileIds;
    if (new Set(ids).size !== 3) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!ids.every((id) => hand.includes(id))) return "tiles not in hand";
    const k = kindOf(state, last.tileId);
    if (!ids.every((id) => sameKind(kindOf(state, id), k))) return "tiles do not match the discard";
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
  validate: (req, { state }) => {
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (!isTurnPlayer(state, req.player)) return "not your turn";
    if (wallIds(state).length === 0) return "cannot kan with empty wall";
    if (state.round.kanCount >= 4) return "kan limit reached";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(req.payload.tileId)) return "tile not in hand";
    const rs = state.round.byPlayer[req.player];
    const mIdx = rs?.melds.findIndex((m) => m.kind === "pon" && m.tileIds.includes(req.payload.targetMeldTileId));
    if (mIdx === undefined || mIdx < 0) return "target pon meld not found";
    const k = kindOf(state, req.payload.tileId);
    const tk = kindOf(state, req.payload.targetMeldTileId);
    if (!sameKind(k, tk)) return "tile does not match the meld";
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
    if (deadWallIds(state).length === 0) return "dead wall is empty";
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
    const nextIndicatorIndex = FIRST_DORA_INDEX + state.round.doraIndicators.length * 2;
    if (deadWallIds(state)[nextIndicatorIndex] === undefined) return "no tiles left for dora";
    return null;
  },
  toEvents: (_req, { state }) => {
    const nextIndicatorIndex = FIRST_DORA_INDEX + state.round.doraIndicators.length * 2;
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
      const winInfos: WinInfo[] = [];

      req.payload.wins.forEach((w, i) => {
        const ev = evaluateWin(
          buildWinContext(state, w.winner, w.winType, w.tileId, {
            includeUra: true,
            rules,
          }),
          yaku,
        );
        const needYaku = rules.resolve<boolean>("win.requiresYaku", {
          playerId: w.winner,
        });
        if (ev === null || (needYaku && !ev.ok)) {
          throw new Error(`Invalid win by ${w.winner}`);
        }
        const isDealer =
          playerOf(state, w.winner).seat === state.round.dealerSeat;
        if (isDealer) dealerWon = true;
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
        if (w.winType === "ron") {
          const honbaBonus = i === 0 ? state.round.honba * 300 : 0;
          const total = score.total + honbaBonus;
          deltas[w.winner] = (deltas[w.winner] ?? 0) + total;
          if (w.from !== null) deltas[w.from] = (deltas[w.from] ?? 0) - total;
        } else {
          const honbaEach = state.round.honba * 100;
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
            dealerSeat: state.round.dealerSeat,
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
        winningKinds(
          handKindsOf(state, p.id),
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
    };
    return [{ type: ROUND_SETTLED, payload }];
  },
};

const sysSettleAbort: ActionDef<Record<string, never>> = {
  type: "sys.settleAbort",
  validate: (req) => sysOnly(req.player),
  toEvents: (_req, { state }) => {
    const payload: RoundSettledPayload = {
      outcome: "abort",
      deltas: Object.fromEntries(state.players.map((p) => [p.id, 0])),
      dealerSeat: state.round.dealerSeat,
      honba: state.round.honba + 1,
      riichiPot: state.round.riichiPot,
      roundNumber: state.round.roundNumber,
      prevalentWind: state.round.prevalentWind,
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
  /** 버릴 수 없는 패 kindKey 목록 (전부 봉인이면 소프트락 방지 허용) */
  rules.define<string[]>("discard.blockedKinds", []);
  /** 치를 아무에게서나 (우선순위: 펑 > 원격 치 > 일반 치) */
  rules.define("call.chi.fromAnyone", false);
  /** 유국 시 노텐 벌점 면제 */
  rules.define("draw.notenExempt", false);
  /** 순환 순자 (8-9-1, 9-1-2) 허용 — 부숴진 벽 */
  rules.define("scoring.wrapRuns", false);
  /** 표준형에 필요한 멘쯔 수 (진짜 용 = 5) */
  rules.define("scoring.totalSets", 4);
  /** 요구패 펑 1개를 국사 구성으로 인정 */
  rules.define("scoring.kokushiMeldAssist", false);
  /** 배패 장수 (진짜 용 = 16) */
  rules.define("deal.handSize", 13);
  /** 턴 진행 방향 (1=표준, -1=역방향) */
  rules.define("turn.direction", 1);
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
