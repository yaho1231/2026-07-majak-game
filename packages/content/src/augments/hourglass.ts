/**
 * 뒤집힌 모래시계 (hourglass, prism) — "죽었던 국이 나 혼자만의 서든데스로 되살아난다".
 *
 * 동풍전 1·반장전 2회, **황패유국이 선언되는 순간 내가 텐파이라면** 국이 끝나지 않는다 —
 * 왕패에서 4장이 패산으로 넘어오고, 그 4장을 **나 혼자 연속으로 쯔모**한다.
 *
 * 구현 (코어 변경 없음, 이벤트 인터셉트 2종):
 * - `ROUND_SETTLED`(outcome="draw") **Interceptor**가 조건을 만족하면 정산 이벤트를
 *   커스텀 이벤트 `HourglassOpened`로 **대체**한다. 리듀서가 왕패 앞 4장을 패산으로 옮기고
 *   phase를 `turn.draw`로, turnSeat을 보유자로 돌린다 — FlowController가 패산이 비지 않았음을
 *   보고 그대로 국을 이어 간다(유국 취소).
 * - `TURN_PASSED` **Interceptor**가 연장 중에는 nextSeat을 **항상 보유자 자리로 고정**한다.
 *   그래서 넘어온 4장이 전부 보유자에게만 간다(솔로 연장).
 * - 4장을 다 쓰면 패산이 다시 비어 표준 유국 정산이 돌아온다. 이때는 사용 플래그가 켜져 있어
 *   인터셉터가 통과시킨다(무한 연장 없음).
 *
 * 연장 중 보유자의 버림 4장은 **평소대로 론 대상**이다 — 유국까지 리치를 끌고 온 상대에게는
 * 공짜 4연속 기회이므로, 이 능력은 안전한 보너스가 아니라 서든데스다(§0 무페널티: 홀더에게
 * 강제 손해는 없고, 상대의 정상적인 대응 기회만 열려 있다).
 */

import {
  DEAD_WALL,
  defineAugment,
  isTenpai,
  meldCountOf,
  moveTiles,
  playerOf,
  rinshanRemaining,
  ROUND_SETTLED,
  scoringOptionsOf,
  SETTLE_STAGE,
  TURN_PASSED,
  WALL,
  winHandKindsOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import {
  counterOf,
  flagOf,
  matchUses,
  roundKey,
  settleInterceptor,
  viewKey,
} from "../util.js";

const ID = "hourglass";
const EVENT = "HourglassOpened";
/**
 * 연장으로 넘겨받는 왕패 장수 — 넘겨받는 것은 **아직 안 쓴 영상패**다.
 *
 * ⚠ 2026-07-26: 깡은 영상패를 소모하고 보충하지 않으므로(07 §2) 왕패 앞 4자리가
 * 늘 영상패인 게 아니다. 그냥 `slice(0, 4)`를 하면 깡이 있었던 국에서 **도라 표시패를
 * 패산으로 끌어와** 도라가 통째로 어긋난다. 그래서 남은 영상패 수로 잘라 쓴다 —
 * 깡이 없었던 국(대부분)은 4장 그대로고, 깡으로 써 버린 만큼만 연장이 짧아진다.
 */
const EXTRA_TILES = 4;

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
/** 이번 국에 이미 연장했는가 — 두 번째 유국은 그대로 통과 (무한 연장 방지) */
const openedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:opened:${roundKey(state)}:${h}`;

interface HourglassPayload {
  holder: PlayerId;
  /** 왕패에서 패산으로 넘기는 패 */
  tiles: TileId[];
  /** 보유자 자리 (턴 고정용) */
  seat: number;
}

export const hourglass: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  name: "뒤집힌 모래시계",
  description:
    "(동풍전 1회 · 반장전 2회) 황패유국이 선언되는 순간 내가 텐파이라면 국이 끝나지 않는다 — 왕패 4장이 패산으로 넘어오고 그 4장을 나 혼자 연속으로 쯔모한다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 황패유국 순간 자신이 텐파이라면 국이 끝나지 않고, 왕패에서 4장이 패산으로 넘어와 그 4장을 혼자 연속으로 쯔모한다. 넘어오는 것은 아직 안 쓴 영상패라, 그 국에 깡이 있었으면 쓴 만큼 연장이 짧아지고 영상패를 다 썼으면 발동하지 않는다. 연장 중 자신이 버리는 패는 평소대로 론 대상이다. 유국 순간 텐파이가 아니면 발동하지 않으며 넘어온 패를 다 쓰면 그대로 유국으로 정산된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.reducers.has(EVENT)) {
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as HourglassPayload;
        // 왕패 앞 4장을 패산으로 — 국이 이어진다
        const zones = moveTiles(state.zones, DEAD_WALL, WALL, p.tiles);
        return {
          ...state,
          zones,
          round: {
            ...state.round,
            phase: "turn.draw",
            turnSeat: p.seat,
            byPlayer: state.round.byPlayer,
          },
          augmentData: {
            ...state.augmentData,
            [openedKey(state, p.holder)]: true,
            [usesKey(p.holder)]:
              (typeof state.augmentData[usesKey(p.holder)] === "number"
                ? (state.augmentData[usesKey(p.holder)] as number)
                : 0) + 1,
            [viewKey("*", `${ID}:${p.holder}`)]: p.tiles.length,
          },
        };
      });
    }

    // 유국 정산을 가로채 연장으로 대체한다
    // 정산 단계: Replace — 정산 이벤트 자체를 대체한다(유국 취소) — 반드시 맨 앞.
    settleInterceptor(ctx, SETTLE_STAGE.Replace, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return event;
      const state = ic.state;
      // 이미 이 국에 연장했으면(=4장을 다 쓴 두 번째 유국) 그대로 정산한다
      if (flagOf(state, openedKey(state, holder))) return event;
      if (counterOf(state, usesKey(holder)) >= matchUses(state)) return event;
      // 유국 순간 텐파이여야 한다
      const tenpai = isTenpai(
        winHandKindsOf(state, ic.rules, holder),
        meldCountOf(state, holder),
        undefined,
        scoringOptionsOf(state, ic.rules, holder),
      );
      if (!tenpai) return event;
      const dead = state.zones[DEAD_WALL]?.tileIds ?? [];
      // 넘겨받을 수 있는 건 남은 영상패까지 — 그 뒤는 도라·뒷도라 표시패다
      const extra = Math.min(EXTRA_TILES, rinshanRemaining(state));
      if (extra === 0 || dead.length < extra) return event;
      return {
        type: EVENT,
        payload: {
          holder,
          tiles: dead.slice(0, extra),
          seat: playerOf(state, holder).seat,
        } satisfies HourglassPayload,
      };
    });

    // 연장 중에는 턴이 보유자에게 고정된다 (솔로 쯔모)
    ctx.interceptor(TURN_PASSED, (event, ic) => {
      const state = ic.state;
      if (!flagOf(state, openedKey(state, holder))) return event;
      // 패산이 다 마르면 연장이 끝난 것이므로 그대로 둔다
      if ((state.zones[WALL]?.tileIds.length ?? 0) === 0) return event;
      const seat = playerOf(state, holder).seat;
      const p = event.payload as { nextSeat: number };
      if (p.nextSeat === seat) return event;
      return { type: event.type, payload: { ...p, nextSeat: seat } };
    });
  },
  // 봇 정책 없음 — 자동 발동(유국 순간 조건 충족)이라 선택 지점이 없다.
});
