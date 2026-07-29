/**
 * kan — 깡을 칠 것인가.
 *
 * 깡은 도라 한 장·영상패·부수를 공짜로 주지만 손 모양 하나를 굳히고, **새 도라는 남에게도
 * 붙는다.** 그래서 사람은 (1) 손이 상하지 않고 (2) 남이 리치를 걸어 놓은 상황이 아닐 때만
 * 친다. 서로 다른 패로 이루어지는 깡(장사진·동남서북)은 이득 계산이 손패 가치에 달려
 * 있어 여기서 판단하지 않는다 — 그 증강의 `bot` 정책이 직접 고른다.
 */

import { isTenpai, shantenOf, winningKinds } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { TileId, TileKind } from "@majak/core";
import { removeKinds } from "./read.js";
import type { BotRead } from "./read.js";
import type { BotProfile } from "./profile.js";

const isNumber = (k: TileKind): boolean =>
  k.suit === "man" || k.suit === "pin" || k.suit === "sou";

export function chooseKan(
  read: BotRead,
  options: readonly ActionOption[],
  profile: BotProfile,
): ActionOption | null {
  // 남이 리치를 걸었으면 깡으로 도라를 늘려 주는 것은 대개 손해다.
  // 내가 텐파이라 승부를 걸 때만 예외로 허용한다.
  const riskyBoard = read.threat >= 0.9 && !read.tenpai;
  if (riskyBoard && profile.aggression < 0.8) return null;

  // 가깡 — 이미 펑한 묶음의 4번째. 손패에서 1장이 빠질 뿐이라 거의 언제나 이득이다.
  for (const o of options) {
    if (o.type !== "shouminkan") continue;
    const tileId = (o.payload as { tileId?: TileId }).tileId;
    const kind = tileId !== undefined ? read.view.tiles[tileId]?.kind : undefined;
    if (kind === undefined) continue;
    const rest = removeKinds(read.hand, [kind]);
    if (read.tenpai && !isTenpai(rest, read.meldCount, undefined, read.opts)) continue;
    return o;
  }

  // 안깡 — 같은 종류 4장만 여기서 판단한다.
  for (const o of options) {
    if (o.type !== "ankan") continue;
    const ids = (o.payload as { tileIds?: TileId[] }).tileIds ?? [];
    const kinds: TileKind[] = [];
    for (const id of ids) {
      const k = read.view.tiles[id]?.kind;
      if (k !== undefined) kinds.push(k);
    }
    if (kinds.length !== 4) continue;
    const head = kinds[0];
    if (head === undefined) continue;
    const sameKind = kinds.every((k) => k.suit === head.suit && k.rank === head.rank);
    if (!sameKind) continue; // 장사진·동남서북 깡 → 증강 정책 담당

    const rest = removeKinds(read.hand, kinds);
    if (read.tenpai) {
      // 깡 뒤에도 텐파이여야 하고, 그 대기가 **깡친 패 자체만**이어서는 안 된다
      // (4장을 다 눕혔으니 그 패는 한 장도 안 남는다 = 죽은 대기).
      const waits = winningKinds(rest, read.meldCount + 1, undefined, read.opts);
      if (waits.length === 0) continue;
      if (!waits.some((w) => !(w.suit === head.suit && w.rank === head.rank))) continue;
      return o;
    }
    // 노텐: 같은 패 4장은 커쯔 하나로 굳는 게 보통이라 기본적으로 깡한다.
    // 다만 그 4장이 슌쯔 재료로 쓰여 깡이 손을 뒤로 미는 형태라면 참는다 —
    // 깡 전후의 샹텐을 직접 재서 판단한다(예전의 '이웃 2장' 어림 대신).
    if (!isNumber(head)) return o;
    const before = shantenOf(read.hand, read.meldCount, read.opts);
    const after = shantenOf(rest, read.meldCount + 1, read.opts);
    if (after <= before) return o;
  }
  return null;
}
