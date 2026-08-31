/**
 * read — 한 번의 결정에 필요한 판 읽기를 한 곳에 모은 스냅샷.
 *
 * 손패·샹텐·대기·도라·잔여 장수·상대 위협을 매 결정마다 **한 번만** 계산해 두고
 * 버림·리치·후로·증강 정책이 전부 이걸 나눠 쓴다. (예전엔 판단마다 텐파이를 다시
 * 계산해 같은 일을 서너 번씩 했다.)
 */

import {
  augmentValueMultiplier,
  doraKindFor,
  handZone,
  kindKey,
  meldsZone,
  shantenOf,
} from "@majak/core";
import type { DecomposeOptions, PlayerId, PlayerView, TileId, TileKind } from "@majak/core";
import {
  expectedLossOf,
  maxThreat,
  readThreats,
  safetyOf,
  tileTracker,
  wallLeftOf,
} from "./danger.js";
import type { DefenseContext, Threat } from "./danger.js";
import { effectiveAugmentsOf } from "./collect.js";
import { readIntel, snapshotTrust } from "./intel.js";
import type { BotIntel } from "./intel.js";
import { exactTenpai, hasUnmodeledShapeOptions } from "./shape.js";
import { NEUTRAL_PROFILE } from "./profile.js";
import type { BotProfile } from "./profile.js";
import { readMatch } from "./match.js";
import type { BotGameMode, MatchContext } from "./match.js";
import { callableUkeireTiles, estimateHandValue, waitTilesOf, winChance } from "./value.js";
import type { KnownDrawEffect } from "./value.js";
import type { YakuName } from "./yaku.js";
import type { HandValue } from "./value.js";
import { NEUTRAL_TRAITS } from "./opponents.js";
import type { OpponentTraits } from "./opponents.js";
import { NO_FLAGS } from "./flags.js";
import type { BotFlags } from "./flags.js";
import type { CallAudit } from "./callAudit.js";

/**
 * 이 국에 노리는 역 — 후로할지, 무엇을 버릴지의 기준이 된다.
 *
 * 이름은 `bot/yaku.ts`의 `YakuName`을 그대로 쓴다. 예전에는 여기에 넷(역패·탕야오·
 * 혼일색·토이토이)만 있고 `yaku.ts`는 여섯을 더 알아서, **값어치는 아는 역을 후로
 * 판단은 모르는** 상태였다 — 콜 기회의 36.6%가 "역 없음"으로 잘려 나간 원인이다.
 */
export type HandPlan = { yaku: YakuName; suit?: string } | null;

/** 가정한 손을 값매기는 질의 — 생략한 값은 지금 손 그대로 */
export interface ValueQuery {
  /** 그 손이 노리는 역 방향 */
  plan: HandPlan;
  /** 이 판단으로 잃거나 얻는 도라 수 (도라를 흘리는 버림은 음수) */
  doraDelta?: number;
  /** 그때의 후로 수 — 울고 난 뒤를 값매길 때 넣는다 (멘젠 판수가 사라진다) */
  meldCount?: number;
  /**
   * **내 증강 배수를 빼고** 값매긴다 — 증강 정책에 넘길 값을 뽑을 때만 쓴다.
   *
   * `botPlan.myHandPoints`(content)가 `ctx.handPoints`에 같은 배수를 스스로 곱하므로,
   * 그 눈금에는 여기서 곱하지 않은 값이 들어가야 두 번 걸리지 않는다.
   * 버림·리치·후로·깡은 이 값을 쓰지 않는다(증강을 얹은 값을 본다).
   */
  withoutAugments?: boolean;
}

export interface BotRead {
  view: PlayerView;
  me: PlayerId;
  /** 감춰진 손패(후로 제외) */
  hand: TileKind[];
  meldCount: number;
  /**
   * **점수상 멘젠인가** — 안깡만 있으면 여전히 참이다.
   * 샹텐에 쓰는 `meldCount`와 다르다(안깡은 멘쯔로 세되 손은 열지 않는다).
   */
  menzen: boolean;
  /** 증강이 바꾼 화료형 옵션 — 텐파이·대기 계산에 반드시 넘긴다 */
  opts: DecomposeOptions;
  turn: number;
  wallLeft: number;
  threats: Threat[];
  /** 가장 높은 상대 위협도 0~1 */
  threat: number;
  /** 샹텐 (0=텐파이) — 버림 후보 비교용 근사 */
  shanten: number;
  /** 정확한 텐파이 여부 (증강 화료형 반영) */
  tenpai: boolean;
  /** 텐파이면 오름패 종류 (13장 기준). 아니면 빈 배열 */
  waits: TileKind[];
  /** 이 국의 도라 종류 (표시패에서 변환) */
  doraKinds: TileKind[];
  /** 보이지 않는 곳에 남은 장수 */
  remainingOf(kind: TileKind): number;
  /** 이 패를 버릴 때의 안전도 0(위험)~1(안전) */
  safetyOf(kind: TileKind): number;
  /**
   * 이 패를 버릴 때 **잃을 것으로 기대되는 점수** (확률 × 실점).
   * `safetyOf`와 달리 점수 단위라 기대 획득(`gainIf`)과 직접 비교된다.
   *
   * `only`를 주면 **그 상대 한 사람에 대한 몫**만 센다. 판단에는 쓰지 않는다 —
   * "이 패가 저 리치에게 현물인가" 같은 한 사람짜리 질문을 검증·설명에서 물을 때
   * 쓴다. 다마텐 경사를 채택한 뒤로는 합계가 어느 판에서도 정확히 0이 아니라서,
   * 사람 하나를 따로 떼어 보지 않으면 그 질문에 답할 자리가 없어졌다.
   */
  expectedLoss(kind: TileKind, only?: PlayerId): number;
  /** 게임 전체에서 이 국의 처지 (순위·남은 국·판돈 → 위험 감수 성향) */
  match: MatchContext;
  /**
   * **가정한 손**의 값어치 (판수·점수).
   *
   * 지금 손뿐 아니라 "이 패를 버린 뒤"·"이걸 울고 난 뒤"·"깡을 친 뒤"를 전부 같은
   * 함수로 값매길 수 있어야 판단들이 서로 비교된다 — 그게 이 인자들의 이유다.
   */
  valueOf(input: ValueQuery): HandValue;
  /**
   * 지금 손이 남은 순목 안에 화료할 확률.
   * 버림 후보를 비교할 때는 그 패를 버린 뒤의 샹텐·우케이레를 넣어 다시 잰다.
   */
  winChanceOf(input: {
    shanten: number;
    waitTiles: number;
    ukeireTiles: number;
    /**
     * 론이 막혀 쯔모로만 이길 수 있는 손인가 — 후리텐이거나 **역이 없는 멘젠 텐파이**.
     * 역없는 손이 그래도 이기려면 리치를 걸어야 한다는 판단이 여기서 나온다.
     */
    tsumoOnly?: boolean;
    /**
     * 이 판단이 **쯔모를 몇 번 더 벌어 주는가** (깡의 영상패 = 1).
     * 공짜 쯔모 한 번은 그 자체로 값이 있다 — 도라를 세지 않아도 깡이 이득인 이유다.
     */
    extraDraws?: number;
    /**
     * 이 손이 **열린 손일 때** 그 손패와 우케이레 종류. 주면 남의 버림패로 부르는
     * 몫까지 세어 전진 속도를 잰다(`callableUkeireTiles`) — 열린 손은 턴을 쓰지 않고
     * 전진하므로 쯔모만 세면 체계적으로 느리게 보인다.
     */
    open?: { hand: readonly TileKind[]; ukeireKinds: readonly TileKind[] } | undefined;
    /** 확정 쯔모가 이 모양에 하는 것 (`knownDrawsFor`의 결과를 그대로 넘긴다) */
    known?: KnownDrawEffect | undefined;
  }): number;
  /** 텐파이일 때 오름패의 남은 장수 합 (노텐이면 0) */
  waitTiles: number;
  /** 이 패 목록에 든 도라 수 (적도라 제외) */
  doraIn(kinds: readonly TileKind[]): number;
  /** 지금 손패(후로 포함)의 도라·적도라 합 — 손의 값어치 어림 */
  handDora: number;
  /** 내 자풍 (1동 2남 3서 4북) */
  seatWind: number;
  /** 후리텐인가 (본인 뷰에만 있는 정보) */
  furiten: boolean;
  /** 리치 선언 중인가 */
  riichiDeclared: boolean;
  /** 이 종류가 나에게 역패인가 */
  isYakuhai(kind: TileKind): boolean;
  /**
   * **역이 없어도 화료할 수 있는가** — 무형화료(`yakuless_win`)가 켜 주는 규칙.
   *
   * 후로 게이트(`bot/call.ts`의 `no_yaku`)와 값어치 감액(`YAKULESS_OPEN`)이 둘 다
   * 이 규칙을 전제로 서 있다. 규칙이 지워진 봇에게 그대로 걸면 **그 증강이 열어 주려던
   * 콜을 봇이 전부 거절한다.**
   */
  noYakuRequired: boolean;
  /**
   * 켜져 있는 실험 스위치 (`bot/flags.ts`). 실대국은 항상 비어 있다 —
   * 2:2 정책 대전으로 새 판단의 강함을 재는 동안에만 채워진다.
   */
  flags: BotFlags;
  /**
   * **내 정보 증강이 이번 결정에 열어 준 것 전부** (`bot/intel.ts`).
   * 정보 증강이 없으면 `NO_INTEL`과 같은 빈 값이라 종전 판단과 다르지 않다.
   */
  intel: BotIntel;
  /**
   * **확정된 내 다음 쯔모**가 이 모양에 무엇을 하는가 (삼세 예지·예지).
   * 확정 쯔모가 없으면 `undefined`를 돌려주므로 호출부는 종전 경로 그대로 간다.
   */
  knownDrawsFor(
    waitKinds: readonly TileKind[],
    ukeireKinds: readonly TileKind[],
  ): KnownDrawEffect | undefined;
  /**
   * 콜 기회가 어디서 걸렸는지 세는 집계기 (`bot/callAudit.ts`). 측정 전용이라
   * 실대국은 `undefined`다 — 그러면 기록 호출 자체가 일어나지 않는다.
   */
  callAudit?: CallAudit | undefined;
}

/**
 * 표시패 한 장이 **내 손에 붙여 줄 도라의 기대 장수**. 손패 14장 / 종류 34가지 =
 * 0.41장. 가려진 표시패를 «모르지만 있다»로 셀 때 쓰는 값이다.
 */
const HIDDEN_DORA_EXPECTED = 14 / 34;

const sameKind = (a: TileKind, b: TileKind): boolean =>
  a.suit === b.suit && a.rank === b.rank;

/** kinds에서 remove의 각 패를 한 장씩 뺀 새 목록 */
export function removeKinds(
  kinds: readonly TileKind[],
  remove: readonly TileKind[],
): TileKind[] {
  const out = [...kinds];
  for (const r of remove) {
    const i = out.findIndex((k) => sameKind(k, r));
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

/** `buildRead`에 함께 넘기는, 뷰 바깥에서 오는 것들 */
export interface ReadContext {
  /** 몇 국짜리 게임인가 (뷰에 없다 — 서버가 알려 준다) */
  mode?: BotGameMode;
  /** 지금까지 읽어 낸 상대 성향 (뷰가 아니라 **기억**에서 온다) */
  traitsOf?: (p: PlayerId) => OpponentTraits;
  /**
   * 이 봇의 성격. 수비 판단이 성격을 타는 곳이 하나 있다 — **스지를 얼마나 믿는가**
   * (`profile.sujiTrust`). 넘기지 않으면 교과서적인 중립값으로 읽는다.
   */
  profile?: BotProfile;
  /** 실험 스위치 (2:2 정책 대전 전용) */
  flags?: BotFlags;
  /** 콜 기회 집계기 (측정 전용) */
  callAudit?: CallAudit | undefined;
}

/** 뷰 하나로 이번 결정의 판 읽기를 만든다 */
export function buildRead(
  view: PlayerView,
  me: PlayerId,
  ctx: BotGameMode | ReadContext = {},
): BotRead {
  // 예전 호출부는 모드 문자열만 넘겼다 — 둘 다 받는다
  const context: ReadContext = typeof ctx === "string" ? { mode: ctx } : ctx;
  const mode = context.mode;
  const flags = context.flags ?? NO_FLAGS;
  const hand: TileKind[] = [];
  for (const id of view.zones[handZone(me)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) hand.push(k);
  }
  const meldCount = view.round.byPlayer[me]?.meldCount ?? 0;
  /**
   * **점수상 멘젠인가** — 안깡은 손을 열지 않는다. 샹텐은 안깡도 멘쯔로 세야 하므로
   * `meldCount`와 나눠 둔다(둘을 겸하게 두면 안깡 한 번에 리치 판수가 날아간다).
   */
  const myMelds = view.round.byPlayer[me]?.melds ?? [];
  const menzen = myMelds.every((m) => m.kind === "kan_closed");
  /**
   * 안깡 수 — **후로가 손으로 돌아올 때**(파혼) 멘젠이 되살아나는지를 가른다.
   * 남는 후로가 전부 안깡이면 그 손은 다시 점수상 멘젠이다.
   */
  const closedKanCount = myMelds.filter((m) => m.kind === "kan_closed").length;
  const opts: DecomposeOptions = view.scoringOptions ?? {};
  const remainingOf = tileTracker(view);
  let shanten = shantenOf(hand, meldCount, opts);

  /*
   * 텐파이·대기는 정확해야 한다 — 코어 계산기에 화료형 옵션을 그대로 넘긴다.
   *
   * ⚠ 문지기를 `shanten <= 0` **하나로 두면 안 된다** (QA synergy4 A-13). 코어의
   * `shantenOf`는 형 완화 옵션 중 일부만 읽어서, 양극·끝없는 윤회·바람의 계보가
   * 걸린 손에서는 **진짜 텐파이인데 샹텐이 1 이상**으로 나온다(실측 누락률 각각
   * 90.5% · 57.8% · 99.1%). 그러면 여기서 대기를 계산조차 하지 않아 봇이 자기
   * 텐파이를 노텐으로 보고 오름패를 흘렸다.
   *
   * 그래서 「샹텐이 모르는 옵션이 켜져 있으면」 정확 판정을 한 번 더 돈다
   * (`bot/shape.ts` — 예외 목록이 아니라 **모델링된 옵션의 여집합**이라 옵션이
   * 늘어나도 자동으로 따라온다). 표준 손에서는 종전과 한 글자도 다르지 않다.
   */
  const mayMissTenpai = hasUnmodeledShapeOptions(opts);
  let waits: TileKind[] = [];
  let tenpai = false;
  if ((shanten <= 0 || mayMissTenpai) && hand.length > 0) {
    const exact = exactTenpai(hand, meldCount, opts);
    tenpai = exact.tenpai;
    waits = exact.waits;
    // 텐파이가 확인됐으면 샹텐 값도 그 사실에 맞춘다 — 밀기·리치·후로 판단이
    // 전부 이 숫자를 쓴다(0보다 큰 값이 남아 있으면 그쪽에서 다시 노텐이 된다).
    if (tenpai && shanten > 0) shanten = 0;
  }

  const doraKinds: TileKind[] = [];
  for (const id of view.round.doraIndicators) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) doraKinds.push(doraKindFor(k));
  }
  // 위협 읽기는 도라를 알아야 한다 — 상대 후로에 눕혀진 도라가 예상 실점을 바꾼다
  /**
   * **내 정보 증강이 열어 준 것**(`bot/intel.ts`) — 뷰에 실려 온 것만 읽는다.
   * 정보 증강이 없으면 빈 값이라 종전 판단과 한 글자도 다르지 않다 (A-14).
   */
  const intel = readIntel(view, me, opts);
  const threats = readThreats(
    view,
    me,
    doraKinds,
    context.traitsOf ?? (() => NEUTRAL_TRAITS),
    intel,
  );
  const doraCount = new Map<string, number>();
  for (const d of doraKinds) {
    const key = kindKey(d);
    doraCount.set(key, (doraCount.get(key) ?? 0) + 1);
  }
  const doraIn = (kinds: readonly TileKind[]): number => {
    let n = 0;
    for (const k of kinds) n += doraCount.get(kindKey(k)) ?? 0;
    return n;
  };

  // 손 전체(후로 포함)의 도라 + 적도라 — 밀지 접을지의 기준이 되는 값어치
  const meldTiles: TileId[] = view.zones[meldsZone(me)]?.tileIds ?? [];
  const meldKinds: TileKind[] = [];
  for (const id of meldTiles) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) meldKinds.push(k);
  }
  let reds = 0;
  for (const id of [...(view.zones[handZone(me)]?.tileIds ?? []), ...meldTiles]) {
    if (view.tiles[id]?.attrs.red === true) reds++;
  }
  /**
   * **가려진 도라 표시패의 몫** (`dora_conceal` — 정보 은폐 계열의 «당하는 쪽»).
   *
   * 표시패가 가려지면 뷰의 `doraIndicators`가 그만큼 짧아진다. 봇은 그 자리를 여태
   * **0장**으로 셌다 — 도라가 존재한다는 사실 자체는 아는데(깡을 몇 번 쳤는지가
   * 공개다) 그 손을 도라 없는 손으로 값매겼다는 뜻이라, 상대의 실버 한 장에
   * 봇이 조용히 자기 손을 싸게 보고 접었다.
   *
   * 사람은 이 자리에서 «모르지만 있다»로 둔다. 그 «있다»의 기대값은 표시패 한 장당
   * 손패 14장 중 약 14/34장이다. 표시패가 다 보이면 이 항은 정확히 0이라 종전과
   * 한 글자도 다르지 않다.
   */
  let kanCount = 0;
  for (const p of view.players) {
    for (const m of view.round.byPlayer[p.id]?.melds ?? []) {
      if (m.kind.startsWith("kan")) kanCount++;
    }
  }
  /*
   * 조건을 둘 다 요구한다 — **표시패가 통째로 비어서 왔고, 그것을 가릴 수 있는
   * 사람이 실제로 앉아 있을 때만**.
   *
   * 「비어 있다」 하나로는 새는 자리가 있다: 배패 직후·깡 직후처럼 표시패가 아직
   * 안 뒤집힌 한 순간이 그렇고, 손으로 세운 시험 장면도 그렇다. 그쪽으로 새면 봇이
   * **없는 도라를 믿는다** — 이 보정이 막으려던 것과 정반대의 잘못이다. 보유 증강은
   * 뷰에 전원 공개이므로(`PlayerInfo.augments`) 이 확인 자체가 합법이고, 무장해제로
   * 잠긴 증강은 빼고 본다(`effectiveAugmentsOf` — 나머지 판단과 같은 규율).
   */
  const someoneConceals = view.players.some((p) =>
    effectiveAugmentsOf(view, p.id).includes("dora_conceal"),
  );
  const hiddenIndicators =
    someoneConceals && view.round.doraIndicators.length === 0 ? 1 + kanCount : 0;
  const handDora =
    doraIn(hand) + doraIn(meldKinds) + reds + hiddenIndicators * HIDDEN_DORA_EXPECTED;

  const seat = view.players.find((p) => p.id === me)?.seat ?? 0;
  const n = view.players.length || 4;
  const seatWind =
    ((((seat - view.round.dealerSeat) * view.round.direction) % n) + n) % n + 1;

  /**
   * 수비 저울 — 순목·도라·**스지 신뢰도**.
   *
   * `noSuji`는 스지 읽기를 **끄는** 스위치다(`bot/flags.ts`의 '자'). 켜면 스지 신뢰가
   * 0이 되어 량면 감액이 사라지고, 벽·장수 셈만 남은 옛 수준의 수비가 된다 —
   * 스지가 실제로 얼마나 기여하는지를 2:2 대전으로 언제든 다시 잴 수 있다.
   */
  const profile = context.profile ?? NEUTRAL_PROFILE;
  const defense: DefenseContext = {
    turn: view.round.turnCount,
    doraKinds,
    sujiTrust: flags.has("noSuji") ? 0 : profile.sujiTrust,
    /*
     * **지뢰 탐지**가 찍어 준 「지금 버리면 쏘이는 종류」 (A-14). 스냅샷이라
     * 나이만큼만 믿는다 — 사람 화면이 「N순 기준」이라고 밝히는 것과 같은 취급.
     */
    ...(intel.dangerKinds.size > 0
      ? {
          confirmedDanger: intel.dangerKinds,
          confirmedDangerTrust: snapshotTrust(view.round.turnCount, intel.dangerTurn ?? undefined),
        }
      : {}),
  };

  const mine = view.round.byPlayer[me];
  /**
   * **내가 든 상시 증강이 내 손 값어치에 거는 배수** (`AUGMENT_PLAY`, 코어).
   *
   * 뚫린 천장(상한 없음)·밀실의 도라(안깡당 +4판)·큰손(최소 만관)을 들고도 봇은
   * 자기 손을 평범한 손으로 셌다 — 밀어야 할 자리에서 접고, 리치를 걸 자리에서
   * 다마를 쳤다(docs/27 §5.2가 지정한 삽입 지점). 표에 없는 증강은 1.0이고 곱은
   * 코어에서 0.4~2.2로 잘려 있다. **그 국에만 사는 효과는 표에 없으므로**
   * 이미 꺼진 증강을 계속 비싸게 세는 일은 생기지 않는다.
   *
   * ⚠ **잠긴 것은 빼고 센다** (`effectiveAugmentsOf`). 예전에는 여기만 원본
   * `player.augments`를 읽었다 — 상대를 볼 때는 전부 무장해제 채널을 통과시키면서
   * (`danger.ts` 리치 신뢰·위협 배수, `collect.ts`) **내 쪽만** 그대로였다. 그래서
   * 사람이 봇의 큰손·뚫린 천장·만년 오야를 잠근 바로 그 국에, 봇은 자기 손을 최대
   * 35% 비싸게 세고 그만큼 더 밀었다(잠근 대가로 얻어야 할 "저 봇이 접는다"가
   * 일어나지 않는다). `handRulesOf`도 같은 목록을 보므로 **역 없이 화료·오픈 리치**가
   * 잠긴 뒤에도 봇은 그 규칙이 살아 있다고 믿고 손을 짰다
   * (`qa-lab/findings/bot.md` 확정 2).
   */
  const myAugments = effectiveAugmentsOf(view, me);
  const myAugmentValue = augmentValueMultiplier(myAugments);
  const rules = handRulesOf(myAugments);
  /**
   * **가정한 후로 수에서 이 손이 점수상 멘젠인가.**
   *
   * 예전 식은 `menzen && 가정 <= 지금`이었다 — 후로가 **느는** 쪽(콜 EV)만 다룬다.
   * 그런데 이 게임에는 후로를 **손으로 되돌리는** 증강이 있다(파혼). 그때는 후로 수가
   * 줄고 멘젠이 실제로 되살아나는데, 지금 손이 열려 있으면 `menzen`이 false라 곱해져
   * **되돌아온 뒤에도 계속 열린 손으로** 값매겨졌다. 그 증강의 값어치 전부가
   * (리치 2.2판 + 역없는 열린 손 감액 해제) 봇의 눈에 보이지 않았다.
   *
   * 어느 후로가 돌아오는지는 여기서 모르므로, **남는 후로가 전부 안깡일 수 있는가**로
   * 본다 — 안깡만 남으면 그 손은 점수상 멘젠이다.
   */
  const menzenAt = (assumed: number): boolean =>
    assumed > meldCount ? false : assumed < meldCount ? assumed <= closedKanCount : menzen;

  const match = readMatch(view, me, mode);
  const wallLeft = wallLeftOf(view);
  const furiten = mine?.furiten === true;
  const waitTiles = waitTilesOf(waits, remainingOf);

  /**
   * **이면투시로 본 뒷도라가 내 손에 몇 장 붙는가** — 표시패가 아니라 도라 종류로
   * 이미 옮겨져 있다(`bot/intel.ts`). 손패 + 후로를 함께 센다.
   */
  const uraDora =
    intel.uraDoraKinds.length === 0
      ? undefined
      : (() => {
          const ura = new Map<string, number>();
          for (const k of intel.uraDoraKinds) {
            ura.set(kindKey(k), (ura.get(kindKey(k)) ?? 0) + 1);
          }
          let n = 0;
          for (const k of [...hand, ...meldKinds]) n += ura.get(kindKey(k)) ?? 0;
          return n;
        })();

  /**
   * 확정 쯔모(`intel.myDraws`)를 확률식이 쓰는 셋으로 줄인다.
   *
   * **어림이라는 것을 적어 둔다**: 첫 전진 이후 손이 바뀌면 뒤 장의 쓸모도 달라지는데
   * 여기서는 지금 모양 기준으로 한 번에 센다. 그래도 «오름패가 몇 번째로 온다»는
   * 정확하고, 판단을 뒤집는 것은 대부분 그 한 가지다.
   */
  const knownDrawsFor = (
    waitKinds: readonly TileKind[],
    ukeireKinds: readonly TileKind[],
  ): KnownDrawEffect | undefined => {
    if (intel.myDraws.length === 0) return undefined;
    const waitSet = new Set(waitKinds.map(kindKey));
    const upSet = new Set(ukeireKinds.map(kindKey));
    let hitAt: number | null = null;
    let advances = 0;
    let misses = 0;
    for (let i = 0; i < intel.myDraws.length; i++) {
      const key = kindKey(intel.myDraws[i] as TileKind);
      if (waitSet.has(key)) {
        if (hitAt === null) hitAt = i + 1;
        continue;
      }
      if (upSet.has(key)) advances++;
      else misses++;
    }
    return { hitAt, advances, misses };
  };

  const read: BotRead = {
    view,
    me,
    hand,
    meldCount,
    menzen,
    opts,
    turn: view.round.turnCount,
    wallLeft,
    threats,
    threat: maxThreat(threats),
    shanten,
    tenpai,
    waits,
    waitTiles,
    match,
    doraKinds,
    remainingOf,
    safetyOf: (kind) => safetyOf(kind, threats, remainingOf, defense),
    expectedLoss: (kind, only) =>
      expectedLossOf(
        kind,
        only === undefined ? threats : threats.filter((t) => t.player === only),
        remainingOf,
        defense,
      ),
    valueOf: (input) =>
      estimateHandValue({
        // 손을 직접 읽어 역을 잡는다 (`bot/yaku.ts`) — 청일색·치또이·일통·산색·찬타.
        // `noYakuRead` 스위치는 이 읽기를 **끈다** — 하위 시스템 하나의 기여를
        // 2:2 대전으로 언제든 다시 잴 수 있게 남겨 둔 측정용 손잡이다.
        ...(flags.has("noYakuRead")
          ? {}
          : { kinds: [...hand, ...meldKinds] }),
        handDora: Math.max(0, handDora + (input.doraDelta ?? 0)),
        meldCount: input.meldCount ?? meldCount,
        menzen: menzenAt(input.meldCount ?? meldCount),
        plan: input.plan,
        isDealer: match.isDealer,
        riichiDeclared: mine?.riichiDeclared === true,
        // 증강이 넓힌 화료형으로 텐파이인 것은 아는데 값은 평범한 규칙으로 매기던
        // 구멍을 막는다 — 샹텐·대기와 **같은 옵션**을 값어치도 본다
        opts,
        augmentMultiplier: input.withoutAugments === true ? 1 : myAugmentValue,
        // 증강이 **규칙 자체를 지운** 두 자리 — 역 요구와 리치의 멘젠 요구
        ...(rules.noYakuRequired ? { noYakuRequired: true } : {}),
        ...(rules.openRiichiHan > 0 ? { openRiichiHan: rules.openRiichiHan } : {}),
        /**
         * 멘젠 부수 분리 (`menzenfu`) — **재 보고 반려한 스위치라 기본은 종전 동작이다.**
         *
         * 2026-08-08, 204배패 2:2 듀플리케이트: 순위 +0.0270 ± 0.0580 · 점수 +344 ± 1297.
         * **강해지지 않았다.** 그런데 값을 치렀다 — **후로율 16.8% → 12.7%**(−4.2%p),
         * 방총률 10.50% → 11.32%. 멘젠 손이 20% 비싸지니 `evOfPass`가 `evOfCall`을
         * 더 자주 이긴다. `bot/value.ts`의 `MENZEN_FU` 주석이 예고한 그대로다.
         *
         * 하필 같은 판에서 `passRisk`가 후로율을 +1.8%p 올려 놓았는데, 이 스위치 하나가
         * 그걸 두 배로 되돌린다(네 스위치 동시: 16.7% → 14.0%). 봇의 후로율 17.5%를
         * 사람 구간 30~40%로 끌어올리는 것이 이번 작업의 목표라, **강함을 하나도 얻지
         * 못하면서 목표를 뒤로 미는** 변경은 채택하지 않는다.
         *
         * 마작으로서는 이쪽이 옳다(멘젠 론 +10부). 다시 켜려면 후로 쪽 값매김을 함께
         * 손봐야 한다 — 그때 이 스위치로 다시 재면 된다.
         */
        menzenFu: flags.has("menzenfu"),
        // 뒷도라를 실제로 봤으면 리치 값어치에 그 수를 그대로 넣는다 (이면투시)
        ...(uraDora === undefined ? {} : { uraDora }),
      }),
    winChanceOf: (input) =>
      winChance({
        shanten: input.shanten,
        waitTiles: input.waitTiles,
        ukeireTiles: input.ukeireTiles,
        // 쯔모 한 번 = 패산 4장 (넷이 돌아가므로)
        wallLeft: wallLeft + (input.extraDraws ?? 0) * 4,
        turn: view.round.turnCount,
        furiten: furiten || input.tsumoOnly === true,
        openUkeire:
          input.open === undefined
            ? undefined
            : callableUkeireTiles(input.open.hand, input.open.ukeireKinds, remainingOf),
        known: input.known,
      }),
    doraIn,
    handDora,
    seatWind,
    flags,
    intel,
    knownDrawsFor,
    callAudit: context.callAudit,
    furiten,
    riichiDeclared: mine?.riichiDeclared === true,
    noYakuRequired: rules.noYakuRequired,
    isYakuhai(kind) {
      if (kind.suit === "dragon") return true;
      if (kind.suit === "wind") {
        return kind.rank === seatWind || kind.rank === view.round.prevalentWind;
      }
      return false;
    },
  };
  return read;
}

/**
 * 지금 손이 어떤 역을 향하고 있는가 — 버림·후로의 기준.
 * 커밋이 아니라 **매 결정마다 다시 읽는 관측**이다(손이 바뀌면 방향도 바뀐다).
 * 이미 후로로 방향이 정해졌다면 `committed`를 넘겨 그 방향을 우선한다.
 */
export function readPlan(read: BotRead, committed: HandPlan = null): HandPlan {
  const all = [...read.hand, ...meldKindsOf(read)];
  if (all.length === 0) return committed;

  // 혼일색 — 수패가 한 색에 몰려 있고 그 색이 충분히 두꺼울 때
  const counts = new Map<string, number>();
  let numberTotal = 0;
  for (const k of all) {
    if (k.suit === "man" || k.suit === "pin" || k.suit === "sou") {
      counts.set(k.suit, (counts.get(k.suit) ?? 0) + 1);
      numberTotal++;
    }
  }
  let bestSuit: string | null = null;
  let bestCount = 0;
  for (const [suit, c] of counts) {
    if (c > bestCount) {
      bestSuit = suit;
      bestCount = c;
    }
  }
  if (bestSuit !== null && bestCount >= 5 && numberTotal - bestCount <= 1) {
    /**
     * 자패가 한 장도 없으면 그 손은 혼일색이 아니라 **청일색**으로 간다.
     * 방향이 다르면 버릴 패가 달라진다 — 청일색은 자패도 정리 대상이다.
     */
    if (all.length - numberTotal === 0) {
      return { yaku: "chinitsu", suit: bestSuit };
    }
    return { yaku: "honitsu", suit: bestSuit };
  }

  if (committed !== null) return committed;

  /**
   * 찬타 계열 — 4·5·6이 한 장도 없는 손. 요구패 장수가 아니라 **중심패의 부재**로
   * 판정하는 것이 `bot/yaku.ts`와 같은 규율이다(456 슌쯔가 든 손을 찬타로 읽지 않는다).
   *
   * **확정된 방향(`committed`)보다 뒤에 둔다.** 혼일색이 앞에 있는 것은 그쪽이 훨씬
   * 비싸서 확정을 덮을 만하기 때문이고, 찬타는 그만큼 비싸지 않다 — 역패 펑으로
   * 방향이 정해진 손을 찬타로 덮으면 중장패를 버리라는 엉뚱한 지시가 된다.
   */
  {
    const hasCore = all.some(
      (k) =>
        (k.suit === "man" || k.suit === "pin" || k.suit === "sou") &&
        k.rank >= 4 &&
        k.rank <= 6,
    );
    const orphans = all.filter(
      (k) =>
        !(k.suit === "man" || k.suit === "pin" || k.suit === "sou") ||
        k.rank === 1 ||
        k.rank === 9,
    ).length;
    if (!hasCore && all.length >= 10 && orphans >= 4) {
      return { yaku: all.length - numberTotal === 0 ? "junchan" : "chanta" };
    }
  }

  /**
   * 이미 눕혀 둔 역패 커쯔 — 그 자체가 확정 역이다.
   *
   * 예전에는 이 방향을 `chooseCall`이 울 때 한 번 정해 주는 것에만 의존했다. 그래서
   * 그 경로를 안 거친 후로(재개·리플레이 재구성·증강이 만든 후로)는 방향을 잃었고,
   * **역이 확정된 손이 "역없는 열린 손"으로 읽혔다**(2026-08-05 EV 도입 때 드러났다).
   * 방향은 기억이 아니라 판에서 읽는 것이 옳다.
   */
  for (const { kind, n } of groupKinds(meldKindsOf(read)).values()) {
    if (n >= 3 && read.isYakuhai(kind)) return { yaku: "yakuhai" };
  }

  // 토이토이 — 커쯔·작두가 4조 이상이면 사람도 이 방향을 본다
  const pairs = new Map<string, number>();
  for (const k of all) {
    const key = kindKey(k);
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  let sets = 0;
  for (const c of pairs.values()) if (c >= 2) sets++;
  if (sets >= 4) return { yaku: "toitoi" };

  // 탕야오 — 요구패가 거의 없을 때
  const orphans = all.filter((k) => isOrphan(k)).length;
  if (orphans <= 1) return { yaku: "tanyao" };

  return null;
}

/** 같은 종류끼리 묶어 장수를 센다 (대표 kind를 함께 들고 있어 되파싱이 필요 없다) */
function groupKinds(
  kinds: readonly TileKind[],
): Map<string, { kind: TileKind; n: number }> {
  const m = new Map<string, { kind: TileKind; n: number }>();
  for (const k of kinds) {
    const key = kindKey(k);
    const cur = m.get(key);
    if (cur === undefined) m.set(key, { kind: k, n: 1 });
    else cur.n++;
  }
  return m;
}

const isOrphan = (k: TileKind): boolean =>
  !(k.suit === "man" || k.suit === "pin" || k.suit === "sou") ||
  k.rank === 1 ||
  k.rank === 9;

// ──────────────── 증강이 **화료 규칙 자체**를 바꾼 자리 ────────────────

/**
 * 증강이 지운 **화료 규칙**을 값어치 계산이 읽을 수 있는 형태로 옮긴다.
 *
 * `view.scoringOptions`에는 화료**형**의 확장(무너진 국경·동수의 결속 …)만 실린다.
 * "역이 필요한가"·"리치에 멘젠이 필요한가"는 `RuleRegistry`의 홀더 규칙이라 뷰에
 * 실리지 않으므로, 보유 증강 id에서 되읽는 수밖에 없다.
 *
 * **표로 두는 이유는 `AUGMENT_PLAY`와 같다**(docs/27 §2.2) — 증강마다 함수를 쓰면
 * 1000종에서 무너진다. 여기 없는 증강은 평범한 마작 규칙이므로 빠뜨려도 봇이
 * 이상해지지 않는다.
 *
 * **조건부로만 규칙을 지우는 것은 넣지 않았다.** 만개해야 비로소 역이 필요 없어지는
 * 늦게 피는 꽃(`late_bloomer`)과, 원수의 버림패에만 걸리는 복수자(`avenger`)가 그렇다 —
 * 보유를 근거로 규칙을 지우면 **아직 오지 않은(또는 이미 지나간) 조건을 계속 참으로
 * 믿는다.** docs/27 §2.2가 "그 국에만 사는 효과를 표에 넣지 않은" 것과 같은 규율이다.
 */
interface HandRules {
  /** 역이 없어도 화료할 수 있는가 (`win.requiresYaku` = false) */
  noYakuRequired: boolean;
  /** 열린 손 리치가 몇 판인가 (0 = 열린 손으로는 리치를 못 건다) */
  openRiichiHan: number;
}

/** 개문선언의 열린 손 리치는 2판으로 취급된다 (`standardAugments.OPEN_RIICHI_HAN`) */
const OPEN_RIICHI_HAN = 2;

function handRulesOf(augments: readonly string[]): HandRules {
  let noYakuRequired = false;
  let openRiichiHan = 0;
  for (const id of augments) {
    if (id === "yakuless_win") noYakuRequired = true;
    if (id === "open_riichi") openRiichiHan = OPEN_RIICHI_HAN;
  }
  return { noYakuRequired, openRiichiHan };
}

/** 내 후로 패의 kind 목록 */
export function meldKindsOf(read: BotRead): TileKind[] {
  const out: TileKind[] = [];
  for (const id of read.view.zones[meldsZone(read.me)]?.tileIds ?? []) {
    const k = read.view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}
