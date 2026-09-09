/**
 * 삼세 예지 (triple_peek, prism) — "내 앞에 놓일 세 장을 미리 읽는다".
 *
 * **2국에 1회**, 자기 턴(turn.act)에 선언하면 그 국이 끝날 때까지 **내 다음 쯔모 세 장의
 * 종류**가 나에게만 계속 보인다. 실제 타일이 아니라 '종류(kind)'만 — 패산은 뒷면이라
 * 클라이언트가 tileId를 그릴 수 없으므로, kindKey 문자열 세 개를 보유자 전용
 * 채널에 실어 미니 패로 렌더한다. 예지(foresight)가 '한 바퀴(네 자리)'를 재배열해
 * 판을 설계한다면, 삼세 예지는 오직 **내 몫의 다음 세 쯔모**만 조용히 들여다본다.
 *
 * 2026-08-12(사용자 지시) **스냅샷 → 실시간**.
 * 예전에는 선언한 그 순간의 패산·자리 배치로 계산한 세 장을 그대로 얼려 두고, 내가 한 장
 * 뽑을 때마다 앞에서 하나씩 지웠다. 그래서 누군가 후로(펑·치·깡)를 해 쯔모 차례가 밀리면
 * **예언한 패가 안 들어오고 엉뚱한 패가 들어왔다** — 정보 증강이 틀린 정보를 확신 있게
 * 주는 셈이었다. 이제 패산·차례가 움직일 때마다(쯔모·버림·후로·깡) 다시 계산해 올린다.
 *
 * 설계 결정:
 * - 액션 `triple_peek_use {}` 하나. turn.act·자기 턴·재사용 대기 없음·패산이 충분할 때만.
 * - 다음 쯔모 순서는 패산(state.zones[WALL].tileIds)을 index 0=바로 다음 뽑을 패로 보고,
 *   **다음에 뽑을 자리**부터 turn.direction 방향으로 돌리며 정한다. 그 "다음 자리"는
 *   페이즈가 가른다 — `turn.draw`면 아직 안 뽑은 현재 자리 자신이고, 그 밖(act·reaction)
 *   이면 현재 자리의 **다음** 자리다(현재 자리는 이미 뽑았거나 후로로 뽑지 않고 버린다).
 * - 저장은 kindKey **문자열 3개 배열**. tileId가 아니다(패산은 숨겨져 있어 클라가
 *   tileId를 못 그린다). 종류만 알면 미니 패로 표시할 수 있다. 남은 쯔모가 세 장이
 *   안 되면 그만큼만 실린다(국 끝물에는 두 장·한 장으로 줄어든다).
 * - 무엇을 봤는지는 **보유자만** 안다(viewKey(holder,...)). 발동 사실 자체는
 *   전원 공개 마커로 알린다(상대는 예지가 일어났다는 것만 안다, 내용은 모른다).
 * - 사용 제한은 **2국에 1회**다(2026-08-12 사용자 하향 — 그전에는 매 국 1회였다).
 *   "N국에 1회" 공용 배관(`trackRoundSeq`/`cooldownReady`/`cooldownUse`)을 그대로 쓴다 —
 *   roundKey("장-국-본장") 산술로는 국 수를 셀 수 없어(연장은 본장만 오른다) 국이
 *   시작될 때마다 +1 하는 순번을 따로 센다. 자세한 이유는 util.ts의 `roundSeqKey` 주석.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  kindKey,
  kindOf,
  nextSeat,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  RuleRegistry,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  flagOf,
  roundKey,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { bottomDealArmed } from "./bottom_deal.js";
import { plan } from "./botPlan.js";
import { reservedNextDrawKind } from "./drawMutators.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "triple_peek";
const ACTION = "triple_peek_use";
/** 미리 읽는 다음 쯔모 장수 */
const PEEK = 3;

/** 몇 국에 한 번 쓸 수 있는가 — **2국에 1회**(2026-08-12 사용자 하향) */
const COOLDOWN_ROUNDS = 2;
/** 지금 쓸 수 있는가 (마지막 사용에서 2국이 지났는가) */
const hasUsesLeft = (state: GameState, holder: PlayerId): boolean =>
  cooldownReady(state, ID, holder, COOLDOWN_ROUNDS);
/** 예지 결과(kindKey 최대 3개)를 담는 보유자 전용 채널 — 판이 움직일 때마다 다시 쓰인다 */
const resultKey = (holder: PlayerId): string => roundViewKey(holder, ID);
/**
 * 이번 국에 예지를 켰는가 (국 스코프).
 *
 * 실시간 갱신의 스위치다. 결과 채널이 비어 있는 것("지금은 보여줄 쯔모가 없다")과
 * 아예 켜지 않은 것을 구분해야, 국 끝물에 잠깐 비었다가 다시 채워질 수 있다.
 */
const activeKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "on", state, holder);

/** 발동 사실만 알리는 전원 공개 마커 (내용 없음) */
const noticeKey = (holder: PlayerId): string =>
  roundViewKey("*", `${ID}:${holder}`);

/** turn.direction 규칙 해석 (기본 1=시계) */
function turnDirection(state: GameState, rules: RuleRegistry): number {
  return rules.has("turn.direction")
    ? rules.resolve<number>("turn.direction", { state })
    : 1;
}

/**
 * 패산 index 0(=바로 다음 뽑을 패)을 **누가** 가져가는가.
 *
 * `turn.draw`는 현재 자리가 아직 안 뽑은 상태라 그 자리 자신이고, 그 밖(`turn.act`·
 * `reaction`)이면 현재 자리는 이미 뽑았거나(쯔모) 후로로 뽑지 않고 버리는 중이라
 * **다음** 자리다. 후로는 turnSeat을 운 사람으로 옮기고 그 사람은 뽑지 않으므로
 * 이 규칙 하나로 펑·치·깡 뒤에도 그대로 맞는다.
 */
function nextDrawSeat(state: GameState, dir: number): number {
  return state.round.phase === "turn.draw"
    ? state.round.turnSeat
    : nextSeat(state, state.round.turnSeat, dir);
}

/**
 * 패산을 훑어 보유자의 다음 쯔모 **최대 PEEK장**의 kind를 순서대로 모은다.
 * 지금 상태로 다시 계산하므로 후로로 차례가 밀려도 어긋나지 않는다(실시간).
 * 남은 쯔모가 모자라면 그만큼만 돌려준다.
 *
 * ⚠ 예전에는 "패산 index 0부터 좌석이 한 칸씩 돌며 뽑는다"만 전제했다. 밑장빼기
 * (`bottom_deal`)는 앞을 소모하지 않고 **최후미**를 뽑으므로 그 전제가 통째로
 * 깨진다 — ① 뒤따르는 좌석의 몫이 한 칸씩 밀리고 ② 내가 선언했으면 다음 한 장은
 * 애초에 이 목록에 없는 패다. 남의 좌석이 써도 내 예고가 깨졌고, 실측 4/4·3/4가
 * 틀렸다(2026-08-23, QA synergy3 kandora 확정 3). "어긋나지 않는다"고 적힌 카드가
 * 틀린 정보를 확신 있게 주는 것이 이 증강의 가장 나쁜 실패다.
 *
 * 그래서 앞뒤 두 손가락으로 헤아린다: 좌석마다 밑장 예약이 걸려 있으면 뒤에서,
 * 아니면 앞에서 한 장 가져간다. 예약은 쓰면 사라지므로(국당 여러 번이지만 매 순
 * 1회) 한 좌석당 한 번만 뒤를 쓴다. 예약 여부는 이미 전원 공개 정보다
 * (`bottom_deal`의 noticeKey) — 새로 새는 정보가 없다.
 *
 * ⚠ **뽑은 뒤에 종류가 바뀌는 카드**도 같은 결의 구멍이었다(2026-08-31, QA synergy4
 * info 확정 2). 소환(`conjure_draw`)의 예약이 서 있는데도 예고는 패산 kind 그대로였다 —
 * 예고 pin9/sou1/sou2, 실제로 들어온 것은 man1. 그래서 **내 다음 한 장**에는
 * `reservedNextDrawKind`(쯔모 변형 카드의 공용 술어)를 얹는다: 무엇이 올지 확정적으로
 * 아는 소환은 그 kind로 갈아 끼우고, 그때의 손패가 정하는 거신병(`giant_god`)의
 * 오름패는 **예고하지 않는다**(목록에서 뺀다). 셋 다 보유자 자신의 예약이라 새로 새는
 * 정보가 없다.
 */
function peekMyDrawKinds(
  state: GameState,
  rules: RuleRegistry,
  holder: PlayerId,
): string[] {
  const wall = state.zones[WALL]?.tileIds ?? [];
  const dir = turnDirection(state, rules);
  let seat = nextDrawSeat(state, dir);
  const kinds: string[] = [];
  let front = 0;
  let back = wall.length - 1;
  const armed = new Set<PlayerId>(
    state.players.filter((p) => bottomDealArmed(state, p.id)).map((p) => p.id),
  );
  while (front <= back && kinds.length < PEEK) {
    const who = playerAtSeat(state, seat).id;
    const fromBottom = armed.has(who);
    if (fromBottom) armed.delete(who);
    const tileId = fromBottom ? wall[back] : wall[front];
    if (fromBottom) back--;
    else front++;
    if (tileId !== undefined && who === holder) {
      kinds.push(kindKey(kindOf(state, tileId)));
    }
    seat = nextSeat(state, seat, dir);
  }
  // 내 다음 한 장에 쯔모 변형이 예약돼 있으면 그 한 장을 바로잡는다 (위 ⚠ 주석)
  const reserved = reservedNextDrawKind(state, holder);
  if (reserved === "unknown") kinds.shift();
  else if (reserved !== null && kinds.length > 0) kinds[0] = kindKey(reserved.kind);
  return kinds;
}

const peekAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no triple_peek augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "on cooldown (once per 2 rounds)";
    // 다음 세 쯔모를 온전히 읽을 수 없으면(패산이 얕음) 발동 불가
    if (peekMyDrawKinds(state, rules, req.player).length < PEEK) {
      return "not enough wall tiles";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const kinds = peekMyDrawKinds(state, rules, req.player);
    return [
      // 쿨다운 기준점 + 잔량 표시 (공용 배관)
      ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
      // 이번 국 동안 실시간 갱신을 켠다
      augmentDataSet(activeKey(state, req.player), true),
      // 내용(kind 3개)은 보유자만 본다 — 이후 판이 움직일 때마다 다시 계산해 덮어쓴다
      augmentDataSet(resultKey(req.player), kinds),
      // 발동 사실만 전원에게 (내용 없는 마커)
      augmentDataSet(noticeKey(req.player), {
        round: `${state.round.prevalentWind}-${state.round.roundNumber}-${state.round.honba}`,
        turnCount: state.round.turnCount,
      }),
    ];
  },
};

export const triplePeek: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "info",
  complexity: 1,
  name: "삼세 예지",
  description:
    "(2국에 1회) 자기 순에 선언하면 그 국이 끝날 때까지 내 다음 쯔모 세 장의 종류가 나에게만 실시간으로 보인다.",
  detail:
    "선언하면 그 국이 끝날 때까지 내 다음 쯔모 세 장이 나에게만 실시간으로 보인다.\n\n누군가 울어서 차례가 밀리면 보이는 세 장도 그에 맞춰 다시 계산된다. 내가 쯔모할 패가 3장 남지 않았으면 사용할 수 없다.",
  // 봇: 자해 위험이 전혀 없다 — 옵션이 뜨면 곧바로 선언한다.
  bot: plan({
    intent: "inform",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) engine.actions.register(peekAction);

    /*
     * 국 진행 순번 + 쿨다운 잔량 표시를 국 경계마다 갱신한다 (공용 배관).
     * 잔량은 이름표 pill이 "🕐N국"으로 직접 그린다 — 횟수형(`publishUsesLeft`)의
     * "n회"는 2국에 1회짜리에는 맞지 않는다("이번 국 1회를 모두 썼다"로 읽힌다).
     */
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    /**
     * **실시간 갱신** — 판이 움직일 때마다 "지금 기준 내 다음 세 쯔모"를 다시 올린다.
     *
     * 켠 국 동안 계속 돈다: 내가 뽑으면 앞의 한 장이 빠지고 뒤에서 한 장이 새로 들어오며,
     * 누가 후로해 차례가 밀리면 배정 자체가 다시 계산된다. 예전의 "발동 순간 스냅샷 +
     * 뽑을 때마다 앞에서 하나 삭제" 방식은 후로 한 번에 통째로 어긋났다.
     *
     * ⚠ 예전에는 `TILE_DRAWN`·`TILE_DISCARDED`·`CALL_MADE` 셋에만 걸려 있었다.
     * 패산을 **직접 옮기는** 증강(미래를 보는 자 future_sight는 커스텀 이벤트로 패산 앞
     * 3장을 손에 넣고 2장을 밑으로 돌린다)은 그 셋을 하나도 발행하지 않아, 채널이
     * **이미 사라진 패**를 "다음 쯔모"로 계속 광고했다 — 한 사람의 패산 조작이 네 좌석의
     * 예고를 전부 망가뜨렸다(qa-lab info 확정 1). 이벤트를 열거하는 방식은 패산을 만지는
     * 증강이 새로 생길 때마다 같은 구멍이 다시 열리므로, **매 이벤트마다** 다시 계산하고
     * 값이 달라졌을 때만 발행한다(같으면 아무것도 안 내므로 반응 연쇄는 한 겹에서 멈춘다).
     */
    const resync = (
      _event: unknown,
      rc: { state: GameState; emit: (e: ProposedEvent) => void },
    ): void => {
      if (!flagOf(rc.state, activeKey(rc.state, holder))) return;
      const kinds = peekMyDrawKinds(rc.state, engine.rules, holder);
      const cur = rc.state.augmentData[resultKey(holder)];
      if (
        Array.isArray(cur) &&
        cur.length === kinds.length &&
        (cur as string[]).every((k, i) => k === kinds[i])
      ) {
        return;
      }
      rc.emit(augmentDataSet(resultKey(holder), kinds));
    };
    ctx.reaction("*", resync);

    // 아직 안 썼으면 보유자 턴에 선언 후보를 낸다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      hasUsesLeft(state, holder) ? [{ type: ACTION, payload: {} }] : [],
    );
  },
});
