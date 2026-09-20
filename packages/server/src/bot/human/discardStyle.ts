/**
 * discardStyle — 버림의 **동점권 취향**을 사람 쪽으로 기울인다.
 *
 * 실측(docs/58 §버림 불일치): 위협이 없을 때 봇과 사람이 다른 패를 버린 4만 지점에서,
 * 사람은 고립 1·9(×1.15)·객풍 또이쯔(×1.59)·**도라 자패**(×6.4)를 봇보다 먼저 버리고,
 * 봇은 역패 단기(×0.78)·1·9 또이쯔(×0.85)를 사람보다 먼저 버린다. 봇이 도라를 끝까지
 * 쥐는 것은 값어치 계산의 결과지만 사람 눈에는 «도라 자패를 13순까지 안 버리는 봇»이다.
 *
 * 절대 EV를 뒤집지 않는다 — `BLUFF_TIEBREAK`(45점)와 같은 축의 작은 가산이고, 위협이
 * 없고 손이 아직 멀 때(2샹텐 이상)만 붙는다. 로그 비를 ±1로 자른다.
 */
import type { TileKind } from "@majak/core";
import type { BotRead } from "../read.js";
import { DISCARD_TASTE } from "./priors.js";
import { clamp } from "./style.js";

export const DISCARD_TASTE_SCALE = 60;

export function tasteBonus(kind: TileKind, read: BotRead): number {
  if (read.threat >= 0.3 || read.shanten < 2) return 0;
  const ratio = DISCARD_TASTE[tasteClass(kind, read)];
  if (ratio === undefined) return 0;
  return clamp(Math.log(ratio), -1, 1) * DISCARD_TASTE_SCALE;
}

/** 연구(`study/studyCli.ts` tileClass)와 같은 분류 — 표가 이 이름으로 서 있다 */
export function tasteClass(kind: TileKind, read: BotRead): string {
  const dora = read.doraIn([kind]) > 0 ? "D" : "";
  let same = 0;
  let near = false;
  for (const k of read.hand) {
    if (k.suit !== kind.suit) continue;
    if (k.rank === kind.rank) same++;
    else if (Math.abs(k.rank - kind.rank) <= 2) near = true;
  }
  const pair = same >= 2 ? "P" : "";
  if (kind.suit === "wind" || kind.suit === "dragon") {
    return `${read.isYakuhai(kind) ? "yakuhai" : "guest"}${pair}${dora}`;
  }
  const iso = near || same >= 2 ? "" : "i";
  const base = kind.rank === 1 || kind.rank === 9 ? "19" : kind.rank === 2 || kind.rank === 8 ? "28" : "37";
  return `${base}${iso}${pair}${dora}`;
}
