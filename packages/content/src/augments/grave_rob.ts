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
  kindKey,
  kindOf,
  moveTiles,
  playerAtSeat,
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
import { counterOf, matchUses, viewKey } from "../util.js";

const ID = "grave_rob";
const ACTION = "grave_rob";
const EVENT = "GraveRobPerformed";

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
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

/** 상대들의 바닥 전체 (내 바닥은 후리텐 존중으로 제외) */
function graveCandidates(
  state: GameState,
  holder: PlayerId,
): { fromPlayer: PlayerId; graveId: TileId }[] {
  const out: { fromPlayer: PlayerId; graveId: TileId }[] = [];
  for (const p of state.players) {
    if (p.id === holder) continue;
    for (const id of state.zones[discardsZone(p.id)]?.tileIds ?? []) {
      out.push({ fromPlayer: p.id, graveId: id });
    }
  }
  return out;
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
  return { ...state, zones, round: { ...state.round, lastDrawnTile: graveId } };
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
  return needYaku ? ev.ok : true;
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
  name: "무덤 도굴",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대의 바닥에 잠든 과거의 버림패 1장을 파내 그대로 화료한다. 지불은 쯔모 취급으로 세 명이 분담한다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대 세 명의 버림패 더미 전체에서 화료가 성립하는 패 1장을 골라 그대로 화료한다. 화료가 되는 패만 후보로 제시된다. 그 순의 쯔모패는 패산으로 돌아가고, 한참 전에 버린 사람에게 책임을 묻지 않도록 지불은 쯔모와 같이 세 명이 분담한다. 자기 바닥은 후리텐 존중을 위해 대상이 아니며, 원주인의 바닥 기록은 남아 그 사람의 후리텐 판정도 유지된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      // YakuRegistry는 게임 전체가 공유하는 단일 객체라 첫 설치 시점의 것을 잡아도 안전하다
      engine.actions.register(makeAction(ctx.yaku as YakuRegistry));
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as GraveRobPayload;
        const sim = simulateRob(state, p.holder, p.drawnId, p.graveId, p.fromPlayer);
        return {
          ...sim,
          augmentData: {
            ...sim.augmentData,
            [usesKey(p.holder)]: counterOf(state, usesKey(p.holder)) + 1,
            // 전원 공개 — 누구의 무덤에서 무엇이 나왔는지가 이 증강의 구경거리다
            [viewKey("*", `${ID}:${p.holder}`)]: kindKey(kindOf(state, p.graveId)),
          },
        };
      });
    }

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
      for (const c of graveCandidates(state, holder)) {
        const key = kindKey(kindOf(state, c.graveId));
        let ok = verdict.get(key);
        if (ok === undefined) {
          ok = robWins(
            state,
            engine.rules,
            ctx.yaku as YakuRegistry,
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
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
