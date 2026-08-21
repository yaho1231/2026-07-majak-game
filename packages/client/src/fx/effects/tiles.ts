/**
 * 패가 움직이는 연출 — 뽑기·버리기·후로·정렬.
 *
 * ── 이 파일이 게임의 인상을 가장 크게 바꾼다 ──
 *
 * 지금은 패가 **사라졌다 나타난다.** 후로하면 손패에서 없어지고 오른쪽에 생긴다. 정렬을
 * 켜면 열세 장이 순간이동한다. 기능은 맞지만, 무엇이 어디로 갔는지 눈이 못 따라간다.
 * "AI가 만든 사이트 같다"는 인상의 상당 부분이 여기서 온다 — 상태는 정확한데 **상태가
 * 바뀌는 과정이 없다.**
 *
 * 그래서 이 파일의 연출은 대부분 **전달(essential)** 이다. 설정을 꺼도 끝 상태까지는 간다.
 *
 * ⚠ 매 순 일어나는 것(뽑기·버리기)은 `DUR.tick`~`DUR.tile`(0.12~0.26초) 안에서 끝낸다.
 *    한 국에 70순이 넘게 돈다 — 여기서 0.1초를 더 쓰면 한 국이 7초 길어진다.
 */
import { gsap, Flip } from "../setup";
import { DUR, EASE, STAGGER } from "../motion";
import { alive, canDecorate, spawnFx } from "../core";
import { deltaTo, arcPath } from "../coords";

/**
 * 방금 뽑은 패 — 패산에서 손으로 들어온다.
 *
 * 패산 요소를 못 찾으면 **위에서 살짝 내려앉는 것으로 대신한다.** 궤적이 없다고 연출을
 * 통째로 거르면, 레이아웃이 바뀔 때마다 조용히 사라지는 연출이 된다.
 */
export function drawTile(tile: Element | null, wall?: Element | null): void {
  if (!alive(tile)) return;
  if (alive(wall)) {
    const d = deltaTo(tile, wall);
    gsap.fromTo(
      tile,
      { x: d.x, y: d.y, opacity: 0.6, scale: 0.92 },
      { x: 0, y: 0, opacity: 1, scale: 1, duration: DUR.tile, ease: EASE.soft, clearProps: "all" },
    );
    return;
  }
  gsap.fromTo(
    tile,
    { y: -14, opacity: 0 },
    { y: 0, opacity: 1, duration: DUR.tick, ease: EASE.soft, clearProps: "all" },
  );
}

/**
 * 버린 패 — 손에서 바닥으로 간 뒤 **눌렸다 펴진다.**
 *
 * 착지에 스쿼시를 남기는 이유는 24_FX_LAB 이 적어 둔 그대로다: 물체가 안 튀면 무게가
 * 없어 보인다. 다만 UI가 아니라 **패**에만 준다.
 *
 * 실제 DOM 이동은 React 가 한다 — 이 함수는 `ghost`(손패 자리의 사본)를 바닥까지
 * 날려 보내고 지운다. 그래야 React 의 렌더 타이밍과 싸우지 않는다.
 */
export function discardTile(from: Element | null, to: Element | null): void {
  if (!alive(from) || !alive(to)) return;
  const ghost = from.cloneNode(true) as HTMLElement;
  const r = from.getBoundingClientRect();
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText += `position:fixed; left:${r.left}px; top:${r.top}px;
    width:${r.width}px; height:${r.height}px; margin:0; pointer-events:none; z-index:40;`;
  const kill = spawnFx(document.body, ghost, 3000);
  const target = to.getBoundingClientRect();
  gsap
    .timeline({ onComplete: kill })
    .to(ghost, {
      left: target.left + (target.width - r.width) / 2,
      top: target.top + (target.height - r.height) / 2,
      duration: DUR.tile,
      ease: EASE.soft,
    })
    .to(ghost, { scaleY: 0.88, scaleX: 1.06, duration: 0.06, ease: "power2.out" }, ">-0.04")
    .to(ghost, { scaleY: 1, scaleX: 1, duration: 0.12, ease: EASE.land });
}

/**
 * 후로 — 손패에서 빠져나온 패가 멜드 자리에 가서 앉는다.
 *
 * **이건 정보다.** 어느 패가 나갔는지 보이지 않으면, 상대가 무엇을 울었는지 매번
 * 손패를 다시 세어 확인해야 한다.
 */
export function meldTiles(tiles: (Element | null)[], slot: Element | null): void {
  const live = tiles.filter(alive);
  if (live.length === 0 || !alive(slot)) return;
  live.forEach((t, i) => {
    const d = deltaTo(t, slot);
    gsap.fromTo(
      t,
      { x: -d.x, y: -d.y, scale: 0.94, opacity: 0.7 },
      {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        duration: DUR.tile,
        ease: EASE.soft,
        delay: i * STAGGER.few,
        clearProps: "all",
      },
    );
  });
}

/**
 * 손패 재배치 — 자동정렬 토글·수동 재정렬·패가 빠진 뒤.
 *
 * FLIP 이다: 바꾸기 **전에** 위치를 재고, DOM 을 바꾼 뒤, 원래 있던 자리에서 새 자리로
 * 미끄러뜨린다. 조상에 `transform`(UI 배율)이 걸려 있어도 맞는다 — 그것이 GSAP `Flip`
 * 을 쓰는 이유다(38 §10-9 ②).
 *
 * @param mutate DOM 순서를 실제로 바꾸는 함수. 이 안에서 React 가 렌더해도 된다.
 */
export function reflowHand(hand: Element | null, mutate: () => void): void {
  if (!alive(hand)) {
    mutate();
    return;
  }
  const state = Flip.getState(hand.children);
  mutate();
  Flip.from(state, {
    duration: DUR.layout,
    ease: EASE.move,
    // 총량으로 잡는다 — 13장에 낱개 간격을 주면 정렬 한 번에 0.6초를 기다린다.
    stagger: { amount: STAGGER.handTotal, from: "center" },
    // 위치가 안 바뀐 패는 건드리지 않는다. 안 그러면 정렬할 때마다 열세 장 전부가
    // 미세하게 떨려서 화면이 부산해진다.
    prune: true,
  });
}

/**
 * React 가 이미 렌더한 뒤에 FLIP 을 걸어야 할 때 쓰는 두 조각.
 *
 * `Flip.getState` 는 React 가 렌더하기 **전에** 불려야 하는데, 훅 안에서는 그 순간을
 * 잡기가 번거롭다. 렌더 직전에 `captureHand` 를 부르고 `useLayoutEffect` 에서
 * `playHand` 를 부르면 된다.
 */
export function captureHand(hand: Element | null): Flip.FlipState | null {
  return alive(hand) ? Flip.getState(hand.children) : null;
}

export function playHand(state: Flip.FlipState | null): void {
  if (state === null) return;
  Flip.from(state, {
    duration: DUR.layout,
    ease: EASE.move,
    stagger: { amount: STAGGER.handTotal, from: "center" },
    prune: true,
  });
}

/**
 * 패 한 장을 다른 자리로 **던진다** — 호를 그린다.
 *
 * 판을 가로지르는 긴 이동(등가교환·통째로 바꾸기·점수봉)에 쓴다. 짧은 이동에 호를 주면
 * 그냥 흔들린 것처럼 보이므로, 거리가 짧으면 직선으로 떨어뜨린다.
 */
export function throwTile(
  el: Element | null,
  target: Element | null,
  opts: { duration?: number; onComplete?: () => void } = {},
): void {
  if (!alive(el) || !alive(target)) {
    opts.onComplete?.();
    return;
  }
  const d = deltaTo(el, target);
  const far = Math.hypot(d.x, d.y) > 160;
  gsap.to(el, {
    ...(far && canDecorate()
      ? { motionPath: { path: arcPath(el, target), curviness: 1.2 } }
      : { x: `+=${d.x}`, y: `+=${d.y}` }),
    duration: opts.duration ?? DUR.beat,
    ease: EASE.move,
    ...(opts.onComplete !== undefined ? { onComplete: opts.onComplete } : {}),
  });
}
