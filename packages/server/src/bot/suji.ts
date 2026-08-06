/**
 * suji — **스지(筋)**, 그리고 그 스지가 실제로 무엇을 지우는지의 모형.
 *
 * ## 원리
 *
 * 상대가 4만을 버렸다면 2-3만(1·4 대기)과 5-6만(4·7 대기)의 **량면**은 그 사람의
 * 대기가 될 수 없다 — 그 량면으로 텐파이했다면 이미 후리텐이라 론이 안 되기 때문이다.
 * 그래서 1만·7만의 안전도가 올라간다. 이것이 4의 스지다.
 *
 *     1↔4   2↔5   3↔6   4↔1,7   5↔2,8   6↔3,9   7↔4   8↔5   9↔6
 *
 * 같은 무늬에서만 적용한다. 실전에서 외우는 여섯 줄(1-4, 2-5, 3-6, 4-7, 5-8, 6-9)이
 * 이 표를 그대로 접은 것이다.
 *
 * ## 이 파일이 예전 방식과 다른 점
 *
 * 예전 `danger.tileRisk`는 스지·노찬스를 **위험도에 곱하는 상수**로 갖고 있었다
 * (스지면 ×0.4, 노찬스면 ×0.35). 그러면 두 가지가 어긋난다.
 *
 * 1. **같은 것을 두 번 지운다.** 스지가 지우는 것도 량면이고 벽이 지우는 것도 량면인데,
 *    둘 다 걸리면 0.4×0.35 = 0.14까지 떨어졌다. 이미 없는 량면을 한 번 더 지운 값이다.
 * 2. **남는 것이 안 보인다.** 스지는 량면만 지운다 — 샤보·간짱·변짱·단기는 그대로
 *    남는다. 상수 곱셈에는 "무엇이 남았는가"가 어디에도 적혀 있지 않아, 스지 걸기에
 *    쏘이고도 봇의 계산은 아무 잘못이 없다고 나온다.
 *
 * 그래서 여기서는 **이 패를 잡을 수 있는 대기형을 종류별로 세우고, 지워진 것만
 * 뺀다.** 스지는 량면 한쪽을, 벽은 량면·간짱을, 장수 셈은 샤보·단기를 지운다. 지워지지
 * 않은 몫이 곧 남은 위험이다 — 그래서 이 모형에서는 **어떤 패도 0이 되지 않는다.**
 * (현물만이 0이고, 그건 이 파일이 아니라 `danger`가 따로 판정한다.)
 *
 * ## 스지는 "안전"이 아니라 "조금 더 안전"이다
 *
 * 위 셈의 결과로 저절로 그렇게 된다. 중장패의 량면 몫은 6할 남짓이라, 양쪽 스지가
 * 다 서도 4할이 남는다. 그 4할이 샤보·간짱·단기이고, 스지 걸기 리치가 노리는 자리다.
 */

/** 이 rank의 **스지 짝** — 같은 무늬에서 이것이 버려졌으면 이 rank는 스지가 된다 */
export function sujiPartners(rank: number): number[] {
  const out: number[] = [];
  if (rank - 3 >= 1) out.push(rank - 3);
  if (rank + 3 <= 9) out.push(rank + 3);
  return out;
}

/** 스지 등급 — 짝이 둘인 4·5·6만 '반쪽'이 나온다 */
export type SujiGrade = "none" | "half" | "full";

/** 이 rank가 이 사람에게 스지인가 (그 사람이 버린 rank 집합으로 판정) */
export function sujiGradeOf(rank: number, discarded: ReadonlySet<number>): SujiGrade {
  const partners = sujiPartners(rank);
  if (partners.length === 0) return "none";
  let hit = 0;
  for (const p of partners) if (discarded.has(p)) hit++;
  if (hit === 0) return "none";
  return hit === partners.length ? "full" : "half";
}

/**
 * 이 rank를 잡는 대기형의 **몫**. 합이 1이고, 각 항이 그 대기형에 쏘일 상대적 비중이다.
 *
 * 량면 몫이 중장패에서 크고 끝수로 갈수록 작다는 것이 요점이다 — 그래서 같은 '스지'라도
 * 5의 스지가 1의 스지보다 위험을 많이 깎는다. (1을 잡는 량면은 2-3 하나뿐이고, 1은
 * 간짱으로는 아예 잡히지 않는다.)
 *
 * 절대값이 아니라 **비율**이다. 이 패가 애초에 얼마나 위험한지는 `danger`의 rank별
 * 기본 위험이 정하고, 여기서는 그 위험을 대기형별로 나눠 어느 몫이 지워졌는지만 센다.
 */
export interface WaitShares {
  /** 량면 — 스지·벽이 지우는 몫. 량면 자리 **하나당** 이 값을 절반씩 나눠 갖는다 */
  ryanmen: number;
  /** 간짱 (r-1, r+1) — 벽이 지운다 */
  kanchan: number;
  /** 변짱 — 3은 1-2, 7은 8-9에서만 나온다 */
  penchan: number;
  /** 샤보·단기 — 스지로는 절대 지워지지 않는다. 장수 셈만이 지운다 */
  other: number;
}

/** rank별 대기형 몫 (1↔9, 2↔8, 3↔7 대칭) */
export function waitSharesOf(rank: number): WaitShares {
  const r = rank <= 5 ? rank : 10 - rank; // 1~5로 접는다
  if (r === 1) return { ryanmen: 0.45, kanchan: 0, penchan: 0, other: 0.55 };
  if (r === 2) return { ryanmen: 0.45, kanchan: 0.17, penchan: 0, other: 0.38 };
  if (r === 3) return { ryanmen: 0.45, kanchan: 0.17, penchan: 0.08, other: 0.3 };
  return { ryanmen: 0.6, kanchan: 0.17, penchan: 0, other: 0.23 };
}

/** 이 판단에 쓰는 재료 — 전부 공개 정보다 */
export interface SujiContext {
  /** 이 상대가 **직접 버린** 같은 무늬의 rank 집합 (스지의 근거) */
  discarded: ReadonlySet<number>;
  /** 같은 무늬 rank의 남은 장수 (벽의 근거). 범위 밖이면 0으로 답한다 */
  aliveAt: (rank: number) => number;
  /** 이 패 **자신**의 남은 장수 — 샤보·단기가 성립하려면 상대 손에 들어 있어야 한다 */
  remaining: number;
  /**
   * 스지를 얼마나 믿는가 0~1. 성격(`profile.sujiTrust`)과 국면 신뢰도
   * (`sujiConfidence`)의 곱이다. 0이면 스지를 아예 안 본다.
   */
  sujiCredit: number;
  /** 벽(카베)을 얼마나 믿는가 0~1 */
  kabeCredit: number;
}

/**
 * **량면 자리 하나가 얼마나 지워졌는가** 0(멀쩡하다) ~ 1(존재할 수 없다).
 *
 * `side`는 그 량면을 이루는 두 장의 rank다. 지우는 근거가 둘이고, 둘 다 걸리면
 * 더 확실해지는 게 아니라 **그냥 지워진 것**이므로 큰 쪽을 쓴다(합치지 않는다).
 */
function sideDead(
  side: readonly [number, number],
  partner: number,
  ctx: SujiContext,
): number {
  // 스지 — 그 량면이 기다리는 반대쪽을 이미 버렸다 (후리텐이라 론이 안 된다)
  const bySuji = ctx.discarded.has(partner) ? ctx.sujiCredit : 0;
  // 벽 — 그 량면의 재료가 세상에 한 장도 안 남았다
  const byKabe =
    ctx.aliveAt(side[0]) <= 0 || ctx.aliveAt(side[1]) <= 0 ? ctx.kabeCredit : 0;
  return Math.max(bySuji, byKabe);
}

/**
 * 이 rank를 지금 버릴 때 **남는 위험의 비율** 0~1.
 *
 * 1이면 아무것도 못 지웠다(생 무스지). 스지·벽·장수 셈으로 지워진 몫만큼 내려간다.
 * 여기서 나온 값을 rank별 기본 위험에 곱하면 그것이 이 상대에 대한 이 패의 위험이다.
 */
export function waitFactor(rank: number, ctx: SujiContext): number {
  const s = waitSharesOf(rank);
  let alive = 0;

  // ── 량면 ── 자리마다 따로 센다. 4·5·6만 자리가 둘이고, 나머지는 하나다.
  const partners = sujiPartners(rank);
  const perSide = partners.length === 0 ? 0 : s.ryanmen / partners.length;
  for (const partner of partners) {
    // 짝이 r-3이면 그 량면은 (r-2, r-1), r+3이면 (r+1, r+2)이다
    const side: [number, number] =
      partner < rank ? [rank - 2, rank - 1] : [rank + 1, rank + 2];
    alive += perSide * (1 - sideDead(side, partner, ctx));
  }

  // ── 간짱 ── (r-1, r+1). 벽만이 지운다 — 스지와는 아무 상관이 없다.
  if (s.kanchan > 0) {
    const dead = ctx.aliveAt(rank - 1) <= 0 || ctx.aliveAt(rank + 1) <= 0;
    alive += s.kanchan * (1 - (dead ? ctx.kabeCredit : 0));
  }

  // ── 변짱 ── 3은 1-2, 7은 8-9에서만 나온다
  if (s.penchan > 0) {
    const side: [number, number] = rank === 3 ? [1, 2] : [8, 9];
    const dead = ctx.aliveAt(side[0]) <= 0 || ctx.aliveAt(side[1]) <= 0;
    alive += s.penchan * (1 - (dead ? ctx.kabeCredit : 0));
  }

  // ── 샤보·단기 ── 스지가 절대 못 지우는 몫. 지우는 것은 장수 셈뿐이다.
  alive += s.other * pairWaitFactor(ctx.remaining);

  return Math.max(0, Math.min(1, alive));
}

/**
 * 샤보·단기가 얼마나 살아 있는가 — **남은 장수**로 정해진다.
 * 자패는 량면·간짱·변짱이 아예 없으므로 이 함수 하나가 곧 자패의 위험 비율이다.
 *
 * 샤보는 상대 손에 같은 패 2장이 있어야 하고 단기는 1장이면 된다. 그래서 보이지
 * 않는 곳에 1장밖에 안 남았으면 샤보는 성립할 수 없고, 0장이면 단기도 안 된다.
 * 사람이 자패 3장이 보이면 그 자패를 안전패로 쓰는 것이 정확히 이 셈이다.
 *
 * 0장이라도 완전히 지우지는 않는다 — 증강이 만든 패(`attrs.conjured`)는 장수 셈에서
 * 빠지므로 이 봇의 추적기는 **원래 종류를 실제보다 한 장 많게** 셀 수 있다(docs/25 P8).
 * "다 나갔다"를 확신으로 바꾸면 그 오차가 그대로 방총이 된다.
 */
export function pairWaitFactor(remaining: number): number {
  if (remaining <= 0) return 0.12;
  if (remaining === 1) return 0.45; // 단기만
  return 1;
}

/**
 * **스지를 이 국면에서 얼마나 믿을 수 있는가** 0~1.
 *
 * 스지가 량면 론을 지운다는 것 자체는 후리텐 규칙이라 순목과 무관하게 참이다.
 * 그런데도 종반으로 갈수록 스지의 값이 떨어지는 이유는 **지울 것이 적어서**다 —
 * 늦게 텐파이한 손은 량면을 못 만들어 간짱·샤보·단기로 굳은 경우가 많다. 량면 비중이
 * 애초에 작으면 량면을 지워 얻는 이득도 작다.
 *
 * 리치 여부도 같은 축이다. **리치자는 손이 고정돼 있어** 지금 보이는 바닥이 그 대기
 * 전체를 제약한다 — 리치 직후에 세운 스지가 가장 값진 것이 이 때문이다. 반대로 리치를
 * 걸지 않은 상대는 텐파이인지조차 모르고, 대기를 갈아탈 수도 있으며, 무엇보다
 * **쯔모로도 이긴다** — 스지가 지워 주는 것은 론뿐이다.
 */
export function sujiConfidence(turn: number, riichi: boolean): number {
  // 종반 감쇠 — 8순까지는 그대로, 이후 16순까지 서서히 내린다
  const late = Math.max(0, Math.min(1, (turn - 8) / 8));
  const byTurn = 1 - late * 0.28;
  return byTurn * (riichi ? 1 : 0.85);
}

/**
 * 벽(카베)을 믿는 정도. 스지보다 **조금 덜** 믿는다.
 *
 * 장수 셈 자체는 확실한 사실이지만, 이 봇의 추적기는 증강 생성패를 세지 않으므로
 * 완벽하지 않다(`danger.tileTracker`). 이론서가 스지를 벽보다 위에 두는 순서와도 맞다.
 */
export const KABE_CREDIT = 0.9;
