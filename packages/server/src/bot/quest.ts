/**
 * quest — **내가 든 증강이 버림에 거는 규율.**
 *
 * ## 무엇이 비어 있었나
 *
 * 편식(picky_eater)은 "한 무늬(+자패)만 골라 12장을 버리면 손이 물든다"는 **퀘스트형**
 * 증강이다. 그런데 봇의 정책은 `pick`(무엇을 고를까)만 말할 수 있고 `pick`은 퀘스트가
 * **이미 달성된 뒤**에나 부를 것이 생긴다 — 즉 봇은 12장을 채우는 일을 아무도 안 했고,
 * 우연히 채워지기를 기다렸다. 12장 내내 한 무늬만 버리는 일이 우연히 일어날 리 없으니
 * 봇은 이 증강을 **한 번도 쓰지 않았다**(2026-08-19 사용자 보고).
 *
 * 발동 정책(content)으로는 고칠 수 없는 종류의 구멍이다. 퀘스트는 발동 순간이 아니라
 * **국의 절반에 걸친 버림 선택 전체**에 걸려 있고, 그 선택은 서버 봇의 EV 계산 안에 있다.
 *
 * ## 무엇을 하는가
 *
 * 버림 EV에 항 하나를 더한다 — "이 패를 지금 버리면 퀘스트가 어떻게 되는가".
 *
 *   - 잠긴 무늬·자패를 버린다 → 진행 +1. 작은 웃돈.
 *   - **다른 수패를 버린다** → 그 국의 퀘스트가 즉시 깨진다. 남은 청일색 값어치를 잃는다.
 *
 * 값은 전부 **손 값어치에 비례**한다(`directionGain`과 같은 규율) — 싸구려 손에서는
 * 퀘스트에 덜 집착하고 비싼 손에서는 더 집착한다.
 *
 * ## 스스로 멈추는 성질
 *
 * 손패에 잠긴 무늬도 자패도 없으면 후보가 전부 같은 벌점을 받아 **서로 상쇄된다** —
 * 그럴 때는 종전과 똑같이 순수 EV가 고른다. 못 채울 국(패산이 모자란 국)도 아래에서
 * 미리 접는다. 즉 이 항이 손을 망치는 방향으로 작동할 수 있는 자리는 없다.
 */

import type { PlayerId, PlayerView, TileKind } from "@majak/core";

/** 편식 진행도 공개 채널의 값 (`picky_eater.ts`의 publish와 같은 모양) */
interface PickyProgress {
  suit: string | null;
  count: number;
  need: number;
  failed: boolean;
}

const NUMBER_SUITS: ReadonlySet<string> = new Set(["man", "pin", "sou"]);

/** 이 패를 버리는 것이 퀘스트에 미치는 값 (점수 단위, 0이면 규율 없음) */
export type QuestGain = (kind: TileKind) => number;

/** 규율이 없는 국 — 봇의 계산은 종전과 완전히 같다 */
export const NO_QUEST: QuestGain = () => 0;

/**
 * 남은 자기 순 어림수. 패산 4장에 자기 쯔모 한 번이다(+ 지금 이 순).
 * 12장을 채울 수 없는 국이면 규율을 걸 이유가 없다.
 */
const turnsLeft = (wallLeft: number): number => Math.floor(wallLeft / 4) + 1;

/**
 * 내가 든 증강이 지금 버림에 거는 규율을 읽는다.
 *
 * @param handPoints 지금 손의 값어치 — 벌점·웃돈의 눈금
 */
export function readDiscardQuest(
  view: PlayerView,
  me: PlayerId,
  wallLeft: number,
  handPoints: number,
): QuestGain {
  const raw = view.augmentView[`picky_eater:progress:${me}`];
  if (raw === null || typeof raw !== "object") return NO_QUEST;
  const p = raw as Partial<PickyProgress>;
  const need = typeof p.need === "number" ? p.need : 12;
  const count = typeof p.count === "number" ? p.count : 0;
  const suit = typeof p.suit === "string" ? p.suit : null;

  // 이미 깨졌거나(그 국은 끝), 이미 채웠거나(발동만 남았다), 무늬가 아직 안 잠겼으면
  // 규율이 없다. 무늬를 잠그는 첫 한 장은 순수 EV에 맡긴다 — 가장 버리고 싶은 무늬가
  // 곧 가장 오래 버릴 수 있는 무늬다.
  if (p.failed === true || count >= need || suit === null) return NO_QUEST;
  // 남은 순이 모자라 어차피 못 채운다 — 여기서 접지 않으면 손만 비틀린다
  if (count + turnsLeft(wallLeft) < need) return NO_QUEST;

  const progress = count / need;
  /**
   * 퀘스트를 깨는 값 = **앞으로 받을 청일색 손을 포기하는 값**.
   * 여기까지 온 몫(progress)이 클수록 아깝다. 계수는 방향 손해(`directionGain`의
   * 청일색 0.22)보다 크게 잡는다 — 이건 한 장의 방향이 아니라 국 전체의 계획이다.
   */
  const breakCost = handPoints * (0.3 + 0.5 * progress);
  /** 한 걸음 나아가는 웃돈 — 엇비슷한 후보들 사이에서 진행 쪽으로 기울이는 크기 */
  const stepGain = handPoints * 0.05;

  return (kind) => {
    if (!NUMBER_SUITS.has(kind.suit)) return stepGain; // 자패는 언제 버려도 안 깨진다
    return kind.suit === suit ? stepGain : -breakCost;
  };
}
