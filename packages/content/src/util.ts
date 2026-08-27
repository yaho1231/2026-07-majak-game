/**
 * content util — 콘텐츠 팩 증강이 공유하는 작은 도우미들.
 *
 * 규칙:
 * - 모든 난수는 state.prngState에서 이어받고, 소비 결과를 이벤트 payload의
 *   prngState로 되돌려 놓는다 (결정론·리플레이 보장).
 * - 증강 전용 데이터 키는 "<augmentId>:" 접두를 쓴다.
 * - 클라이언트에 보여줄 값은 view:{playerId}:{key} / view:*:{key} 로 쓴다.
 */

import {
  Prng,
  ROUND_SCOPED_MARK,
  ROUND_SETTLED,
  ROUND_STARTED,
  SETTLE_LAYER,
  SETTLE_STAGE,
  settlePriority,
  settleSeatAxis,
  augmentDataSet,
  augmentStageKey,
  calculateScore,
  kindOf,
  playerAtSeat,
  sameKind,
  WALL,
  DEAD_WALL,
} from "@majak/core";
import type {
  AugPointNote,
  AugmentContext,
  GameState,
  PeekVisibility,
  PlayerId,
  ProposedEvent,
  RoundSettledPayload,
  RuleRegistry,
  SettleStage,
  TileId,
  TileKind,
  VisibilityRule,
  WinInfo,
  YakuRegistry,
} from "@majak/core";

/** state.prngState에서 이어지는 PRNG. 사용 후 getState()를 이벤트에 실어라 */
export function statePrng(state: GameState): Prng {
  const prng = new Prng(0);
  prng.setState(state.prngState);
  return prng;
}

/** 현재 국을 식별하는 키 (국이 바뀌면 달라진다 — 국 단위 플래그용) */
/**
 * **아직 안 나온 그 종류의 장수** — 패산 + 왕패에 남아 있는 수.
 *
 * 「없는 5번째 장을 만들지 않는다」를 지키려는 증강이 공유하는 자다. 손·바닥·후로에
 * 있는 장은 이미 '나온' 장이고, 여기 남은 것이 정확히 아직 안 나온 나머지다.
 *
 * **왜 함수로 뽑았나**: `off_by_one`이 이 검사를 먼저 갖췄는데(2026-08-20 QA 리치
 * 확정 3) `peek_riichi_waits`의 위조는 같은 함정에 그대로 빠져 있었다(QA 2차 aug-3
 * 확정 1) — 같은 규칙이 두 곳에 필요한데 한 곳에만 있으면, 그 갈림은 언제나
 * **느슨한 쪽이 통과되는 방향**으로만 드러난다. 세 번째 자리가 생기면 여기를 쓴다.
 *
 * 장수 세기는 마작 방어의 근간이다 — "이 패는 4장 다 보였으니 절대 안 맞는다"라고
 * 세고 던진 안전패에 맞으면 그건 대응 자체가 불가능한 화료가 된다.
 */
export function copiesLeftUndrawn(state: GameState, kind: TileKind): number {
  let n = 0;
  for (const zone of [WALL, DEAD_WALL]) {
    for (const id of state.zones[zone]?.tileIds ?? []) {
      if (sameKind(kindOf(state, id), kind)) n++;
    }
  }
  return n;
}

export function roundKey(state: GameState): string {
  const r = state.round;
  return `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
}

/**
 * 이 사람이 **이번 정산에서 회수한 공탁(리치봉)** 금액.
 *
 * ⚠ `payload.riichiPot`을 보면 안 된다 — 화료 정산에서 그 필드는 **다음 국으로 넘길
 * 공탁**이라 언제나 0이다(`standardActions.ts` `riichiPot: 0`). 회수액은 첫 화료자의
 * `winInfos[].riichiPotGain`에만 실린다. 배수 증강들이 `p.riichiPot`을 빼는 코드를
 * 갖고도 공탁을 그대로 곱하고 있던 원인이 이것이다(QA score-a 확정 1·2).
 */
export function riichiPotGainOf(
  p: RoundSettledPayload,
  player: PlayerId,
): number {
  return (p.winInfos ?? []).find((w) => w.winner === player)?.riichiPotGain ?? 0;
}

/**
 * 이 사람이 이번 화료로 받은 **본장 가산분**.
 *
 * 론이면 첫 화료자만, 쯔모면 셋에게서 걷은 합계가 `winInfo.honbaBonus`에 실린다 —
 * 론만 따로 계산하면 쯔모 본장이 배수에 휩쓸린다(QA score-a 확정 2).
 */
export function honbaGainOf(p: RoundSettledPayload, player: PlayerId): number {
  return (p.winInfos ?? []).find((w) => w.winner === player)?.honbaBonus ?? 0;
}

/**
 * "게임당 N회" 액티브의 N — 매치 길이에 비례한다.
 * 동풍전(tonpuu)=1회, 반장전(hanchan, 기본)=2회.
 * (config.mode가 없으면 반장전로 본다 — 서버 기본과 일치.)
 *
 * 사용 패턴: `counterOf(state, usesKey(holder)) < matchUses(state)`로 남았는지 보고,
 * 발동 시 `augmentDataSet(usesKey(holder), counterOf(state, usesKey(holder)) + 1)`.
 * usesKey에는 roundKey를 섞지 않는다 — 게임(매치) 전체에 걸쳐 누적된다.
 */
export function matchUses(state: GameState): number {
  return scaledUses(state, 1);
}

/**
 * **매치 길이에 비례하는 사용 횟수** — 동풍전 기준 N회를 반장전에서는 올림 1.5배로 준다.
 *
 * 왜: "게임 내 5회" 같은 매치 예산은 전부 **동풍전(4국)을 기준으로** 정해져 있었는데,
 * 반장전은 국이 두 배 가까이(8국+) 도는데도 같은 5회였다 — 같은 카드가 반장전에서만
 * 국당 절반 값이 된다(2026-08-23 사용자 지시). 국 수에 정비례로 두 배를 주면 이번엔
 * 매치당 총량이 너무 커지므로, **1.5배(올림)**로 그 사이를 잡는다.
 *
 * | 동풍전 | 1 | 2 | 3 | 5 |
 * | 반장전 | 2 | 3 | 5 | 8 |
 *
 * `matchUses`(동풍전 1 · 반장전 2)가 이 함수의 N=1 자리다 — 두 곳으로 갈라지지 않게
 * 그쪽이 이쪽을 부른다.
 *
 * 사용 패턴: `counterOf(state, usesKey(holder)) < scaledUses(state, N)`으로 남았는지 보고,
 * 발동 시 `augmentDataSet(usesKey(holder), counterOf(state, usesKey(holder)) + 1)`.
 * usesKey에는 roundKey를 섞지 않는다 — 게임(매치) 전체에 걸쳐 누적된다.
 *
 * @param tonpuuUses 동풍전에서의 횟수 (카드에 적히는 기준값)
 */
export function scaledUses(state: GameState, tonpuuUses: number): number {
  return state.config.mode === "tonpuu"
    ? tonpuuUses
    : Math.ceil(tonpuuUses * 1.5);
}

/**
 * **매치 길이에 비례하는 쿨다운 국 수** — 동풍전 기준 N국을 반장전에서는 올림 1.5배로.
 *
 * (2026-08-27 밸런스 웨이브) "N국에 1회" 액티브의 N도 매치 길이를 따라야 한다.
 * 반장전은 국이 두 배 가까이 도는데 쿨다운이 그대로면 같은 카드가 반장전에서만
 * **매치당 발동 횟수가 두 배**가 된다 — `scaledUses`가 횟수 쪽에서 바로잡은 것과
 * 정확히 같은 왜곡이 쿨다운 쪽에 남아 있었다.
 *
 * | 동풍전 | 1 | 2 | 3 |
 * | 반장전 | 2 | 3 | 5 |
 *
 * ⚠ **`scaledUses`와 산식은 같지만 의미가 다르다.** 저쪽은 "매치 동안 몇 번",
 * 이쪽은 "다시 열릴 때까지 몇 국". 한 함수로 합치면 나중에 한쪽 곡선만 손볼 때
 * 다른 쪽이 조용히 함께 움직인다 — 그래서 일부러 따로 둔다.
 *
 * @param tonpuuRounds 동풍전에서의 쿨다운 국 수 (카드에 적히는 기준값)
 */
export function scaledCooldown(state: GameState, tonpuuRounds: number): number {
  return state.config.mode === "tonpuu"
    ? tonpuuRounds
    : Math.ceil(tonpuuRounds * 1.5);
}

/**
 * 지금이 이 플레이어의 **국 첫 순**인가 — 아직 이 국에 한 장도 버리지 않은 자기 턴.
 *
 * 저장소 공용 규약이다(일확천금 `atFirstTurn`·밥상 뒤엎기 `atFirstHand`·통째로
 * 바꾸기가 전부 `discardCount === 0`을 본다). **`turnCount`로 재지 않는다** —
 * `turnCount`는 친의 쯔모에만 오르므로, 내 순이 오기 전에 누가 울면 내가 아직
 * 아무것도 하지 않았는데 창이 닫힌다(2026-08-25 사용자 보고).
 */
export function atHolderFirstTurn(state: GameState, player: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (playerAtSeat(state, state.round.turnSeat).id !== player) return false;
  return (state.round.byPlayer[player]?.discardCount ?? 0) === 0;
}

/** 본인 전용 뷰 채널 키 (PlayerView.augmentView로 전달됨) */
export function viewKey(player: PlayerId | "*", key: string): string {
  return `view:${player}:${key}`;
}

/**
 * **국 스코프** 뷰 채널 키 — 국이 끝나면 엔진이 알아서 지운다.
 *
 * "이번 국 동안"만 성립하는 효과의 공개 표시(일확천금의 배수, 무장해제의 지목,
 * 단색 세계의 무늬 …)는 반드시 이걸로 쓴다. `viewKey`(고정 키)로 쓰면 효과 쪽
 * roundKey는 만료됐는데 화면 표시만 다음 국에 그대로 남는다 — 2026-07-31 사용자
 * 보고("국이 지나갔는데 효과·설명이 남아 있다")의 원인이 전부 이것이었다.
 *
 * 표식은 `setupRound`가 국 경계에서 떼어 지우고, `buildPlayerView`가 클라이언트에
 * 넘기기 전에 이름에서 떼어 낸다 — 클라이언트 코드는 종전 채널 이름 그대로 읽는다.
 *
 * 국을 넘어 유지돼야 하는 값(스택·낙인·게임당 1회 지정)에는 쓰지 말 것.
 */
export function roundViewKey(player: PlayerId | "*", key: string): string {
  return `${viewKey(player, key)}${ROUND_SCOPED_MARK}`;
}

/**
 * 남은 사용 횟수 뱃지 채널 (보유자 전용, 고정 키).
 *
 * 값은 `{ left, total, scope }` — 클라이언트 이름표 pill이 "n회"로 그리고 툴팁에
 * "게임 내 n/N회 남음"을 적는다. `roundViewKey`가 아니라 **고정 키**다: 매치 스코프
 * 카운터("게임 내 2회")는 국을 넘어 살아 있어야 하고, 국 스코프 카운터는 국이 바뀔 때
 * `publishUsesLeft`가 새 값으로 덮어쓴다.
 */
export function usesViewKey(holder: PlayerId, augmentId: string): string {
  return viewKey(holder, `uses:${augmentId}`);
}

/** `usesViewKey` 채널에 실리는 값 */
export interface UsesLeftView {
  /** 앞으로 몇 번 더 쓸 수 있는가 */
  left: number;
  /** 최대 몇 번인가 */
  total: number;
  /** 카운터가 게임(매치) 전체인가, 국 단위인가 */
  scope: "match" | "round";
}

/**
 * **남은 사용 횟수를 보유자 화면에 상시 노출한다** (횟수형 증강 공용).
 *
 * 왜 필요한가: "게임 내 2회"라고 적힌 증강이 몇 번 남았는지가 화면 어디에도 없었다.
 * 등가교환·간파·안개처럼 카운터가 `augmentData` 안에만 있는 증강은, 액티브 버튼이
 * 사라지고 나서야 "아, 다 썼구나"를 알 수 있었다(2026-08-12 사용자 지적).
 * 연금술사·염색이 각자 손으로 만들어 두었던 `{id}:left` 채널을 규약으로 끌어올린 것이다.
 *
 * 동기화 시점: **모든 이벤트**(`"*"`). 값이 달라질 때만 발행하므로 그 외에는 no-op다.
 *
 * 예전에는 쯔모·버림·국 시작 세 이벤트에만 걸려 있었다. 그런데 액티브 증강을 쓰는
 * 순간에 일어나는 것은 그 증강의 **자기 이벤트**(PondSnatchPerformed·mono_world …)라,
 * 카운터는 그 자리에서 줄어드는데 화면의 "n회"는 **다음 쯔모나 버림이 올 때까지**
 * 그대로 서 있었다 — "날치기·단색 세계 횟수가 안 줄어든다", "카운트가 나중에 줄어든다"
 * (2026-08-16 사용자 보고)가 전부 이 한 가지였다. 발동 직후에 갱신되어야 하는데 그
 * 시점을 이벤트 이름으로 열거하는 방식은 증강마다 새로 빠뜨리게 된다(날치기는 카운터를
 * 리듀서 안에서 직접 올려 augmentData 이벤트조차 나지 않는다).
 *
 * 값이 같으면 아무것도 내지 않으므로 연쇄는 한 겹에서 멈춘다 — 발행한 AugmentDataSet을
 * 다시 보고도 계산 결과가 같아 재발행이 없다.
 *
 * @param compute 지금 상태에서 `{left, total}` — 아직 알 수 없으면 null
 */
export function publishUsesLeft(
  ctx: AugmentContext,
  compute: (state: GameState) => { left: number; total: number } | null,
  scope: "match" | "round" = "match",
): void {
  const key = usesViewKey(ctx.holder, ctx.augmentId);
  const sync = (_event: unknown, rc: { state: GameState; emit: (e: ProposedEvent) => void }): void => {
    const next = compute(rc.state);
    if (next === null) return;
    const cur = rc.state.augmentData[key] as UsesLeftView | undefined;
    if (
      cur !== undefined &&
      cur.left === next.left &&
      cur.total === next.total &&
      cur.scope === scope
    ) {
      return;
    }
    rc.emit(augmentDataSet(key, { left: next.left, total: next.total, scope }));
  };
  ctx.reaction("*", sync);
}

/**
 * 두 플레이어의 손패를 **통째로 맞바꿔도 안전한가**.
 *
 * 손패 수·화료형(`deal.handSize`·`scoring.totalSets`) 규칙은 **플레이어에 고정**돼 있어
 * 타일과 함께 이동하지 않는다. 진짜 용(16장)처럼 장수가 다른 상대와 손을 바꾸면 한쪽은
 * 필요한 장수를 못 채워 화료·버림 판정이 깨진다.
 *
 * ⚠ 배패 장수만 보면 부족하다 — **후로(멘쯔)는 손패와 함께 이동하지 않기 때문**이다.
 * 멘쯔가 1개인 사람(손패 10장)과 0개인 사람(손패 13장)은 `deal.handSize`가 둘 다 13이라
 * 예전 가드를 그대로 통과했고, 바꾸고 나면 "손패 13장 + 멘쯔 1개 = 16장"처럼 화료가
 * 물리적으로 불가능한 손이 남아 **그 국 내내 벽돌**이 됐다(2026-07-29 감사, 실측 재현).
 * 그래서 멘쯔 수까지 같은지 함께 본다.
 *
 * ⚠⚠ 그런데 **멘쯔 개수도 부족했다** — 후로가 손에서 빼 가는 장수는 종류마다 다르다.
 * 깡은 3장(안깡은 4장), 퐁·치·국사퐁은 2장이다. 멘쯔 1개끼리라도 깡 보유자는 손패 10장,
 * 퐁 보유자는 11장이라 옛 가드를 그대로 통과했고, 바꾸고 나면 강탈자 손이
 * **11 + 쯔모 1 = 12장**(정상 11장)이 되어 그 국 내내 유효 14장으로 놀았다
 * (2026-08-22 QA aug-2 확정 1, 실측 재현: `qa-lab/round2/aug-2/r_fullswap.ts`).
 * 반대 조합이면 한 장 모자란 벽돌 손이 된다. 그래서 개수가 아니라 **손패 슬롯 수**
 * (`deal.handSize − Σ 멘쯔가 손에서 가져간 장수`)를 비교한다.
 *
 * 손에서 가져간 장수는 멘쯔 종류를 나열하지 않고 실물로 센다 —
 * `tileIds.length − (남의 패를 울어 온 것이면 1)`. 종류가 늘어도(국사퐁·가깡·묵계)
 * 이 식은 그대로 맞고, 새 종류를 여기 등록하는 것을 잊어 가드가 다시 새는 일이 없다.
 *
 * 손패를 통째로 옮기는 증강(자리 바꿈·통째로 바꾸기)의 **공용 가드** —
 * 여기 한 곳에서만 판정해 사본이 갈라져 가드가 빠지는 일을 막는다.
 */
export function sameHandSize(
  rules: {
    resolve: <T>(rule: string, ctx: { playerId: PlayerId; state: GameState }) => T;
  },
  state: GameState,
  a: PlayerId,
  b: PlayerId,
): boolean {
  const sizeA = rules.resolve<number>("deal.handSize", { playerId: a, state });
  const sizeB = rules.resolve<number>("deal.handSize", { playerId: b, state });
  if (sizeA !== sizeB) return false;
  // 멘쯔 개수가 같아도 손패 슬롯 수는 다를 수 있다(깡 ↔ 퐁). 슬롯 수로 본다.
  return concealedSlotsOf(state, a, sizeA) === concealedSlotsOf(state, b, sizeB);
}

/**
 * 이 사람이 지금 손에 들고 있어야 할 **슬롯 수**(쯔모패 제외).
 *
 * `deal.handSize`(보통 13)에서 후로가 손에서 가져간 장수를 뺀다. 실제 손패 배열 길이를
 * 그대로 쓰지 않는 이유: 쯔모를 마친 사람은 한 장 더 들고 있어 양쪽을 비교할 수 없고,
 * 손패가 이미 어긋난 상태에서는 "어긋남을 정상으로 인정"해 버린다.
 */
export function concealedSlotsOf(
  state: GameState,
  id: PlayerId,
  handSize = 13,
): number {
  const melds = state.round.byPlayer[id]?.melds ?? [];
  const taken = melds.reduce(
    (n, m) => n + m.tileIds.length - (m.calledTileId === undefined ? 0 : 1),
    0,
  );
  return handSize - taken;
}

/**
 * 두 열람(peek) 가시성을 **더 넓은 쪽으로** 합친다.
 *
 * 열람 범위를 넓히는 증강이 둘 이상 겹칠 때(절벽 위에 피어난 꽃 × 왕패의 주인) 각자
 * `cur`를 무시하고 자기 값으로 덮으면, 최종 범위가 **드래프트 픽 순서**로 갈린다 —
 * 늦게 설치된 쪽이 이겨 먼저 픽한 증강의 핵심 능력이 조용히 사라졌다(2026-07-29 감사).
 * 열람은 "더 많이 보는 쪽"으로 합치는 것이 의미상 옳고, 순서와 무관해진다.
 *
 * 이미 전면 공개(`public`)라면 그대로 둔다 — 그보다 넓을 수는 없다.
 */
export function widenPeek(
  current: VisibilityRule,
  next: PeekVisibility,
): VisibilityRule {
  if (current === "public") return current;
  if (typeof current === "object" && current.mode === "peek") {
    return current.count >= next.count ? current : next;
  }
  return next;
}

/**
 * 쯔모패를 다른 패로 갈아끼운다 — `lastDrawnTile`과 `lastDrawRinshan`을 **함께** 다룬다.
 *
 * 영상개화는 `lastDrawRinshan` 플래그로만 판정된다(helpers.ts `rinshan`). 그래서
 * 깡 직후(영상 쯔모 상태)에 쯔모패를 바꿔치기하면서 플래그를 안 끄면, 바닥이나
 * 남의 손에서 가져온 패로 화료해도 **영상개화 +1판이 그대로 붙는다**.
 *
 * pond_snatch·take_back·meld_dissolve·grave_rob은 각자 플래그를 껐지만
 * silent_swap·hand_swap3·suit_unify에는 안 퍼져 있었다(docs/25 P2). 앞으로
 * 쯔모패를 바꾸는 증강은 전부 이 헬퍼를 거친다 — 소스 스캔 테스트가 강제한다.
 *
 * 영상패로 뽑는 것이 능력 자체인 증강(north_trader)은 예외적으로 직접 세운다.
 */
export function replaceDrawnTile(
  round: GameState["round"],
  tileId: TileId | null,
): GameState["round"] {
  return { ...round, lastDrawnTile: tileId, lastDrawRinshan: false };
}

/**
 * YakuRegistry 단위로 "이 역을 쓸 수 있는 보유자" 집합을 관리한다.
 * 같은 증강을 여러 명이 가져도 역은 한 번만 등록하고,
 * check에서 ctx.winnerId ∈ holders로 판별하는 패턴.
 */
const holderSets = new WeakMap<YakuRegistry, Map<string, Set<PlayerId>>>();

export function yakuHolders(yaku: YakuRegistry, yakuId: string): Set<PlayerId> {
  let byId = holderSets.get(yaku);
  if (byId === undefined) {
    byId = new Map();
    holderSets.set(yaku, byId);
  }
  let holders = byId.get(yakuId);
  if (holders === undefined) {
    holders = new Set();
    byId.set(yakuId, holders);
  }
  return holders;
}

/**
 * 커스텀 역의 **보유자로 등록**하고, 증강이 파괴되면 자동으로 빠지게 한다.
 *
 * `yakuHolders(...).add(holder)`를 직접 부르면 `uninstallAugment` 뒤에도 보유자로
 * 남아 **파괴된 증강의 역이 계속 성립한다** — 커스텀 역은 게임당 1회 등록이라
 * 코어가 소스로 걷어낼 수 없는 유일한 잔재였다(docs/25 시스템 횡단 #7).
 * 소스 스캔 테스트가 `.add(` 직접 호출을 금지한다.
 */
export function addYakuHolder(
  ctx: AugmentContext,
  yaku: YakuRegistry,
  ...yakuIds: string[]
): void {
  const holder = ctx.holder;
  for (const id of yakuIds) {
    yakuHolders(yaku, id).add(holder);
    ctx.onUninstall(() => {
      yakuHolders(yaku, id).delete(holder);
    });
  }
}

/** augmentData 숫자 카운터 읽기 (없으면 0) */
export function counterOf(state: GameState, key: string): number {
  const v = state.augmentData[key];
  return typeof v === "number" ? v : 0;
}

/** augmentData 불리언 플래그 읽기 */
export function flagOf(state: GameState, key: string): boolean {
  return state.augmentData[key] === true;
}

/**
 * 그 플레이어의 리치가 **숨겨져 있는가** (스텔스 리치).
 *
 * 코어 규칙 `riichi.hidden`이 true면 타가의 뷰에서 리치 표시가 지워진다. 그런데 뷰만
 * 가려서는 부족하다 — **리치 중인 상대를 대상으로 삼는 증강**이 원시 상태
 * (`round.byPlayer[x].riichi`)를 그대로 읽으면, 후보 목록이 뜨는 것만으로 "저 사람이
 * 리치다"가 새어 나간다(선언 간파의 대상 목록이 실제로 그랬다 — 2026-08-02 감사).
 * 그런 증강은 대상 판정에 이 함수를 함께 걸어 **숨은 리치는 없는 것으로 본다**.
 *
 * 드래프트 상호 배제(conflicts)로는 이걸 막을 수 없다 — 배제는 **한 사람이 두 증강을
 * 같이 갖는 것**만 막고, 스텔스 리치를 건 사람과 리치 정보를 읽는 사람은 서로 다른
 * 플레이어이기 때문이다.
 */
export function riichiHidden(
  rules: {
    has: (rule: string) => boolean;
    resolve: <T>(rule: string, ctx: { playerId: PlayerId; state: GameState }) => T;
  },
  state: GameState,
  player: PlayerId,
): boolean {
  if (!rules.has("riichi.hidden")) return false;
  return rules.resolve<boolean>("riichi.hidden", { playerId: player, state }) === true;
}

/** augmentData 문자열 읽기 (없거나 빈 문자열이면 null) */
export function stringOf(state: GameState, key: string): string | null {
  const v = state.augmentData[key];
  return typeof v === "string" && v !== "" ? v : null;
}

// ─────────────────── "N국에 1회" 쿨다운 ───────────────────

/**
 * 지금까지 **배패가 이루어진 횟수**를 세는 카운터 키 (보유자별).
 *
 * `roundKey`("장-국-본장") 산술로 국 수를 세면 안 된다. 동1국0본장 → 동1국1본장은
 * 국 번호가 그대로라 "몇 판이 지났는가"가 산술에 잡히지 않고, 반대로 국 번호가
 * 오르는 폭(동1→동2)과 본장이 오르는 폭이 서로 달라 어떤 자릿수를 잡아도 어긋난다.
 * 실제로 동1국0본장에 쓴 "2국에 1회"가 동1국1본장을 지나 동2국에 가도 안 풀렸다
 * (2026-08-01 사용자 보고). **사용자 기준은 명확하다 — 배패 한 번 = 1국이다.**
 *
 * 그래서 세는 대신 **국이 시작될 때마다 +1** 한다(discard_lock이 쓰던 방식).
 * 연장·유국 재배패도 ROUND_STARTED를 거치므로 본장이 곧 한 국으로 잡힌다.
 */
const roundSeqKey = (augmentId: string, holder: PlayerId): string =>
  `${augmentId}:seq:${holder}`;

/** 지금까지 진행된 국 수 (아직 세기 전이면 0) */
export function roundSeqOf(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
): number {
  return counterOf(state, roundSeqKey(augmentId, holder));
}

/**
 * 마지막으로 발동한 국의 순번을 담는 키 (보유자별).
 * "N국에 1회" 증강 8종이 전부 같은 이름을 쓰고 있어 공용으로 끌어올렸다.
 */
export const cooldownUsedKey = (augmentId: string, holder: PlayerId): string =>
  `${augmentId}:usedSeq:${holder}`;

/**
 * 쿨다운 잔량을 **보유자 본인에게만** 알리는 뷰 채널 (`cooldown:{augmentId}`).
 *
 * 값은 "앞으로 몇 국을 더 기다려야 하는가"(0 = 지금 쓸 수 있다). 쿨다운은 국을 넘어
 * 이어지므로 `roundViewKey`(국 스코프)가 아니라 고정 채널을 쓰고, 대신 국이 시작될
 * 때마다 `trackRoundSeq`가 새 값을 덮어써 준다.
 *
 * 남에게는 공개하지 않는다 — 발동 자체는 어차피 보이지만, "지금 잠겨 있다"는 것은
 * 상대가 마음 놓고 밀 수 있다는 뜻이라 보유자만 아는 편이 대칭적이다.
 */
/**
 * **순 단위** 쿨다운 잔량 채널 (보유자 전용) — 이름표 pill이 `N순`으로 그린다.
 *
 * 국 단위(`cooldownViewKey`)와 나란한 짝이다. 순 단위로 잠기는 증강(예지·무르기·
 * 미래를 보는 자)은 채널 자체가 없어서, 다시 열릴 때까지 **버튼이 사라진 것으로만**
 * 알 수 있었다 — 왜 사라졌는지도, 언제 돌아오는지도 화면에 없었다.
 */
export const cooldownTurnsViewKey = (augmentId: string, holder: PlayerId): string =>
  viewKey(holder, `cooldownTurns:${augmentId}`);

export const cooldownViewKey = (augmentId: string, holder: PlayerId): string =>
  viewKey(holder, `cooldown:${augmentId}`);

/** 앞으로 몇 국 더 잠겨 있는가 (0 = 지금 쓸 수 있다) */
export function cooldownLeft(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
  rounds: number,
): number {
  const used = state.augmentData[cooldownUsedKey(augmentId, holder)];
  if (typeof used !== "number") return 0;
  return Math.max(0, rounds - (roundSeqOf(state, augmentId, holder) - used));
}

/** 쿨다운이 풀렸는가 — 쓴 적이 없거나 마지막 사용 이후 `rounds`국이 지났다 */
export function cooldownReady(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
  rounds: number,
): boolean {
  return cooldownLeft(state, augmentId, holder, rounds) === 0;
}

/**
 * 발동 시점에 낼 이벤트 — 쿨다운 기준점을 찍고, 잔량 표시를 그 자리에서 갱신한다.
 *
 * 표시 갱신을 여기서 함께 내지 않으면 다음 국이 시작될 때까지(다음 `trackRoundSeq`)
 * 화면이 "사용 가능"인 채로 남는다 — 방금 쓴 증강이 아직 쓸 수 있어 보인다.
 */
export function cooldownUse(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
  rounds: number,
): ProposedEvent[] {
  return [
    augmentDataSet(cooldownUsedKey(augmentId, holder), roundSeqOf(state, augmentId, holder)),
    augmentDataSet(cooldownViewKey(augmentId, holder), rounds),
  ];
}

/**
 * 국 진행 카운터를 이 증강 인스턴스에 붙인다 (`install`에서 한 번 호출).
 * 이후 `roundSeqOf`로 국 수를 읽고, 발동 시점의 값을 기록해 두면
 * `roundSeqOf(now) - used >= N` 이 곧 "N국이 지났는가"가 된다.
 *
 * `cooldownRounds`를 넘기면 국이 바뀔 때마다 잔량 표시(`cooldownViewKey`)도 같이
 * 갱신한다 — 카운터를 올린 **뒤**의 값으로 계산해야 하므로 여기서 직접 뺀다.
 *
 * 쿨다운 국 수가 매치 길이에 따라 달라지는 증강(`scaledCooldown`)은 **함수**로 넘긴다
 * (2026-08-27) — 상수로 굳히면 모드를 모르는 채 잔량을 그린다.
 */
export function trackRoundSeq(
  ctx: AugmentContext,
  augmentId: string,
  cooldownRounds?: number | ((state: GameState) => number),
): void {
  ctx.reaction(ROUND_STARTED, (_event, rc) => {
    const key = roundSeqKey(augmentId, ctx.holder);
    const next = counterOf(rc.state, key) + 1;
    rc.emit(augmentDataSet(key, next));
    if (cooldownRounds === undefined) return;
    const rounds =
      typeof cooldownRounds === "number" ? cooldownRounds : cooldownRounds(rc.state);
    const used = rc.state.augmentData[cooldownUsedKey(augmentId, ctx.holder)];
    const left = typeof used === "number" ? Math.max(0, rounds - (next - used)) : 0;
    rc.emit(augmentDataSet(cooldownViewKey(augmentId, ctx.holder), left));
  });
}

// ───────────── "뽑자마자 자동 사용, 이번 국만" (선발동형) ─────────────

/**
 * 이 증강이 자동 발동한 국을 담는 키 (보유자별, 게임 전체에 한 번만 굳는다).
 */
const armedRoundKey = (augmentId: string, holder: PlayerId): string =>
  `${augmentId}:armedRound:${holder}`;

/**
 * **효과가 이미 지나갔음**을 알리는 전원 공개 채널 (`spent:{증강id}:{보유자}` = true).
 *
 * 선발동형은 효과 표시가 국 스코프라 국이 끝나면 조용히 사라진다. 그런데 이름표에는
 * 증강이 그대로 서 있고 설명 배지도 "이번 국만"이라, 이미 죽은 증강이 아직 살아 있는
 * 것처럼 읽혔다(2026-08-13 사용자 보고). 국을 넘어 남아야 하는 사실이라 `roundViewKey`가
 * 아니라 고정 키를 쓴다.
 */
export const spentViewKey = (augmentId: string, holder: PlayerId): string =>
  viewKey("*", `spent:${augmentId}:${holder}`);

/**
 * **획득 직후의 국 하나에만** 효과를 켜는 증강의 공용 배선 (`install`에서 호출).
 *
 * 드래프트는 국과 국 사이에만 열리므로, 획득 뒤 **처음 시작되는 국**이 곧 사용자가
 * 말하는 "이번 국"이다. 그 국의 `roundKey`를 상태에 한 번 굳혀 두고,
 * `armedNow`가 지금이 그 국인지 판정한다.
 *
 * install 시점의 `roundKey`를 쓰면 안 된다 — 그때 상태에 남아 있는 것은 **직전 국**이고,
 * install은 재구성(rebuildAugments)에서 다시 불리므로 클로저에 담아도 값이 어긋난다.
 * 상태에 한 번만 쓰는(이미 있으면 건드리지 않는) 방식이라 재구성·리플레이에서도 같다.
 *
 * `onArm`은 **켜지는 바로 그 순간** 함께 낼 이벤트를 만든다(공개 채널 표시 등).
 * 같은 ROUND_STARTED에 리액션을 따로 하나 더 달면 안 된다 — 그 리액션이 보는 state에는
 * 아직 위 표식이 반영되지 않아 `armedNow`가 항상 false다.
 */
export function armOnNextRound(
  ctx: AugmentContext,
  augmentId: string,
  onArm?: (state: GameState) => ProposedEvent<string, unknown>[],
): void {
  ctx.reaction(ROUND_STARTED, (_event, rc) => {
    const key = armedRoundKey(augmentId, ctx.holder);
    if (rc.state.augmentData[key] !== undefined) {
      // 켜졌던 국이 지나갔다 — 이름표가 "이번 국만"인 채로 남지 않게 끝났음을 알린다.
      const spent = spentViewKey(augmentId, ctx.holder);
      if (rc.state.augmentData[spent] !== true) rc.emit(augmentDataSet(spent, true));
      return;
    }
    rc.emit(augmentDataSet(key, roundKey(rc.state)));
    for (const e of onArm?.(rc.state) ?? []) rc.emit(e);
  });
}

/** 지금이 그 증강이 자동 발동한 국인가 (`armOnNextRound`와 짝) */
export function armedNow(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
): boolean {
  return stringOf(state, armedRoundKey(augmentId, holder)) === roundKey(state);
}

/**
 * 이 증강이 **선발동형인가** — `armOnNextRound` 배선을 실제로 쓰고 있는가.
 *
 * 판정은 그 배선이 남기는 «켜진 국» 표식의 존재로 한다. 표식은 획득 뒤 처음 시작되는
 * 국에 굳고 게임이 끝날 때까지 남으므로, 한 국이라도 지난 뒤라면 확실히 잡힌다.
 * (재장전이 «되살릴 것이 있는가»를 판정할 때 쓴다 — 선발동형도 복구 대상이다.)
 */
export function preArmInstalled(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
): boolean {
  return state.augmentData[armedRoundKey(augmentId, holder)] !== undefined;
}

/**
 * 선발동형이 **이미 다 타 버렸는가** — 켜졌던 국이 지나갔다.
 *
 * `armOnNextRound`가 그 사실을 공개 채널(`spentViewKey`)에 굳히므로 그것만 보면 된다.
 * 지금 켜져 있는 국(`armedNow`)에는 아직 false다 — 타는 중인 것은 소진이 아니다.
 */
export function preArmSpent(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
): boolean {
  return state.augmentData[spentViewKey(augmentId, holder)] === true;
}

/**
 * 다 타 버린 선발동형을 **지금 이 국에 곧바로 켠다** (재무장 전용).
 *
 * `preArmRestoreEvents`(표식을 지워 다음 국을 기다린다)와 갈라지는 지점이다. 이쪽은
 * 켜진 국을 **지금**으로 못박으므로 누른 그 자리에서 효과가 산다 — 사용자가 고르는 것이
 * «어느 국»이 아니라 «이 순간»이 된다(2026-08-25 사용자 확정).
 *
 * 다음 `ROUND_STARTED`에서 `armOnNextRound`는 표식이 이미 있는 것을 보고 «켜졌던 국이
 * 지나갔다»로 처리한다 — 소진 표시가 정상적으로 다시 선다.
 *
 * 공개 채널(«발동했다» 표시)은 여기서 내지 않는다. 그것은 증강마다 다르므로 호출부가
 * `armOnNextRound`에 넘기는 것과 **같은 이벤트**를 함께 낸다.
 */
export function preArmArmNowEvents(
  state: GameState,
  augmentId: string,
  holder: PlayerId,
): ProposedEvent<string, unknown>[] {
  return [
    augmentDataSet(armedRoundKey(augmentId, holder), roundKey(state)),
    augmentDataSet(spentViewKey(augmentId, holder), undefined),
  ];
}

/**
 * 다 타 버린 선발동형을 **다시 장전한다** (재장전 전용).
 *
 * 표식 둘을 지우면 그만이다 — 다음 `ROUND_STARTED`에서 `armOnNextRound`가 "아직 켜진
 * 적 없는 증강"으로 보고 그 국에 다시 켠다(공개 표시도 그때 함께 다시 나간다).
 * 값을 `undefined`로 두는 것이 요점이다: `null`을 쓰면 `!== undefined` 검사에 걸려
 * 재장전이 아니라 **또 한 번 소진 처리**가 된다.
 */
export function preArmRestoreEvents(
  augmentId: string,
  holder: PlayerId,
): ProposedEvent<string, unknown>[] {
  return [
    augmentDataSet(armedRoundKey(augmentId, holder), undefined),
    augmentDataSet(spentViewKey(augmentId, holder), undefined),
  ];
}

/**
 * 이 증강이 '게임 시작 이후(늦은) 드래프트'에서 획득됐는가.
 * 게임은 각 국 첫 진입마다 1개씩(동풍전 3개·반장전 4개) 준다. 시작 이후에 들어온
 * 증강은 남은 국이 적어 국을 거듭해 쌓는 스택형 증강이 제 값을 못 낸다 — 이때 보강한다.
 * 스테이지는 정식 픽에서 상태에 기록되므로(augmentStageKey) 리플레이·재개에서도 결정적.
 * (도박사가 지급한 증강은 스테이지 기록이 없어 false로 본다 — 첫 픽으로 취급.)
 */
export function draftedLate(
  state: GameState,
  holder: PlayerId,
  augmentId: string,
): boolean {
  const stage = state.augmentData[augmentStageKey(holder, augmentId)];
  return typeof stage === "string" && stage !== "gameStart";
}

/**
 * 보유자 화료 시 판을 더하는 score.extraHan 모디파이어를 등록한다.
 * han(state)은 정산 시점의 state로 계산되며, 음수는 0으로 막고 역만에는
 * 엔진이 자동으로 적용하지 않는다. 대부분의 "+N판" 증강이 이걸 쓴다.
 */
export function addHanBonus(
  ctx: AugmentContext,
  han: (state: GameState) => number,
): void {
  ctx.engine.rules.addModifier<number>("score.extraHan", {
    source: ctx.instanceId,
    layer: ctx.layer,
    apply: (cur, rctx) => {
      if (rctx.playerId !== ctx.holder) return cur;
      const state = rctx.state as GameState | undefined;
      if (state === undefined) return cur;
      return cur + Math.max(0, han(state));
    },
  });
}

/**
 * **정산 인터셉터의 유일한 등록 경로.**
 *
 * `ctx.interceptor(ROUND_SETTLED, …)`를 직접 부르면 실행 순서가 증강의 tier와
 * 드래프트 픽 순서에 끌려간다 — deltas를 이어서 고쳐 쓰는 증강들 사이에서 그건 곧
 * 결과가 픽 순서로 갈린다는 뜻이다. 이 헬퍼는 레이어를 `SETTLE_LAYER` 하나로 모으고
 * 순서를 **단계(stage)** 로만 정한다. 단계 정의와 배치 근거는 core의
 * `settleStages.ts`가 단일 진실이다.
 *
 * **같은 단계 안의 동률**도 여기서 확정한다. 예전에는 동률이면 등록 순서(seq)로
 * 밀렸는데, 그 순서가 곧 드래프트 픽 순서라 결과가 "누가 먼저 뽑았는가"로 갈렸다
 * (docs/25 P6). 실제로 죽기살기 × 역만 방어술(둘 다 Shield)은 순서에 따라 최종
 * 점수와 남은 사용 횟수가 통째로 달라졌고, 서로 기생하는 기생충 둘도 마찬가지였다.
 *
 * 이제 **보유자의 자리(seat)** 와 **증강 id**를 하위 자릿수로 얹어 게임 상태만으로
 * 순서가 정해진다(`settlePriority`). 자리만 얹던 시절에는 **한 사람이 같은 단계의
 * 증강 둘을 쥐면** priority가 똑같아져 다시 픽 순서로 밀렸다 — 큰손 × 올인처럼
 * `deltas` 현재값을 읽는 조합에서 수령액이 통째로 갈렸다. 이제 그 경우도 막힌다.
 * 재구성(resume·리플레이)으로 설치 순서가 달라져도 결과가 같다.
 */
export function settleInterceptor(
  ctx: AugmentContext,
  stage: SettleStage,
  intercept: Parameters<AugmentContext["interceptor"]>[1],
): void {
  ctx.interceptor(ROUND_SETTLED, intercept, {
    layer: SETTLE_LAYER,
    priority: settlePriority(stage, settleSeatAxis(ctx.engine.state, ctx.holder), ctx.augmentId),
  });
}

/**
 * 보유자가 화료한 국의 정산에 보너스 점수를 얹는 ROUND_SETTLED 인터셉터를 등록한다.
 * points(state, info)는 정산 적용 전 state와 보유자의 WinInfo로 계산한다.
 * (판이 아니라 점수를 직접 주므로 상대가 내는 게 아니라 추가로 생기는 점수다.)
 *
 * 단계는 `BankTopUp` — 뱅크가 발행하는 가산이라 배수(Multiply) **뒤에** 와야 한다.
 * 앞에 오면 보전액에까지 일확천금 3배가 곱해져 폭발이 한 겹 더 쌓인다.
 *
 * @param points 얹을 점수, 또는 `{ points, han }`. han을 주면 결과 화면이 그 줄을
 *               점수 대신 **판**으로 적는다(addWinPointTransfer와 같은 규약).
 */
export function addWinPointBonus(
  ctx: AugmentContext,
  points: (
    state: GameState,
    info: WinInfo,
    /**
     * **이 정산에서 다른 증강이 이미 얹은 판수.** "+N판" 계열이 서로 겹칠 때
     * 각자 원본 `info.han`을 밑값으로 삼으면 합이 +(N+M)판이 되지 않는다 —
     * 만개+해저(각 +3판)가 36,000이 아니라 30,000이었고, 무형화료+대기만성은
     * 반대로 만관표에 없는 20,100이 나왔다(2026-08-23 QA synergy3 relax 확정 1).
     * 이 값을 밑값에 더해 계산하면 순서와 무관하게 정확히 덧셈이 된다.
     */
    hanSoFar: number,
  ) => number | { points: number; han?: number },
): void {
  settleInterceptor(ctx, SETTLE_STAGE.BankTopUp, (event, ic) => {
    const p = event.payload as RoundSettledPayload;
    if (p.outcome !== "win") return event;
    const info = (p.winInfos ?? []).find((w) => w.winner === ctx.holder);
    if (info === undefined) return event;
    const myId = augIdOf(ctx);
    const hanSoFar = (p.augPoints ?? [])
      .filter((n) => n.player === ctx.holder && n.augId !== myId)
      .reduce((sum, n) => sum + (n.han ?? 0), 0);
    const raw = points(ic.state, info, hanSoFar);
    const asObj = typeof raw === "number" ? { points: raw } : raw;
    const bonus = Math.max(0, Math.round(asObj.points));
    if (bonus === 0) return event;
    const deltas = {
      ...p.deltas,
      [ctx.holder]: (p.deltas[ctx.holder] ?? 0) + bonus,
    };
    return {
      type: event.type,
      payload: {
        ...p,
        deltas,
        augPoints: withAugPoint(p, ctx, bonus, asObj.han),
      },
    };
  });
}

/**
 * ctx.instanceId(`aug:{holder}:{augmentId}`)에서 증강 id를 되꺼낸다.
 * 결과 화면이 카탈로그에서 이름을 찾을 때 쓴다.
 */
function augIdOf(ctx: AugmentContext): string {
  const parts = ctx.instanceId.split(":");
  return parts.slice(2).join(":") || ctx.instanceId;
}

/**
 * 정산 payload에 "이 증강이 점수를 이만큼 움직였다" 한 줄을 덧붙인다 (표시 전용).
 *
 * deltas만 고치고 지나가면 결과 화면에는 표준 점수만 남아 증강이 한 일이 통째로
 * 안 보인다(2026-08-02 사용자 보고). 같은 증강이 여러 줄을 남기지 않도록 합산한다.
 *
 * addWinPointBonus 같은 래퍼는 내부에서 이걸 부른다. 정산 deltas를 **직접** 고치는
 * 증강(판돈·연승 배수·부활·역만 방어·강탈)은 래퍼를 안 거치므로 직접 호출해야 한다
 * — 안 하면 결과 화면 합계와 실제 증감이 어긋난다(docs/25 P9). 소스 스캔이 강제한다.
 */
/**
 * **다른 사람의** 정산 줄에 증강 내역을 한 줄 남긴다 (보유자 몫은 `withAugPoint`).
 *
 * 지불자를 재배선하는 증강들(눈먼 총알·책임전가·희생양·밀정)은 총액도 보유자 수령액도
 * 그대로라 `withAugPoint`에 남길 것이 없었다. 그래서 화료패를 버리지도 않은 사람이
 * 8,000점을 무는 장면에 화면 어디에도 설명이 없었다 — 이제 그 사람의 증감표 줄 아래에
 * 근거가 붙는다. `points`는 **그 사람에게 실제로 옮겨간 금액**(음수면 무는 쪽)이다.
 */
export function withAugNoteFor(
  p: RoundSettledPayload,
  augId: string,
  player: PlayerId,
  points: number,
): AugPointNote[] {
  const prev = p.augPoints ?? [];
  const at = prev.findIndex((n) => n.player === player && n.augId === augId);
  const merged: AugPointNote = {
    player,
    augId,
    points: (at >= 0 ? (prev[at]?.points ?? 0) : 0) + points,
  };
  if (at < 0) return [...prev, merged];
  return prev.map((n, i) => (i === at ? merged : n));
}

export function withAugPoint(
  p: RoundSettledPayload,
  ctx: AugmentContext,
  points: number,
  /** 화면에 판으로 적을 값 (없으면 점수로 적는다) */
  han?: number,
): AugPointNote[] {
  const augId = augIdOf(ctx);
  const prev = p.augPoints ?? [];
  const at = prev.findIndex((n) => n.player === ctx.holder && n.augId === augId);
  const merged: AugPointNote = {
    player: ctx.holder,
    augId,
    points: (at >= 0 ? (prev[at]?.points ?? 0) : 0) + points,
    ...(han !== undefined && han > 0 ? { han } : {}),
  };
  if (at < 0) return [...prev, merged];
  return prev.map((n, i) => (i === at ? merged : n));
}

/**
 * 보유자의 화료점을 올리되 **그 몫을 지불자에게서 가져오는** 인터셉터.
 *
 * `addWinPointBonus`(뱅크 발행)와 달리 상대의 점수가 실제로 줄어든다 —
 * 무페널티 원칙(10_AUGMENT_SYSTEM §0)의 **명시적 예외**이므로, 사용자가 그렇게
 * 지정한 증강에만 쓴다(2026-08-02 뚫린 천장: "추가 점수도 타가들한테 가져오게").
 *
 * 분배는 표준 지불 구조 그대로다 — 론은 방총자가 전액, 쯔모는 친 2배·자 1배.
 * 단계는 `Transfer` — 배수(Multiply)·뱅크 가산(BankTopUp) **뒤**라 이 이동액에
 * 다른 배수가 다시 곱해지지 않는다.
 *
 * @param points 얹을 점수, 또는 `{ points, han }`. han을 주면 결과 화면이 그 줄을
 *               점수 대신 **판**으로 적는다(역 목록의 다른 줄과 단위를 맞추기 위함).
 */
export function addWinPointTransfer(
  ctx: AugmentContext,
  points: (
    state: GameState,
    info: WinInfo,
  ) => number | { points: number; han?: number },
): void {
  settleInterceptor(ctx, SETTLE_STAGE.Transfer, (event, ic) => {
    const p = event.payload as RoundSettledPayload;
    if (p.outcome !== "win") return event;
    const info = (p.winInfos ?? []).find((w) => w.winner === ctx.holder);
    if (info === undefined) return event;
    const raw = points(ic.state, info);
    const asObj = typeof raw === "number" ? { points: raw } : raw;
    const extra = Math.max(0, Math.round(asObj.points));
    if (extra === 0) return event;

    const state = ic.state as GameState;
    const deltas = { ...p.deltas };
    let moved = 0;
    const take = (from: PlayerId, amount: number): void => {
      if (amount <= 0 || from === ctx.holder) return;
      deltas[from] = (deltas[from] ?? 0) - amount;
      moved += amount;
    };

    if (info.winType === "ron" && info.from !== null) {
      take(info.from, extra);
    } else {
      // 쯔모 — 표준 분배와 같은 비율. 화료자가 친이면 셋이 똑같이, 자면 친이 2배를 낸다.
      //
      // ⚠ **오야 취급**(`win.treatAsDealer` — 만년 오야·찬탈자)도 친과 같다. 엔진의
      // 기본 분담(`sysSettleWin`)은 `scoresAsDealer`가 켜지면 세 사람이 똑같이 내는데,
      // 여기서는 **진짜 오야 자리인지만** 봐서 같은 화료 안에서 기본분은 균등, 상한
      // 해제분만 "친 2배"로 갈렸다(QA score-a 확정 5 — 진짜 오야가 1,500점 더 냈다).
      const dealer = playerAtSeat(state, state.round.dealerSeat).id;
      const treatAsDealer =
        dealer === ctx.holder ||
        ic.rules.resolve<boolean>("win.treatAsDealer", {
          playerId: ctx.holder,
          state,
        });
      const others = state.players.map((pl) => pl.id).filter((id) => id !== ctx.holder);
      // 친이 무거운 쪽이 먼저 오도록 정렬 — 나머지 100점을 결정적으로 배분한다
      const payers =
        treatAsDealer
          ? others.map((id) => ({ id, weight: 1 }))
          : [...others]
              .sort((a, b) => (b === dealer ? 1 : 0) - (a === dealer ? 1 : 0))
              .map((id) => ({ id, weight: id === dealer ? 2 : 1 }));
      for (const { id, amount } of splitOnGrid(extra, payers)) take(id, amount);
    }
    if (moved === 0) return event;
    deltas[ctx.holder] = (deltas[ctx.holder] ?? 0) + moved;
    return {
      type: event.type,
      payload: {
        ...p,
        deltas,
        augPoints: withAugPoint(p, ctx, moved, asObj.han),
      },
    };
  });
}

const roundUp100 = (n: number): number => Math.ceil(n / 100) * 100;

/**
 * 총액을 100점 격자 위에서 가중 분배한다 — **합계가 총액과 정확히 같다**.
 *
 * 예전에는 `roundUp100(extra / 3)`을 각자에게 물려서, 이미 100단위로 반올림된
 * 총액을 **두 번 올림**했다. extra=2500이면 자 쯔모에서 unit=700 → 친 1400 +
 * 자 700 + 자 700 = 2800이 이동해 계산값보다 300을 더 받았다. 판수가 높을수록
 * 오차가 쌓이고, 결과창 augPoints(실제 이동액)와 판수 표기의 근거가 어긋난다
 * (docs/25 역/점수 #12).
 *
 * 몫을 100 단위로 내림해 나눈 뒤, 남는 100점을 **무거운 쪽부터** 한 칸씩 얹는다.
 * 표준 마작이 각 지불을 개별로 올리는 것과는 다르지만, 여기서 나누는 값은 이미
 * "총 이동액"으로 확정된 수라 총액을 지키는 쪽이 맞다.
 */
export function splitOnGrid(
  total: number,
  payers: readonly { id: PlayerId; weight: number }[],
): { id: PlayerId; amount: number }[] {
  const units = payers.reduce((sum, p) => sum + p.weight, 0);
  if (units <= 0) return [];
  const per = Math.floor(total / units / 100) * 100;
  const out = payers.map((p) => ({ id: p.id, amount: per * p.weight }));
  let left = total - out.reduce((sum, o) => sum + o.amount, 0);
  for (let i = 0; left >= 100 && out.length > 0; i = (i + 1) % out.length) {
    (out[i] as { amount: number }).amount += 100;
    left -= 100;
  }
  return out;
}

/**
 * "+N판"을 정산 시점 뱅크 점수로 환산한다 — 실제 화료 점수(info.points)와
 * 판을 N만큼 올려 다시 계산한 점수의 차이. 승자의 실제 부수·역만·오야 여부를
 * 그대로 써서 만관 상한 등도 정확히 반영한다. addWinPointBonus와 함께 쓴다.
 * (커스텀 역으로 표현할 수 없는 "상태 조건부 +판"을 점수로 옮기는 용도.)
 */
export function winPointsWithExtraHan(
  state: GameState,
  holder: PlayerId,
  info: WinInfo,
  extraHan: number,
  rules?: RuleRegistry,
  /** 이 정산에서 다른 "+N판" 증강이 이미 얹은 판수 (밑값에 더한다) */
  hanSoFar = 0,
): number {
  /*
   * 오야 배율은 **자리만으로 정하지 않는다** — 정산(`sysSettleWin`)이
   * `isDealer || win.treatAsDealer`로 정하므로 여기서도 같은 기준을 써야 한다.
   * 예전에는 자리만 봐서, 만년 오야·찬탈자로 오야가 된 홀더의 "+N판"이 자 기준으로
   * 계산됐고 `info.points`(오야 기준)와의 차가 산배만 위에서 0으로 무너졌다 —
   * 카운터의 직격 +4판이 한 푼도 안 붙었다. 뚫린 천장·큰손은 각자 이 예외를
   * 이미 갖고 있었는데 공용 헬퍼만 빠져 있었다(2026-08-08 QA §2-9).
   *
   * `rules`가 없으면 종전대로 자리만 본다 — 호출부가 점진적으로 넘기게 둔다.
   */
  const isDealer =
    playerAtSeat(state, state.round.dealerSeat).id === holder ||
    (rules?.resolve<boolean>("win.treatAsDealer", { playerId: holder, state }) ?? false);
  /*
   * 상한 해제(뚫린 천장)를 **함께 본다.** 예전에는 표준 계단으로만 환산해서,
   * 같은 "+3판"이 실판 계열(`score.extraHan`·역 등록)에서는 상한이 풀리고
   * 뱅크 환산 계열에서는 잘렸다 — 8판 손에서 48,000 대 42,000, 계수역만
   * 구간에서는 아예 0원이었다(2026-08-23 QA synergy3 score 확정 6).
   */
  const uncapped =
    rules?.resolve<boolean>("score.uncapped", { playerId: holder, state }) ?? false;
  const scoreAt = (extra: number): number =>
    calculateScore({
      han: info.han + extra,
      fu: info.fu,
      yakumanCount: info.yakumanCount,
      isDealer,
      winType: info.winType,
      uncapped,
    }).total;
  /*
   * 밑값은 `info.points`가 아니라 **같은 식으로 계산한 값**이다 — 다른 증강이
   * 배수를 걸어 둔 국에서 `info.points`를 빼면 그 배수까지 되빼게 되고,
   * 상한 해제나 앞선 "+N판"이 걸린 국에서는 밑값이 아예 다른 곡선 위에 있다.
   */
  return Math.max(0, scoreAt(hanSoFar + extraHan) - scoreAt(hanSoFar));
}

/**
 * **확정 보상 단위의 단일 진실 (2026-07-26 통일)** — "화료 시 +N판".
 *
 * 증강이 얹어 주는 확정 보상은 **점수(+2000 등)가 아니라 판수로만** 표기·구현한다.
 * 실제 지급은 winPointsWithExtraHan으로 환산한 뱅크 점수라, 판을 올렸지만
 * **상대가 더 내지는 않는다**(§0 무페널티). 손패의 실제 부수·역만·오야 여부를 그대로
 * 쓰므로 만관/하네만 상한도 정확히 반영된다.
 *
 * 환산표(구 점수 → 판, docs/17 §3.4):
 *   +2000 → **2판** · +4500 → **3판** · +6000 → **4판** · 스택 1000점당 → **스택당 1판**
 *
 * 신규 증강도 점수가 아니라 이 판수 단위(2/3/4판)로 설계한다.
 *
 * **결과 화면에도 판으로 적는다** (2026-08-07 사용자 보고: "예지는 +2판인데 정산에
 * +6000점이 붙는다"). 환산은 구현 내부 사정일 뿐이고, 플레이어가 읽는 단위는 증강
 * 설명과 같은 "+N판"이어야 한다 — han을 augPoints 줄에 실어 그 줄만 판으로 적는다.
 */
export function addWinHanBonus(
  ctx: AugmentContext,
  han: (state: GameState, info: WinInfo) => number,
): void {
  addWinPointBonus(ctx, (state, info, hanSoFar) => {
    const n = Math.max(0, Math.round(han(state, info)));
    if (n === 0) return 0;
    return {
      points: winPointsWithExtraHan(
        state,
        ctx.holder,
        info,
        n,
        ctx.engine.rules,
        hanSoFar,
      ),
      han: n,
    };
  });
}

/*
 * ⚠ 삭제됨 (2026-07-22, 48차): yakuBountyBonus — "지정 역으로 화료하면 +N점".
 * 현상금 계열 6종과 함께 제거했다. PROJECT_CHARTER "노잼 금지 조항"이 이 패턴을
 * 명시적으로 금지하므로 헬퍼를 되살리지 말 것 (역 현상금은 증강이 아니다).
 *
 * 위 addHanBonus/addWinPointBonus도 그 자체로는 보이지 않는 정산 보정이다.
 * 이것만 쓰는 신규 증강은 10_AUGMENT_SYSTEM §0 도파민 리트머스에서 자동 탈락한다 —
 * 눈에 보이는 발동(액티브·패 변형·규칙 파괴)과 반드시 함께 쓸 것.
 */
