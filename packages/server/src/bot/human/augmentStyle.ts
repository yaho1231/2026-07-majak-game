/**
 * augmentStyle — 액티브 증강을 **사람이 쓰는 빈도와 순목**으로 쓰게 한다.
 *
 * 실측(docs/58 §증강 발동, 상위 계층): 봇은 정책이 «쓸 수 있다»고 하면 거의 매 프롬프트
 * 태운다 — 소원의 패 72%, 침묵의 교환 77%, 고요한 손바꿈 80%, 밀정 74%, 자패 회수 84%.
 * 같은 자리의 사람은 4~16%다. 사람은 횟수형 증강을 **아껴 두었다가** 때에 쓰고, 봇은
 * 첫 순부터 소진한다. 반대로 봇이 사람보다 덜 쓰는 것(우라 엿보기 3% vs 31%, 전체 교환
 * 14% vs 62%)은 정책의 조건이 문제라 여기서는 못 고친다 — 그 카드들은 정책을 따로 고쳤다.
 *
 * 문(gate): 정책이 입찰한 뒤, 순목별 «사람 p / 봇 p» 비가 1보다 작으면 그 확률로만
 * 통과시킨다. 봇 rng라 결정론은 그대로다. 비가 1 이상이면 그대로 통과한다.
 */
import type { BotRng } from "@majak/core";
import { TURN_INDEX, bucketTurn } from "./buckets.js";
import { AUGMENT_STYLE } from "./priors.js";

const EPS = 0.02;

/**
 * 이 순에 이 증강을 태우는 것을 허락하는가.
 *
 * 비의 **제곱근**에 바닥 0.3 — 사람 빈도까지 그대로 내리면 2:2에서 순위 −0.10 ± 0.04로
 * 유의미하게 약해졌다(2026-09-21, 동풍전 200배패 × 2시드, docs/58 §9). 증강은 공짜
 * 이득이라 «안 쓰는 사람»을 그대로 따르면 그만큼 잃는다. 절반만 따르면(제곱근) 순위
 * −0.02 ± 0.04로 중립이고, 프롬프트당 발동률은 72% → 10~25%대로 사람 쪽에 온다.
 */
export function augmentGate(augId: string, turn: number, rng: BotRng): boolean {
  const style = AUGMENT_STYLE[augId];
  if (style === undefined) return true;
  const [human, bot] = style.turn[TURN_INDEX[bucketTurn(turn)]];
  const ratio = (human + EPS) / (bot + EPS);
  if (ratio >= 1) return true;
  return rng.float() < Math.max(GATE_FLOOR, Math.sqrt(ratio));
}

const GATE_FLOOR = 0.3;
