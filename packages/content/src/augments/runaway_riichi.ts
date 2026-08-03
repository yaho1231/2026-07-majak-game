/**
 * 폭주 리치 (runaway_riichi, prism) — "리치를 걸고, 다섯 순을 혼자 달린다".
 *
 * (2국에 1회) 텐파이 상태에서 자기 순에 발동한다. 버릴 패를 고르면 그 패로 **리치를
 * 선언**하고, 그대로 **연속 5쯔모**에 들어간다 — 상대 셋의 순을 건너뛰고 내가 다섯 번
 * 연달아 뽑고 버린다. 텐파이 손이 다섯 순을 한꺼번에 당겨 오는 셈이라, 남은 패산이
 * 두터울수록 화력이 크다.
 *
 * **다섯 순은 공짜가 아니다.** 그동안 내가 버리는 다섯 장은 평소대로 전부 론 대상이고,
 * **타가가 후로(치·펑·대명깡)하는 순간 폭주는 그 자리에서 끝난다** — 후로한 사람에게
 * 순서가 넘어가고 남은 연속 쯔모는 사라진다. 즉 상대에게는 "울어서 끊는다"는 분명한
 * 대응 수단이 있다(Rule #4).
 *
 * 구현 (코어 변경 없음 — 뒤집힌 모래시계의 솔로 쯔모 계열):
 * - 커스텀 액션 `blitz_riichi{tileId}` — 표준 리치와 **같은 조건**을 검사하고
 *   `TILE_DISCARDED{riichi:true}`를 낸다. 리치 성립·공탁·일발 판정은 전부 표준 경로다.
 * - `TURN_PASSED` **Interceptor**가 남은 횟수가 있는 동안 nextSeat을 보유자로 고정한다.
 * - `TILE_DRAWN` 리액션이 보유자의 **패산 쯔모**를 셀 때마다 남은 횟수를 줄인다.
 *   영상 쯔모(내 깡)는 세지 않는다 — 깡이 스스로 주는 보너스지 폭주분이 아니다.
 * - `CALL_MADE`·`KAN_DECLARED`(대명깡) 리액션이 **타가의 후로**를 보면 남은 횟수를 0으로
 *   지운다. 후로는 턴을 그 사람에게 옮기므로 고정도 함께 풀려야 한다.
 * - 국의 순번을 실제로 5순 소모한다(패산에서 5장이 빠진다) — 해저가 그만큼 앞당겨진다.
 */

import {
  CALL_MADE,
  KAN_DECLARED,
  TILE_DISCARDED,
  TILE_DRAWN,
  TURN_PASSED,
  WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindOf,
  meldCountOf,
  openMeldCountOf,
  playerAtSeat,
  playerOf,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  CallMadePayload,
  GameState,
  KanDeclaredPayload,
  PlayerId,
  ProposedEvent,
  TileDrawnPayload,
  TileId,
  TurnPassedPayload,
} from "@majak/core";
import {
  counterOf,
  roundKey,
  roundSeqOf,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";

const ID = "runaway_riichi";
const ACTION = "blitz_riichi";

/** 연속으로 가져오는 쯔모 횟수 */
const BLITZ_DRAWS = 5;
/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;

const usedSeqKey = (h: PlayerId): string => `${ID}:usedSeq:${h}`;
/** 이번 국에 남은 연속 쯔모 횟수 */
const leftKey = (state: GameState, h: PlayerId): string =>
  `${ID}:left:${roundKey(state)}:${h}`;

const leftOf = (state: GameState, h: PlayerId): number =>
  counterOf(state, leftKey(state, h));

const offCooldown = (state: GameState, h: PlayerId): boolean => {
  const used = state.augmentData[usedSeqKey(h)];
  if (typeof used !== "number") return true;
  return roundSeqOf(state, ID, h) - used >= COOLDOWN_ROUNDS;
};

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

const blitzAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no runaway_riichi augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!offCooldown(state, req.player)) return "on cooldown";
    if (leftOf(state, req.player) > 0) return "already running";

    // ── 아래는 표준 리치와 같은 조건 ──
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
    const cost = rules.resolve<number>("riichi.cost", { playerId: req.player, state });
    if (playerOf(state, req.player).score < cost) return "not enough points";
    if (wallLen(state) < rules.resolve<number>("riichi.minWallTiles")) {
      return "not enough wall tiles";
    }
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) return "tile not in hand";
    // 텐파이는 이 증강의 발동 조건이다 — 공성계(블러프 리치)로는 폭주할 수 없다.
    const after = handIds
      .filter((t) => t !== req.payload.tileId)
      .map((t) => kindOf(state, t));
    const opts = scoringOptionsOf(state, rules, req.player);
    if (winningKinds(after, meldCountOf(state, req.player), undefined, opts).length === 0) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => [
    // 표준 리치와 완전히 같은 버림 — 공탁·일발·더블리치 판정이 전부 표준 경로를 탄다
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
    augmentDataSet(leftKey(state, req.player), BLITZ_DRAWS),
    augmentDataSet(usedSeqKey(req.player), roundSeqOf(state, ID, req.player)),
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), BLITZ_DRAWS),
  ],
};

export const runawayRiichi: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  name: "폭주 리치",
  description:
    "(2국에 1회) 텐파이 상태에서 발동하면 그 패로 리치를 걸고 연속 5쯔모에 들어간다 — 상대 셋의 순을 건너뛰고 혼자 다섯 번 뽑는다. 타가가 후로하면 그 자리에서 끝난다.",
  detail:
    "(2국에 1회) 텐파이 상태의 자기 순에 발동한다. 버릴 패를 고르면 그 패로 리치를 선언하고, 그대로 연속 5쯔모에 들어간다 — 상대 셋의 순서를 건너뛰고 다섯 번 연달아 뽑고 버린다. 리치 자체는 표준과 완전히 같아 공탁·일발·더블리치가 평소대로 판정된다.\n\n연속 쯔모는 국의 순번을 실제로 소모한다. 패산에서 다섯 장이 빠지므로 해저가 그만큼 앞당겨지고, 그 다섯 장은 상대에게 돌아가지 않는다. 자신이 깡을 쳐서 뽑는 영상패는 폭주분에 세지 않는다.\n\n그동안 자신이 버리는 다섯 장은 평소대로 전부 론 대상이며, 타가가 후로(치·펑·대명깡)하는 순간 폭주는 즉시 끝나고 순서가 그 사람에게 넘어간다 — 상대에게는 울어서 끊는다는 분명한 대응 수단이 있다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) engine.actions.register(blitzAction);

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID);

    // 손패 각 장을 후보로 낸다 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) =>
      handIdsOf(state, holder).map((tileId) => ({ type: ACTION, payload: { tileId } })),
    );

    // 남은 횟수가 있는 동안 턴을 보유자에게 고정한다 (솔로 연속 쯔모)
    ctx.interceptor(TURN_PASSED, (event, ic) => {
      const state = ic.state;
      if (leftOf(state, holder) <= 0) return event;
      // 패산이 마르면 유국이다 — 그대로 흘려보낸다
      if (wallLen(state) === 0) return event;
      const seat = playerOf(state, holder).seat;
      const p = event.payload as TurnPassedPayload;
      if (p.nextSeat === seat) return event;
      return { type: event.type, payload: { ...p, nextSeat: seat } };
    });

    // 보유자의 패산 쯔모마다 남은 횟수를 하나 줄인다 (영상 쯔모는 세지 않는다)
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || p.rinshan) return;
      const left = leftOf(rc.state, holder);
      if (left <= 0) return;
      rc.emit(augmentDataSet(leftKey(rc.state, holder), left - 1));
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), left - 1));
    });

    // 타가의 후로 — 폭주는 그 자리에서 끝난다
    const stop = (rc: {
      state: GameState;
      emit: (e: ProposedEvent) => void;
    }): void => {
      if (leftOf(rc.state, holder) <= 0) return;
      rc.emit(augmentDataSet(leftKey(rc.state, holder), 0));
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), 0));
    };
    ctx.reaction(CALL_MADE, (event, rc) => {
      const p = event.payload as CallMadePayload;
      if (p.caller === holder) return;
      stop(rc);
    });
    ctx.reaction(KAN_DECLARED, (event, rc) => {
      const p = event.payload as KanDeclaredPayload;
      // 안깡·가깡은 남의 손 안에서 일어나 순서를 뺏지 않지만, 대명깡은 후로다
      if (p.player === holder || p.kanKind !== "kan_open") return;
      stop(rc);
    });
  },
  bot: {
    choose: (ctx) => {
      if (!ctx.tenpai) return null;
      // 패산이 얕으면 다섯 순을 다 못 쓴다 — 넉넉할 때만 지른다
      if (ctx.wallLeft < 20) return null;
      // 가장 안전한 패로 리치를 건다 (표준 리치 판단과 같은 기준)
      let best: { type: string; payload: unknown } | null = null;
      let bestSafety = -Infinity;
      for (const o of ctx.options) {
        if (o.type !== ACTION) continue;
        const tileId = (o.payload as { tileId?: TileId }).tileId;
        const kind = tileId !== undefined ? ctx.view.tiles[tileId]?.kind : undefined;
        if (kind === undefined) continue;
        const s = ctx.safety(kind);
        if (s > bestSafety) {
          bestSafety = s;
          best = o;
        }
      }
      return best;
    },
  },
});
