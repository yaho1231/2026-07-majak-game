/**
 * 무덤 도굴 (grave_rob, prism).
 *
 * 동풍전 1·반장전 2회, 자기 턴에 **아무 상대의 바닥에 잠든 과거의 버림패 1장**을 파내 그대로 화료한다.
 * "버린 패는 죽은 패"라는 상식을 정면으로 부순다 — 12순 전에 흘린 5통이 무덤에서
 * 걸어 나와 화료패가 된다.
 *
 * 설계 결정:
 * - **지불은 쯔모 취급(전원 분담)**. 한참 전에 버린 사람에게 방총 책임을 묻는 것은
 *   부당하므로 winType="tsumo"로 정산 파이프라인을 그대로 탄다.
 * - **자기 바닥은 도굴 불가**(후리텐 존중). 상대 강만 대상.
 * - **화료가 성립하는 패만 후보로 제시한다.** 패만 바꿔치기해 놓고 역이 없어 이기지
 *   못하는 "막힌 상태"가 원천적으로 생기지 않는다. 그래서 이 증강은 '두 번째 날치기'가
 *   아니라 확정 화료 버튼이다.
 * - 리미트는 게임 1회라는 **횟수뿐**이다(무페널티 원칙).
 *
 * 구현: 쯔모패를 패산으로 되돌리고 무덤의 패를 손으로 가져오는 커스텀 이벤트 하나.
 * 도굴은 버림을 소비하지 않으므로 곧바로 같은 턴의 프롬프트가 다시 열리고, 그때
 * **표준 쯔모(win) 옵션**이 떠 있다 — 정산은 표준 파이프라인이 그대로 처리한다
 * (FlowController.resolve는 `win` 액션에서만 sys.settleWin을 부른다).
 * 화면에서는 "도굴 → 쯔모" 두 박자로 보인다. 원주인의 바닥 기록(discardedKinds)은
 * 건드리지 않아 그 상대의 후리텐 판정은 그대로 유지된다.
 */

import {
  WALL,
  buildWinContext,
  defineAugment,
  discardsZone,
  evaluateWin,
  handZone,
  isFuritenAsRon,
  kindKey,
  kindOf,
  moveTiles,
  playerAtSeat,
  scoringOptionsOf,
  visibleTileIdsIn,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
  YakuRegistry,
} from "@majak/core";
import {
  counterOf,
  matchUses,
  publishUsesLeft,
  replaceDrawnTile,
  roundViewKey,
} from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "grave_rob";
const ACTION = "grave_rob";
const EVENT = "GraveRobPerformed";

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;

/**
 * 이 국에서 **마지막으로 파낸 패**의 id. 지금의 `lastDrawnTile`과 같을 때만
 * "손에 든 쯔모패가 남의 바닥에서 온 패"라는 뜻이다 — 다음 쯔모가 오면 자연히 어긋난다.
 * 날치기(pond_snatch)와 같은 규약이며, 아래 `win.tsumoFuriten` 모디파이어가 이 값을 본다.
 */
const robbedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "robbed", state, h);
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

interface GraveRobPayload {
  holder: PlayerId;
  /** 패산으로 되돌릴 쯔모패 */
  drawnId: TileId;
  /** 무덤에서 파낸 패 */
  graveId: TileId;
  fromPlayer: PlayerId;
}

/**
 * 파낼 수 있는 무덤의 깊이 — **최근 버림 10장**까지만 (2026-07-31 사용자 확정).
 *
 * 예전에는 상대 셋의 바닥 **전체**가 대상이라, 순이 쌓일수록 후보가 수십 장으로 불어나
 * 사실상 "언젠가 한 번은 반드시 화료"가 됐다. 무덤이 얕아야 "지금 저 패가 아직 위에
 * 있을 때 파낸다"는 타이밍 판단이 생긴다.
 */
const GRAVE_DEPTH = 10;

/**
 * 상대들의 바닥에서 **가장 최근 GRAVE_DEPTH장** (내 바닥은 후리텐 존중으로 제외).
 *
 * 전체 순서를 기록해 두는 곳이 없으므로 바닥 안 순서(각자 버린 순)와 자리 순으로
 * 되짚는다 — 같은 순번이면 친부터 돌았으니 그 순서가 곧 시간 순이다. 후로로 바닥에서
 * 빠진 패가 있으면 한 칸씩 어긋나지만, 이건 규칙 판정이 아니라 "무덤 깊이"라는
 * 게임 감각용 창이라 그 정도 오차는 문제되지 않는다(결정적이므로 리플레이는 안전).
 */
function graveCandidates(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): { fromPlayer: PlayerId; graveId: TileId }[] {
  const n = state.players.length;
  const rows: {
    fromPlayer: PlayerId;
    graveId: TileId;
    turn: number;
    seatOrder: number;
  }[] = [];
  for (const p of state.players) {
    if (p.id === holder) continue;
    const seatOrder = ((p.seat - state.round.dealerSeat) % n + n) % n;
    // ⚠ **보유자에게 실제로 보이는 패만** 무덤으로 센다. 후보는 "지금 파면 화료되는
    //    패"만 남으므로, 안개(박무·숨은 강)로 가려진 바닥까지 긁으면 그 순간
    //    "안 보이는 저 패가 내 오름패다"가 후보 하나로 드러난다(2026-08-02 감사).
    //    보이지 않는 무덤은 팔 수도 없다 — 정보와 규칙을 같은 선에 맞춘다.
    const pond = visibleTileIdsIn(state, rules, holder, discardsZone(p.id));
    pond.forEach((id, turn) => {
      rows.push({ fromPlayer: p.id, graveId: id, turn, seatOrder });
    });
  }
  rows.sort((a, b) => a.turn - b.turn || a.seatOrder - b.seatOrder);
  return rows
    .slice(-GRAVE_DEPTH)
    .map(({ fromPlayer, graveId }) => ({ fromPlayer, graveId }));
}

/** 이 패가 지금 파낼 수 있는 깊이 안에 있는가 (validate·후보 생성이 같은 판정을 쓴다) */
function inGraveWindow(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
  graveId: TileId,
): boolean {
  return graveCandidates(state, rules, holder).some((c) => c.graveId === graveId);
}

/** 도굴을 반영한 가상 상태 — 쯔모패는 패산으로, 무덤 패는 손으로 */
function simulateRob(
  state: GameState,
  holder: PlayerId,
  drawnId: TileId,
  graveId: TileId,
  fromPlayer: PlayerId,
): GameState {
  let zones = moveTiles(state.zones, handZone(holder), WALL, [drawnId]);
  zones = moveTiles(zones, discardsZone(fromPlayer), handZone(holder), [graveId]);
  // 깡이 아니므로 영상 플래그를 끈다 — 깡 직후 도굴하면 남아 있던 플래그로
  // **영상개화(+1판)가 헛성립**했다(2026-07-29 감사).
  return {
    ...state,
    zones,
    round: {
      ...replaceDrawnTile(state.round, graveId),
      // 무덤에서 파낸 패가 마지막 버림패였다면 그 표식을 비운다 — 후로가 패를 가져갈 때
      // CALL_MADE가 하는 것과 같은 처리다 (2026-08-20 QA hand 확정 7). 비우지 않으면
      // `round.lastDiscard`가 이미 바닥에 없는 패를 가리켜, 세 좌석 뷰에 어느 가시 존에도
      // 없는 패의 정체가 실리고 `lastDiscardFrom` 낡은 표식도 걸러지지 않는다.
      lastDiscard:
        state.round.lastDiscard?.tileId === graveId ? null : state.round.lastDiscard,
    },
    // 배패가 아닌 손이 됐다 → 천화·지화 게이트를 닫는다 (handAltered.ts 참고).
    // 가상 상태에도 함께 실어야 화료 예측(robWins)과 실제 판정이 갈라지지 않는다.
    augmentData: { ...state.augmentData, ...handAlteredMark(state, holder) },
  };
}

/** 그 패를 파내면 화료가 성립하는가 (역 없음도 화료 불가로 본다) */
function robWins(
  state: GameState,
  rules: RuleRegistry,
  yaku: YakuRegistry,
  holder: PlayerId,
  drawnId: TileId,
  graveId: TileId,
  fromPlayer: PlayerId,
): boolean {
  const sim = simulateRob(state, holder, drawnId, graveId, fromPlayer);
  const ev = evaluateWin(
    buildWinContext(sim, holder, "tsumo", graveId, { rules }),
    yaku,
  );
  if (ev === null) return false;
  const needYaku = rules.resolve<boolean>("win.requiresYaku", {
    playerId: holder,
    state: sim,
  });
  if (needYaku && !ev.ok) return false;
  // 파낸 패로 나는 것은 **남이 버린 패로 나는 것**이다 — 후리텐이면 화료할 수 없다
  // (아래 win.tsumoFuriten 모디파이어가 표준 win 액션에서 같은 판정을 다시 건다).
  // 후보 단계에서 미리 거르지 않으면 "화료되는 패만 제시한다"는 약속이 깨지고,
  // 게임 1회뿐인 사용 횟수를 화료하지 못하는 도굴에 태우게 된다.
  if (
    rules.resolve<boolean>("win.furiten.enabled", { playerId: holder, state: sim }) &&
    isFuritenAsRon(sim, holder, graveId, scoringOptionsOf(sim, rules, holder), rules)
  ) {
    return false;
  }
  return true;
}

function makeAction(yaku: YakuRegistry): ActionDef<{
  graveId: TileId;
  fromPlayer: PlayerId;
}> {
  return {
    type: ACTION,
    validate: (req, { state, rules }) => {
      const player = state.players.find((p) => p.id === req.player);
      if (player === undefined || !player.augments.includes(ID)) {
        return "no grave_rob augment";
      }
      if (state.round.phase !== "turn.act") return "not in act phase";
      if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
        return "not your turn";
      }
      if (!hasUsesLeft(state, req.player)) return "no uses left";
      const drawn = state.round.lastDrawnTile;
      if (drawn === null) return "no drawn tile";
      if (req.payload.fromPlayer === req.player) return "cannot rob your own pond";
      const pond = state.zones[discardsZone(req.payload.fromPlayer)]?.tileIds ?? [];
      if (!pond.includes(req.payload.graveId)) return "tile is not in that pond";
      if (!inGraveWindow(state, rules, req.player, req.payload.graveId)) {
        return "that tile is buried too deep";
      }
      if (
        !robWins(
          state,
          rules,
          yaku,
          req.player,
          drawn,
          req.payload.graveId,
          req.payload.fromPlayer,
        )
      ) {
        return "that tile does not complete your hand";
      }
      return null;
    },
    // 도굴만 수행한다 — 파낸 패가 새 쯔모패가 되어 곧바로 표준 쯔모 옵션이 열린다
    // (오래전 버림이라 방총 책임을 묻지 않으므로 쯔모 취급 = 전원 분담이 된다)
    toEvents: (req, { state }) => [
      {
        type: EVENT,
        payload: {
          holder: req.player,
          drawnId: state.round.lastDrawnTile as TileId,
          graveId: req.payload.graveId,
          fromPlayer: req.payload.fromPlayer,
        } satisfies GraveRobPayload,
      },
    ],
  };
}

export const graveRob: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 2,
  name: "무덤 도굴",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대들이 **최근에 버린 10장** 중 1장을 파내 그대로 화료한다. 지불은 쯔모 취급으로 세 명이 분담한다 — 단 남이 버린 패로 나는 것이므로 후리텐이면 화료할 수 없다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대 세 명이 최근에 버린 10장 안에서 화료가 성립하는 패 1장을 골라 그대로 화료한다. 화료가 되는 패만 후보로 제시되며, 그보다 더 오래전에 흘린 패는 무덤 깊이 묻혀 파낼 수 없다. 그 순의 쯔모패는 패산으로 돌아가고, 한참 전에 버린 사람에게 책임을 묻지 않도록 지불은 쯔모와 같이 세 명이 분담한다. 안개로 가려진 바닥의 패도 파낼 수 없다. 자기 바닥은 후리텐 존중을 위해 대상이 아니며, 원주인의 바닥 기록은 남아 그 사람의 후리텐 판정도 유지된다. 파낸 패로 나는 것은 남이 버린 패로 나는 것이므로 내가 후리텐이면 화료할 수 없다 — 그런 패는 후보에도 오르지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    if (!engine.actions.has(ACTION)) {
      // YakuRegistry는 게임 전체가 공유하는 단일 객체라 첫 설치 시점의 것을 잡아도 안전하다.
      // 다만 없이 설치되면(테스트가 extras를 빠뜨린 경우 등) 액션이 undefined 레지스트리를
      // 붙든 채 등록되어, 한참 뒤 도굴 후보를 만들 때 원인 불명으로 터진다 — 여기서 막는다.
      if (ctx.yaku === undefined) {
        throw new Error("grave_rob requires a YakuRegistry (installAugment extras.yaku)");
      }
      engine.actions.register(makeAction(ctx.yaku));
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as GraveRobPayload;
        const sim = simulateRob(state, p.holder, p.drawnId, p.graveId, p.fromPlayer);
        return {
          ...sim,
          augmentData: {
            ...sim.augmentData,
            [usesKey(p.holder)]: counterOf(state, usesKey(p.holder)) + 1,
            // 이 패로 화료하면 후리텐 판정을 받는다 (아래 win.tsumoFuriten 모디파이어)
            [robbedKey(state, p.holder)]: p.graveId,
            // 전원 공개 — 누구의 무덤에서 무엇이 나왔는지가 이 증강의 구경거리다
            [roundViewKey("*", `${ID}:${p.holder}`)]: kindKey(kindOf(state, p.graveId)),
          },
        };
      });
    }

    /**
     * 파낸 패가 지금의 쯔모패인 동안, 이 보유자의 **쯔모 화료에 후리텐을 태운다**.
     * 파낸 패로 나는 것은 남이 버린 패로 나는 것이므로 표준 론과 같은 판정을 받아야
     * 한다(날치기 pond_snatch와 같은 규약). setHolderRule은 상수만 걸 수 있어
     * 여기서는 Modifier로 직접 짠다.
     */
    ctx.engine.rules.addModifier<boolean>("win.tsumoFuriten", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        const robbed = state.augmentData[robbedKey(state, holder)];
        if (typeof robbed !== "number") return cur;
        return state.round.lastDrawnTile === robbed ? true : cur;
      },
    });

    // 화료가 성립하는 무덤 패만 후보로 제시한다 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      const drawn = state.round.lastDrawnTile;
      if (drawn === null) return [];

      // 같은 종류를 여러 번 평가하지 않도록 kind 단위로 메모한다
      const verdict = new Map<string, boolean>();
      const out: { type: string; payload: { graveId: TileId; fromPlayer: PlayerId } }[] =
        [];
      for (const c of graveCandidates(state, engine.rules, holder)) {
        const key = kindKey(kindOf(state, c.graveId));
        let ok = verdict.get(key);
        if (ok === undefined) {
          ok = robWins(
            state,
            engine.rules,
            ctx.yaku as YakuRegistry, // install 시점에 존재를 검증했다
            holder,
            drawn,
            c.graveId,
            c.fromPlayer,
          );
          verdict.set(key, ok);
        }
        if (ok) out.push({ type: ACTION, payload: c });
      }
      return out;
    });
  },
  // 봇: 제시된다는 것 자체가 "지금 화료한다"는 뜻이므로 언제나 발동한다.
  bot: plan({
    intent: "win",
    fleeting: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
});
