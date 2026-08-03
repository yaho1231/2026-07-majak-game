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
  augmentDataSet,
  augmentStageKey,
  calculateScore,
  meldCountOf,
  playerAtSeat,
} from "@majak/core";
import type {
  AugPointNote,
  AugmentContext,
  GameState,
  PeekVisibility,
  PlayerId,
  RoundSettledPayload,
  SettleStage,
  TileId,
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
export function roundKey(state: GameState): string {
  const r = state.round;
  return `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
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
  return state.config.mode === "tonpuu" ? 1 : 2;
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
  if (
    rules.resolve<number>("deal.handSize", { playerId: a, state }) !==
    rules.resolve<number>("deal.handSize", { playerId: b, state })
  ) {
    return false;
  }
  return meldCountOf(state, a) === meldCountOf(state, b);
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
 * 국 진행 카운터를 이 증강 인스턴스에 붙인다 (`install`에서 한 번 호출).
 * 이후 `roundSeqOf`로 국 수를 읽고, 발동 시점의 값을 기록해 두면
 * `roundSeqOf(now) - used >= N` 이 곧 "N국이 지났는가"가 된다.
 */
export function trackRoundSeq(ctx: AugmentContext, augmentId: string): void {
  ctx.reaction(ROUND_STARTED, (_event, rc) => {
    const key = roundSeqKey(augmentId, ctx.holder);
    rc.emit(augmentDataSet(key, counterOf(rc.state, key) + 1));
  });
}

/**
 * 이 증강이 '두 번째(늦은) 드래프트'에서 획득됐는가.
 * 게임은 총 2개(게임 시작 + 남장/동장 후반 진입)를 준다. 두 번째로 들어온 증강은
 * 남은 국이 절반뿐이라 국을 거듭해 쌓는 스택형 증강이 제 값을 못 낸다 — 이때 보강한다.
 * 스테이지는 정식 픽에서 상태에 기록되므로(augmentStageKey) 리플레이·재개에서도 결정적.
 * (도박사가 지급한 증강은 스테이지 기록이 없어 false로 본다 — 첫 픽으로 취급.)
 */
export function draftedLate(
  state: GameState,
  holder: PlayerId,
  augmentId: string,
): boolean {
  const stage = state.augmentData[augmentStageKey(holder, augmentId)];
  return stage === "southEntry" || stage === "eastThird";
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
 * 이제 **보유자의 자리(seat)** 를 하위 자릿수로 얹어 게임 상태만으로 순서가 정해진다.
 * 단계 간격이 100이고 자리는 0~3이라 단계 경계를 넘지 않는다. 재구성(resume·리플레이)
 * 으로 설치 순서가 달라져도 결과가 같다.
 */
export function settleInterceptor(
  ctx: AugmentContext,
  stage: SettleStage,
  intercept: Parameters<AugmentContext["interceptor"]>[1],
): void {
  const seat = ctx.engine.state.players.find((p) => p.id === ctx.holder)?.seat ?? 0;
  ctx.interceptor(ROUND_SETTLED, intercept, {
    layer: SETTLE_LAYER,
    priority: stage + seat,
  });
}

/**
 * 보유자가 화료한 국의 정산에 보너스 점수를 얹는 ROUND_SETTLED 인터셉터를 등록한다.
 * points(state, info)는 정산 적용 전 state와 보유자의 WinInfo로 계산한다.
 * (판이 아니라 점수를 직접 주므로 상대가 내는 게 아니라 추가로 생기는 점수다.)
 *
 * 단계는 `BankTopUp` — 뱅크가 발행하는 가산이라 배수(Multiply) **뒤에** 와야 한다.
 * 앞에 오면 보전액에까지 일확천금 3배가 곱해져 폭발이 한 겹 더 쌓인다.
 */
export function addWinPointBonus(
  ctx: AugmentContext,
  points: (state: GameState, info: WinInfo) => number,
): void {
  settleInterceptor(ctx, SETTLE_STAGE.BankTopUp, (event, ic) => {
    const p = event.payload as RoundSettledPayload;
    if (p.outcome !== "win") return event;
    const info = (p.winInfos ?? []).find((w) => w.winner === ctx.holder);
    if (info === undefined) return event;
    const bonus = Math.max(0, Math.round(points(ic.state, info)));
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
        augPoints: withAugPoint(p, ctx, bonus),
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
      const dealer = playerAtSeat(state, state.round.dealerSeat).id;
      const others = state.players.map((pl) => pl.id).filter((id) => id !== ctx.holder);
      if (dealer === ctx.holder) {
        const each = roundUp100(extra / 3);
        for (const id of others) take(id, each);
      } else {
        // 친 2 : 자 1 : 자 1 = 4몫. 100점 단위로 올려 나눈다.
        const unit = roundUp100(extra / 4);
        for (const id of others) take(id, id === dealer ? unit * 2 : unit);
      }
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
): number {
  const isDealer = playerAtSeat(state, state.round.dealerSeat).id === holder;
  const boosted = calculateScore({
    han: info.han + extraHan,
    fu: info.fu,
    yakumanCount: info.yakumanCount,
    isDealer,
    winType: info.winType,
  }).total;
  return Math.max(0, boosted - info.points);
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
 */
export function addWinHanBonus(
  ctx: AugmentContext,
  han: (state: GameState, info: WinInfo) => number,
): void {
  addWinPointBonus(ctx, (state, info) => {
    const n = Math.max(0, Math.round(han(state, info)));
    return n === 0 ? 0 : winPointsWithExtraHan(state, ctx.holder, info, n);
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
