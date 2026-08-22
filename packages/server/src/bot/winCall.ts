/**
 * winCall — **오라스의 론을 흘릴 것인가.**
 *
 * ## 왜 필요한가 (QA 4라운드 P2)
 *
 * `BotAgent.decideNow`는 «화료는 비교하지 않는다 — 이기는 것보다 나은 선택지는
 * 없다»는 한 줄로 화료를 즉시 돌려줬다. 게임 전체에서 그 말은 참이 아니다.
 * **마지막 국**에서 화료는 「이겼다」가 아니라 「게임을 끝냈다」이기도 하다.
 * 60판 619국을 재니 오라스 화료 37건 중 **19건이 화료자의 순위를 전혀 못 바꿨고**,
 * 그중 14건은 1위도 아니었다 — 봇이 자기 손으로 자기 순위를 확정한 것이다.
 *
 * ## 그런데 이건 **되돌릴 수 없는 수**다
 *
 * 론을 흘리면 그 국의 그 패에 대해 후리텐이 되고, 잘못 흘리면 순위가 그대로인 채
 * 점수만 잃는다. 그래서 이 파일의 설계는 «순위 계산을 화료에 넣는다»가 아니라
 * **«명백히 헛된 화료만 흘린다»**다. 아래 조건이 **전부** 맞을 때만 흘린다:
 *
 *   1. 마지막 국이고, 내가 1위가 아니다 (1위가 끝내는 것은 옳은 수다)
 *   2. 이 화료로도 **순위가 한 칸도 안 오른다** (지불자의 실점까지 반영해 다시 센다)
 *   3. 이 화료를 흘려도 **떨어질 자리가 없다** — 화료해도 그대로일 순위라면,
 *      점수를 안 받아 아래에 추월당할 여지가 생기는 만큼은 세야 한다
 *   4. 위 순위가 **현실적으로 닿는다** (남은 손으로 메울 수 있는 점수차)
 *   5. 아직 **순목이 남아 있다** — 흘리고 나서 다시 만들 시간이 있어야 한다
 *   6. 내가 오야가 아니다 — 오야의 화료는 연장이라 기회를 늘린다, 끝내지 않는다
 *   7. 리치를 걸지 않았다 — 리치 중 론을 흘리면 그 국 내내 후리텐이라
 *      「다시 만든다」가 성립하지 않는다
 *   8. 실력이 낮은 봇은 이 계산을 하지 않는다 (`bot/skill.ts` — 난이도 축의 하나)
 *
 * 쯔모는 흘릴 수 없다(선택지가 「이기거나 그냥 진행」이 아니다 — 쯔모 화료를 거절하는
 * 것은 그냥 손해다). 그래서 **론 프롬프트(패스가 함께 제시된 자리)에서만** 본다.
 */

import type { PlayerId, PlayerView } from "@majak/core";
import type { BotRead } from "./read.js";
import type { BotProfile } from "./profile.js";
import { skillOf } from "./skill.js";

/** 이 실력 아래로는 순위 계산을 하지 않는다 — 초보는 그냥 먹고 끝낸다 */
const RANK_AWARE_SKILL = 0.7;

/** 위 순위와 이만큼 넘게 벌어져 있으면 「닿는다」고 보지 않는다 (한 손으로 못 메운다) */
const REACHABLE_GAP = 12000;

/** 흘린 뒤 다시 만들려면 최소 이만큼의 패산이 남아 있어야 한다 (≈ 두 순) */
const MIN_WALL_LEFT = 8;

/**
 * 이 론이 **순위를 못 바꾸는 화료**인가 → 참이면 흘린다.
 *
 * `isRon`은 호출자가 판별한다(패스가 함께 제시된 프롬프트인가). 이 함수는 판만 본다.
 */
export function shouldDeclineRon(read: BotRead, profile: BotProfile): boolean {
  const match = read.match;
  if (!match.allLast) return false; // (1)
  if (match.rank <= 1) return false; // (1) — 1위는 끝내는 것이 옳다
  if (match.isDealer) return false; // (6) 오야의 화료는 연장이다
  if (read.riichiDeclared) return false; // (7) 흘리면 그 국 내내 후리텐
  if (read.wallLeft < MIN_WALL_LEFT) return false; // (5)
  if (skillOf(profile) < RANK_AWARE_SKILL) return false; // (8)

  // (4) 위 순위가 닿지 않으면 흘려 봐야 얻을 것이 없다
  if (match.chase <= 0 || match.chase > REACHABLE_GAP) return false;

  const gain = read.valueOf({ plan: null }).points + match.potBonus;
  if (gain <= 0) return false;

  // (2)(3) 지불자까지 반영해 화료 뒤의 순위를 다시 센다.
  const payer = payerOf(read.view, read.me);
  const after = rankAfter(read.view, read.me, gain, payer);
  if (after < match.rank) return false; // 순위가 오른다 — 당연히 먹는다

  /**
   * (3) 화료해도 순위가 그대로다. 그래도 **점수를 받으면 아래에 안 쫓긴다**는 값이
   * 남아 있으므로, 아래와의 격차가 이 화료 없이는 위태로운 자리에서는 그냥 먹는다.
   * 여기가 이 판단에서 가장 보수적인 자리다 — 흘려서 4위가 되는 일은 없어야 한다.
   */
  if (match.lead > 0 && match.lead < gain) return false;

  return true;
}

/** 지금 버림패를 낸 사람 (리액션 프롬프트의 지불자) */
function payerOf(view: PlayerView, me: PlayerId): PlayerId | null {
  const p = view.players.find((x) => x.seat === view.round.turnSeat && x.id !== me);
  return p?.id ?? null;
}

/** 이 점수 이동 뒤의 내 순위 (1 = 선두). 동점은 자리 순으로 끊는다 — `bot/match.ts`와 같다 */
function rankAfter(view: PlayerView, me: PlayerId, gain: number, payer: PlayerId | null): number {
  const after = view.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    score: p.score + (p.id === me ? gain : p.id === payer ? -gain : 0),
  }));
  after.sort((a, b) => b.score - a.score || a.seat - b.seat);
  return after.findIndex((p) => p.id === me) + 1 || 1;
}
