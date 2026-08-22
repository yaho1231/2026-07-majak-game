/**
 * settleInterceptor 의 priority 는 **설치 시점의 seat** 를 굽는다.
 * seat_swap 이 자리를 바꾼 뒤 rebuildAugments(재개·리플레이)를 돌리면
 * 같은 증강 구성인데 정산 인터셉터 실행 순서가 달라진다.
 */
import { createStandardGame, createStandardGameFromState, installAugment, rebuildAugments, ROUND_SETTLED, settlePriority, SETTLE_STAGE } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
const mk = () => createStandardGame({
  seed: 42, playerIds: [...SEATS], mode: "hanchan", startScore: 25000,
  redFivesPerSuit: 1, extraAugments: contentAugments,
} as never);

const order = (g: ReturnType<typeof mk>): string[] =>
  (g.engine.effects as unknown as { interceptorsFor(t: string): { source: string }[] })
    .interceptorsFor(ROUND_SETTLED).map((e) => e.source);

// ── 원본: 자리 그대로에서 설치
const a = mk();
for (const [seat, id] of [["p0", "spy"], ["p1", "parasite"]] as const) {
  a.engine.submit({ player: seat, type: "draftPick", payload: { augmentId: id } });
  installAugment(a.engine, a.augments.get(id)!, seat, { yaku: a.yaku, catalog: a.augments });
}
console.log("원본 seat:", a.engine.state.players.map((p) => `${p.id}@${p.seat}`).join(" "));
console.log("원본 정산 순서:", order(a).join(" -> "));

// ── p0 과 p1 의 자리를 맞바꾼 상태(= seat_swap 이 남긴 상태)에서 재구성
const tmp = mk();
for (const [seat, id] of [["p0", "spy"], ["p1", "parasite"]] as const) {
  tmp.engine.submit({ player: seat, type: "draftPick", payload: { augmentId: id } });
}
// seat_swap 이 남기는 상태: p0 과 p1 의 seat 가 맞바뀐다
const swapped = {
  ...tmp.engine.state,
  players: tmp.engine.state.players.map((p) =>
    p.id === "p0" ? { ...p, seat: 1 } : p.id === "p1" ? { ...p, seat: 0 } : p),
};
const b = createStandardGameFromState(swapped as never, undefined, contentAugments);
rebuildAugments(b.engine, b.augments, { yaku: b.yaku, catalog: b.augments });
console.log("교환 후 seat:", b.engine.state.players.map((p) => `${p.id}@${p.seat}`).join(" "));
console.log("재구성 정산 순서:", order(b).join(" -> "));

console.log("\npriority 원본  spy(p0 seat0)=", settlePriority(SETTLE_STAGE.Transfer, 0, "spy").toFixed(4),
  " parasite(p1 seat1)=", settlePriority(SETTLE_STAGE.Transfer, 1, "parasite").toFixed(4));
console.log("priority 재구성 spy(p0 seat1)=", settlePriority(SETTLE_STAGE.Transfer, 1, "spy").toFixed(4),
  " parasite(p1 seat0)=", settlePriority(SETTLE_STAGE.Transfer, 0, "parasite").toFixed(4));

// ── 실제 정산 금액이 갈리는가 (spy × parasite, 숙주=화료자)
import { kindKey, kindOf } from "@majak/core";
import { roundKey } from "@majak/content/util.js";
function settleDemo(g: ReturnType<typeof mk>, label: string): void {
  const st = g.engine.state;
  const winner = "p2" as PlayerId;
  const tileId = Object.keys(st.tiles)[0] as unknown as number;
  const marked = kindKey(kindOf(st, tileId as never));
  const data: Record<string, unknown> = {
    ...st.augmentData,
    "spy:mark:p0": marked,
    [`parasite:target:p1:${roundKey(st)}#round`]: winner,
  };
  const state = { ...st, augmentData: data };
  let ev: { type: string; payload: Record<string, unknown> } = {
    type: ROUND_SETTLED,
    payload: {
      outcome: "win",
      deltas: { p0: 0, p1: 0, p2: 8000, p3: -8000 },
      winInfos: [{ winner, winningTileId: tileId }],
      augPoints: [],
    },
  };
  const chain = (g.engine.effects as unknown as {
    interceptorsFor(t: string): { source: string; intercept: (e: unknown, c: unknown) => unknown }[];
  }).interceptorsFor(ROUND_SETTLED);
  for (const c of chain) {
    const next = c.intercept(ev, { state, rules: g.engine.rules }) as typeof ev | null;
    if (next === null) break;
    ev = next;
  }
  console.log(`${label} 순서=[${chain.map((c) => c.source).join(",")}] deltas=`, JSON.stringify(ev.payload["deltas"]));
}
console.log();
settleDemo(a, "원본  ");
settleDemo(b, "재구성");
