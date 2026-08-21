/**
 * 연출 큐가 화면에 그리는 것 — 컷인 · 배너 · 리치 무대.
 *
 * ── 왜 여기서는 GSAP 으로 **다시 만들지 않는가** ──
 *
 * 컷인·배너는 `styles.css` 에 규칙 수십 개로 이미 잘 만들어져 있다(밴드·섬광·파문·
 * 파티클·톤별 색). 잘 도는 89개 키프레임을 옮기지 않는다는 규칙(38 §9-1)이 여기에
 * 그대로 적용된다 — 옮겨서 나아지는 것이 없고, 톤 열몇 개의 미묘한 차이를 다시
 * 맞추다 반드시 무언가를 잃는다.
 *
 * 대신 **CSS 가 못 하던 것만** 얹는다:
 *  ① 재생 속도(`applyProdSpeed`) — CSS `animation-duration` 은 나중에 배수로 못 곱한다.
 *  ② 큰 사건의 임팩트 순간에 판을 흔든다(`shakeBoard`) — 이건 이미 배선돼 있다.
 *
 * 이 파일은 그 둘을 **점검 페이지에서도 똑같이** 재생할 수 있게 묶어 둔 것이다.
 * 게임과 점검 페이지가 같은 함수를 쓰지 않으면, 점검에서 내린 판단이 게임으로
 * 옮겨가지 않는다.
 */
import { applyProdSpeed } from "../prodSpeed";
import { fxSpeed } from "../settings";
import { spawnFx } from "../core";


/**
 * 붙인 직후에 재생 속도를 건다 — **세 번 시도한다.**
 *
 * `getAnimations()` 는 스타일이 계산된 뒤에야 애니메이션을 돌려준다. 그래서
 *  ① 강제 리플로(`offsetWidth`)로 스타일을 계산시키고 바로 한 번,
 *  ② 다음 프레임에 한 번(첫 페인트 뒤 생기는 것들),
 *  ③ 그래도 안 되면 짧은 타이머로 한 번.
 *
 * ③ 이 필요한 이유: **배경 탭에서는 rAF 가 오지 않는다.** 게임의 연출 큐도 같은
 * 이유로 rAF 에 타이머 폴백을 붙여 두었다(`PROD_PAINT_FALLBACK_MS`). 여기만
 * rAF 를 믿으면, 탭을 두고 온 사이 지나간 연출은 속도가 안 걸린다.
 */
function speedUpSoon(el: HTMLElement, speed: number): void {
  if (speed === 1) return;
  void el.offsetWidth; // 스타일 계산을 강제해 애니메이션 객체가 생기게 한다
  applyProdSpeed(el, speed);
  requestAnimationFrame(() => applyProdSpeed(el, speed));
  window.setTimeout(() => applyProdSpeed(el, speed), 60);
}

/** 컷인 톤 — `styles.css` 의 `.cutin-<톤>` 과 짝이다 */
export type ProdTone =
  | "ron"
  | "tsumo"
  | "riichi"
  | "yakuman"
  | "augment"
  | "kan"
  | "pon"
  | "chi"
  | "draw"
  | "spy";

export interface CutInSpec {
  tone: ProdTone;
  text: string;
  sub?: string;
  /** 증강 컷인 — 대각 섬광·스캔라인이 붙는다 */
  aug?: boolean;
  /** 후로 계열 — 짧고 가벼운 밴드 */
  call?: boolean;
  /** 화면에 머무는 시간(ms). 실제 게임에서는 연출 큐가 정한다 */
  ttl?: number;
}

/** 게임과 같은 마크업을 만든다 — 클래스 이름이 곧 계약이다 */
function buildCutIn(spec: CutInSpec, decorate: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className =
    `cutin cutin-${spec.tone}` + (spec.call === true ? " cutin-call" : "") +
    (spec.aug === true ? " cutin-aug" : "");
  el.style.setProperty("--prod-ttl", `${spec.ttl ?? 1600}ms`);
  const parts: string[] = [];
  if (decorate && spec.aug === true) {
    parts.push('<div class="cutin-bolt"></div><div class="cutin-bolt cutin-bolt-2"></div><div class="cutin-scan"></div>');
  }
  if (decorate && (spec.tone === "yakuman" || spec.tone === "ron")) {
    parts.push('<div class="cutin-rays"></div><div class="cutin-ring"></div>');
  }
  if (decorate && spec.tone === "yakuman") parts.push('<div class="cutin-ring cutin-ring-2"></div>');
  parts.push('<div class="cutin-band"></div>');
  parts.push(
    `<div class="cutin-body"><span class="cutin-text"${
      spec.text.replace(/\s/g, "").length >= 4 ? ' data-long="1"' : ""
    }>${spec.text}</span>${
      spec.sub !== undefined ? `<span class="cutin-sub">${spec.sub}</span>` : ""
    }</div>`,
  );
  if (decorate && spec.tone === "yakuman") parts.push('<div class="cutin-flash"></div>');
  el.innerHTML = parts.join("");
  return el;
}

/**
 * 컷인 한 번 재생 (점검 페이지용).
 *
 * 게임에서는 React 가 같은 마크업을 그리고 연출 큐가 수명을 관리한다. 여기서는
 * 그 두 가지를 흉내 내되, **속도 적용만은 게임과 같은 함수**(`applyProdSpeed`)를 쓴다.
 */
export function playCutIn(host: Element, spec: CutInSpec, decorate = true): HTMLElement {
  const el = buildCutIn(spec, decorate);
  const ttl = spec.ttl ?? 1600;
  // 체류 시간도 속도 배수를 받는다 — 게임의 `effectiveProdTtl` 과 같은 방향.
  spawnFx(host, el, Math.max(400, ttl * fxSpeed()) + 400);
  speedUpSoon(el, fxSpeed());
  return el;
}

/** 배너 — 컷인보다 가볍고 판을 덜 가린다 */
export function playBanner(
  host: Element,
  tone: ProdTone,
  text: string,
  sub?: string,
  ttl = 1300,
): HTMLElement {
  const el = document.createElement("div");
  el.className = `banner banner-${tone}`;
  el.style.setProperty("--prod-ttl", `${ttl}ms`);
  el.innerHTML =
    `<span class="banner-text">${text}</span>` +
    (sub !== undefined ? `<span class="banner-sub">${sub}</span>` : "");
  spawnFx(host, el, Math.max(400, ttl * fxSpeed()) + 400);
  speedUpSoon(el, fxSpeed());
  return el;
}

/** 리치 전용 무대 — 비네트 암전 + 붉은 밴드 + 천점봉 */
export function playRiichiStage(host: Element, who: string, ttl = 1700): HTMLElement {
  const el = document.createElement("div");
  el.className = "riichi-stage";
  el.style.setProperty("--prod-ttl", `${ttl}ms`);
  el.innerHTML = `
    <div class="riichi-vignette"></div>
    <div class="riichi-band">
      <div class="riichi-stick"><i class="riichi-stick-dot"></i></div>
      <div class="riichi-body">
        <span class="riichi-text">리치</span>
        <span class="riichi-sub">${who}</span>
      </div>
    </div>
    <div class="riichi-flash"></div>`;
  spawnFx(host, el, Math.max(400, ttl * fxSpeed()) + 400);
  speedUpSoon(el, fxSpeed());
  return el;
}
