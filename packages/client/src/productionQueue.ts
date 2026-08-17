/**
 * 연출 큐의 순서·체류 규칙 — 배너와 컷인이 **언제** 뜨는가.
 *
 * 연출은 한 번에 하나씩만 재생한다(겹치면 아무것도 안 읽힌다). 그래서 큐는 늘 벽이
 * 될 위험을 안고 있다 — 한 순에 증강 컷인 다섯이 터지면 2초 × 5 = 10초짜리 줄이 서고,
 * 그 뒤에 들어온 **리치 배너가 10초 뒤에** 뜬다. 실제로는 상대가 리치를 건 지 한참
 * 지나 내가 버릴 패를 고르고 있을 때, 심하면 론 직전에 떴다(2026-08-17 사용자 보고).
 * 리치는 "알고 나서 버려야 하는" 유일한 통지라 지연이 곧 오판이 된다.
 *
 * 두 가지로 나눠 푼다.
 *  ① **등급**(`priority`) — 리치 알림은 증강 컷인 줄을 앞질러 나간다.
 *  ② **압축**(`backlogProdTtl`) — 밀린 개수만큼 체류를 줄여 줄 자체를 빨리 흘려보낸다.
 *
 * ⚠ 순서가 바뀌어도 **기록은 안 바뀐다** — 📜 로그는 재생 시점이 아니라 큐에 넣는
 * 시점에 쌓이므로(App의 `enqueueProduction`) 실제로 일어난 순서 그대로 남는다.
 *
 * App.tsx가 아니라 별도 모듈인 이유: 이 패키지 테스트에는 jsdom이 없어서 컴포넌트
 * 안의 로직은 소스 스캔으로밖에 못 지킨다. 순수 함수로 빼 두면 그냥 돌려 볼 수 있다.
 */

/** 큐에 서는 것 중 순서 계산에 필요한 부분만 (App의 `Production`이 이 모양을 만족한다) */
export interface Queued {
  /** 클수록 먼저 재생된다. 없으면 0 */
  priority?: number;
}

/**
 * 리치 알림의 등급.
 *
 * 2를 쓰는 이유는 특별하지 않다 — 기본(0)보다 위이기만 하면 되고, 나중에 그 사이에
 * 한 단계를 끼울 자리를 남겨 둔 것이다.
 */
export const PROD_PRIORITY_RIICHI = 2;

/** 아무리 줄여도 글자를 읽을 시간은 남긴다 (읽기 전에 사라지면 정보가 통째로 날아간다) */
export const PROD_TTL_FLOOR_MS = 520;

/**
 * **뒤에 밀려 있는 연출 수만큼 체류를 줄인다.**
 *
 * 앞질러 나가는 것만으로는 부족하다 — 리치를 먼저 보여 준 뒤에도 남은 줄이 판을 계속
 * 덮기 때문이다. 큐가 한가하면(0~1개) 아무것도 손대지 않으므로 평소 연출 길이는 그대로다.
 *
 * @param backlog 이 연출을 꺼낸 **뒤** 큐에 남아 있는 개수
 */
export function backlogProdTtl(ttl: number, backlog: number): number {
  const scale = backlog >= 4 ? 0.45 : backlog >= 2 ? 0.7 : 1;
  if (scale === 1) return ttl;
  return Math.max(PROD_TTL_FLOOR_MS, Math.round(ttl * scale));
}

/**
 * 등급 순서를 지키며 큐에 끼워 넣는다 (큐를 **제자리에서** 고친다).
 *
 * 자기보다 등급이 낮은 대기열은 앞질러 들어가고, **같은 등급 뒤에는 그대로 붙는다** —
 * 그래서 등급 안에서는 넣은 순서가 유지되고, 짝지어 넣은 연출(등 떠밀기 → 리치)이
 * 갈리지 않는다.
 */
export function insertByPriority<T extends Queued>(queue: T[], item: T): void {
  const prio = item.priority ?? 0;
  let at = queue.length;
  while (at > 0 && (queue[at - 1]?.priority ?? 0) < prio) at--;
  queue.splice(at, 0, item);
}
