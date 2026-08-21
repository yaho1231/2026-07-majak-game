/**
 * 연출 모듈의 공개 입구.
 *
 * 앱 어디서든 `import { shakeBoard, ... } from "./fx"` 로 쓴다. 개별 파일을 직접 import
 * 하지 않는 이유는 `setup.ts`(플러그인 등록)가 반드시 먼저 실행되게 하기 위해서다 —
 * 등록이 늦으면 첫 연출이 **에러도 없이** 아무것도 안 한다.
 */
export { gsap } from "./setup";
export { DUR, EASE, SHAKE, STAGGER, type ShakeLevel } from "./motion";
export {
  applyFxSettings,
  fxEnabled,
  fxSpeed,
  prodTimeScale,
  watchReducedMotion,
  type FxSettings,
} from "./settings";
export { fxTimeline, canDecorate, alive, centerOf, spawnFx, type FxTimelineOpts } from "./core";
export { deltaTo, flyTo, arcPath } from "./coords";
export { applyProdSpeed } from "./prodSpeed";
export { playCutIn, playBanner, playRiichiStage, type CutInSpec, type ProdTone } from "./effects/production";
export { shakeBoard, flashBoard, ringAt, attention } from "./effects/board";
export {
  drawTile,
  discardTile,
  meldTiles,
  reflowHand,
  captureHand,
  playHand,
  isPureReorder,
  throwTile,
} from "./effects/tiles";
export { type FxDemo, type FxFreq, type FxStage } from "./catalog";
