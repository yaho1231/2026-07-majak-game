/**
 * GSAP 초기 설정 — 플러그인 등록과 전역 손잡이.
 *
 * **이 모듈은 앱에서 딱 한 번, 가장 먼저 import 된다**(`fx/index.ts`가 재수출한다).
 * 플러그인 등록이 늦으면 첫 연출이 조용히 아무것도 안 한다 — 에러도 안 난다.
 */
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { CustomEase } from "gsap/CustomEase";
import { CustomWiggle } from "gsap/CustomWiggle";
import { CustomBounce } from "gsap/CustomBounce";
import { SHAKE } from "./motion";

gsap.registerPlugin(Flip, MotionPathPlugin, CustomEase, CustomWiggle, CustomBounce);

/**
 * 흔들림 이징 — 세기 단계마다 진동 횟수가 다르다.
 *
 * 세기가 셀수록 더 여러 번 떤다. 진폭만 키우고 횟수를 그대로 두면 "크게 한 번 밀린 것"이
 * 되지 "흔들린 것"이 안 된다.
 */
/*
 * ⚠ 등록은 **터져도 앱을 죽이지 않아야 한다.**
 *
 * 이 파일은 `fx/` 의 모든 것이 끌고 오므로, 여기서 던지면 **화면이 통째로 안 뜬다.**
 * 실제로 Node(테스트 러너)에서 `CustomWiggle.create` 가 `yEase is not a function` 으로
 * 터지는 것을 봤다 — 브라우저에서는 안 터지지만, 이징 등록 하나 때문에 게임이 안 열리는
 * 위험을 감수할 이유가 없다.
 *
 * 등록이 실패하면 그 이름을 쓰는 트윈은 GSAP 기본 이징으로 떨어진다. 흔들림이 조금
 * 밋밋해질 뿐 게임은 돈다.
 */
function registerEase(make: () => void, what: string): void {
  try {
    make();
  } catch (err) {
    // 콘솔에 남기기만 한다 — 연출 하나 때문에 게임을 멈추지 않는다.
    console.warn(`[fx] ${what} 이징을 등록하지 못했습니다 (기본 이징으로 대체됩니다)`, err);
  }
}

for (const [lv, cfg] of Object.entries(SHAKE)) {
  registerEase(
    () => CustomWiggle.create(`mjShake${lv}`, { wiggles: cfg.wiggles, type: "easeOut" }),
    `흔들림 ${lv}단`,
  );
}

/**
 * 예고형 흔들림 — **한 번 뒤로 당겼다가 터진다.**
 *
 * 론·역만처럼 "맞았다"를 표현하는 자리에 쓴다. 지금의 CSS 키프레임으로는 만들 수 없는
 * 결이라, 이것 하나가 큰 사건과 작은 사건의 어휘를 갈라 준다. 흔한 사건에는 쓰지 않는다.
 */
registerEase(
  () => CustomWiggle.create("mjShakeAntic", { wiggles: 7, type: "anticipate" }),
  "예고형 흔들림",
);

/**
 * 착지 — 패가 바닥에 닿아 살짝 눌렸다 펴진다.
 *
 * `squash` 가 핵심이다. 튀기만 하면 고무공이고, 눌렸다 펴져야 무게가 있는 물체가 된다.
 */
registerEase(
  () => CustomBounce.create("mjLand", { strength: 0.45, squash: 1.1, squashID: "mjLandSquash" }),
  "착지 스쿼시",
);

/**
 * 배경 탭에서의 동작.
 *
 * GSAP 은 rAF 기반이라 탭이 숨겨지면 브라우저가 알아서 조인다. anime.js 처럼 엔진이
 * 통째로 서지는 않지만, 돌아왔을 때 밀린 시간을 한꺼번에 소화하면 연출이 몰아친다.
 * `lagSmoothing` 이 그걸 막는다 — 500ms 넘게 끊기면 33ms 였던 것처럼 취급해 건너뛴다.
 * (GSAP 기본값과 같은 값을 **명시적으로** 적어 둔다. 기본에 기대면 왜 이 값인지가 사라진다.)
 */
gsap.ticker.lagSmoothing(500, 33);

export { gsap, Flip, MotionPathPlugin, CustomEase, CustomWiggle, CustomBounce };
