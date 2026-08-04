/**
 * 영혼의 일격 (soul_strike, prism) — "리치를 걸고, 여섯 순을 혼자 달린다".
 *
 * (2국에 1회) 텐파이 상태에서 자기 순에 발동한다. 버릴 패를 고르면 그 패로 **리치를
 * 선언**하고 그대로 **연속 6쯔모**에 들어간다 — 상대 셋의 순을 건너뛰고 내가 여섯 번
 * 연달아 뽑고 버린다. 이 리치는 **2판**(더블리치면 **3판**)으로 값하고, 연속 쯔모 중의
 * 쯔모 화료는 **언제나 일발**이다.
 *
 * # 종료 조건 (위가 우선)
 *
 * | 조건 | 그 다음 |
 * |------|---------|
 * | 타가에게 방총 | 즉시 국 종료 |
 * | 타가가 후로 | 후로한 사람부터 진행 |
 * | 6번째 이후 쯔모패를 타패 | 하가부터 진행 |
 *
 * **안깡은 5번째까지만 횟수를 먹는다.** 여섯 장을 다 뽑은 뒤에는 타패하기 전까지
 * 횟수를 소모하지 않고 안깡 → 영상 쯔모를 이어 갈 수 있다 — 즉 마지막 한 장을 쥔 채
 * 깡을 거듭해 손을 더 키울 수 있다.
 *
 * # 구현 (코어 변경 없음 — 뒤집힌 모래시계의 솔로 쯔모 계열)
 *
 * - 커스텀 액션 `soul_strike{tileId}` — 표준 리치와 **같은 조건**을 검사하고
 *   `TILE_DISCARDED{riichi:true}`를 낸다. 리치 성립·공탁·더블리치 판정은 전부 표준 경로다.
 * - `TURN_PASSED` **Interceptor**가 폭주 중에는 nextSeat을 보유자로 고정한다.
 * - `TILE_DRAWN` 리액션이 보유자의 쯔모마다 남은 횟수를 줄인다(0이면 그대로 둔다 —
 *   그게 "6번째 이후 안깡은 공짜"의 구현이다).
 * - `TILE_DISCARDED` 리액션이 **남은 횟수 0에서의 타패**를 보고 폭주를 끝낸다.
 *   턴 고정이 풀려 하가부터 정상 진행된다.
 * - `CALL_MADE`·`KAN_DECLARED`(대명깡) 리액션이 **타가의 후로**를 보면 즉시 끝낸다.
 * - **일발 유지**: 코어는 리치자가 화료 없이 다시 버리면 일발을 끈다. 폭주 중에는
 *   내가 여섯 번을 연달아 버리므로 그대로 두면 두 번째 쯔모부터 일발이 죽는다.
 *   그래서 폭주 중 보유자의 쯔모마다 **일발을 되살리는 전용 이벤트**를 낸다
 *   (내 안깡의 영상 쯔모도 마찬가지 — 상대의 일발은 건드리지 않는다).
 * - **리치 2판 취급**: 표준 리치 1판·더블리치 2판과의 차이가 둘 다 **+1판**이라
 *   `addWinHanBonus(+1)` 한 줄이다. 뱅크 발행이므로 상대가 더 내지는 않는다.
 *
 * 폭주 중 내가 버리는 여섯 장은 **평소대로 전부 론 대상**이고, 타가는 울어서 끊을 수
 * 있다 — 상대에게 분명한 대응 수단이 있다(Rule #4). 페널티는 없다: 여섯 순을 당겨
 * 오는 대가는 "그동안 여섯 번 쏘일 수 있다"는 위험 그 자체다.
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
  TileDiscardedPayload,
  TileDrawnPayload,
  TileId,
  TurnPassedPayload,
} from "@majak/core";
import {
  addWinHanBonus,
  counterOf,
  flagOf,
  roundKey,
  roundSeqOf,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";

const ID = "soul_strike";
const ACTION = "soul_strike";
/** 일발을 되살리는 전용 이벤트 (id에서 파생시켜 충돌 방지) */
const IPPATSU_KEPT = "SoulStrikeIppatsuKept";

/** 연속으로 가져오는 쯔모 횟수 */
const SOUL_DRAWS = 6;
/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 */
const COOLDOWN_ROUNDS = 2;

/**
 * 이 리치를 몇 판으로 취급하는가 — 표준과의 **차이만** 얹는다.
 * 리치 1판 → 2판, 더블리치 2판 → 3판. 둘 다 차이가 +1판이라 한 값으로 족하다.
 */
const RIICHI_HAN_BONUS = 1;

const usedSeqKey = (h: PlayerId): string => `${ID}:usedSeq:${h}`;
/** 폭주가 켜져 있는가 (이번 국) */
const activeKey = (state: GameState, h: PlayerId): string =>
  `${ID}:active:${roundKey(state)}:${h}`;
/** 남은 연속 쯔모 횟수 (이번 국) */
const leftKey = (state: GameState, h: PlayerId): string =>
  `${ID}:left:${roundKey(state)}:${h}`;
/** 이번 국에 영혼의 일격으로 리치를 걸었는가 (판수 보너스 조건) */
const declaredKey = (state: GameState, h: PlayerId): string =>
  `${ID}:declared:${roundKey(state)}:${h}`;

const isActive = (state: GameState, h: PlayerId): boolean =>
  flagOf(state, activeKey(state, h));
const leftOf = (state: GameState, h: PlayerId): number =>
  counterOf(state, leftKey(state, h));

const offCooldown = (state: GameState, h: PlayerId): boolean => {
  const used = state.augmentData[usedSeqKey(h)];
  if (typeof used !== "number") return true;
  return roundSeqOf(state, ID, h) - used >= COOLDOWN_ROUNDS;
};

const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

const soulStrikeAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no soul_strike augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!offCooldown(state, req.player)) return "on cooldown";
    if (isActive(state, req.player)) return "already running";

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
    // 텐파이는 이 증강의 발동 조건이다 — 공성계(블러프 리치)로는 발동할 수 없다.
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
    augmentDataSet(activeKey(state, req.player), true),
    augmentDataSet(leftKey(state, req.player), SOUL_DRAWS),
    augmentDataSet(declaredKey(state, req.player), true),
    augmentDataSet(usedSeqKey(req.player), roundSeqOf(state, ID, req.player)),
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), SOUL_DRAWS),
  ],
};

export const soulStrike: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  name: "영혼의 일격",
  description:
    "(2국에 1회) 텐파이에서 발동하면 그 패로 리치를 걸고 연속 6쯔모에 들어간다. 그 리치는 2판(더블리치는 3판)으로 값하고, 폭주 중 쯔모 화료는 언제나 일발이다.",
  detail:
    "텐파이 상태의 자기 순에 버릴 패를 골라 발동한다. 그 패로 리치를 선언하고 연속 6쯔모에 들어간다. 이 리치는 2판, 더블리치면 3판으로 취급하며, 연속 쯔모 중의 쯔모 화료에는 일발이 붙는다.\n\n다음 중 하나가 충족되면 종료된다(위가 우선). ① 타가에게 방총당하면 국이 끝난다. ② 타가가 후로하면 후로한 사람부터 진행된다. ③ 여섯 번째 이후의 쯔모패를 버리면 하가부터 진행된다.\n\n안깡은 다섯 번째 쯔모까지만 횟수를 소모한다. 여섯 장을 뽑은 뒤에는 버리기 전까지 횟수 소모 없이 안깡과 영상 쯔모를 반복할 수 있다.\n\n연속 쯔모는 패산을 실제로 소모하며, 그동안 버리는 패는 평소대로 론 대상이다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) engine.actions.register(soulStrikeAction);

    // 일발 되살리기 — 폭주 중 보유자의 리치에만 손댄다 (상대의 일발은 건드리지 않는다)
    if (!engine.reducers.has(IPPATSU_KEPT)) {
      engine.reducers.register(IPPATSU_KEPT, (state, event) => {
        const p = event.payload as { player: PlayerId };
        const rs = state.round.byPlayer[p.player];
        if (rs?.riichi == null || rs.riichi.ippatsu) return state;
        return {
          ...state,
          round: {
            ...state.round,
            byPlayer: {
              ...state.round.byPlayer,
              [p.player]: { ...rs, riichi: { ...rs.riichi, ippatsu: true } },
            },
          },
        };
      });
    }

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID);

    // 손패 각 장을 후보로 낸다 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) =>
      handIdsOf(state, holder).map((tileId) => ({ type: ACTION, payload: { tileId } })),
    );

    // 폭주 중에는 턴을 보유자에게 고정한다 (솔로 연속 쯔모)
    ctx.interceptor(TURN_PASSED, (event, ic) => {
      const state = ic.state;
      if (!isActive(state, holder)) return event;
      // 패산이 마르면 유국이다 — 그대로 흘려보낸다
      if (wallLen(state) === 0) return event;
      const seat = playerOf(state, holder).seat;
      const p = event.payload as TurnPassedPayload;
      if (p.nextSeat === seat) return event;
      return { type: event.type, payload: { ...p, nextSeat: seat } };
    });

    // 보유자의 쯔모 — 남은 횟수를 줄이고(0이면 그대로) 일발을 되살린다.
    // 0에서 줄이지 않는 것이 곧 "여섯 장을 다 뽑은 뒤의 안깡은 공짜"다.
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder || !isActive(rc.state, holder)) return;
      const left = leftOf(rc.state, holder);
      if (left > 0) {
        rc.emit(augmentDataSet(leftKey(rc.state, holder), left - 1));
        rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), left - 1));
      }
      // 폭주 중의 쯔모 화료는 언제나 일발 — 직전 내 버림이 껐던 것을 되살린다
      rc.emit({ type: IPPATSU_KEPT, payload: { player: holder } });
    });

    // 남은 횟수 0에서의 타패 = 폭주 종료. 턴 고정이 풀려 하가부터 진행된다.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder || !isActive(rc.state, holder)) return;
      if (leftOf(rc.state, holder) > 0) return;
      rc.emit(augmentDataSet(activeKey(rc.state, holder), false));
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), 0));
    });

    // 타가의 후로 — 폭주는 그 자리에서 끝나고 후로한 사람부터 진행된다
    const stop = (rc: {
      state: GameState;
      emit: (e: ProposedEvent) => void;
    }): void => {
      if (!isActive(rc.state, holder)) return;
      rc.emit(augmentDataSet(activeKey(rc.state, holder), false));
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

    // 이 리치를 2판(더블리치면 3판)으로 취급한다 — 표준과의 차이 +1판을 얹는다
    addWinHanBonus(ctx, (state) =>
      flagOf(state, declaredKey(state, holder)) ? RIICHI_HAN_BONUS : 0,
    );
  },
  bot: {
    choose: (ctx) => {
      if (!ctx.tenpai) return null;
      // 패산이 얕으면 여섯 순을 다 못 쓴다 — 넉넉할 때만 지른다
      if (ctx.wallLeft < 24) return null;
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
