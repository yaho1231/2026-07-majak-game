/**
 * 손패 재배치 판정 — **순수 함수만.** GSAP 도 DOM 도 import 하지 않는다.
 *
 * 왜 파일을 나누나: `effects/tiles.ts` 는 `setup.ts`(플러그인 등록)를 끌고 오는데, 그
 * 등록은 브라우저 밖에서 실패한다. 그래서 그 파일 안에 있으면 이 판정을 **단위 테스트로
 * 돌릴 수가 없다** — 실제로 테스트를 붙이려다 `CustomWiggle.create` 가 Node 에서
 * 터지는 것을 보고 나눴다.
 *
 * `productionQueue.ts` 가 같은 이유로 App.tsx 에서 빠져나온 것과 같은 판단이다
 * (이 패키지 테스트에는 jsdom 이 없다).
 */

/**
 * **이번 변화가 FLIP 을 걸어도 되는 종류인가.**
 *
 * FLIP 은 "같은 것들이 자리를 바꿨다"를 그리는 기법이다. 패가 들어오거나 나가는 변화에
 * 걸면 Flip 이 사라진 요소의 상태를 남은 요소에 뒤집어씌운다 — 실제로 그렇게 해서
 * 손패 열세 장이 전부 `width: 2px` 가 됐다.
 *
 * 그래서 **집합이 완전히 같고 순서만 다를 때만** true 다. 뽑기·버리기·후로는 각자 전용
 * 연출이 있으므로 이쪽에 기댈 필요가 없다.
 *
 * 장수만 보지 않고 **내용까지** 보는 것이 중요하다 — 패 id 는 국마다 재사용되므로
 * (0~135), 장수만 맞으면 옛 국에서 잡은 상태를 새 국에 재생하게 된다.
 *
 * ⚠ 입력을 건드리지 않는다. 여기서 원본을 정렬하면 손패 순서가 통째로 망가진다.
 */
export function isPureReorder(prev: readonly number[], next: readonly number[]): boolean {
  if (prev.length !== next.length || prev.length === 0) return false;
  const a = [...prev].sort((x, y) => x - y);
  const b = [...next].sort((x, y) => x - y);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  // 순서까지 같으면 움직일 것이 없다
  return prev.some((v, i) => v !== next[i]);
}
