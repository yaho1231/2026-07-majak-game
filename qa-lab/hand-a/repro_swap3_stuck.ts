/**
 * 재현: 등가교환(hand_swap3) — **넘길 3장을 고른 뒤 그중 한 장을 버리면 그 국의 교환이
 * 영구히 막힌다** (지정 1회는 이미 소비된 뒤다).
 *
 *  · swap3_give 는 패를 움직이지 않고 `give` 키에 tileId 3장을 적어 둘 뿐이다.
 *  · 그 상태에서 보유자가 그 3장 중 하나를 **평범하게 버리면** 손패에서 사라진다.
 *  · 이후 swap3_take 는 `gives.every(id => myHand.includes(id))` 에서 항상 반려되고,
 *    swap3_give 는 `pendingGives.length > 0` 이라 다시 고를 수 없다(`hand_swap3.ts:307`).
 *  · holderTurnOptions 는 계속 take 후보(C(13,3)=286개)를 내므로 화면에는 버튼이 살아
 *    있지만 무엇을 눌러도 거부된다. 게임당 2회 중 1회는 이미 소비됐고,
 *    지목 표식·상대 손패 공개(revealTiles)는 그 국 내내 남는다.
 *
 * 출력: take 시도 → validate 반려 사유, 그리고 그 국 동안 교환이 끝내 성립하지 않음.
 */
import { handZone } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { runMatch2 } from "./run.js";
import { ScriptAgent } from "./agent.js";

const events: string[] = [];
let aimed = false;
let gaveChosen: number[] = [];
let discardedOne = false;
let takeTries = 0;
let swapped = false;
let snap: Record<string, unknown> | null = null;

const p0 = new ScriptAgent("p0", (prompt, view) => {
  const opts = prompt.options;
  const hand = view?.zones[handZone("p0")]?.tileIds ?? [];

  if (!aimed) {
    const aim = opts.find((o) => o.type === "swap3");
    if (aim !== undefined) {
      aimed = true;
      events.push(`1) swap3 지정 → ${JSON.stringify(aim.payload)}`);
      return aim;
    }
  }
  if (aimed && gaveChosen.length === 0) {
    const give = opts.find((o) => o.type === "swap3_give");
    if (give !== undefined) {
      gaveChosen = (give.payload as { gives: number[] }).gives;
      events.push(`2) swap3_give 선택 → ${JSON.stringify(gaveChosen)}`);
      return give;
    }
  }
  if (gaveChosen.length > 0 && !discardedOne) {
    // 고른 3장 중 하나를 그냥 버린다 (손패에서 사라진다)
    const target = gaveChosen[0]!;
    const d = opts.find(
      (o) => o.type === "discard" && (o.payload as { tileId: number }).tileId === target,
    );
    if (d !== undefined) {
      discardedOne = true;
      events.push(`3) 넘기기로 한 ${target} 을(를) 그냥 버린다`);
      return d;
    }
  }
  if (discardedOne && events.length < 14) {
    const types = [...new Set(opts.map((o) => o.type))];
    events.push(`   턴 옵션: ${types.join(",")} (손패 ${hand.length})`);
  }
  if (discardedOne) {
    const take = opts.find((o) => o.type === "swap3_take");
    if (take !== undefined && takeTries < 3) {
      takeTries++;
      events.push(
        `4) swap3_take 시도 ${takeTries} (제시된 후보 ${opts.filter((o) => o.type === "swap3_take").length}개, 내 손패 ${hand.length}장, 고른 3장 중 ${gaveChosen.filter((g) => hand.includes(g)).length}장만 손에 있음)`,
      );
      return take;
    }
    const give = opts.find((o) => o.type === "swap3_give");
    if (give !== undefined) events.push("   (참고) swap3_give 후보가 다시 제시됨");
  }
  const drawn = view?.round.myDrawnTile ?? null;
  return opts.find(
    (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
  );
});

const others = (["p1", "p2", "p3"] as PlayerId[]).map(
  (id) =>
    new ScriptAgent(id, (prompt, view) => {
      const pass = prompt.options.find((o) => o.type === "pass");
      if (pass !== undefined) return pass;
      const drawn = view?.round.myDrawnTile ?? null;
      return prompt.options.find(
        (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
      );
    }),
);

const r = await runMatch2({
  seed: Number(process.argv[2] ?? 31),
  mode: "tonpuu",
  preset: { p0: ["hand_swap3"], p1: [], p2: [], p3: [] },
  agents: [p0, ...others],
  draftSchedules: [],
  onState: (st) => {
    if (st.augmentData[`hand_swap3:done:1-1-0:p0`] === true) swapped = true;
    if (discardedOne && snap === null) {
      snap = Object.fromEntries(
        Object.entries(st.augmentData).filter(
          ([k]) => k.includes("hand_swap3") || k.includes("revealTiles"),
        ).map(([k, v]) => [k, Array.isArray(v) ? `${v.length}장` : v]),
      );
    }
  },
  timeoutMs: 120_000,
});

console.log("--- 진행 ---");
for (const e of events) console.log(" ", e);
console.log(`교환 성사=${swapped} take 시도=${takeTries}`);
console.log("p0 액션 로그:", JSON.stringify(p0.actionLog.slice(0, 20)));
console.log("버린 직후 augmentData:", JSON.stringify(snap));
console.log("crash:", r.crash ?? "-", "eff:", r.effectErrors.slice(0, 2));
