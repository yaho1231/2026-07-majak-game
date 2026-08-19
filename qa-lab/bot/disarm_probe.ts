/**
 * 무장해제(disarm)로 잠긴 증강을 봇이 **자기 손 값어치**에서도 빼는가.
 *
 *  - 상대 쪽 읽기(`danger.readThreats`)는 `effectiveAugmentsOf`를 써서 잠긴 증강을 뺀다.
 *  - 내 쪽 읽기(`read.ts`의 `myAugments`)는 `view.players[].augments`를 **그대로** 쓴다.
 *
 * 같은 장면에서 두 값을 나란히 찍어 비대칭을 보인다.
 *
 *   tsx qa-lab/bot/disarm_probe.ts
 */
import { botScene } from "../../packages/server/test/botTestView.js";
import { buildRead } from "../../packages/server/src/bot/read.js";
import { readThreats } from "../../packages/server/src/bot/danger.js";
import type { PlayerView } from "@majak/core";

/** 값 배수가 가장 큰 축 하나 — 큰손(1.4) */
const AUG = "eternal_dealer";

function scene(disarmMe: boolean, disarmOpp: boolean): PlayerView {
  const s = botScene({
    hand: "123m456p789s22m5p",
    turnCount: 8,
    riichi: ["p1"],
    discards: { p1: "1m9m1p9p" },
    riichiTileIndex: { p1: 0 },
  });
  const v = s.view as PlayerView & { augmentView: Record<string, unknown> };
  // 나(p0)와 상대(p1)가 같은 증강을 하나씩 들고 있다
  for (const p of v.players) {
    if (p.id === "p0" || p.id === "p1") (p as { augments: string[] }).augments = [AUG];
  }
  v.augmentView = { ...(v.augmentView ?? {}) };
  // 무장해제 공개 채널 — 시전자 p2가 대상의 증강을 잠갔다
  if (disarmMe) v.augmentView["disarm:p2"] = { target: "p0", augmentId: AUG };
  if (disarmOpp) v.augmentView["disarm:p3"] = { target: "p1", augmentId: AUG };
  return v;
}

const valueOf = (v: PlayerView): number =>
  buildRead(v, "p0", { mode: "hanchan" }).valueOf({ plan: null }).points;
const threatOf = (v: PlayerView): number =>
  readThreats(v, "p0", []).find((t) => t.player === "p1")?.value ?? 0;

// 증강을 아예 안 든 대조군 — 배수가 실제로 걸리는지 확인
const none = (() => {
  const v = scene(false, false);
  for (const p of v.players) (p as { augments: string[] }).augments = [];
  return v;
})();
const base = scene(false, false);
const meLocked = scene(true, false);
const oppLocked = scene(false, true);

console.log(`증강 = ${AUG} (AUGMENT_PLAY: threat 1.4 · value 1.35)`);
console.log(`내 손 값어치   증강 없음 ${valueOf(none).toFixed(0)}`);
console.log(`내 손 값어치   잠금 없음 ${valueOf(base).toFixed(0)}  →  내 것이 잠김 ${valueOf(meLocked).toFixed(0)}`);
console.log(`상대 예상 실점 잠금 없음 ${threatOf(base).toFixed(0)}  →  상대 것이 잠김 ${threatOf(oppLocked).toFixed(0)}`);
console.log(
  valueOf(base) === valueOf(meLocked)
    ? "→ 내 값어치는 **한 푼도 안 바뀐다** (봇은 자기 증강이 잠긴 것을 모른다)"
    : "→ 내 값어치도 줄었다",
);
console.log(
  threatOf(base) === threatOf(oppLocked)
    ? "→ 상대 위협도 안 바뀐다"
    : "→ 상대 위협은 제대로 줄었다 (비대칭)",
);
