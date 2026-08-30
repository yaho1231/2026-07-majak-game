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
import { DEAD_WALL, WALL, discardsZone } from "../../engine/zones/Zone.js";
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
import { findPao, round100 } from "./pao.js";
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
  isFuritenAsRon,
  kindOf,
  meldCountOf,
  openMeldCountOf,
  nextSeat,
  playerAtSeat,
  playerOf,
  scoringOptionsOf,
  sameCallBody,
  sameCallKind,
  lockedDiscardIds,
  mixedTripletsFor,
  polarEndsFor,
  sameCallQuad,
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
  // 노텐 리치(대기 ∅)는 지킬 대기가 없어 `sameKindSet(∅, ∅)`이 **어떤 안깡이든**
  // 통과시킨다. 그러면 공성계(siege_riichi) 같은 노텐 리치 카드가 대기와 무관한
  // 아무 안깡으로 사깡산료를 만들어 국을 무효화하고, 카드가 약속한 노텐 벌부를
  // 회피할 수 있다(QA verify-score 확정 4). 대기가 없는 리치는 손이 완전히 잠긴다.
  // 진짜 리치는 언제나 텐파이라 이 줄에 걸리지 않는다.
  if (before.length === 0) return false;
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
 * **증강이 막아서** 화료가 성립하지 않을 때 win.validate가 돌려주는 사유.
 *
 * 이 두 가지는 "손이 안 됐다·후리텐이다" 같은 표준 사유와 다르다 — 손은 다 됐는데
 * 남의 증강이 막은 것이라, 조용히 건너뛰면 당한 쪽은 **왜 론 버튼이 안 뜨는지 영영
 * 모른다**(no_ron_pact 주석의 그 문제다). FlowController가 이 사유를 자물쇠 표시
 * (`DecisionPrompt.locked`)로 옮겨 화면에 잠긴 론/쯔모 버튼을 세운다.
 *
 * ⚠ 문자열을 바꾸면 자물쇠가 조용히 사라진다 — 반드시 이 상수를 통해 쓴다.
 */
export const WIN_BLOCKED_MIN_HAN = "below minimum han";
export const WIN_BLOCKED_RON_IMMUNE = "discarder is immune to ron";

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
    // 봉인된 패 — 리치 예외·소프트락 예외까지 얹은 최종 판정을 쓴다.
    // 화면의 자물쇠(PlayerView)도 같은 함수를 쓴다 — 갈라지면 거짓 UI가 된다.
    if (lockedDiscardIds(state, rules, req.player, hand).has(req.payload.tileId)) {
      return "tile is sealed";
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
    // 봉인된 패는 리치 선언으로도 버릴 수 없다 — discardAction과 같은 규칙을 탄다.
    // 여기에 검사가 없어서 봉인술사가 잠근 패를 "리치 한 번"으로 털어낼 수 있었다
    // (docs/25 방해 #2). 손패 전부가 봉인이면 소프트락 방지를 위해 허용하는 예외도 같다.
    // (리치 중 재검사는 하지 않는다 — 리치를 걸면 쯔모기리가 강제되므로 선택지가 없다.)
    // (선언 시점에는 아직 리치가 아니므로 lockedDiscardIds의 리치 예외는 걸리지 않고,
    //  소프트락 예외만 적용된다 — 종전 동작과 같다.)
    if (lockedDiscardIds(state, rules, req.player, handIds).has(req.payload.tileId)) {
      return "tile is sealed";
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
        // 바닥에서 주워 온 '쯔모패'라면 후리텐을 적용한다 (win.tsumoFuriten 주석 참고).
        // 표준 쯔모는 이 규칙이 false라 예전과 완전히 같다.
        if (
          rules.resolve<boolean>("win.tsumoFuriten", {
            playerId: req.player,
            state,
          }) &&
          rules.resolve<boolean>("win.furiten.enabled", {
            playerId: req.player,
            state,
          }) &&
          isFuritenAsRon(
            state,
            req.player,
            state.round.lastDrawnTile,
            scoringOptionsOf(state, rules, req.player),
            rules,
          )
        ) {
          return "furiten";
        }
        const ev = evaluateWin(
          buildWinContext(state, req.player, "tsumo", state.round.lastDrawnTile, {
            rules,
          }),
          yaku,
        );
        if (ev === null) return "not a winning hand";
        if (needYaku && !ev.ok) return "no yaku";
        if (belowMinHan(ev, state, rules, req.player)) return WIN_BLOCKED_MIN_HAN;
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
        /*
         * 이 사람의 버림은 론당하지 않는다 (천하무적·불가침 조약) — playerId는 '쏘일 사람'.
         *
         * 이 검사는 **손이 실제로 화료형인지 다 본 뒤**에 온다. 예전엔 evaluateWin보다
         * 앞이라, 텐파이도 아닌 사람이 물어도 "면역"이 돌아왔다 — 판정 결과는 어차피
         * 거부라 같았지만, 지금은 이 사유가 곧 화면의 자물쇠라서 위치가 곧 정보가 된다.
         * 앞에 두면 **아무 관계 없는 사람에게까지 잠긴 론 버튼**이 뜬다.
         */
        const source = last?.player ?? chankan?.player;
        if (
          source !== undefined &&
          rules.resolve<boolean>("win.ronImmune", { playerId: source, state })
        ) {
          return WIN_BLOCKED_RON_IMMUNE;
        }
        if (belowMinHan(ev, state, rules, req.player)) return WIN_BLOCKED_MIN_HAN;
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
    /*
     * 세 장을 **한 규칙 안에서** 판정한다 (2026-08-23 QA synergy3 shape 확정 2).
     *
     * 예전에는 버림패와 손패 한 장씩을 따로 비교했다. 그래서 동수의 결속(랭크만 맞으면 됨)과
     * 양극(같은 무늬의 1·9)을 함께 들면 **어느 카드로도 몸통이 아닌 잡종 펑**이 통과했다 —
     * `{1만, 9만, 1통}`은 "9만↔1만"이 양극으로, "1통↔1만"이 결속으로 각각 통과하는데
     * 셋을 한꺼번에 보면 어느 규칙도 만족하지 않는다. 채점은 그걸 몸통으로 세었다.
     * 후보 생성(FlowController)은 이미 `sameCallBody`로 닫혔고, 여기는 **직접 제출**을
     * 막는 마지막 그물이다.
     */
    if (!sameCallBody(target, kindOf(state, a), kindOf(state, b), mixedTri, polar)) {
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
    // 후로(치·펑) 직후에는 깡을 칠 수 없다 — 깡은 **쯔모한 순**의 권리다(표준 룰).
    // turn.act에서 lastDrawnTile이 null인 경우는 CALL_MADE 직후뿐이라(배패·턴 넘김은
    // turn.draw) 이 한 줄이 정확히 "울고 나서 바로 깡"만 막는다.
    // 예: 1삭 3장에서 1삭을 펑 → 남은 1삭으로 그 순에 가깡, 은 성립하지 않는다.
    //     다음 자기 순에 쯔모하고 나면 정상적으로 칠 수 있다 (2026-07-31 사용자 확정).
    if (state.round.lastDrawnTile === null) return "must draw before calling a kan";
    const ids = req.payload.tileIds;
    if (new Set(ids).size !== 4) return "duplicate tile ids";
    const hand = handIdsOf(state, req.player);
    if (!ids.every((id) => hand.includes(id))) return "tiles not in hand";
    const mixedTri = mixedTripletsFor(state, rules, req.player);
    // 양극(polarEnds)도 깡 재료를 연다 — 같은 무늬의 1·9 넉 장(1만1만9만9만)이 한 깡이다.
    // 동수의 결속을 함께 들면 무늬까지 지워진다(helpers.sameCallQuad).
    const polar = polarEndsFor(state, rules, req.player);
    const kinds = ids.map((id) => kindOf(state, id));
    const allSame = sameCallQuad(kinds, mixedTri, polar);
    // 바람의 계보(honorRuns) 보유자는 동·남·서·북 각 한 장을 '동남서북 깡'으로 낼 수 있다.
    const fourWinds =
      honorRunsFor(state, rules, req.player) && isFourWinds(kinds);
    // 장사진(call.snakeKan) 보유자는 같은 무늬 연속 4장(3-4-5-6)을 한 깡으로 낼 수 있다.
    // 끝없는 윤회(scoring.wrapRuns)를 함께 들고 있으면 8-9-1-2처럼 9를 넘는 연속도 깡이 된다.
    const snake =
      snakeKanFor(state, rules, req.player) &&
      isRunQuad(kinds, scoringOptionsOf(state, rules, req.player).wrapRuns === true);
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
    const polar = polarEndsFor(state, rules, req.player);
    // 넉 장을 **한꺼번에** 본다 — 규칙끼리 섞인 잡종 깡을 막는 그물(sameCallBody와 같은 규약).
    if (!sameCallQuad([k, ...ids.map((id) => kindOf(state, id))], mixedTri, polar)) {
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
    // 후로(치·펑) 직후에는 깡을 칠 수 없다 — 깡은 **쯔모한 순**의 권리다(표준 룰).
    // turn.act에서 lastDrawnTile이 null인 경우는 CALL_MADE 직후뿐이라(배패·턴 넘김은
    // turn.draw) 이 한 줄이 정확히 "울고 나서 바로 깡"만 막는다.
    // 예: 1삭 3장에서 1삭을 펑 → 남은 1삭으로 그 순에 가깡, 은 성립하지 않는다.
    //     다음 자기 순에 쯔모하고 나면 정상적으로 칠 수 있다 (2026-07-31 사용자 확정).
    if (state.round.lastDrawnTile === null) return "must draw before calling a kan";
    if (state.round.byPlayer[req.player]?.riichi != null) return "riichi: cannot call";
    const hand = handIdsOf(state, req.player);
    if (!hand.includes(req.payload.tileId)) return "tile not in hand";
    const rs = state.round.byPlayer[req.player];
    const mIdx = rs?.melds.findIndex((m) => m.kind === "pon" && m.tileIds.includes(req.payload.targetMeldTileId));
    if (mIdx === undefined || mIdx < 0) return "target pon meld not found";
    const k = kindOf(state, req.payload.tileId);
    const tk = kindOf(state, req.payload.targetMeldTileId);
    // 양극(polarEnds)이면 같은 무늬의 1·9가 한 패로 통한다 — detail이 예시로 든
    // "1만1만9만 + 1만"이 서려면 여기서도 그 규칙을 봐야 한다. 넘기지 않으면
    // 얹는 패가 **멘쯔 대표와 같은 랭크일 때만** 통해, 퐁한 순서에 따라 1만만 되거나
    // 9만만 되는 반쪽이 된다(qa-lab text 확정 21).
    if (
      !sameCallKind(
        k,
        tk,
        mixedTripletsFor(state, rules, req.player),
        polarEndsFor(state, rules, req.player),
      )
    ) {
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

/**
 * 다음 국으로 넘긴다 (연장이 아닐 때).
 *
 * ⚠ 다음 오야는 **로테이션 기준 자리**(round.rotationSeat)에서 뽑는다. 그 국의 실제
 * 오야(dealerSeat)에서 뽑으면 오야 자리를 옮기는 증강(찬탈자·만년 오야)이 한 번
 * 개입한 것만으로 로테이션이 통째로 어긋나, 한 장 안에서 어떤 자리는 오야를 두 번
 * 하고 어떤 자리는 한 번도 못 한다 — 국 번호는 무조건 +1로 오르기 때문이다.
 * (구 상태·리플레이에는 rotationSeat가 없으므로 dealerSeat로 폴백한다.)
 */
function advanceRound(
  state: GameState,
  direction: number,
): {
  roundNumber: number;
  prevalentWind: number;
  dealerSeat: number;
  rotationSeat: number;
} {
  const roundNumber = state.round.roundNumber + 1;
  const rotation = state.round.rotationSeat ?? state.round.dealerSeat;
  const nextRotation = nextSeat(state, rotation, direction);
  return {
    roundNumber: roundNumber > state.players.length ? 1 : roundNumber,
    prevalentWind:
      roundNumber > state.players.length
        ? state.round.prevalentWind + 1
        : state.round.prevalentWind,
    dealerSeat: nextRotation,
    rotationSeat: nextRotation,
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
        // 증강이 더하는 추가 판 (score.extraHan) — 역만에는 적용하지 않는다.
        // 어느 증강이 몇 판을 얹었는지도 함께 받아 둔다: 여러 증강이 공유하는 합계라
        // 둘 이상 겹치면 결과 화면의 "증강 보너스 3판" 한 줄로는 출처를 알 수 없었다.
        const extraBreakdown =
          ev.yakumanCount > 0
            ? { total: 0, parts: [] as { source: string; delta: number }[] }
            : rules.resolveBreakdown("score.extraHan", { playerId: w.winner, state });
        const extraHan = ev.yakumanCount > 0 ? 0 : Math.max(0, extraBreakdown.total);
        /** 증강별 기여 — source(`aug:{좌석}:{증강id}`)에서 증강 id만 떼어 낸다 */
        const extraHanBy = extraBreakdown.parts
          .map((part) => {
            const m = /^aug:[^:]+:(.+)$/.exec(part.source);
            return m === null ? null : { augId: m[1] as string, han: part.delta };
          })
          .filter((x): x is { augId: string; han: number } => x !== null && x.han > 0);
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
        /*
         * 책임지불(파오) — 대삼원·대사희를 확정시킨 후로를 내준 사람 (01 §9).
         *
         * 역만이 여러 개 복합했으면 **파오 대상 역의 몫만** 넘긴다. 역만 점수는
         * 배수에 정비례하므로 units 비율이 곧 금액 비율이다.
         * 본장·공탁은 파오를 따라가지 않는다 — 본장은 "이 국을 끝낸 사람"에게
         * 붙는 벌금이라 방총자(쯔모면 셋)의 몫으로 남긴다 (통용 룰).
         */
        const paoEnabled = rules.resolve<boolean>("score.pao", {
          playerId: w.winner,
          state,
        });
        const pao =
          paoEnabled && ev.yakumanCount > 0
            ? findPao(
                state,
                w.winner,
                ev.yaku.map((y) => y.id),
              )
            : null;
        // 파오분이 전체 화료점에서 차지하는 비율 (0이면 파오 없음)
        const paoRatio =
          pao === null
            ? 0
            : Math.min(1, pao.units / Math.max(1, ev.yakumanCount));
        const paoTotal = pao === null ? 0 : round100(score.total * paoRatio);
        /** 책임자가 실제로 문 금액 (표시·검증용) */
        let paoCharged = 0;

        /** 이 화료가 받는 본장 가산분 — 결과 화면이 큰 숫자에 함께 굴린다 */
        let honbaGain = 0;
        if (w.winType === "ron") {
          const honbaBonus = i === 0 ? state.round.honba * honbaPerStick : 0;
          honbaGain = honbaBonus;
          const total = score.total + honbaBonus;
          deltas[w.winner] = (deltas[w.winner] ?? 0) + total;
          if (w.from !== null) {
            /*
             * 론 파오는 **책임자와 방총자가 파오분을 절반씩** 진다 (통용 룰,
             * 천봉·대부분의 작장). 01 §9는 "확정시킨 후로에 적용"까지만 정하고
             * 분담 방식을 정하지 않아 가장 널리 쓰이는 쪽을 택했다.
             * 파오 대상이 아닌 부분·본장은 방총자가 전액 진다.
             */
            const paoHalf =
              pao !== null && pao.responsible !== w.from
                ? round100(paoTotal / 2)
                : 0;
            if (paoHalf > 0) {
              deltas[pao!.responsible] =
                (deltas[pao!.responsible] ?? 0) - paoHalf;
              paoCharged = paoHalf;
            }
            deltas[w.from] = (deltas[w.from] ?? 0) - (total - paoHalf);
          }
        } else {
          const honbaEach = Math.round((state.round.honba * honbaPerStick) / 3);
          /*
           * 쯔모 파오는 **책임자 혼자 파오분 전액**을 낸다 (3분할 없음).
           * 남은 부분(다른 역만·본장)만 평소대로 나눈다.
           */
          let paoAssigned = 0;
          for (const p of state.players) {
            if (p.id === w.winner) continue;
            const full =
              (scoresAsDealer
                ? score.payments.others
                : p.seat === state.round.dealerSeat
                  ? score.payments.dealer
                  : score.payments.others) ?? 0;
            const share = pao === null ? full : round100(full * (1 - paoRatio));
            paoAssigned += full - share;
            deltas[p.id] = (deltas[p.id] ?? 0) - share - honbaEach;
            deltas[w.winner] = (deltas[w.winner] ?? 0) + share + honbaEach;
            honbaGain += honbaEach;
          }
          if (pao !== null && paoAssigned > 0) {
            deltas[pao.responsible] =
              (deltas[pao.responsible] ?? 0) - paoAssigned;
            deltas[w.winner] = (deltas[w.winner] ?? 0) + paoAssigned;
            paoCharged = paoAssigned;
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
          ...(extraHanBy.length > 0 ? { extraHanBy } : {}),
          yaku: ev.yaku.map((y) => ({ id: y.id, name: y.name, han: y.han })),
          // 채점이 고른 몸통 구성 — 결과 화면이 손을 몸통 단위로 끊어 그린다
          ...(ev.shape !== undefined ? { shape: ev.shape } : {}),
          doraHan: ev.doraHan,
          uraHan: ev.uraHan,
          redHan: ev.redHan,
          ...(ev.augDoraHan > 0 ? { augDoraHan: ev.augDoraHan } : {}),
          // 실역 0개 화료 — 여기까지 왔다는 건 needYaku가 꺼져 있었다는 뜻이다
          ...(ev.ok ? {} : { yakuless: true }),
          points: score.total,
          ...(honbaGain > 0 ? { honbaBonus: honbaGain } : {}),
          // 표준 분담 — 쯔모의 "친 3,900 / 자 2,000씩"이 화면 어디에도 없었다.
          // 오야 취급 증강이 걸리면 친 몫이 따로 없으므로(scoresAsDealer) 자 몫만 싣는다.
          payments:
            w.winType === "ron"
              ? { discarder: score.payments.discarder ?? score.total }
              : scoresAsDealer
                ? { others: score.payments.others ?? 0 }
                : {
                    dealer: score.payments.dealer ?? 0,
                    others: score.payments.others ?? 0,
                  },
          limit: score.limit,
          ...(pao !== null && paoCharged > 0
            ? {
                pao: {
                  responsible: pao.responsible,
                  yakuId: pao.yakuId,
                  points: paoCharged,
                },
              }
            : {}),
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
          // 실제로 낸 만큼만 돌려준다. 공탁을 내지 않는 리치(스텔스 리치 등)가
          // 규칙 상수를 그대로 받아 가면 없던 점수가 생기고, 그만큼 화료자가
          // 공탁을 덜 받는다(docs/25 최우선#2). 손으로 조립한 구 상태에만 규칙값 폴백.
          const paid =
            fromRs.riichi.cost ??
            rules.resolve<number>("riichi.cost", { playerId: first.from, state });
          riichiRefund = Math.min(paid, state.round.riichiPot);
          deltas[first.from] = (deltas[first.from] ?? 0) + riichiRefund;
        }
      }
      const firstWinner = first.winner;
      const riichiPotGain = state.round.riichiPot - riichiRefund;
      deltas[firstWinner] = (deltas[firstWinner] ?? 0) + riichiPotGain;
      // 공탁은 **첫 화료자에게만** 간다. 더블론이면 두 번째 화료자는 못 받는데 그
      // 사실도 화면에 없었다 — 받은 사람 쪽에만 실어 준다.
      if (riichiPotGain > 0) {
        const firstInfo = winInfos.find((info) => info.winner === firstWinner);
        if (firstInfo !== undefined) firstInfo.riichiPotGain = riichiPotGain;
      }

      const next = dealerWon
        ? {
            roundNumber: state.round.roundNumber,
            prevalentWind: state.round.prevalentWind,
            dealerSeat: keepDealerSeat ?? state.round.dealerSeat,
            // 연장은 국 번호를 소모하지 않으므로 로테이션 기준도 그대로다.
            // (만년 오야가 오야 자리를 자기 쪽으로 끌어와도 순번은 안 건드린다.)
            rotationSeat: state.round.rotationSeat ?? state.round.dealerSeat,
          }
        : advanceRound(state, rules.resolve<number>("turn.direction", { state }));

      const payload: RoundSettledPayload = {
        outcome: "win",
        deltas,
        dealerSeat: next.dealerSeat,
        rotationSeat: next.rotationSeat,
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

/**
 * 유국만관(流し満貫) 성립 좌석 — 황패유국 시 판정한다.
 *
 * 조건은 정통 규칙 그대로다.
 * ① 그 국에 버린 패가 **한 장도 빠짐없이** 요구패(1·9 수패)나 자패이고, 한 장 이상이다.
 * ② 그 버림패를 **아무도 울어 가지 않았다.**
 *
 * ②는 바닥에 남은 장수와 버린 이력의 길이를 견줘 본다 — 울려 나간 패는 바닥에서
 * 빠지지만 이력에는 남는다. (누명처럼 명의가 옮겨 가는 경우도 둘이 같은 사람에게
 * 기록되므로 이 비교가 그대로 성립한다.)
 *
 * 판정을 `draw.nagashiMangan` 규칙으로 감싸 두는 이유: 유국역만 증강은 ②를 없애고
 * 만관 대신 역만을 지불하는 **다른 규칙**이라, 보유자에게는 이 표준 경로가 돌면 안 된다.
 * 그 증강이 자기 규칙을 꺼서 중복 지불을 막는다.
 */
function kindFromDiscardKey(key: string): TileKind | null {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  return m === null ? null : { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
}

function nagashiManganSeats(state: GameState, rules: RuleRegistry): PlayerId[] {
  const out: PlayerId[] = [];
  for (const p of state.players) {
    if (!rules.resolve<boolean>("draw.nagashiMangan", { playerId: p.id, state })) continue;
    const all = state.round.byPlayer[p.id]?.discardedKinds ?? [];
    if (all.length === 0) continue;
    /*
     * **버림 이력을 갈아 끼우는 증강**(거신병 각성)이 남긴 기준선 앞은 건너뛴다.
     *
     * 각성은 요구패 이력을 통째로 지우고 내려보낸 손패(중장패)를 대신 넣는다 —
     * 13면 후리텐을 푸는 정당한 처리다. 그런데 그 가짜 이력을 그대로 검사하면
     * **각성 조건("요구패 13종을 내가 전부 버려 뒀다")을 만족한 국의 유국만관이
     * 통째로 사라진다**(2026-08-23 QA synergy3 shape 확정 3).
     * 기준선 뒤 = 각성 이후에 실제로 버린 패이고, 그것만 검사한다
     * (각성 뒤에 잡패를 버리면 유국만관은 여전히 깨진다).
     */
    const base = Math.max(
      0,
      Math.min(all.length, rules.resolve<number>("draw.nagashiHistoryBase", {
        playerId: p.id,
        state,
      })),
    );
    const history = base > 0 ? all.slice(base) : all;
    // 이력은 문자열 스냅샷이라 tileId가 없다 — 종류만 알면 요구패 판정에는 충분하다.
    // 파싱에 실패한 키는 요구패가 아닌 것으로 본다(성립을 넓히지 않는 쪽으로 막는다).
    if (
      !history.every((key) => {
        const k = kindFromDiscardKey(key);
        return k !== null && isTerminalOrHonor(k);
      })
    ) {
      continue;
    }
    // 하나라도 울려 나갔으면 불성립 (기준선 앞은 각성이 만든 자리라 이력 전체로 견준다)
    if ((state.zones[discardsZone(p.id)]?.tileIds.length ?? 0) !== all.length) continue;
    out.push(p.id);
  }
  return out;
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
    /*
     * 유국만관 — 노텐 벌점을 정산한 **뒤에** 쯔모 만관 지불을 얹는다(표준 처리).
     *
     * 용어사전이 오래도록 이 규칙을 설명하고 있었는데 엔진에는 판정이 없었다.
     * 요구패만 버린 플레이어는 사전이 알려 준 대로 만관을 기대했지만 아무것도
     * 받지 못했다 — 화면이 규칙을 거짓으로 말한 자리였다.
     */
    const nagashi = nagashiManganSeats(state, rules);
    for (const id of nagashi) {
      const seat = playerOf(state, id).seat;
      const isDealer = seat === state.round.dealerSeat;
      const score = calculateScore({ han: 5, fu: 30, isDealer, winType: "tsumo" });
      for (const p of state.players) {
        if (p.id === id) continue;
        const pay =
          (isDealer
            ? score.payments.others
            : p.seat === state.round.dealerSeat
              ? score.payments.dealer
              : score.payments.others) ?? 0;
        deltas[p.id] = (deltas[p.id] ?? 0) - pay;
        deltas[id] = (deltas[id] ?? 0) + pay;
      }
    }

    const dealerTenpai = tenpai.some((p) => p.seat === state.round.dealerSeat);
    const next = dealerTenpai
      ? {
          roundNumber: state.round.roundNumber,
          prevalentWind: state.round.prevalentWind,
          dealerSeat: state.round.dealerSeat,
          // 텐파이야메(연장)도 국 번호를 소모하지 않는다 — 기준 자리 유지
          rotationSeat: state.round.rotationSeat ?? state.round.dealerSeat,
        }
      : advanceRound(state, rules.resolve<number>("turn.direction", { state }));
    const payload: RoundSettledPayload = {
      outcome: "draw",
      deltas,
      dealerSeat: next.dealerSeat,
      rotationSeat: next.rotationSeat,
      honba: state.round.honba + 1,
      riichiPot: state.round.riichiPot,
      roundNumber: next.roundNumber,
      prevalentWind: next.prevalentWind,
      // 유국 증강이 "누가 노텐인가"를 delta 부호로 추정하지 않도록 실제 집계를 싣는다
      tenpaiPlayers: tenpai.map((p) => p.id),
      dealerContinues: dealerTenpai,
      ...(nagashi.length > 0
        ? {
            drawSpecial: {
              augId: "nagashi_mangan",
              label: "유국만관 — 버림패가 전부 요구패·자패",
              ...(nagashi[0] !== undefined ? { holder: nagashi[0] } : {}),
            },
          }
        : {}),
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
      rotationSeat: state.round.rotationSeat ?? state.round.dealerSeat,
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
  /**
   * 이 사람의 화료에는 **단계 상한이 없다** (뚫린 천장).
   *
   * 채점 본체가 읽는 값이 아니라, "+N판"을 점수로 환산하는 쪽
   * (`content/util.ts` winPointsWithExtraHan)이 같은 곡선을 쓰게 하는 스위치다.
   * 이게 없던 시절에는 상한 해제가 **실판 계열에만** 걸리고 뱅크 환산 계열은
   * 표준 계단에 다시 잘려, 같은 "+3판"이 6,000점 갈렸다(QA synergy3 score 확정 6).
   */
  rules.define("score.uncapped", false);
  /** 화료 시 추가 판 (역만 제외) — 동적 Modifier가 state에서 계산한다 */
  rules.define("score.extraHan", 0);
  /*
   * **정산 시점에 얹히는 보너스 판** (`addWinHanBonus` 계열). `score.extraHan`과 달리
   * 이 값은 채점(`calculateScore`)에 들어가지 않는다 — 정산 인터셉터가 «그 판수로 다시
   * 계산한 점수 − 실제 점수»만큼을 뱅크에서 지급하기 때문이다(무페널티 원칙).
   *
   * 그런데 관전 패널은 **화료자가 실제로 받는 값**을 적어야 한다. 인터셉터는 부작용 없이
   * 미리 태울 수 없으므로, 증강이 같은 함수를 이 규칙으로도 한 번 더 내놓게 해서
   * 관전 쪽이 «질의»할 수 있게 한다 (`information/spectateScore.ts`).
   * 해석 문맥에 `winInfo`(가상 화료)가 실려 온다.
   */
  rules.define("score.settleHanBonus", 0);
  // 유국만관 — 표준 규칙(01_GAME_RULES). 유국역만 증강이 보유자에게만 끈다.
  rules.define("draw.nagashiMangan", true);
  /**
   * 버림 이력을 갈아 끼운 증강이 남기는 **기준선** — 유국만관 판정은 이 인덱스 뒤만 본다.
   * (거신병 각성이 요구패 이력을 중장패로 갈아 끼운다. 위 `nagashiManganSeats` 주석.)
   */
  rules.define("draw.nagashiHistoryBase", 0);
  /** 리치를 걸지 않은 손도 뒷도라를 센다 (숨은 칼날). ctx에 winType·isClosed가 온다 */
  rules.define("scoring.uraWithoutRiichi", false);
  /**
   * 이 사람에게만 얹히는 **개인 도라 종류** (거울의 도라·도라의 잔상).
   *
   * 표시패에서 나온 표준 도라에 이어 붙는다 — `countDora`가 중복을 그대로 세므로
   * 표준 도라와 겹치면 자연히 중첩된다. 화료 문맥을 만들 때 한 번 resolve되며,
   * 손패·후로·**화료패**를 전부 포함한 정상 도라 계산 경로를 그대로 탄다.
   * (`score.extraHan`으로 흉내 내면 화료패가 손패 Zone에 없는 론에서 한 장이 샌다.)
   */
  rules.define<readonly TileKind[]>("scoring.extraDoraKinds", []);
  /** 위의 뒷도라판 — 뒷도라를 세는 손(리치·숨은 칼날)에만 얹힌다 */
  rules.define<readonly TileKind[]>("scoring.extraUraDoraKinds", []);
  /** 이 사람의 버림패는 론당하지 않는다 (천하무적). playerId는 '쏘일 사람' */
  rules.define("win.ronImmune", false);
  /** 버릴 수 없는 패 kindKey 목록 (전부 봉인이면 소프트락 방지 허용) */
  rules.define<string[]>("discard.blockedKinds", []);
  /**
   * 버릴 수 없는 **개별 패**(tileId) 목록 — 종류가 아니라 지목된 그 한 장만 잠근다.
   *
   * 종류 단위 봉인(`discard.blockedKinds`)은 봉인 뒤에 **새로 들어온 같은 종류**까지
   * 함께 잠근다. 봉인술사처럼 "그 순간 손에 있던 패 2장"만 묶는 능력에는 그게 과했다
   * (2026-07-31 사용자 보고). 이쪽은 잠근 그 패가 손을 떠나면 자연히 풀린다.
   * 전부 봉인이면 소프트락 방지로 허용하는 것은 종류 봉인과 같다.
   */
  rules.define<TileId[]>("discard.blockedTileIds", []);
  /** 치를 아무에게서나 (우선순위: 펑 > 원격 치 > 일반 치) */
  rules.define("call.chi.fromAnyone", false);
  /** 유국 시 노텐 벌점 면제 */
  rules.define("draw.notenExempt", false);
  /** 혼색 슌쯔 (2만-3통-4삭) 허용 — 무너진 국경 */
  rules.define("scoring.mixedRuns", false);
  /** 혼색 커쯔 (2만-2통-2삭) 허용 — 무너진 국경. 치뿐 아니라 펑·깡도 무늬를 안 가린다 */
  rules.define("scoring.mixedTriplets", false);
  /**
   * 혼색 머리 (2만-2통) 허용 — 랭크만 맞으면 작두가 선다.
   * 뒤섞인 아홉 개의 연꽃처럼 **랭크 공간에서만 화료형을 세우는** 증강이 켠다.
   * 슌쯔·커쯔만 열어 두면 머리가 같은 무늬 2장으로 묶이는 손만 화료할 수 있어,
   * 대기 27종 중 3종만 오름패가 되는 반쪽 대기가 된다(2026-08-01 사용자 보고).
   */
  rules.define("scoring.mixedPairs", false);
  /** 순환 슌쯔 (8-9-1, 9-1-2) 허용 — 부숴진 벽 */
  rules.define("scoring.wrapRuns", false);
  /**
   * 증강의 ±1 숫자 이동이 1↔9를 넘어 순환한다 — 끝없는 윤회(2026-08-27).
   * 채점 분해와 무관하므로 `scoring.*`(= DecomposeOptions)이 아니라 손패 축에 둔다.
   * 연금술사(9→1 · 1→9)와 한 끗 차이(9 대기에 1을 잡아도 밀린다)가 읽는다.
   */
  rules.define("hand.wrapRanks", false);
  /** 표준형에 필요한 멘쯔 수 (진짜 용 = 5) */
  rules.define("scoring.totalSets", 4);
  /** 요구패 펑 1개를 국사 구성으로 인정 */
  rules.define("scoring.kokushiMeldAssist", false);
  /** 국사무쌍에서 빠져도 되는 요구패 종류 수 (왕의 징표 = 중복 허용). 기본 0 = 표준 13종 */
  rules.define("scoring.kokushiDupes", 0);
  /** 1·9만으로 커쯔 몸통(199·191·911) 허용 — 양극 */
  rules.define("scoring.polarEnds", false);
  /**
   * **지금 이 사람의 쯔모 화료를 묻지 않고 그대로 성립시킨다** (turn.act 한정).
   *
   * "그 패로 화료한다"고 적힌 증강(무덤 도굴)이 패만 가져다 놓고 다시 «쯔모» 버튼을
   * 기다리면, 카드가 약속한 한 동작이 두 박자로 갈라진다(2026-08-31 사용자 보고).
   * FlowController가 턴 프롬프트를 세우기 전에 이 규칙을 보고, 켜져 있고 표준 `win`이
   * 합법이면 그 자리에서 정산으로 보낸다 — 화료 판정·정산 경로는 표준 그대로다.
   */
  rules.define("turn.autoWin", false);
  /** 치또이 쌍을 무늬 무관 rank로 인정(1만+1통) — 비대칭 치또이 */
  rules.define("scoring.chiitoiMixedPairs", false);
  /** 자패 슌쯔 허용(동남서·남서북·백발중) — 바람의 계보 */
  rules.define("scoring.honorRuns", false);
  /** 손패에서 무엇이든 될 수 있는 패(조커)의 종류 — 조커. 기본 없음 */
  rules.define<readonly TileKind[]>("scoring.wildKinds", []);
  /**
   * 조커가 **넓힌** 대기까지 후리텐으로 셀 것인가. 기본 false —
   * 조커가 없었어도 잡을 수 있었던 패만 후리텐을 만든다 (helpers.furitenOptionsOf).
   */
  rules.define("win.furiten.countWildWaits", false);
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
  /*
   * 게임 **종국 시** 점수 보정 (계약 위약금·가불 상환 등).
   *
   * 지금 이 값을 건드리는 증강은 하나도 없다 — 감사 §10-11이 "죽은 확장점"으로
   * 지목한 자리다. **그래도 남긴다**, 이유는 셋이다.
   *   ① 소비 지점이 이미 정확히 한 곳(`HanchanController`의 최종 정산)이고,
   *      값이 0이면 그 자리는 덧셈 한 번이다 — 비용이 사실상 0이다.
   *   ② 걷어내면 되살릴 때 정산 순서를 다시 정해야 한다. 정산 단계는 이 저장소가
   *      가장 여러 번 틀렸던 자리다(`settleStages.ts` 이력).
   *   ③ `unification.ts`가 "증강별 하드코딩 없이 규칙으로 얹는" 본보기로 이 키를
   *      가리키고 있다 — 지우면 그 주석이 없는 것을 가리킨다.
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
   * **지금 손에 든 그 '쯔모패'가 사실은 남의 바닥에서 온 패**라 쯔모 화료에도
   * 후리텐을 적용한다 (기본 false = 표준 쯔모는 후리텐과 무관).
   * playerId = 화료하려는 사람.
   *
   * 후리텐은 "내가 이미 버린 종류로는 **남의 버림으로** 나지 못한다"는 벌이다.
   * 패산에서 스스로 뽑은 패에는 걸리지 않는 것이 표준이지만, 바닥의 패를 주워
   * 그 패로 나는 증강(날치기)은 이름만 쯔모일 뿐 실체가 "남이 버린 패로 화료"다.
   * 그 증강이 자기 차례에만 이 규칙을 켠다.
   */
  rules.define("win.tsumoFuriten", false);
  /**
   * 본장 1개당 지불액 (론 기준, 기본 300 — 쯔모는 1/3씩 나눠 낸다).
   * playerId = 화료자. 본장 사냥꾼이 자기 화료에만 올린다.
   */
  rules.define("score.honbaPerStick", 300);
  /**
   * 책임지불(파오) 적용 여부 (01 §9). playerId = 화료자.
   * 대삼원·대사희를 확정시킨 후로를 내준 사람이 그 역만분을 책임진다.
   */
  rules.define("score.pao", true);
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
