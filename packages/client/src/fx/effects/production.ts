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
import { spawnFx, canDecorate } from "../core";


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
  if (decorate && spec.tone === "yakuman") parts.push('<div class="cutin-flash"></div>');
  el.innerHTML = parts.join("");
  /*
   * ⚠ **글자는 `innerHTML` 로 넣지 않는다.**
   *
   * `text`·`sub` 에는 **플레이어 이름**이 들어온다(게임 쪽 컷인은 "하가 — 12000점"
   * 처럼 이름을 싣는다). 템플릿 문자열로 박으면 이름에 태그를 넣은 사람이 다른
   * 사람의 클라이언트에서 스크립트를 실행한다. 지금은 점검 페이지가 하드코딩
   * 문자열만 넘겨서 안 터지지만, 연출 큐를 이 함수로 배선하는 순간 열린다 —
   * 배선 전에 막아 두는 편이 싸다.
   */
  const body = document.createElement("div");
  body.className = "cutin-body";
  const text = document.createElement("span");
  text.className = "cutin-text";
  if (spec.text.replace(/\s/g, "").length >= 4) text.dataset.long = "1";
  text.textContent = spec.text;
  body.appendChild(text);
  if (spec.sub !== undefined) {
    const sub = document.createElement("span");
    sub.className = "cutin-sub";
    sub.textContent = spec.sub;
    body.appendChild(sub);
  }
  // 밴드 뒤·섬광 앞에 들어가야 한다 (컷인 CSS 가 그 순서를 가정한다)
  const flash = el.querySelector(".cutin-flash");
  el.insertBefore(body, flash);
  return el;
}

/**
 * 컷인 한 번 재생 (점검 페이지용).
 *
 * 게임에서는 React 가 같은 마크업을 그리고 연출 큐가 수명을 관리한다. 여기서는
 * 그 두 가지를 흉내 내되, **속도 적용만은 게임과 같은 함수**(`applyProdSpeed`)를 쓴다.
 */
export function playCutIn(
  host: Element,
  spec: CutInSpec,
  /** 장식 조각(광선·파문·섬광)을 그릴지. **기본값이 설정을 본다** — 호출부가 잊어도 새지 않는다 */
  decorate = canDecorate(),
): HTMLElement {
  const el = buildCutIn(spec, decorate);
  const ttl = spec.ttl ?? 1600;
  // 체류 시간도 속도 배수를 받는다 — 게임의 `effectiveProdTtl` 과 같은 방향.
  spawnFx(host, el, Math.max(400, ttl * fxSpeed()) + 400);
  speedUpSoon(el, fxSpeed());
  return el;
}

/**
 * 배너 — 컷인보다 가볍고 판을 덜 가린다.
 *
 * `decorate` 인자가 없는 것은 의도다: 배너에는 걷어낼 **장식 조각이 없다**(글자와
 * 밴드뿐이다). 컷인의 광선·파문·섬광 같은 것이 없으므로 끌 것도 없다.
 * 체류 시간과 재생 속도는 다른 연출과 똑같이 설정을 따른다.
 */
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
  // 글자는 textContent 로 — 이름이 실려 오는 자리다(위 buildCutIn 주석 참고)
  const t = document.createElement("span");
  t.className = "banner-text";
  t.textContent = text;
  el.appendChild(t);
  if (sub !== undefined) {
    const sEl = document.createElement("span");
    sEl.className = "banner-sub";
    sEl.textContent = sub;
    el.appendChild(sEl);
  }
  spawnFx(host, el, Math.max(400, ttl * fxSpeed()) + 400);
  speedUpSoon(el, fxSpeed());
  return el;
}

/** 리치 전용 무대 — 비네트 암전 + 붉은 밴드 + 천점봉 */
export function playRiichiStage(
  host: Element,
  who: string,
  ttl = 1700,
  decorate = canDecorate(),
): HTMLElement {
  const el = document.createElement("div");
  el.className = "riichi-stage";
  el.style.setProperty("--prod-ttl", `${ttl}ms`);
  /*
   * 비네트 암전과 섬광은 **장식**이다 — 끄면 밴드와 글자만 남는다.
   * `board.ts` 가 광과민 위험 때문에 섬광 상한을 낮춰 둔 것과 같은 이유로,
   * 여기도 끌 수 있어야 한다. 리치가 걸렸다는 **정보**는 밴드가 전한다.
   */
  el.innerHTML =
    (decorate ? '<div class="riichi-vignette"></div>' : "") +
    `<div class="riichi-band">
      <div class="riichi-stick"><i class="riichi-stick-dot"></i></div>
      <div class="riichi-body"><span class="riichi-text">리치</span></div>
    </div>` +
    (decorate ? '<div class="riichi-flash"></div>' : "");
  const sub = document.createElement("span");
  sub.className = "riichi-sub";
  sub.textContent = who; // 이름이다 — innerHTML 로 넣지 않는다
  el.querySelector(".riichi-body")?.appendChild(sub);
  spawnFx(host, el, Math.max(400, ttl * fxSpeed()) + 400);
  speedUpSoon(el, fxSpeed());
  return el;
}
