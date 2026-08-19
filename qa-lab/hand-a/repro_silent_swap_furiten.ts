/**
 * 재현: silent_swap(정적의 손)이 **후리텐을 무시한 쯔모 화료**를 만든다.
 *
 * 시나리오 (리치 없음 — 정적의 손 발동 조건)
 *  - p0: 핑후 텐파이 (만234·통234·통789·삭78 + 만9만9), 대기 = sou6 / sou9
 *  - p0 가 대기패를 쯔모하면 **화료를 누르지 않고 그대로 버린다** → 자기 바닥에
 *    대기패가 깔려 **후리텐(discard)** 확정. 손패는 그대로라 텐파이는 유지된다.
 *  - 그 뒤 자기 순에 `silent_take`로 **자기 바닥의 그 패**를 다시 집는다
 *    → 집은 패가 lastDrawnTile 이 되어 표준 `win`(쯔모)이 열린다.
 *
 * 기대: 후리텐이므로 화료 불가. 같은 계열인 날치기(pond_snatch)는 `win.tsumoFuriten`
 *       모디파이어로 정확히 이 경로를 막는다(docs/28 §2-9 에서 고쳐진 항목).
 *       silent_swap 의 detail 도 "내 바닥에서 가져와도 내 후리텐은 풀리지 않는다"고 적는다.
 * 실제: 화료가 성립한다.
 */
import { handZone, kindKey, kindOf, winningKinds } from "@majak/core";
import type { ActionOption, GameState, PlayerId } from "@majak/core";
import { runMatch2 } from "./run.js";
import { ScriptAgent } from "./agent.js";

const WAITS = new Set(["sou6", "sou9"]);

const P0_HAND = [
  "man2", "man3", "man4",
  "pin2", "pin3", "pin4",
  "pin7", "pin8", "pin9",
  "sou7", "sou8",
  "man9", "man9",
];

const events: string[] = [];
let furitenMade = false;
let swapped = false;
let curRound = "?";
let stop = false;
let proof: unknown = null;

const p0 = new ScriptAgent("p0", (prompt, view) => {
  const opts = prompt.options;
  const win = opts.find((o) => o.type === "win");
  const drawn = view?.round.myDrawnTile ?? null;
  const drawnKind = drawn === null ? undefined : view?.tiles[drawn]?.kind;
  const me = view?.round.byPlayer?.["p0"] as
    | { furiten?: boolean; furitenReasons?: string[] }
    | undefined;

  // 1) 후리텐을 만들기 전에는 화료를 누르지 않는다 — 대기패를 쯔모하면 그대로 버린다
  if (!furitenMade) {
    if (win !== undefined) {
      const tsumogiri = opts.find(
        (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
      );
      if (tsumogiri !== undefined && drawnKind !== undefined && WAITS.has(kindKey(drawnKind))) {
        events.push(`[${curRound}] p0: 대기패 ${kindKey(drawnKind)} 쯔모 → 화료를 안 누르고 버린다 (후리텐 만들기)`);
        furitenMade = true;
        return tsumogiri;
      }
      return opts.find((o) => o.type === "pass") ?? tsumogiri;
    }
  } else if (win !== undefined && swapped) {
    events.push(`[${curRound}] p0: win 선택 — 후리텐=${String(me?.furiten)} 사유=${JSON.stringify(me?.furitenReasons)}`);
    stop = true;
    return win;
  } else if (win !== undefined) {
    // 후리텐 성립 이후의 자연 쯔모 화료는 눌러도 되지만, 시나리오를 흐리지 않게 넘긴다
    const tsumogiri = opts.find(
      (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
    );
    return opts.find((o) => o.type === "pass") ?? tsumogiri;
  }

  // 2) 후리텐이 만들어졌으면 내 바닥에서 대기패를 집는다
  if (furitenMade && !swapped) {
    const take = opts.filter((o) => o.type === "silent_take");
    const hit = take.find((o) => {
      const tid = (o.payload as { tileId?: number }).tileId;
      const k = tid === undefined ? undefined : view?.tiles[tid]?.kind;
      return k !== undefined && WAITS.has(kindKey(k));
    });
    if (hit !== undefined) {
      events.push(
        `[${curRound}] p0: silent_take 발동 → ${JSON.stringify(hit.payload)} | 지금 후리텐=${String(me?.furiten)} 사유=${JSON.stringify(me?.furitenReasons)}`,
      );
      swapped = true;
      return hit as ActionOption;
    }
  }
  // 3) 그 외엔 쯔모기리
  return opts.find(
    (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
  );
});

const others = (["p1", "p2", "p3"] as PlayerId[]).map(
  (id) =>
    new ScriptAgent(id, (prompt, view) => {
      const opts = prompt.options;
      const pass = opts.find((o) => o.type === "pass");
      if (pass !== undefined) return pass;
      const drawn = view?.round.myDrawnTile ?? null;
      return opts.find(
        (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
      );
    }),
);

const r = await runMatch2({
  seed: Number(process.argv[2] ?? 11),
  mode: "tonpuu",
  preset: { p0: ["silent_swap"], p1: [], p2: [], p3: [] },
  presetHands: { p0: P0_HAND },
  agents: [p0, ...others],
  draftSchedules: [],
  onState: (st: GameState) => {
    curRound = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    if (!swapped || proof !== null) return;
    // 집은 직후: 13장(집은 패 제외) 기준 대기 vs 내 바닥 이력 = 진짜 후리텐인가
    const drawn = st.round.lastDrawnTile;
    const kinds = (st.zones[handZone("p0")]?.tileIds ?? [])
      .filter((id) => id !== drawn)
      .map((id) => kindOf(st, id));
    const waits = winningKinds(kinds, 0).map(kindKey);
    const disc = st.round.byPlayer["p0"]?.discardedKinds ?? [];
    proof = {
      집은패: drawn === null ? null : kindKey(kindOf(st, drawn)),
      대기: waits,
      내바닥: disc,
      후리텐: waits.some((w) => disc.includes(w)),
    };
  },
  timeoutMs: 120_000,
});

console.log("--- 진행 ---");
for (const e of events.slice(0, 12)) console.log(" ", e);
console.log("furitenMade:", furitenMade, "swapped:", swapped, "화료:", stop);
console.log("crash:", r.crash ?? "-", "eff:", r.effectErrors.slice(0, 2));
console.log("최종 점수:", JSON.stringify(r.finalScores));
console.log("액션:", JSON.stringify(r.actionsTaken));
console.log("증거(집은 직후 상태):", JSON.stringify(proof));
