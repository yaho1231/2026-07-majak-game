/**
 * yaku — **이 손이 얼마짜리 역이 될 수 있는가.**
 *
 * ## 무엇이 문제였나
 *
 * 봇의 손 값어치 추정(`value.ts`)은 역을 **네 종류밖에 몰랐다** —
 * 역패·탕야오·혼일색·토이토이. 그 넷에 안 걸리는 손은 전부 "멘젠 기본 1판"으로
 * 셌다. 그래서 이런 일이 벌어진다.
 *
 *   - **청일색**이 혼일색(3판)으로 잡힌다. 실제로는 6판이라 절반 이하로 센 것이다.
 *   - **치또이**가 1판으로 잡힌다. 실제로는 2판이고 리치가 붙으면 만관권이다.
 *   - **산색·일통·찬타**는 아예 없는 역이다. 그 손들은 언제나 1판짜리로 취급된다.
 *
 * 값어치는 봇의 **모든** 판단에 들어간다(밀기/접기·리치/다마텐·후로·깡·증강).
 * 값을 절반으로 세면 그 손은 전부의 판단에서 절반만큼만 대접받는다 — 비싼 손을
 * 싸구려처럼 접어 버린다.
 *
 * ## 무엇을 하지 않는가
 *
 * **방향은 건드리지 않는다.** 여기서 내는 것은 "이 손이 완성되면 몇 판인가"의 추정뿐이고,
 * "그래서 무엇을 버려야 하는가"(`readPlan`·`directionGain`)는 그대로 둔다. 값 추정과
 * 방향 결정을 한꺼번에 바꾸면 무엇이 개선을 만들었는지 알 수 없다.
 *
 * 그리고 이 추정은 **낙관적이지 않아야 한다.** 완성되지도 않을 역을 세면 봇이 못 가는
 * 손을 붙들고 늘어진다. 그래서 판정은 전부 "이미 그 모양에 가까운가"를 본다 —
 * 가능성이 아니라 근접도다.
 *
 * ## 실측 결과를 정직하게 적어 둔다
 *
 * 2:2 정책 대전(`npm run arena -- --ab yaku2`, 동풍전 550배패 × 2)에서 이 변경은
 * **강함에 잴 수 있는 차이를 만들지 못했다** — 평균 순위 +0.003 ±0.032,
 * 1인당 점수 +173 ±589. 둘 다 유의미하지 않다.
 *
 * 그런데도 채택한 이유는 둘이다.
 *
 *  1. **모형이 틀린 것을 고친 것이다.** 청일색 텐파이를 1500점짜리로 세는 것은
 *     근사가 아니라 오류다. 그 손은 실제로 18000점이다.
 *  2. **드물어서 순위에 안 보일 뿐이다.** 청일색·일통·찬타는 다 합쳐도 손의 몇
 *     퍼센트라, 800판을 돌려도 평균 순위를 흔들 만큼 자주 나오지 않는다. 하지만
 *     그 몇 퍼센트에서 봇은 6판짜리 손을 싸구려처럼 접는다 — 사람이 보면 바로
 *     이상한 장면이고, 이 프로젝트가 재려는 것은 그 인상이다.
 *
 * 즉 "측정이 개선을 확인했다"가 아니라 **"측정이 손해가 없음을 확인했고, 모형은
 * 더 옳아졌다"** 가 정확한 서술이다.
 */

import { kindKey } from "@majak/core";
import type { TileKind } from "@majak/core";

const NUMBER_SUITS = ["man", "pin", "sou"] as const;
const isNumber = (k: TileKind): boolean =>
  k.suit === "man" || k.suit === "pin" || k.suit === "sou";
const isOrphan = (k: TileKind): boolean =>
  !isNumber(k) || k.rank === 1 || k.rank === 9;

/** 손 전체(손패 + 후로)에서 읽어 낸 역 후보 하나 */
export interface YakuGuess {
  /** 사람이 읽는 이름 (로그·설명용) */
  name: string;
  /** 이 역이 주는 판수 */
  han: number;
}

/** 같은 종류끼리 장수 세기 */
function counts(kinds: readonly TileKind[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of kinds) m.set(kindKey(k), (m.get(kindKey(k)) ?? 0) + 1);
  return m;
}

/** 색깔별 rank 장수 (수패만) */
function bySuit(kinds: readonly TileKind[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const s of NUMBER_SUITS) m.set(s, new Array<number>(10).fill(0));
  for (const k of kinds) {
    if (!isNumber(k)) continue;
    const arr = m.get(k.suit);
    if (arr !== undefined) arr[k.rank] = (arr[k.rank] ?? 0) + 1;
  }
  return m;
}

/**
 * 이 손이 노릴 수 있는 역들 — **이미 그 모양에 가까운 것만** 센다.
 *
 * 각 판정의 문턱은 "남은 순목으로 메울 수 있는 거리"다. 예를 들어 일기통관은
 * 아홉 장 중 일곱 장이 이미 있어야 인정한다. 가능성만으로 세면 봇이 못 가는 손을
 * 비싸다고 착각한다.
 */
export function guessYaku(
  kinds: readonly TileKind[],
  menzen: boolean,
): YakuGuess[] {
  const out: YakuGuess[] = [];
  const suits = bySuit(kinds);
  const numberTotal = kinds.filter(isNumber).length;
  const honorTotal = kinds.length - numberTotal;

  // ── 색 계열 ── 청일색은 혼일색의 상위 호환이라 함께 세지 않는다
  let bestSuit: string | null = null;
  let bestCount = 0;
  for (const s of NUMBER_SUITS) {
    const n = (suits.get(s) ?? []).reduce((a, b) => a + b, 0);
    if (n > bestCount) {
      bestSuit = s;
      bestCount = n;
    }
  }
  if (bestSuit !== null && bestCount >= 8) {
    if (honorTotal === 0 && numberTotal === bestCount) {
      out.push({ name: "chinitsu", han: menzen ? 6 : 5 });
    } else if (numberTotal - bestCount <= 1) {
      out.push({ name: "honitsu", han: menzen ? 3 : 2 });
    }
  }

  // ── 치또이 ── 멘젠 전용. 작두가 다섯이면 실제로 그 방향이다
  if (menzen) {
    let pairs = 0;
    for (const n of counts(kinds).values()) if (n >= 2) pairs++;
    if (pairs >= 5) out.push({ name: "chiitoitsu", han: 2 });
  }

  /**
   * ── 일기통관 ──
   *
   * 한 색의 **123·456·789 세 덩이가 각각** 두 장 이상 모였고, 전체로 여덟 장 이상일 때.
   *
   * 처음에는 "1~9 중 일곱 종류"로만 봤는데, 그러면 두 가지가 새어 들어온다 —
   * `123456`에 `9` 하나만 붙어도(789가 통째로 빔), `2345678`처럼 양 끝이 다 비어도
   * 일통으로 읽힌다. 세 덩이를 따로 세고 문턱을 여덟 장으로 올리면 둘 다 걸러진다.
   */
  for (const s of NUMBER_SUITS) {
    const a = suits.get(s);
    if (a === undefined) continue;
    const runs = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ].map((run) => run.filter((r) => (a[r] ?? 0) > 0).length);
    const have = runs.reduce((x, y) => x + y, 0);
    if (have >= 8 && runs.every((n) => n >= 2)) {
      out.push({ name: "ittsu", han: menzen ? 2 : 1 });
      break;
    }
  }

  // ── 산색동순 ── 같은 시작 숫자의 슌쯔가 세 색에 걸쳐 일곱 장 이상 모였을 때
  for (let start = 1; start <= 7; start++) {
    let have = 0;
    let suitsTouched = 0;
    for (const s of NUMBER_SUITS) {
      const a = suits.get(s);
      if (a === undefined) continue;
      let inSuit = 0;
      for (const r of [start, start + 1, start + 2]) if ((a[r] ?? 0) > 0) inSuit++;
      have += inSuit;
      if (inSuit > 0) suitsTouched++;
    }
    if (have >= 7 && suitsTouched === 3) {
      out.push({ name: "sanshoku", han: menzen ? 2 : 1 });
      break;
    }
  }

  /**
   * ── 찬타 계열 ──
   *
   * 판정 기준은 "요구패가 많은가"가 아니라 **4·5·6이 한 장도 없는가**이다.
   * 찬타의 몸통은 123·789·커쯔·자패뿐이라 2·3·7·8은 얼마든지 들어가지만
   * 4·5·6은 어떤 몸통에도 못 들어간다. 요구패 장수로 세면 456 슌쯔가 통째로
   * 들어 있는 손도 "요구패가 많다"는 이유로 찬타로 읽힌다(실제로 그랬다).
   */
  const hasCore = kinds.some((k) => isNumber(k) && k.rank >= 4 && k.rank <= 6);
  const orphans = kinds.filter(isOrphan).length;
  if (!hasCore && kinds.length >= 10 && orphans >= 4) {
    const junchan = honorTotal === 0;
    out.push({
      name: junchan ? "junchan" : "chanta",
      han: (junchan ? 3 : 2) - (menzen ? 0 : 1),
    });
  }

  return out;
}

/**
 * 이 손이 노릴 수 있는 **가장 비싼 역**의 판수. 아무것도 안 걸리면 0.
 *
 * 여러 역이 겹칠 때 실제로는 더해지지만(청일색 + 일통 등) 여기서는 **가장 큰 하나만**
 * 센다. 겹침을 다 더하면 추정이 낙관 쪽으로 크게 기울고, 그러면 못 가는 손을 붙들게
 * 된다. 과소평가가 과대평가보다 안전하다.
 */
export function bestYakuHan(kinds: readonly TileKind[], menzen: boolean): number {
  let best = 0;
  for (const g of guessYaku(kinds, menzen)) if (g.han > best) best = g.han;
  return best;
}
