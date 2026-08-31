/** synergy4 방해·수비·강 축 — synergy3/score 하네스를 그대로 재사용한다 (읽기 전용). */
export { run, table, winInfoLine, P, DEFS } from "../../synergy3/score/lib.js";
export type { RunOpts, RunResult, Seats } from "../../synergy3/score/lib.js";
export { ron, tsumo, HANDS } from "../../synergy3/score/scenes.js";
export { K, rk, MARK } from "../../synergy3/score/keys.js";
import type { GameState, PlayerId } from "@majak/core";
import { rk, MARK } from "../../synergy3/score/keys.js";

const scoped = (aug: string, name: string, s: GameState, h?: PlayerId): string =>
  `${aug}:${name}:${rk(s)}${h === undefined ? "" : `:${h}`}${MARK}`;

/** 이 축에서 추가로 필요한 키들 */
export const K4 = {
  pushForced: (s: GameState, h: PlayerId) => scoped("push_riichi", "forced", s, h),
  pushBrand: (s: GameState, h: PlayerId) => scoped("push_riichi", "brand", s, h),
  pushUsed: (s: GameState, h: PlayerId) => scoped("push_riichi", "used", s, h),
  counterPrev: (h: PlayerId) => `counter:prev:${h}`,
  counterStruck: (h: PlayerId) => `counter:struck:${h}`,
  counterSpent: (h: PlayerId) => `counter:spent:${h}`,
  scapegoatTarget: (s: GameState, h: PlayerId) => scoped("scapegoat", "target", s, h),
  parasiteTarget: (s: GameState, h: PlayerId) => `parasite:target:${h}:${rk(s)}${MARK}`,
  spyMark: (h: PlayerId) => `spy:mark:${h}`,
  karmaGauge: (h: PlayerId) => `karma:gauge:${h}`,
  armed: (aug: string, h: PlayerId) => `${aug}:armedRound:${h}`,
};
