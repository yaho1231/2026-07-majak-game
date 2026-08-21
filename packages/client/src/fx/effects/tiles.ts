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
 * 그래서 이 파일의 연출은 대부분 **전달(essential)** 이다 — 다만 끝 상태를 만드는 것은
 * **React 이지 이 연출이 아니다.** 패는 이미 제자리에 그려져 있고, 여기서 하는 일은
 * "어디서 왔는지"를 눈에 보여 주는 것뿐이다. 그래서 설정을 끄면 **그냥 안 그린다** —
 * 그것이 곧 "즉시 도착"이고, 정보는 하나도 잃지 않는다.
 * (예외: `throwTile` 은 끝날 때 상태를 바꾸는 호출부가 있어 `onComplete` 를 반드시 부른다.)
 *
 * ⚠ 매 순 일어나는 것(뽑기·버리기)은 `DUR.tick`~`DUR.tile`(0.12~0.26초) 안에서 끝낸다.
 *    한 국에 70순이 넘게 돈다 — 여기서 0.1초를 더 쓰면 한 국이 7초 길어진다.
 */
import { gsap, Flip } from "../setup";
import { DUR, EASE, STAGGER } from "../motion";
import { alive, canDecorate, spawnFx } from "../core";
import { fxEnabled } from "../settings";
import { deltaTo, arcPath } from "../coords";

/**
 * 방금 뽑은 패 — 패산에서 손으로 들어온다.
 *
 * 패산 요소를 못 찾으면 **위에서 살짝 내려앉는 것으로 대신한다.** 궤적이 없다고 연출을
 * 통째로 거르면, 레이아웃이 바뀔 때마다 조용히 사라지는 연출이 된다.
 */
export function drawTile(tile: Element | null, wall?: Element | null): void {
  if (!alive(tile)) return;
  // 연출을 껐으면 움직이지 않는다. 패는 이미 손에 있으므로 정보는 그대로다.
  if (!fxEnabled()) return;
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
  /*
   * 고스트는 **순수 장식**이다 — 실제 패의 이동은 React 가 한다(바닥에 이미 그려진다).
   * 그래서 끄면 아예 만들지 않는다. 정보는 하나도 잃지 않는다.
   */
  if (!canDecorate()) return;
  const ghost = from.cloneNode(true) as HTMLElement;
  const r = from.getBoundingClientRect();
  ghost.setAttribute("aria-hidden", "true");
  /*
   * ⚠ 고스트는 **from 의 부모 옆에** 붙인다 — `document.body` 가 아니다.
   *
   * body 에는 `--ui-scale` 이 걸린다(`uiScale.ts`). 변형된 조상 아래의
   * `position: fixed` 는 그 조상이 컨테이닝 블록이 되므로, 화면 좌표로 넣은 `left/top`
   * 이 배율로 한 번 더 곱해진다 — 오차가 8.5px 급이 아니라 수백 px 이다.
   *
   * 그래서 ① 같은 좌표계 안(원본의 부모)에 붙이고 ② 이동은 `left/top` 이 아니라
   * `deltaTo` 로 구한 **transform** 으로 한다. `coords.ts` 가 "판을 가로지르는 이동은
   * 전부 이 파일을 지난다"고 적어 둔 규칙을 이 파일이 어기고 있었다.
   */
  ghost.style.cssText += `position:absolute; left:${from instanceof HTMLElement ? from.offsetLeft : 0}px;
    top:${from instanceof HTMLElement ? from.offsetTop : 0}px; width:${r.width}px; height:${r.height}px;
    margin:0; pointer-events:none; z-index:40;`;
  const host = from.parentElement ?? document.body;
  const kill = spawnFx(host, ghost, 3000);
  const d = deltaTo(ghost, to);
  gsap
    .timeline({ onComplete: kill })
    .to(ghost, { x: d.x, y: d.y, duration: DUR.tile, ease: EASE.soft })
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
  // 끝 상태(멜드 자리에 패가 있다)는 React 가 이미 만들었다 — 움직임만 뺀다.
  if (!fxEnabled()) return;
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
 * ── ⚠ 뒤처리가 이 함수의 절반이다 ──
 *
 * Flip 은 애니메이션 동안 요소에 `width`/`height`/`min-*`/`max-*` 를 **px 로 박는다**
 * (크기가 함께 변하는 일반적인 경우를 처리하기 위해서다). 정상 종료하면 지우지만,
 * **끝나기 전에 다음 Flip 이 시작되면 그 값이 남는다.** 손패는 타패마다 재배치가
 * 일어나므로 이 겹침이 늘 생긴다.
 *
 * 실제로 그렇게 됐다: 게임에서 두어 번 버린 뒤 손패 열세 장 전부에
 * `width: 65.3px; min-width: 65.3px; max-width: 65.3px` 가 박혀 남았다. 우리 패 크기는
 * 컨테이너 쿼리와 UI 배율에서 나오므로, 이게 박히면 **창을 줄이거나 배율을 바꿔도 패가
 * 옛 크기 그대로 있는다.** 조용히 레이아웃이 깨지는 종류의 버그다.
 *
 * 그래서 ① 새 Flip 을 걸기 전에 이전 것을 죽이고 ② 끝나든 끊기든 박힌 값을 지운다.
 */
const PINNED = "width,height,minWidth,minHeight,maxWidth,maxHeight";

/**
 * 지금 돌고 있는 손패 Flip — 겹치면 앞의 것을 죽인다.
 *
 * 손패 단위로 잡는다(모듈 전역 변수 하나가 아니라). 지금은 손패가 화면에 하나뿐이지만
 * (관전도 시점 하나만 그린다), 전역 변수로 두면 손패가 둘이 되는 날 A 의 완료 콜백이
 * B 의 타임라인을 놓아 버려 B 를 죽일 수 없게 된다. `WeakMap` 이라 손패 노드가 사라지면
 * 항목도 함께 사라진다.
 */
const handFlips = new WeakMap<Element, gsap.core.Timeline>();

function clearPinned(hand: Element): void {
  gsap.set(hand.children, { clearProps: PINNED });
}

/** 대국을 나갈 때 등 — 손패가 사라지기 전에 돌고 있는 Flip 을 정리한다 */
export function killHandFlip(hand: Element | null): void {
  if (hand === null) return;
  const tl = handFlips.get(hand);
  if (tl === undefined) return;
  tl.kill();
  handFlips.delete(hand);
}

function runHandFlip(hand: Element, state: Flip.FlipState): void {
  const running = handFlips.get(hand);
  if (running !== undefined) {
    running.kill();
    clearPinned(hand);
  }
  /*
   * **설정을 여기서 본다.**
   *
   * 호출부가 아니라 이 안에서 검사하는 것이 `fx/` 모듈의 취지다 — 새 호출부가
   * 생길 때마다 검사를 다시 적게 하면 반드시 하나는 빠진다.
   *
   * FLIP 은 "정보를 나르는" 연출이지만(어느 패가 어디로 갔는가), **끝 상태는 이미
   * DOM 에 있다.** 그래서 그냥 안 그리면 그것이 곧 "즉시 도착"이다 — 정보를 잃지 않고
   * 움직임만 없앤다. 전정기관 문제로 움직임 자체가 증상인 사람에게는 이쪽이 맞다.
   */
  if (!fxEnabled()) {
    clearPinned(hand);
    handFlips.delete(hand);
    return;
  }
  const done = (): void => {
    clearPinned(hand);
    handFlips.delete(hand);
  };
  const tl = Flip.from(state, {
    duration: DUR.layout,
    ease: EASE.move,
    // 총량으로 잡는다 — 13장에 낱개 간격을 주면 정렬 한 번에 0.6초를 기다린다.
    stagger: { amount: STAGGER.handTotal, from: "center" },
    // 위치가 안 바뀐 패는 건드리지 않는다. 안 그러면 정렬할 때마다 열세 장 전부가
    // 미세하게 떨려서 화면이 부산해진다.
    prune: true,
    /*
     * **크기는 절대 건드리지 않는다.**
     *
     * 손패 재배치에서 패 크기는 변하지 않는다 — 자리만 바뀐다. 그런데 Flip 은 기본적으로
     * 크기 변화를 `width`/`height` 로 처리하려고 요소에 px 를 박는데, 우리 패 크기는
     * 컨테이너 쿼리와 UI 배율에서 나오므로 그게 박히는 순간 반응형이 죽는다.
     * `scale: true` 는 크기 차이를 `scaleX/Y` 로 다루므로 **width 를 아예 안 만진다**
     * (그리고 어차피 크기가 같으니 배율은 1이 되어 아무 일도 안 일어난다).
     */
    scale: true,
    // 회전·기울임 계산도 건너뛴다. 손패는 평면 위에서 옆으로만 움직인다.
    simple: true,
    onComplete: done,
    onInterrupt: done,
  });
  handFlips.set(hand, tl);
}

/**
 * @param mutate DOM 순서를 실제로 바꾸는 함수.
 */
export function reflowHand(hand: Element | null, mutate: () => void): void {
  if (!alive(hand)) {
    mutate();
    return;
  }
  const state = Flip.getState(hand.children);
  mutate();
  runHandFlip(hand, state);
}

/**
 * React 가 이미 렌더한 뒤에 FLIP 을 걸어야 할 때 쓰는 두 조각.
 *
 * `Flip.getState` 는 React 가 렌더하기 **전에** 불려야 하는데, 훅 안에서는 그 순간을
 * 잡기가 번거롭다. 렌더 단계에서 `captureHand` 를 부르고 `useLayoutEffect` 에서
 * `playHand` 를 부르면 된다.
 */
export function captureHand(hand: Element | null): Flip.FlipState | null {
  return alive(hand) ? Flip.getState(hand.children) : null;
}

/** 캡처해 둔 상태로 재생한다 (`captureHand` 와 짝) */
export function playHand(state: Flip.FlipState | null, hand: Element | null): void {
  if (state === null || !alive(hand)) return;
  runHandFlip(hand, state);
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
  /*
   * 끄면 **즉시 도착**한다 — `onComplete` 는 반드시 부른다.
   * 이 연출은 끝날 때 상태를 바꾸는 호출부가 있으므로(전달형), 안 부르면 게임이 멈춘다.
   */
  if (!fxEnabled()) {
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
