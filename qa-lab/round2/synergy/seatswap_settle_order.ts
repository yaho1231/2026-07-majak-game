/**
 * 자리 바꿈(seat_swap) × 정산 인터셉터 순서.
 *
 * settleInterceptor 는 **install 시점의 좌석 번호**를 priority 에 굳힌다
 * (content/util.ts:645). seat_swap 은 player.seat 를 영구히 바꾼다.
 * → 원본 게임의 정산 순서와, 그 상태에서 재구성(rebuildAugments = 이어하기/리플레이)한
 *   게임의 정산 순서가 갈릴 수 있다.
 */
import { createStandardGame, installAugment, uninstallAugment, ROUND_SETTLED } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "../../cross/lib.js";

const game = createStandardGame({
  seed: 1234, playerIds: [...SEATS], mode: "hanchan", startScore: 25000,
  redFivesPerSuit: 1, extraAugments: contentAugments,
} as never) as any;
const byId = new Map(contentAugments.map((d) => [d.id, d]));
const order = (): string[] =>
  game.engine.effects.interceptorsFor(ROUND_SETTLED).map((e: any) => e.source);

// 정산 인터셉터를 쓰는 대표 증강 몇 개를 서로 다른 좌석에 심는다
const plant: [string, string][] = [["parasite","p0"],["spy","p2"],["big_hand","p1"],["counter","p3"]];
for (const [id, who] of plant) {
  const def = byId.get(id); if (def === undefined) { console.log(`(없음 ${id})`); continue; }
  installAugment(game.engine, def, who as never, { yaku: game.yaku, catalog: game.augments } as never);
}
const before = order().filter((s) => plant.some(([id]) => s.endsWith(id)));
console.log("원본 정산 순서:", before.join(" -> "));

// p0 ↔ p2 자리 교환 (seat_swap 이 하는 일 = players[].seat 를 맞바꾼다)
const st = game.engine.state;
const s0 = st.players.find((p: any) => p.id === "p0").seat;
const s2 = st.players.find((p: any) => p.id === "p2").seat;
st.players = st.players.map((p: any) =>
  p.id === "p0" ? { ...p, seat: s2 } : p.id === "p2" ? { ...p, seat: s0 } : p);
console.log(`자리 교환: p0 ${s0}->${s2}, p2 ${s2}->${s0}`);

// 재구성 = 같은 증강을 지금 상태로 다시 설치한다 (rebuildAugments 가 하는 일)
for (const [id, who] of plant) {
  const def = byId.get(id); if (def === undefined) continue;
  uninstallAugment(game.engine, def, who as never);
}
for (const [id, who] of plant) {
  const def = byId.get(id); if (def === undefined) continue;
  installAugment(game.engine, def, who as never, { yaku: game.yaku, catalog: game.augments } as never);
}
const after = order().filter((s) => plant.some(([id]) => s.endsWith(id)));
console.log("재구성 정산 순서:", after.join(" -> "));
console.log(before.join(",") === after.join(",") ? "\n== 같다 ==" : "\n!! 다르다 — 재구성이 원본과 다른 순서로 정산한다 !!");
