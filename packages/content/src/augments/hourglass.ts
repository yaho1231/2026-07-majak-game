/**
 * 뒤집힌 모래시계 (hourglass, prism) — "죽었던 국이 나 혼자만의 서든데스로 되살아난다".
 *
 * **2국에 1회**, **황패유국이 선언되는 순간 내가 텐파이라면** 국이 끝나지 않는다 —
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
  augmentDataSet,
  DEAD_WALL,
  defineAugment,
  discardsZone,
  isTenpai,
  isTerminalOrHonor,
  meldCountOf,
  moveTiles,
  playerOf,
  rinshanRemaining,
  ROUND_SETTLED,
  scoringOptionsOf,
  SETTLE_STAGE,
  TILE_DISCARDED,
  TURN_PASSED,
  WALL,
  winHandKindsOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileDiscardedPayload,
  TileId,
} from "@majak/core";
import {
  counterOf,
  flagOf,
  cooldownReady,
  cooldownUsedKey,
  cooldownViewKey,
  roundSeqOf,
  roundViewKey,
  settleInterceptor,
  trackRoundSeq,
} from "../util.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "hourglass";
const EVENT = "HourglassOpened";
/** 연장이 끝나는 순간 — 남은 패산을 왕패로 되돌려 그 자리에서 유국을 부른다 */
const CLOSE_EVENT = "HourglassClosed";
/**
 * 연장으로 넘겨받는 왕패 장수 — 넘겨받는 것은 **아직 안 쓴 영상패**다.
 *
 * ⚠ 2026-07-26: 깡은 영상패를 소모하고 보충하지 않으므로(07 §2) 왕패 앞 4자리가
 * 늘 영상패인 게 아니다. 그냥 `slice(0, 4)`를 하면 깡이 있었던 국에서 **도라 표시패를
 * 패산으로 끌어와** 도라가 통째로 어긋난다. 그래서 남은 영상패 수로 잘라 쓴다 —
 * 깡이 없었던 국(대부분)은 4장 그대로고, 깡으로 써 버린 만큼만 연장이 짧아진다.
 */
const EXTRA_TILES = 4;

/**
 * 쿨다운 — 한 번 연장하면 이만큼 국(본장 포함)이 지나야 다시 열린다.
 * 2026-08-02 사용자 지시로 "동풍1/반장2"에서 **2국당 1회**로 상향했다 — 발동 조건이
 * "유국 순간 텐파이"라 기회 자체가 드물어, 매치당 횟수 제한까지 겹치면 사장된다.
 */
const COOLDOWN_ROUNDS = 2;
/** 지금 연장할 수 있는가 — 쓴 적이 없거나, 마지막 사용 이후 2국이 지났다 */
function offCooldown(state: GameState, h: PlayerId): boolean {
  return cooldownReady(state, ID, h, COOLDOWN_ROUNDS);
}

/**
 * 지금 이 유국에 **보유자의 유국만관/유국역만이 서 있는가.**
 *
 * 연장은 거절할 수 없는 자동 발동이다. 그런데 나가시는 "내 버림이 **한 장도 빠짐없이**
 * 요구패·자패"라서, 연장으로 4장을 더 버리는 순간 손에 요구패가 없으면 **회피 경로가
 * 아예 없다** — 실측으로 유국역만 51,000이 3,000이 됐고(표준 유국만관도 12,000 증발),
 * 두 카드 어디에도 그 말이 없었다(QA synergy3 relax 확정 2, 2026-08-23).
 * 그래서 나가시가 서 있는 국에는 인터셉터가 **통과**한다 — 연장을 포기하고 그 국을
 * 그대로 정산한다. 모래시계는 2국에 1회 다시 열리지만 유국역만은 그 국뿐이라,
 * 둘 중 하나를 버려야 한다면 큰 쪽을 지킨다.
 *
 * 판정은 `nagashi_yakuman.nagashiValid`·`standardActions.nagashiManganSeats`와 같은
 * 이력(discardedKinds) 기준이다. 유국역만 증강 보유자는 "울려 나갔어도 성립"이므로
 * 강 장수 비교를 하지 않고, 표준 유국만관 쪽만 ②(아무도 울지 않았다)를 함께 본다.
 */
function nagashiStanding(state: GameState, h: PlayerId): boolean {
  const history = state.round.byPlayer[h]?.discardedKinds ?? [];
  if (history.length === 0) return false;
  const allOrphans = history.every((key) => {
    const m = /^([a-z]+)(\d+)$/.exec(key);
    return m !== null && isTerminalOrHonor({ suit: m[1] as never, rank: Number(m[2]) });
  });
  if (!allOrphans) return false;
  if (playerOf(state, h).augments.includes("nagashi_yakuman")) return true;
  // 표준 유국만관: 한 장이라도 울려 나갔으면 이미 자격이 없다
  return (state.zones[discardsZone(h)]?.tileIds.length ?? 0) === history.length;
}
/** 이번 국에 이미 연장했는가 — 두 번째 유국은 그대로 통과 (무한 연장 방지) */
const openedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "opened", state, h);
/**
 * 연장으로 **아직 남은 솔로 순(順) 수**.
 *
 * 예전에는 연장의 끝을 "패산이 마르는 것"으로 판정했다. 그런데 강 회수 카드
 * (정적의 손·날치기)는 쯔모패를 `WALL` 로 되돌리며 **패산을 되채운다** — 연장이
 * 그만큼 늘어나 설명이 약속한 "최대 4장"이 실측 7회까지 갔다
 * (QA synergy3 handedit 확정 5, 2026-08-23). 넘겨받은 장수는 발동 시점에 이미
 * 정해져 있으니(`HourglassPayload.tiles.length`) 그 수를 세는 것이 단일 진실이다.
 *
 * ⚠ 세는 것은 **쯔모가 아니라 버림**이다 (2026-08-23 2차). 쯔모를 세면 패산에서
 * 오지 않는 패 수급 — 날치기의 강 회수 — 이 한도를 지나쳐 간다: 주운 순은 카운터를
 * 안 깎는데 턴은 그대로 한 번 도니까, 날치기 횟수만큼 연장이 늘어난다(반장전 예산이
 * 1.5배가 되면서 실측 5회). 연장이 약속하는 것은 "패 4장"이 아니라 **내 순 4번**이고,
 * 어떤 방식으로 패를 받았든 한 순은 정확히 한 번의 버림으로 끝난다.
 */
const soloLeftKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "soloLeft", state, h);

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
  complexity: 3,
  name: "뒤집힌 모래시계",
  description:
    "(2국에 1회) 황패유국이 선언되는 순간 내가 텐파이라면 국이 끝나지 않고, 남은 영상패(최대 4장)를 나 혼자 연속으로 쯔모한다.",
  detail:
    "왕패에서 넘어오는 것은 아직 쓰지 않은 영상패다. 그 국에 깡이 있었으면 쓴 만큼 연장이 짧아지고, 영상패가 남지 않았으면 발동하지 않는다. 내 유국만관·유국역만이 성립한 국에는 연장하지 않는다.\n\n연장 중 자신이 버리는 패는 평소대로 론 대상이다. 넘어온 패를 다 쓰면 그대로 유국으로 정산된다.",
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
            // 넘겨받은 장수 = 앞으로 돌 솔로 쯔모 횟수 (soloLeftKey 주석 참고)
            [soloLeftKey(state, p.holder)]: p.tiles.length,
            // 이 국을 쿨다운 기준점으로 찍고, 잔량 표시도 그 자리에서 갱신한다
            [cooldownUsedKey(ID, p.holder)]: roundSeqOf(state, ID, p.holder),
            [cooldownViewKey(ID, p.holder)]: COOLDOWN_ROUNDS,
            [roundViewKey("*", `${ID}:${p.holder}`)]: p.tiles.length,
          },
        };
      });
    }

    /*
     * 연장이 끝나면 **남은 패산을 왕패로 되돌린다** — 그래야 다음 `turn.draw`에서
     * 패산이 비어 표준 유국 정산이 돌아온다(FlowController는 패산이 비었을 때만 유국이다).
     *
     * 왜 남는가: 강 회수 카드(날치기·정적의 손)가 쯔모패를 패산으로 되돌리기 때문이다.
     * 그 한 장이 남아 있으면 4순이 끝난 뒤에도 국이 **평범하게 이어져** 네 사람이 계속
     * 친다 — 연장이 유국을 취소한 채 국을 부활시킨 셈이라, 카드가 약속한
     * "넘어온 패를 다 쓰면 그대로 유국으로 정산된다"와 정반대다
     * (QA synergy3 handedit 확정 5의 남은 구멍 — 2026-08-23 2차).
     */
    if (!engine.reducers.has(CLOSE_EVENT)) {
      engine.reducers.register(CLOSE_EVENT, (state, event) => {
        const p = event.payload as { tiles: TileId[] };
        return { ...state, zones: moveTiles(state.zones, WALL, DEAD_WALL, p.tiles) };
      });
    }

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    // 유국 정산을 가로채 연장으로 대체한다
    // 정산 단계: Replace — 정산 이벤트 자체를 대체한다(유국 취소) — 반드시 맨 앞.
    settleInterceptor(ctx, SETTLE_STAGE.Replace, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return event;
      const state = ic.state;
      // 이미 이 국에 연장했으면(=4장을 다 쓴 두 번째 유국) 그대로 정산한다
      if (flagOf(state, openedKey(state, holder))) return event;
      if (!offCooldown(state, holder)) return event;
      // 나가시(유국만관·유국역만)가 서 있으면 연장하지 않는다 — 위 nagashiStanding 주석
      if (nagashiStanding(state, holder)) return event;
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

    // 연장 중 보유자가 한 순을 끝낼(=버릴) 때마다 남은 솔로 순을 하나 깎는다.
    // 버림으로 세는 이유는 soloLeftKey 주석 참고 — 강 회수로 받은 순도 똑같이 센다.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder) return;
      const state = rc.state;
      if (!flagOf(state, openedKey(state, holder))) return;
      const left = counterOf(state, soloLeftKey(state, holder));
      if (left <= 0) return;
      rc.emit(augmentDataSet(soloLeftKey(state, holder), left - 1));
      if (left - 1 > 0) return;
      // 마지막 순을 끝냈다 — 남은 패산을 왕패로 되돌려 유국을 부른다 (위 주석 참고)
      const wall = state.zones[WALL]?.tileIds ?? [];
      if (wall.length > 0) rc.emit({ type: CLOSE_EVENT, payload: { tiles: [...wall] } });
    });

    // 연장 중에는 턴이 보유자에게 고정된다 (솔로 쯔모)
    ctx.interceptor(TURN_PASSED, (event, ic) => {
      const state = ic.state;
      if (!flagOf(state, openedKey(state, holder))) return event;
      /*
       * 넘겨받은 장수를 다 썼으면 연장은 끝이다 — **패산이 마르는 것**으로 판정하면
       * 강 회수(쯔모패를 패산으로 되돌린다)가 패산을 되채울 때마다 솔로 쯔모가
       * 늘어난다(4회 → 7회 실측, QA synergy3 handedit 확정 5).
       */
      if (counterOf(state, soloLeftKey(state, holder)) <= 0) return event;
      // 패산이 다 마르면 연장이 끝난 것이므로 그대로 둔다
      if ((state.zones[WALL]?.tileIds.length ?? 0) === 0) return event;
      // **보유자가 버린 뒤**에만 턴을 되가져온다. 누가 버렸는지 보지 않으면,
      // 연장 중 상대가 보유자의 버림을 울어 한 장 버렸을 때 그 턴까지 빼앗아
      // 그 상대는 쯔모를 한 번도 못 받고 손패만 줄어든 채 국이 끝났다
      // (docs/25 방해 #17). 후로는 패산을 소모하지 않아 연장이 한 턴 늘기도 했다.
      if (state.round.lastDiscard?.player !== holder) return event;
      const seat = playerOf(state, holder).seat;
      const p = event.payload as { nextSeat: number };
      if (p.nextSeat === seat) return event;
      return { type: event.type, payload: { ...p, nextSeat: seat } };
    });
  },
  // 봇 정책 없음 — 자동 발동(유국 순간 조건 충족)이라 선택 지점이 없다.
});
