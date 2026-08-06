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

/**
 * 봇이 아는 역 이름 — **손 값어치와 후로 판단이 함께 쓰는 하나의 어휘**다.
 *
 * 2026-08-06까지 이 어휘는 두 벌이었다. `bot/read.ts`의 `HandPlan`이 아는 역은
 * 역패·탕야오·혼일색·토이토이 넷뿐인데 이 파일은 청일색·치또이·일통·산색·찬타까지
 * 읽었다. 값어치는 여섯을 알고 **후로 게이트는 넷만 아는** 상태였고, 그래서
 * "울면 화료할 역이 없다"로 잘려 나간 콜 기회가 전체의 36.6%였다(#152 집계).
 * 산색으로 갈 수 있는 손도, 일통이 보이는 손도 게이트가 모르니 그냥 잘렸다.
 *
 * 어휘를 하나로 합쳐 그 구멍을 없앤다.
 */
export type YakuName =
  | "yakuhai"
  | "tanyao"
  | "honitsu"
  | "chinitsu"
  | "toitoi"
  | "sanankou"
  | "ittsu"
  | "sanshoku"
  | "sanshokuDoukou"
  | "chanta"
  | "junchan"
  | "chiitoitsu";

/**
 * 역이 주는 판수. 열린 손에서 한 판 깎이는 역(쿠이사가리)이 표에 그대로 들어 있다.
 *
 * 이 표가 값어치(`value.planHan`)와 후로 판단이 함께 보는 **한 벌의 눈금**이다 —
 * 예전에는 두 곳이 각자 숫자를 들고 있어 조용히 어긋날 수 있었다.
 */
export function hanOf(name: YakuName, menzen: boolean): number {
  switch (name) {
    case "yakuhai":
      return 1;
    case "tanyao":
      return 1;
    case "honitsu":
      return menzen ? 3 : 2;
    case "chinitsu":
      return menzen ? 6 : 5;
    // 토이토이 2판 + 대개 따라오는 삼암각·역패로 실질 3판 근처 (열린 손도 안 깎인다)
    case "toitoi":
      return menzen ? 3 : 2;
    case "sanankou":
      return 2;
    case "ittsu":
      return menzen ? 2 : 1;
    case "sanshoku":
      return menzen ? 2 : 1;
    case "sanshokuDoukou":
      return 2;
    case "chanta":
      return menzen ? 2 : 1;
    case "junchan":
      return menzen ? 3 : 2;
    case "chiitoitsu":
      return 2;
  }
}

/** 손 전체(손패 + 후로)에서 읽어 낸 역 후보 하나 */
export interface YakuGuess {
  /** 역 이름 */
  name: YakuName;
  /** 이 역이 주는 판수 */
  han: number;
  /** 색 계열 역이 노리는 무늬 (혼일색·청일색만) */
  suit?: string;
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
  /**
   * 2026-08-06에 더한 넷(탕야오·토이토이·산안커·삼색동각)까지 볼 것인가.
   *
   * 스위치 뒤에 둔 이유는 이 넷이 **손 값어치를 바꾸기** 때문이다 — 특히 탕야오는
   * 요구패가 없는 열린 손을 '역없는 열린 손'(값의 15%)에서 멀쩡한 1판짜리로 올린다.
   * 값어치는 봇의 모든 판단에 들어가므로 재고 나서 켠다.
   */
  extended = false,
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
      out.push({ name: "chinitsu", han: hanOf("chinitsu", menzen), suit: bestSuit });
    } else if (numberTotal - bestCount <= 1) {
      out.push({ name: "honitsu", han: hanOf("honitsu", menzen), suit: bestSuit });
    }
  }

  // ── 치또이 ── 멘젠 전용. 작두가 다섯이면 실제로 그 방향이다
  if (menzen) {
    let pairs = 0;
    for (const n of counts(kinds).values()) if (n >= 2) pairs++;
    if (pairs >= 5) out.push({ name: "chiitoitsu", han: hanOf("chiitoitsu", menzen) });
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
      out.push({ name: "ittsu", han: hanOf("ittsu", menzen) });
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
      out.push({ name: "sanshoku", han: hanOf("sanshoku", menzen) });
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
    const name = junchan ? "junchan" : "chanta";
    out.push({ name, han: hanOf(name, menzen) });
  }

  if (!extended) return out;

  /**
   * ── 탕야오 ──
   *
   * 요구패·자패가 한 장도 없으면 그 손은 이미 탕야오다. 값어치 쪽에서는 `plan`이
   * 같은 값을 내지만, **방향이 안 정해진 손**(`plan === null`)에서는 아무도 이걸
   * 세지 않았다 — 열린 손이면 "역없는 열린 손"으로 값이 15%까지 깎였다.
   * 실제로는 쿠이탄이 붙는 멀쩡한 손이다.
   */
  if (kinds.length >= 8 && orphans === 0) {
    out.push({ name: "tanyao", han: hanOf("tanyao", menzen) });
  }

  // ── 커쯔 계열 ── 또이쯔·커쯔가 몇 벌이나 모였는가로 잰다
  const c = counts(kinds);
  let triplets = 0;
  let pairsOrBetter = 0;
  for (const n of c.values()) {
    if (n >= 3) triplets++;
    if (n >= 2) pairsOrBetter++;
  }
  // 토이토이 — 커쯔가 될 덩이가 넷 이상(머리 포함 다섯 덩이 근처)
  if (pairsOrBetter >= 4 && triplets >= 2) {
    out.push({ name: "toitoi", han: hanOf("toitoi", menzen) });
  }
  /**
   * 산안커 — **멘젠에서만** 센다. 열린 손에서도 안커 셋은 가능하지만, 여기서 세는
   * 커쯔는 손패의 커쯔라 후로가 섞이면 암각인지 밝은 커쯔인지 구별이 안 된다.
   * 과대평가보다 과소평가가 안전하다는 이 파일의 원칙대로 멘젠으로 좁힌다.
   */
  if (menzen && triplets >= 3) {
    out.push({ name: "sanankou", han: hanOf("sanankou", menzen) });
  }
  // 삼색동각 — 같은 숫자의 커쯔·또이쯔가 세 색에 걸쳐 있을 때
  for (let r = 1; r <= 9; r++) {
    let touched = 0;
    let have = 0;
    for (const suitName of NUMBER_SUITS) {
      const n = c.get(kindKey({ suit: suitName, rank: r })) ?? 0;
      if (n >= 2) touched++;
      have += Math.min(n, 3);
    }
    if (touched === 3 && have >= 7) {
      out.push({ name: "sanshokuDoukou", han: hanOf("sanshokuDoukou", menzen) });
      break;
    }
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
export function bestYakuHan(
  kinds: readonly TileKind[],
  menzen: boolean,
  extended = false,
): number {
  let best = 0;
  for (const g of guessYaku(kinds, menzen, extended)) if (g.han > best) best = g.han;
  return best;
}
