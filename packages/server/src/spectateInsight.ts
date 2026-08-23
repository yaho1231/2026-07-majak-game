/**
 * 중계 관전 보조 계산 — **예상 타점**과 **위험패** (docs/36 A2·A4).
 *
 * ## 두 층으로 나뉜다
 * - **텐파이 좌석은 확정값**이다. 코어(`information/spectateScore.ts`)가 판이 실제로
 *   쓰는 채점기(`buildWinContext` → `evaluateWin` → `calculateScore`)로 가상 화료를
 *   시켜 낸 값이라, 쿠이사가리·역없음·「도라는 역이 있어야 센다」·좌석별 증강이
 *   전부 자동으로 맞는다. 그 계산은 `GameState`를 봐야 해서 뷰만 가진 이 파일이 아니라
 *   컨트롤러가 하고, 여기로는 결과(`SpectateSeatScore[]`)가 실려 온다.
 * - **노텐 좌석만 추정**이다. 아직 완성되지 않은 손의 «확정 타점»이라는 것은 존재하지
 *   않으므로 봇의 값어치 모형(`bot/value.ts`)을 그대로 쓴다 — 다만 **화면에 실재하지
 *   않는 숫자를 내보내지 않는다**(아래 `snapEstimate` 주석).
 *
 * ## 왜 예전 값이 틀렸나
 * 예전에는 네 좌석 전부를 `estimateHandValue`로 찍었다. 그 모형은 만관 경계에서 봇의
 * 판단이 요동치지 않도록 **일부러** 판수를 연속값으로 두고(리치 2.2판·부수 36부)
 * 점수표 두 칸을 보간한다. 그래서 화면에 「3.2판」·「4660점」이 떴다 — 마작에 존재할
 * 수 없는 숫자다. 봇에게는 옳고 화면에는 틀리다.
 *
 * ## 관전 뷰에서만 돈다
 * 손패가 전부 공개된 시점에서만 의미가 있고, 그 시점은 관전자에게만 간다.
 * 대국자에게는 이 메시지가 한 글자도 가지 않는다.
 */

import {
  SPECTATOR_ID,
  calculateScore,
  doraKindFor,
  handZone,
  kindKey,
  meldsZone,
  shantenOf,
} from "@majak/core";
import type {
  DecomposeOptions,
  PlayerView,
  SpectateInsightMessage,
  SpectateSeatScore,
  TileKind,
} from "@majak/core";
import { estimateHandValue } from "./bot/value.js";
import { NEUTRAL_DEFENSE, readThreats, safetyOf, tileTracker } from "./bot/danger.js";

/** 이 뷰에서 한 좌석이 쥔 패의 종류 (관전 뷰라 전부 보인다). */
function kindsOf(view: PlayerView, zoneId: string): TileKind[] {
  const out: TileKind[] = [];
  for (const id of view.zones[zoneId]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) out.push(k);
  }
  return out;
}

/**
 * **한 장 버린 뒤의 최선 샹텐** — 14장(3n+2) 시점의 옳은 셈 (docs/36:101).
 *
 * 예전에는 `hand.slice(0, -1)`, 즉 **배열의 마지막 한 장**을 그냥 잘라 냈다. 그 자리는
 * 손패 배치(`handOrder`)에 따라 아무 패나 될 수 있고 최선의 버림도 아니다 — 실측에서
 * 14장 시점 64건 중 22건(34%)이 좌석 뱃지와 어긋났고, 어긋날 때는 언제나 «한 단계 나쁘게»
 * 나왔다. 텐파이인 좌석을 1샹텐이라 읽는 일이 실제로 났다. 해설이 읽는 숫자다.
 *
 * 코어의 관전 채점(`buildSpectateSeatScores`)이 같은 셈을 들고 있다 — 여기 것은
 * **좌석값이 실려 오지 않은 경로**(옛 호출부·단위 테스트)의 대비책이다. 두 셈이 갈리면
 * 같은 화면 안에서 숫자가 갈리므로 바꿀 때는 반드시 함께 바꾼다.
 */
function bestShanten(
  hand: readonly TileKind[],
  meldCount: number,
  options: DecomposeOptions | undefined,
): number {
  if (hand.length % 3 !== 2) return shantenOf(hand, meldCount, options);
  let best = Number.POSITIVE_INFINITY;
  const tried = new Set<string>();
  for (let i = 0; i < hand.length; i++) {
    const key = kindKey(hand[i]!);
    if (tried.has(key)) continue;
    tried.add(key);
    const rest = hand.filter((_, j) => j !== i);
    const s = shantenOf(rest, meldCount, options);
    if (s < best) best = s;
  }
  return Number.isFinite(best) ? best : shantenOf(hand.slice(0, -1), meldCount, options);
}

/**
 * 점수표에 실재하는 부수 눈금. 봇 모형이 내는 연속 부수(36부 같은 기대값)를 여기로
 * 스냅한다 — 부수는 «표의 칸»이지 연속량이 아니라서, 화면에 36부라고 적으면 그 줄은
 * 통째로 거짓이 된다.
 */
const FU_STEPS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110] as const;

function snapFu(fu: number): number {
  let best: number = FU_STEPS[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const step of FU_STEPS) {
    const d = Math.abs(step - fu);
    if (d < bestDiff) {
      bestDiff = d;
      best = step;
    }
  }
  return best;
}

/**
 * 노텐 좌석의 **추정** 타점을 «실재하는 숫자»로 고쳐 낸다.
 *
 * 봇 모형(`estimateHandValue`)은 판수를 소수로, 점수를 두 칸의 보간으로 낸다 — 봇의
 * 비교에는 그게 옳지만 화면에 3.2판·4660점은 존재하지 않는 값이다. 판수를 정수로
 * 확정하고 부수를 표의 눈금에 스냅한 뒤 **점수는 다시 `calculateScore`로 낸다**.
 * 보간된 점수를 반올림만 하면 여전히 표에 없는 값이 남는다.
 *
 * 판수를 1 미만으로 두지 않는 이유: 점수표에 «1판 미만»이라는 칸이 없다. 역없는 열린
 * 손이라 값이 거의 0으로 눌린 경우에도 화면은 «화료하면 얼마»를 적어야 하므로 1판으로
 * 바닥을 친다(그 좌석이 실제로 못 먹는다는 사실은 텐파이가 됐을 때 `yakuless`가 말한다).
 *
 * ⚠ **확정 경로에는 이 바닥이 없고, 없는 것이 맞다.** 무형화료(`win.requiresYaku` off)
 * 좌석은 실역 0개로도 화료하고 정산기가 실제로 «0판 30부 500점»을 지불한다 — 그건
 * 근사가 아니라 사실이라 반올림하면 안 된다(`SpectateWinValue.noYaku`가 그 사실을
 * 화면에 알린다). 여기 바닥은 **추정을 표의 칸에 앉히기 위한 것**이지 규칙이 아니다.
 */
function snapEstimate(
  han: number,
  fu: number,
  isDealer: boolean,
): { han: number; fu: number; points: number } {
  const h = Math.max(1, Math.round(han));
  const f = snapFu(fu);
  return { han: h, fu: f, points: calculateScore({ han: h, fu: f, isDealer, winType: "ron" }).total };
}

/**
 * 관전 뷰 하나에서 중계 보조값을 만든다. 관전 뷰가 아니면 null —
 * 손패가 가려진 시점에서 이 값을 만들면 그건 계산이 아니라 지어내기다.
 *
 * @param seatScores 코어가 낸 좌석 확정값 (`HanchanController`가 뷰와 같은 순간에 준다).
 *   없으면 샹텐만 이 파일이 다시 재고 타점은 전부 추정으로 떨어진다 — 뷰밖에 없는
 *   경로(단위 테스트)를 위한 대비책이지 정상 경로가 아니다.
 */
export function buildSpectateInsight(
  view: PlayerView,
  seatScores?: readonly SpectateSeatScore[],
): SpectateInsightMessage | null {
  if (view.playerId !== SPECTATOR_ID) return null;

  const scoreOf = new Map<string, SpectateSeatScore>();
  for (const s of seatScores ?? []) scoreOf.set(s.id, s);

  const doraKinds: TileKind[] = [];
  for (const id of view.round.doraIndicators) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) doraKinds.push(doraKindFor(k));
  }
  const doraCount = new Map<string, number>();
  for (const d of doraKinds) doraCount.set(kindKey(d), (doraCount.get(kindKey(d)) ?? 0) + 1);
  const doraIn = (kinds: readonly TileKind[]): number => {
    let n = 0;
    for (const k of kinds) n += doraCount.get(kindKey(k)) ?? 0;
    return n;
  };

  const seats: SpectateInsightMessage["seats"] = [];
  for (const p of view.players) {
    const handIds = view.zones[handZone(p.id)]?.tileIds ?? [];
    const meldIds = view.zones[meldsZone(p.id)]?.tileIds ?? [];
    const hand = kindsOf(view, handZone(p.id));
    const meldKinds = kindsOf(view, meldsZone(p.id));
    if (hand.length === 0) continue; // 배패 전 — 잴 것이 없다
    const pr = view.round.byPlayer[p.id];
    const meldCount = pr?.meldCount ?? 0;
    let reds = 0;
    for (const id of [...handIds, ...meldIds]) {
      if (view.tiles[id]?.attrs.red === true) reds++;
    }
    /*
     * 안깡은 손을 열지 않는다 — 샹텐에서는 멘쯔 하나로 세면서 리치·멘젠쯔모·
     * 우라도라는 그대로다. `bot/value.ts`가 `menzen`을 따로 받는 이유가 이것이라,
     * 여기서도 그 규칙을 그대로 따른다(공개된 후로가 하나도 없으면 멘젠).
     *
     * 묵계(`silent`)도 손을 열지 않지만 뷰(`MeldView`)에는 그 표식이 없다 — 그래서
     * 이 대비책 경로는 묵계를 «열린 손»으로 본다. 정상 경로에서는 상태를 직접 보는
     * 코어값(`core.menzen`)이 오므로 이 근사가 화면에 나가지 않는다.
     */
    const menzen = (pr?.melds ?? []).every((m) => m.kind === "kan_closed");
    // 샹텐과 **같은 옵션**을 쓴다 — 한 좌석의 두 숫자(예상 타점·샹텐)가 서로 다른
    // 규칙으로 계산되면 화면 안에서도 어긋난다 (QA 2차 spectate 확정 3).
    const seatOpts = view.seatScoringOptions?.[p.id];
    const core = scoreOf.get(p.id);
    /*
     * **그 좌석의 규칙으로** 잰다 (QA 2차 spectate 확정 3).
     *
     * 관전 뷰의 `scoringOptions`는 «관전자는 특정 플레이어가 아니다»라서 `{}`(표준)다.
     * 그걸 그대로 네 좌석에 쓰면 화료형을 바꾸는 증강(진짜 용 5멘쯔 · 조커 만능패 ·
     * 국사무쌍 전용)을 든 좌석에서 정확히 틀린다 — 좌석 뱃지는 그 좌석의 증강을 보고
     * 재므로 같은 화면에 숫자가 둘 뜬다. 좌석별 옵션은 뷰가 실어 준다
     * (`PlayerView.seatScoringOptions`). 없으면(옛 뷰) 표준 규칙으로 떨어진다.
     */
    const shanten = core?.shanten ?? bestShanten(hand, meldCount, seatOpts);
    const dora = core?.dora ?? doraIn(hand) + doraIn(meldKinds) + reds;

    /*
     * 텐파이 좌석에는 확정값이 있으므로 추정을 얹지 않는다 — 같은 줄에 두 숫자가
     * 뜨면 어느 쪽을 읽어도 절반은 거짓말이다.
     */
    let estimate: { han: number; fu: number; points: number } | undefined;
    if (core === undefined || core.best === undefined) {
      const value = estimateHandValue({
        kinds: [...hand, ...meldKinds],
        ...(seatOpts !== undefined ? { opts: seatOpts } : {}),
        handDora: doraIn(hand) + doraIn(meldKinds) + reds,
        meldCount,
        menzen,
        plan: null,
        isDealer: p.seat === view.round.dealerSeat,
        riichiDeclared: pr?.riichiDeclared === true,
      });
      estimate = snapEstimate(value.han, value.fu, p.seat === view.round.dealerSeat);
    }

    const best = core?.best;
    seats.push({
      id: p.id,
      shanten,
      meldCount: core?.meldCount ?? meldCount,
      menzen: core?.menzen ?? menzen,
      dora,
      ...(best !== undefined ? { best } : {}),
      ...(core?.waits !== undefined ? { waits: core.waits } : {}),
      ...(core?.yakuless === true ? { yakuless: true } : {}),
      ...(core?.belowMinHan === true ? { belowMinHan: true } : {}),
      ...(core?.furiten === true ? { furiten: true } : {}),
      ...(core?.handGrade !== undefined ? { handGrade: core.handGrade } : {}),
      ...(estimate !== undefined ? { estimate } : {}),
      // 옛 화면 호환 — 확정값이 있으면 그것, 없으면 추정. 어느 쪽이든 **실재하는 숫자**다.
      han: best?.han ?? estimate?.han ?? 0,
      fu: best?.fu ?? estimate?.fu ?? 0,
      points: best?.points ?? estimate?.points ?? 0,
    });
  }

  /*
   * 위험패 — **지금 두는 사람의 손패**에만 매긴다.
   *
   * 네 좌석 모두에 색을 칠하면 화면이 통째로 신호등이 된다. 실제로 궁금한 것은 언제나
   * 「지금 이 사람이 무엇을 버릴 수 있나」 하나다. 값은 봇이 쓰는 그 눈 그대로다
   * (`safetyOf` 0~1, 1이 가장 안전 → 화면에는 뒤집어 위험도로 준다).
   */
  const turnPlayer = view.players.find((p) => p.seat === view.round.turnSeat);
  const danger: Record<number, number> = {};
  if (turnPlayer !== undefined) {
    const threats = readThreats(view, turnPlayer.id, doraKinds);
    if (threats.some((t) => t.level > 0)) {
      const remainingOf = tileTracker(view);
      for (const id of view.zones[handZone(turnPlayer.id)]?.tileIds ?? []) {
        const kind = view.tiles[id]?.kind;
        if (kind === undefined) continue;
        danger[id] = Math.round((1 - safetyOf(kind, threats, remainingOf, NEUTRAL_DEFENSE)) * 100) / 100;
      }
    }
  }

  return {
    type: "spectateInsight",
    seats,
    ...(turnPlayer !== undefined && Object.keys(danger).length > 0
      ? { dangerSeat: turnPlayer.id, danger }
      : {}),
  };
}
