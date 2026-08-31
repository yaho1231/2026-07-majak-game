/**
 * P3 — 격(rank_gate) × 무덤 도굴(grave_rob).
 *
 * 도굴은 "화료가 성립하는 무덤 패만 후보로 제시한다"고 파일에 적혀 있고(grave_rob.ts
 * robWins), 그 근거로 «게임 1회뿐인 사용 횟수를 화료하지 못하는 도굴에 태우면 안 된다»를
 * 든다. robWins 는 역·후리텐은 보지만 **격(win.minHan)** 은 보지 않는다.
 *
 * 예측:
 *  - 격 없음: 도굴 후보가 뜨고, 누르면 turn.autoWin 으로 그 자리에서 화료한다.
 *  - 격 있음(4판 이하 화료 불가) + 4판 이하 손: 후보는 **그대로 뜨는데**
 *    FlowController 의 validateOk("win") 이 막아 화료가 안 된다 →
 *    사용 횟수만 타고 손패만 바뀐 채 턴이 계속된다.
 */
import {
  craft, setup, turnOptions, submit, startFlow2, PLAYERS,
} from "../../synergy3/disrupt/lib.js";
import { handZone, kindKey, discardsZone } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";

// p0: 2판짜리 손 1장 부족(탕야오 핑후), 오름패 5p 가 p1 바닥에 깔려 있다
const HANDS = {
  p0: "234m567m234p345s55s", // 14장(쯔모 상태) — 아래에서 쯔모패를 버리지 않고 도굴한다
  p1: "*", p2: "*", p3: "*",
};

function build(augs: Record<string, string[]>, mark: boolean) {
  let state: GameState = craft({
    hands: { p0: "234m678m678s23p33p9m", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "4p", p2: "1z", p3: "2z" } as never,
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  } as never);
  if (mark) {
    state = {
      ...state,
      augmentData: {
        ...state.augmentData,
        [roundScopedKey("rank_gate", "mark", state, "p1")]: "p0",
      },
    };
  }
  return setup(state, augs);
}

for (const mark of [false, true]) {
  const g = build({ p0: ["grave_rob"], p1: mark ? ["rank_gate"] : [] }, mark);
  const opts = turnOptions(g, "p0").filter((o) => o.type === "grave_rob");
  console.log(`\n## rank_gate ${mark ? "걸림(최소 5판)" : "없음"}`);
  console.log(`  도굴 후보 ${opts.length}개`);
  console.log(`  win.minHan(p0) =`, g.engine.rules.has("win.minHan")
    ? g.engine.rules.resolve("win.minHan", { playerId: "p0", state: g.engine.state }) : "n/a");
  if (opts.length === 0) continue;
  const { flow, status } = startFlow2(g);
  const before = g.engine.state.zones[handZone("p0")]!.tileIds.length;
  const st = flow.submit("p0", { type: "grave_rob", payload: opts[0]!.payload } as never);
  const usedKey = Object.keys(g.engine.state.augmentData).find((k) => k.startsWith("grave_rob:"));
  console.log(`  도굴 제출 → 결과 kind=${st.kind}`,
    st.kind === "awaiting" ? `(프롬프트 ${JSON.stringify(((st as any).prompts ?? [(st as any).prompt]).map((q: any) => `${q?.player}:${q?.options?.map((o: any) => o.type).join("/")}`))})` : "");
  console.log(`  손패 ${before} → ${g.engine.state.zones[handZone("p0")]!.tileIds.length}` +
    ` · 사용표식 ${usedKey}=${String(g.engine.state.augmentData[usedKey ?? ""])}`);
  if (st.kind !== "roundOver") { console.log("  → 화료가 거부되어 국이 계속된다 (도굴 횟수만 소진)"); continue; }
  const log = g.engine.eventLog;
  const rs = [...log].reverse().find((e) => e.type === "RoundSettled");
  const pl = rs?.payload as any;
  console.log(`  정산: outcome=${pl?.outcome} deltas=${JSON.stringify(pl?.deltas)}`);
  console.log(`  winInfos=${JSON.stringify((pl?.winInfos ?? []).map((w: any) => ({w: w.winner, han: w.han, fu: w.fu, pts: w.points})))}`);
}
