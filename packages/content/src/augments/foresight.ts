/**
 * 예지 (foresight, prism) — "다음 한 바퀴를 내가 설계한다".
 *
 * 2026-07-25 재설계(사용자 지시): **상시 공개 → 발동 시 공개 + 드래그 순서지정.**
 * - 이전엔 패산 앞 4장이 보유자에게 상시 보였다. 이제는 **발동해야** 그 순간의 앞 4장이
 *   보유자에게 공개된다(발동 = 공개, 취소 불가).
 * - 공개된 4장을 드래그로 재배열한다. 4장은 **발동 시점의 차례 기준으로**
 *   하가·대면·상가·**나**의 다음 쯔모이며, 그 순간에는 4번째가 내 쯔모다.
 *
 * ⚠ "네 번째가 내 쯔모"는 **예보이지 확정이 아니다.** 중간에 퐁·치가 끼면 운 사람은
 *   쯔모를 건너뛰므로 패산 앞의 배정이 한 칸 당겨지고, 4번째가 남에게 간다
 *   (qa-lab text 확정 4). 재배열은 그 자리에서 확정하는 **한 번뿐인 결정**이라
 *   삼세 예지처럼 "지금 기준으로 다시 계산"해서 되돌릴 수 있는 종류의 정보가 아니다 —
 *   미래의 후로를 미리 알 방법이 없으므로 구조적으로 재계산 불가다.
 *   그래서 엔진이 아니라 **문구**를 사실에 맞췄다(detail에 배정이 밀릴 수 있음을 명시).
 *   표시 쪽은 정확하다: 공개 채널은 **저장된 스냅샷이 아니라 파생값**이라
 *   («남은 장수» × «지금 패산 앞») 매 이벤트마다 다시 만들어지고(아래 resync),
 *   자리 이름은 클라이언트의 `drawOrder.ts`가 렌더 시점의 `turnSeat`·방향에서
 *   매번 다시 계산한다 — 후로 뒤에는 "나"가 세 번째 칸으로 옮겨 붙는다.
 * - 발동만 하고 순서를 바꾸지 않으면(턴 시간 종료 포함) **그대로**(항등) 둔 것으로 친다 —
 *   발동 자체가 이미 소진이라, 재배열은 선택이다.
 *
 * 발동한 국에 화료하면 +2판. 발동 후 4순 동안 재발동 비활성(쿨다운).
 *
 * 2026-08-02(사용자 지시) 너프: 열람(2순 1회)은 그대로 두고 **재배열만 국에 1회**로
 * 묶는다 — 발동할 때마다 패산을 다시 짜는 "매 순 조작"을 막는다.
 * 2026-08-07(사용자 지시) 너프: 열람 쿨다운을 **4순 1회**로 늘린다 — 한 국에 서너 번
 * 열리던 패산 열람이 한두 번으로 줄어, 재배열 한 번을 어디에 쓸지가 실제 선택이 된다.
 *
 * 액션 두 개로 나눈다:
 * - `foresight_reveal {}` : 앞 4장의 kind를 보유자 전용 채널(view:{h}:foresight_peek)에 싣고,
 *   소진·쿨다운·"이번 턴 공개" 마커를 세운다. 패산은 아직 바꾸지 않는다.
 * - `foresight_order { order }` : 공개한 그 턴에 한해, order(0~3 순열, 항등 허용)대로 패산 앞
 *   4장을 재배열한다. 재배열 후 공개 채널을 새 순서로 갱신하고 "이번 턴 공개" 마커를 지운다.
 *
 * 리듀서는 WALL Zone의 앞 4장만 바꿔 끼우는 불변 갱신(나머지 패산은 그대로).
 * 쿨다운·소진은 국(roundKey) 스코프라 국이 바뀌면 자동 만료.
 */

import {
  TILE_DRAWN,
  WALL,
  augmentDataSet,
  defineAugment,
  kindKey,
  kindOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDrawnPayload,
  TileId,
} from "@majak/core";
import { addWinHanBonus, cooldownTurnsViewKey, flagOf, roundKey, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "foresight";
const REVEAL = "foresight_reveal";
const ORDER = "foresight_order";
const EVENT = "ForesightReordered";
/** 미리 보고 재배열하는 패산 앞 장수 */
const PEEK = 4;
/** 사용 후 비활성 순 수 (2026-08-07 사용자 지시 너프: 2순 → 4순) */
const COOLDOWN_TURNS = 4;
/** 발동한 국에 화료하면 받는 추가 점수 */
const WIN_BONUS_HAN = 2; // 구 +4500점 → 3판 → 2판 (2026-07-26 판수 통일·재조정)

/** 이번 국에 발동했는가 (점수 보너스 게이팅, roundKey 스코프) */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);
/** 마지막 발동 순 — 쿨다운 기준 (roundKey 스코프). 단위는 아래 `turnNo` */
const lastTurnKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "turn", state, h);
/**
 * 공개한 4장 중 아직 뽑히지 않고 남은 장수 (roundKey 스코프).
 *
 * 표시할 kind는 **저장하지 않는다** — 남은 장수만 세고 화면에 낼 목록은 그때그때
 * 패산 앞에서 다시 만든다(아래 resync). 이유는 확정 4를 보라.
 */
const peekLeftKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "peekLeft", state, h);
/**
 * 이번 국에 재배열을 이미 썼는가 (roundKey 스코프).
 *
 * 2026-08-02(사용자 지시) 너프: **열람은 쿨다운 1회, 재배열은 국에 1회.**
 * 예전에는 발동할 때마다 패산을 다시 짤 수 있어 국 내내 한 바퀴씩 쯔모를 설계했다.
 * 이제 두 번째 발동부터는 "보기"만 되고 드래그 확정은 열리지 않는다.
 */
const orderUsedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "ordered", state, h);
/** '이번 턴에 공개했고 아직 재배열 안 함' 마커 = 공개 시점의 turnCount (roundKey 스코프) */
const revealTurnKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "reveal", state, h);
/** 공개된 앞 4장 kind를 담는 보유자 전용 채널 */
const peekViewKey = (h: PlayerId): string => roundViewKey(h, "foresight_peek");

/** 패산 앞 PEEK장의 tileId (부족하면 짧은 배열) */
function frontIds(state: GameState): TileId[] {
  return (state.zones[WALL]?.tileIds ?? []).slice(0, PEEK);
}

/** 예언 채널 비교 — 같으면 emit을 생략해 반응 연쇄를 한 겹에서 끊는다 */
function sameKinds(shown: unknown, kinds: string[]): boolean {
  if (!Array.isArray(shown) || shown.length !== kinds.length) return false;
  return kinds.every((k, i) => shown[i] === k);
}

/** 공개분 중 아직 안 뽑힌 장수 (한 번도 발동 안 했으면 0) */
function peekLeftOf(state: GameState, h: PlayerId): number {
  const raw = state.augmentData[peekLeftKey(state, h)];
  return typeof raw === "number" ? raw : 0;
}

/** 0~n-1의 모든 순열 (재배열 후보 생성용) */
function permutations(n: number): number[][] {
  if (n <= 1) return [[0]];
  const out: number[][] = [];
  const rec = (rest: number[], acc: number[]): void => {
    if (rest.length === 0) {
      out.push([...acc]);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      const next = [...rest];
      const [picked] = next.splice(i, 1);
      rec(next, [...acc, picked as number]);
    }
  };
  rec(
    Array.from({ length: n }, (_v, i) => i),
    [],
  );
  return out;
}

/** 재배열 후보 = 0~3의 모든 순열(항등 포함 — 드래그가 제자리로 끝나도 제출 가능) */
const ALL_ORDERS: number[][] = permutations(PEEK);

/** order가 0~PEEK-1의 순열인가 (항등도 허용 — '그대로 두기') */
function isValidOrder(order: unknown): order is number[] {
  if (!Array.isArray(order) || order.length !== PEEK) return false;
  const seen = new Set<number>();
  for (const v of order) {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= PEEK) {
      return false;
    }
    seen.add(v as number);
  }
  return seen.size === PEEK;
}

/** 잔여 쿨다운 순 수를 담는 보유자 전용 채널 (이름표 pill이 `N순`으로 그린다) */
const cdTurnsKey = (h: PlayerId): string => cooldownTurnsViewKey(ID, h);
/** 이번 국 재배열이 소진됐음을 알리는 보유자 전용 채널 */
const reorderSpentKey = (h: PlayerId): string => roundViewKey(h, `${ID}:reorderSpent`);

/**
 * 이 국에서 보유자의 현재 순 번호 (= 내가 버린 수).
 *
 * ⚠ `state.round.turnCount`를 쓰면 안 된다 — 그것은 **오야가 쯔모할 때마다** 오르고
 * 영상패(깡)도 예외가 아니다(`flowEvents.ts`, `turnCount + (isDealer ? 1 : 0)`).
 * 그래서 오야가 예지를 발동한 **바로 그 순에 깡을 치면** 영상 쯔모로 turnCount가 +1 되어
 * ① `revealedThisTurn`이 거짓이 되고 재배열 후보 24개가 그 자리에서 **0개로 사라졌다** —
 *    "발동 = 소진, 취소 불가"인 증강이 소진만 되고 능력은 못 쓴 채 죽었다.
 * ② 쿨다운이 4 → 3으로 줄어 **깡 한 번당 1순씩 공짜로 짧아졌다**.
 * (2026-08-22 QA aug-2 확정 3, 실측 재현: `qa-lab/round2/aug-2/r_foresight_kan.ts`.)
 *
 * 형제 증강이 같은 함정을 먼저 밟고 먼저 나왔다 — `future_sight`·`take_back` 둘 다
 * 보유자의 `discardCount`로 옮겨 갔다. 여기도 같은 기준을 쓴다.
 * (누명이 `discardedKinds`를 남의 이력으로 돌리므로 이력 길이가 아니라 `discardCount`다.)
 */
function turnNo(state: GameState, h: PlayerId): number {
  return state.round.byPlayer[h]?.discardCount ?? 0;
}

/** 남은 쿨다운 순 수 (0이면 발동 가능) */
function cooldownLeft(state: GameState, h: PlayerId): number {
  const last = state.augmentData[lastTurnKey(state, h)];
  if (typeof last !== "number") return 0;
  return Math.max(0, COOLDOWN_TURNS - (turnNo(state, h) - last));
}

/** 공개했고 그 뒤로 아직 버리지 않았는가 (= 발동한 그 순 안인가) */
function revealedThisTurn(state: GameState, h: PlayerId): boolean {
  return state.augmentData[revealTurnKey(state, h)] === turnNo(state, h);
}

function isMyTurn(state: GameState, h: PlayerId): boolean {
  return (
    state.round.phase === "turn.act" &&
    playerAtSeat(state, state.round.turnSeat).id === h
  );
}

/** 지금 공개 발동이 가능한가 */
function canReveal(state: GameState, h: PlayerId): boolean {
  if (!isMyTurn(state, h)) return false;
  if (frontIds(state).length < PEEK) return false;
  if (cooldownLeft(state, h) > 0) return false;
  if (revealedThisTurn(state, h)) return false; // 이미 이번 턴에 공개함
  return true;
}

// ── ① 공개(발동) — 앞 4장을 보유자에게 열고 소진·쿨다운을 세운다 (패산 불변) ──
const revealAction: ActionDef<Record<string, never>> = {
  type: REVEAL,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no foresight augment";
    }
    if (!isMyTurn(state, req.player)) return "not your turn";
    if (frontIds(state).length < PEEK) return "not enough wall tiles";
    if (cooldownLeft(state, req.player) > 0) return "on cooldown";
    if (revealedThisTurn(state, req.player)) return "already revealed this turn";
    return null;
  },
  toEvents: (req, { state }) => {
    const kinds = frontIds(state).map((id) => kindKey(kindOf(state, id)));
    const tc = turnNo(state, req.player);
    return [
      augmentDataSet(peekViewKey(req.player), kinds),
      augmentDataSet(peekLeftKey(state, req.player), kinds.length),
      augmentDataSet(usedKey(state, req.player), true),
      augmentDataSet(lastTurnKey(state, req.player), tc),
      augmentDataSet(revealTurnKey(state, req.player), tc),
      // 발동 사실만 전원 공개 (무엇을 봤는지는 보유자만 안다)
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
        round: roundKey(state),
        turnCount: tc,
      }),
    ];
  },
};

// ── ② 재배열 — 공개한 그 턴에 한해, order대로 앞 4장을 갈아 끼운다 ──
const orderAction: ActionDef<{ order: number[] }> = {
  type: ORDER,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no foresight augment";
    }
    if (!isMyTurn(state, req.player)) return "not your turn";
    if (!revealedThisTurn(state, req.player)) return "reveal first";
    if (flagOf(state, orderUsedKey(state, req.player))) {
      return "reorder already used this round";
    }
    if (frontIds(state).length < PEEK) return "not enough wall tiles";
    if (!isValidOrder(req.payload.order)) return "invalid order";
    return null;
  },
  toEvents: (req) => [
    { type: EVENT, payload: { holder: req.player, order: [...req.payload.order] } },
  ],
};

interface ForesightOrderPayload {
  holder: PlayerId;
  order: number[];
}

export const foresight: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "info",
  complexity: 2,
  name: "예지",
  description:
    "(열람 4순에 1회 · 재배열은 국에 1회) 자기 순에 발동하면 그 순간 패산 다음 4장이 나에게만 공개되고(발동=공개, 취소 불가), 국에 한 번은 드래그로 순서를 바꿔 다음 한 바퀴를 설계한다. 발동한 국에 화료하면 +2판을 얻는다(역만에는 미적용).",
  detail:
    "(열람 4순에 1회 · 재배열은 국에 1회) 자기 순에 발동하면 패산 앞 4장이 나에게만 공개된다. 이 4장은 **지금 차례 기준으로** 하가·대면·상가·나에게 차례로 배정되며, 발동한 그 순간에는 네 번째가 내 쯔모다. 중간에 누군가 퐁·치를 하면 그 사람은 쯔모를 건너뛰므로 배정이 한 칸씩 당겨져 **네 번째가 더 이상 내 쯔모가 아닐 수 있다** — 화면의 자리 이름은 그때그때 다시 계산되니 재배열을 확정하기 전에 확인한다. 드래그로 순서를 바꿔 다시 배치할 수 있지만 **재배열은 한 국에 한 번**이라, 그 국에 다시 발동하면 열람만 되고 순서는 손댈 수 없다. 바꾸지 않거나 순 시간이 지나면 그대로 확정된다. 발동 자체가 이미 소진이라 취소할 수 없으며, 발동 후 4순 동안은 다시 발동할 수 없고 국이 바뀌면 초기화된다. 무엇을 보고 어떻게 섞었는지는 나만 알고 상대에게는 발동 사실만 보인다. 발동한 국에 화료하면 +2판을 얻는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(REVEAL)) {
      engine.actions.register(revealAction);
      engine.actions.register(orderAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as ForesightOrderPayload;
        const zone = state.zones[WALL];
        if (zone === undefined) throw new Error("foresight: no wall zone");
        const front = zone.tileIds.slice(0, PEEK);
        if (front.length < PEEK) return state;
        // order[i] = 새 i번째 자리에 올 기존 인덱스
        const reordered = p.order.map((i) => front[i] as TileId);
        const rest = zone.tileIds.slice(PEEK);
        const newKinds = reordered.map((id) => kindKey(kindOf(state, id)));
        return {
          ...state,
          zones: {
            ...state.zones,
            [WALL]: { ...zone, tileIds: [...reordered, ...rest] },
          },
          augmentData: {
            ...state.augmentData,
            // 공개 채널을 새 순서로 갱신 (재배열한 대로 보인다)
            [peekViewKey(p.holder)]: newKinds,
            // 재배열 완료 — 이번 턴 재배열 마커를 지운다 (한 번만)
            [revealTurnKey(state, p.holder)]: -1,
            // 재배열은 국에 1회 — 이후 발동은 열람만 된다
            [orderUsedKey(state, p.holder)]: true,
          },
        };
      });
    }

    /*
     * 예언한 4장은 뽑히는 대로 하나씩 줄어든다 — **남은 장수만** 센다.
     *
     * ⚠ 보유자 본인의 쯔모만 세면 안 된다. 이 예언은 네 자리의 다음 쯔모를 함께
     * 보여 주므로, **누가 뽑든** 패산 앞이 한 장씩 줄어든다.
     * 영상패(깡)는 왕패에서 오므로 패산 순서를 소모하지 않는다 — 세지 않는다.
     */
    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.rinshan) return;
      const left = peekLeftOf(rc.state, holder);
      if (left <= 0) return;
      rc.emit(augmentDataSet(peekLeftKey(rc.state, holder), left - 1));
    });

    ctx.holderTurnOptions((state) => {
      if (canReveal(state, holder)) return [{ type: REVEAL, payload: {} }];
      if (
        revealedThisTurn(state, holder) &&
        !flagOf(state, orderUsedKey(state, holder)) &&
        frontIds(state).length >= PEEK
      ) {
        return ALL_ORDERS.map((order) => ({ type: ORDER, payload: { order: [...order] } }));
      }
      return [];
    });

    /*
     * 잔여 쿨다운(순)과 재배열 소진 여부를 이름표 pill에 상시로 낸다.
     *
     * 예전에는 둘 다 화면에 없었다 — 열람 버튼이 사라진 이유도, 두 번째 발동에서
     * **드래그가 안 먹히는 이유**도(재배열은 국에 1회) 알 방법이 없었다.
     * 값이 같으면 아무것도 내지 않아 반응 연쇄는 한 겹에서 멈춘다.
     */
    ctx.reaction("*", (_event, rc) => {
      const left = cooldownLeft(rc.state, holder);
      if (rc.state.augmentData[cdTurnsKey(holder)] !== left) {
        rc.emit(augmentDataSet(cdTurnsKey(holder), left));
      }
      const spent = flagOf(rc.state, orderUsedKey(rc.state, holder));
      if (spent && rc.state.augmentData[reorderSpentKey(holder)] !== true) {
        rc.emit(augmentDataSet(reorderSpentKey(holder), true));
      }

      /*
       * 예언 채널을 **지금 패산 앞**에서 매번 다시 만든다.
       *
       * 예전에는 발동 시점의 kind 배열을 저장해 두고 `TILE_DRAWN` 에서 앞을 한 장씩
       * 깎기만 했다. 그런데 패산 앞을 `TILE_DRAWN` 없이 가져가는 경로가 여럿이다 —
       * `future_sight`(앞 3장 교환) · `full_hand_swap`(앞에서 13장 refill) ·
       * `meld_dissolve`(보충패). 그 뒤로 예언 채널은 **이미 남의 손에 들어간 패**를
       * "다음 4장"이라고 국 끝까지 확신 있게 보여 줬다 — 정보 증강이 틀린 정보를 주는
       * 셈이고(docs/25 정보 #5), 더 나쁜 것은 재배열이 그 잘못된 표시 위에서 확정된다는
       * 점이다. 드래그로 옮긴 것은 화면의 pin8이 아니라 실제 패산의 pin9였다
       * (2026-08-22 QA aug-2 확정 4, 실측 재현: `qa-lab/round2/aug-2/r_foresight_stale.ts`).
       *
       * 삼세 예지가 같은 문제를 2026-08-01에 이렇게 고쳤고, 거기 주석이 이유까지 적어
       * 뒀다 — "증강이 새로 생길 때마다 같은 구멍이 다시 열리므로 **매 이벤트마다** 다시
       * 계산한다"(`triple_peek.ts`). 경로를 하나씩 막는 대신 파생값으로 둔다.
       * "발동 시점 스냅샷"이 아니라 "지금 패산 앞 N장"이 카드가 약속한 것이기도 하다.
       *
       * 값이 같으면 아무것도 내지 않아 반응 연쇄는 한 겹에서 멈춘다.
       */
      const peekLeft = peekLeftOf(rc.state, holder);
      if (peekLeft > 0) {
        const kinds = frontIds(rc.state)
          .slice(0, peekLeft)
          .map((id) => kindKey(kindOf(rc.state, id)));
        const shown = rc.state.augmentData[peekViewKey(holder)];
        if (!sameKinds(shown, kinds)) {
          rc.emit(augmentDataSet(peekViewKey(holder), kinds));
        }
      } else if (
        Array.isArray(rc.state.augmentData[peekViewKey(holder)]) &&
        (rc.state.augmentData[peekViewKey(holder)] as unknown[]).length > 0
      ) {
        // 네 장이 전부 뽑혔으면 채널을 비운다 (예언이 끝났다)
        rc.emit(augmentDataSet(peekViewKey(holder), []));
      }
    });

    // 발동한 국에 화료하면 +2판
    addWinHanBonus(ctx, (state) =>
      flagOf(state, usedKey(state, holder)) ? WIN_BONUS_HAN : 0,
    );
  },
  /**
   * 봇: **공개(reveal)까지만** 한다. 재배열(order)은 상대 손 정보 없이 판단할 수 없어
   * 손대지 않고(항등) 넘기지만, 공개 자체가 다음 한 바퀴의 쯔모를 알려 주고
   * 발동 국 화료에 +2판을 얻으므로 순이득이다. 이른 소모만 피하도록 중반에 연다.
   * (2026-07-26: 정책이 아예 없어 제시 30회에 발동 0회였다.)
   */
  // 예전에는 "버림패 3장 이상"이라는 순목 조건을 이 파일이 직접 들고 있었다.
  // 그 판단은 증강이 아니라 판의 문제라 planner의 `inform` 적기가 대신한다.
  bot: plan({
    intent: "inform",
    pick: ({ options }) => options.find((o) => o.type === REVEAL) ?? null,
  }),
});
