/** augmentData 키 조립 — packages/content 의 구현과 1:1로 맞춘 사본 (읽기 전용 재현용) */
import type { GameState, PlayerId } from "@majak/core";

export const MARK = "#round";
export const rk = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;
const scoped = (aug: string, name: string, s: GameState, h?: PlayerId): string =>
  `${aug}:${name}:${rk(s)}${h === undefined ? "" : `:${h}`}${MARK}`;

export const K = {
  haiteiFired: (s: GameState, h: PlayerId) => scoped("haitei_lord", "fired", s, h),
  bigHandDeclared: (h: PlayerId) => `big_hand:round:${h}`,
  bloodContract: (s: GameState, h: PlayerId) => scoped("blood_contract", "yaku", s, h),
  letItRideStreak: (h: PlayerId) => `let_it_ride:streak:${h}`,
  jackpotMult: (s: GameState, h: PlayerId) => scoped("jackpot", "mult", s, h),
  armed: (aug: string, h: PlayerId) => `${aug}:armedRound:${h}`,
  scapegoatTarget: (s: GameState, h: PlayerId) => scoped("scapegoat", "target", s, h),
  parasiteTarget: (s: GameState, h: PlayerId) =>
    `parasite:target:${h}:${rk(s)}${MARK}`,
  spyMark: (h: PlayerId) => `spy:mark:${h}`,
  karmaGauge: (h: PlayerId) => `karma:gauge:${h}`,
  dieHardUses: (h: PlayerId) => `die_hard:uses:${h}`,
  aonActive: (s: GameState, h: PlayerId) => scoped("all_or_nothing", "active", s, h),
  aonUses: (s: GameState, h: PlayerId) => scoped("all_or_nothing", "uses", s, h),
  counterPrev: (h: PlayerId) => `counter:prev:${h}`,
  counterStruck: (h: PlayerId) => `counter:struck:${h}`,
  avengerNemesis: (h: PlayerId) => `avenger:nemesis:${h}`,
  eternalKeeps: (h: PlayerId) => `eternal_dealer:keeps:${h}`,
  devilsDebt: (h: PlayerId) => `devils_advance:debt:${h}`,
};
