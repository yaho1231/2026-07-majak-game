/**
 * 좌표 — **조상 transform 을 가로질러** 두 요소를 잇는다.
 *
 * ── 이 파일이 있는 이유 ──
 *
 * `uiScale.ts` 가 앱 루트에 `transform: scale()` 을 건다. 그래서 이 앱에는 좌표계가 두 벌
 * 있다 — `getBoundingClientRect()` 가 주는 **화면 좌표**와, 인라인 `transform` 이 쓰는
 * **레이아웃 좌표**. 여기에 판 위 요소들이 각자 또 transform 을 갖는다(흔들림·기울임·
 * 좌석 회전). 배율만 나누는 계산은 그 중첩을 모른다.
 *
 * 얼마나 틀리는가를 실제로 쟀다: **8.53px**(패 폭 52px 의 16%). 패를 다른 자리에 얹는
 * 연출에서 이 정도면 눈에 보인다. GSAP 의 `MotionPathPlugin` 헬퍼로 재면 0.0006px 였다
 * (38_ANIMATION_LIBS §10-9 ①).
 *
 * **그래서 판을 가로지르는 이동은 전부 이 파일을 지난다.** 직접 `getBoundingClientRect()`
 * 로 빼서 쓰지 않는다 — 그 순간 8.5px 이 돌아온다.
 */
import { MotionPathPlugin } from "./setup";

/**
 * `from` 을 `to` 위로 정확히 옮기려면 얼마나 움직여야 하는가 (from 의 로컬 좌표계 기준).
 *
 * 두 요소가 서로 다른 transform 문맥에 있어도 맞는다 — 그것이 이 함수를 쓰는 유일한 이유다.
 *
 * @param fromOrigin from 의 어느 점을 기준으로 잡을지 (`[0.5, 0.5]` = 중심)
 * @param toOrigin   to 의 어느 점에 맞출지
 */
export function deltaTo(
  from: Element,
  to: Element,
  fromOrigin: [number, number] = [0.5, 0.5],
  toOrigin: [number, number] = [0.5, 0.5],
): { x: number; y: number } {
  return MotionPathPlugin.getRelativePosition(from, to, fromOrigin, toOrigin);
}

/**
 * 두 요소 사이를 **호(弧)를 그리며** 잇는 경로.
 *
 * 점수봉이 지불자에게서 수령자에게 갈 때처럼, 직선으로 가면 "미끄러졌다"로 보이고 호를
 * 그리면 "던졌다"로 보인다. 판을 가로지르는 긴 이동에만 쓴다 — 짧은 이동에 호를 주면
 * 그냥 흔들린 것처럼 보인다.
 *
 * @param lift 호의 높이 (이동 거리 대비 비율). 0.18 정도가 자연스럽다.
 */
export function arcPath(
  from: Element,
  to: Element,
  lift = 0.18,
): { x: number; y: number }[] {
  const d = deltaTo(from, to);
  const len = Math.hypot(d.x, d.y);
  // 중간점을 이동 방향의 **수직으로** 들어 올린다. 항상 위로 들면 아래로 가는 이동에서
  // 궤적이 꺾여 보인다.
  const nx = len === 0 ? 0 : -d.y / len;
  const ny = len === 0 ? 0 : d.x / len;
  const h = len * lift * (d.x >= 0 ? 1 : -1);
  return [
    { x: 0, y: 0 },
    { x: d.x / 2 + nx * h, y: d.y / 2 + ny * h },
    { x: d.x, y: d.y },
  ];
}
