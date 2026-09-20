/**
 * style — 사람 성향 모듈들의 공용 계산과 **스위치**.
 *
 * ## 무엇을 하는가
 *
 * `priors.ts`의 각 셀은 `[사람 p, 봇 p]`다. 모듈은 그 둘의 **로짓 차**만큼만 기울인다:
 *
 *     gap = logit(사람 p) − logit(봇 p)
 *
 * 사람이 더 자주 고르는 자리(gap > 0)는 그쪽 입찰에 웃돈을, 덜 고르는 자리는 벌점을 준다.
 * 로짓을 쓰는 이유는 «5% → 10%»와 «50% → 55%»가 같은 5%p라도 뜻이 다르기 때문이다 —
 * 전자는 두 배, 후자는 거의 같다. 봇의 EV 입찰은 점수 축이므로, 모듈마다 «로짓 1 =
 * 몇 점»의 환율(GAIN)을 두고 그 값은 연구 하네스로 사람 비율에 맞춰 잡는다(docs/58).
 *
 * ## 스위치
 *
 * 영역별 `humanRiichi` 등과 전체 `human`. 실대국 봇은 스위치가 비어 있으므로 채택
 * 전에는 종전과 완전히 같다(`bot/flags.ts` 규약). 채택된 영역은 기본값이 되고 끄는
 * 스위치(`noHumanStyle`)만 남긴다.
 */
import type { BotFlags } from "../flags.js";
import type { Pair } from "./priors.js";

export type StyleArea = "riichi" | "call" | "defense" | "discard" | "augment" | "draft";

/**
 * 채택되어 기본이 된 영역 — 여기 든 영역은 `noHumanStyle`로만 끈다.
 *
 * 2026-09-21 2:2 아레나(동풍전 200배패 × 2시드, docs/58 §9)에서 순위 차가 표준오차 안이면
 * 채택했다: 후로 +0.01 · 수비 0.00 · 타패 +0.04 · 드래프트 +0.02 · 증강(완화 문) −0.02.
 * 리치는 1500점/로짓에서 4시드 합 −0.02 ± 0.02(잡음 수준)라 환율을 1000으로 낮춰 채택했다.
 * 채택된 묶음 전체의 순효과는 `noHumanStyle`을 켠 쪽과 붙여 다시 쟀다(§9 4차).
 */
const ADOPTED: ReadonlySet<StyleArea> = new Set<StyleArea>([
  "riichi",
  "call",
  "defense",
  "discard",
  "draft",
  "augment",
]);

export function styleOn(flags: BotFlags, area: StyleArea): boolean {
  if (flags.has("noHumanStyle")) return false;
  if (ADOPTED.has(area)) return true;
  if (flags.has("human")) return true;
  return flags.has(`human${area[0]?.toUpperCase()}${area.slice(1)}`);
}

const EPS = 0.02;
function logit(p: number): number {
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(q / (1 - q));
}

/** 셀의 로짓 차 (사람 − 봇). 셀이 없으면 0 */
export function gapOf(pair: Pair | undefined): number {
  if (pair === undefined) return 0;
  return logit(pair[0]) - logit(pair[1]);
}

/** 여러 셀의 평균 로짓 차 — 없는 셀은 빼고 평균한다 */
export function meanGap(pairs: readonly (Pair | undefined)[]): number {
  let sum = 0;
  let n = 0;
  for (const p of pairs) {
    if (p === undefined) continue;
    sum += gapOf(p);
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
