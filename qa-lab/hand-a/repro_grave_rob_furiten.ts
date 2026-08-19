/**
 * 재현: grave_rob(무덤 도굴)이 **후리텐을 무시한다**.
 *
 * 시나리오
 *  - p0: 산색동순 텐파이(만234·통234·삭234·통789 + 삭7 단기), 대기 = sou7
 *  - p1: sou7 을 3장 들고 첫 순에 버린다 → p0 는 론을 **넘긴다**(pass) → 후리텐
 *  - 그 뒤 p0 의 순: 자기 손을 그대로 둔 채 `grave_rob`로 p1 의 바닥에서 sou7 을 파내
 *    표준 `win`(쯔모 취급)으로 화료한다.
 *
 * 기대: 후리텐이므로 화료 불가(날치기 pond_snatch는 같은 상황에서 `win.tsumoFuriten`을
 *       켜 막는다 — docs/28 §2-9 에서 고쳐진 바로 그 경로).
 * 실제: 화료가 성립하고 전원이 지불한다.
 *
 * 대조군: 같은 시나리오를 pond_snatch 로 돌리면 화료가 거부된다.
 */
import { discardsZone, handZone, kindKey } from "@majak/core";
import type { ActionOption, GameState, PlayerId } from "@majak/core";
import { runMatch2 } from "./run.js";
import { ScriptAgent } from "./agent.js";

const WAIT = "sou7";

const P0_HAND = [
  "man2", "man3", "man4",
  "pin2", "pin3", "pin4",
  "sou2", "sou3", "sou4",
  "pin7", "pin8", "pin9",
  "sou7",
];
// p1 은 sou7 을 들고 첫 순에 흘린다
const P1_HAND = [
  "sou7", "sou7", "sou7",
  "man9", "man9", "pin1", "pin1", "ton", "ton", "nan", "sha", "pee", "haku",
];

type Mode = "grave_rob" | "pond_snatch";
const mode = ((process.argv[2] as Mode) ?? "grave_rob");

const events: string[] = [];
let curRound = "?";
let scoreBefore: Record<string, number> = {};
let settle: Record<string, number> | null = null;
let robbed = false;
let furitenAtRob: unknown = null;

const p0 = new ScriptAgent("p0", (prompt, view) => {
  const opts = prompt.options;
  // 1) 론은 절대 누르지 않는다 → 후리텐을 만든다
  const isRon = opts.some((o) => o.type === "pass");
  const win = opts.find((o) => o.type === "win");
  if (win !== undefined && isRon && !robbed) {
    events.push("p0: RON 넘김 (후리텐 성립)");
    return opts.find((o) => o.type === "pass");
  }
  // 2) 도굴/날치기 후에는 화료를 누른다
  if (win !== undefined) {
    events.push(`[${curRound}] p0: win 선택 (robbed=${robbed})`);
    return win;
  }
  // 2.5) 첫 순에 리치 — 리치 후의 후리텐은 **영구**다(리치 후리텐)
  const riichi = opts.find((o) => o.type === "riichi");
  if (riichi !== undefined) {
    events.push("p0: 리치 선언");
    return riichi;
  }
  // 3) 내 순이면 도굴/날치기를 시도한다
  const act = opts.filter((o) => o.type === mode);
  if (act.length > 0) {
    const pick =
      act.find((o) => {
        const id = (o.payload as { graveId?: number; snatchId?: number });
        const tid = id.graveId ?? id.snatchId;
        return tid !== undefined && view?.tiles[tid]?.kind !== undefined &&
          kindKey(view.tiles[tid]!.kind!) === WAIT;
      }) ?? act[0];
    const me = view?.round.byPlayer?.["p0"] as
      | { furiten?: boolean; furitenReasons?: string[] }
      | undefined;
    events.push(
      `[${curRound}] p0: ${mode} 발동 → ${JSON.stringify(pick!.payload)} | 내 후리텐=${String(me?.furiten)} 사유=${JSON.stringify(me?.furitenReasons)} | 내 리치=${String(view?.round.byPlayer?.["p0"]?.riichi != null)}`,
    );
    robbed = true;
    return pick as ActionOption;
  }
  // 4) 그 외엔 쯔모기리 (손을 유지한다)
  const drawn = view?.round.myDrawnTile ?? null;
  const tsumogiri = opts.find(
    (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
  );
  return tsumogiri;
});

const others = (["p1", "p2", "p3"] as PlayerId[]).map(
  (id) =>
    new ScriptAgent(id, (prompt, view) => {
      const opts = prompt.options;
      // p1 은 sou7 이 손에 있으면 그것부터 버린다
      if (id === "p1") {
        const s = opts.find(
          (o) =>
            o.type === "discard" &&
            kindKey(view!.tiles[(o.payload as { tileId: number }).tileId]!.kind!) === WAIT,
        );
        if (s !== undefined) return s;
      }
      // 아무도 울지 않는다 / 화료도 하지 않는다 (시나리오 고정)
      const pass = opts.find((o) => o.type === "pass");
      if (pass !== undefined) return pass;
      const drawn = view?.round.myDrawnTile ?? null;
      return opts.find(
        (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
      );
    }),
);

const r = await runMatch2({
  seed: 4242,
  mode: "tonpuu",
  preset: { p0: [mode], p1: [], p2: [], p3: [] },
  presetHands: { p0: P0_HAND, p1: P1_HAND },
  agents: [p0, ...others],
  draftSchedules: [],
  onState: (st: GameState) => {
    curRound = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    if (!robbed) scoreBefore = Object.fromEntries(st.players.map((p) => [p.id, p.score]));
    const rs = st.round.byPlayer["p0"];
    if (robbed && furitenAtRob === null) {
      furitenAtRob = {
        temporaryFuriten: rs?.temporaryFuriten,
        riichiFuriten: rs?.riichiFuriten,
        pondOfP1: (st.zones[discardsZone("p1")]?.tileIds ?? []).map((i) =>
          kindKey(st.tiles[i]!.kind),
        ),
        p0hand: (st.zones[handZone("p0")]?.tileIds ?? []).map((i) => kindKey(st.tiles[i]!.kind)),
      };
    }
  },
  onRound: (st, phase) => {
    if (phase === "end" && robbed && settle === null) {
      settle = Object.fromEntries(st.players.map((p) => [p.id, p.score]));
    }
  },
  timeoutMs: 60_000,
});

console.log("--- 진행 ---");
for (const e of events.slice(0, 10)) console.log(" ", e);
console.log("robbed:", robbed);

console.log("crash:", r.crash ?? "-");
console.log("effectErrors:", r.effectErrors.slice(0, 3));
console.log("최종 점수:", JSON.stringify(r.finalScores));
console.log("액션:", JSON.stringify(r.actionsTaken));
console.log("도굴 직전 점수:", JSON.stringify(scoreBefore));
console.log("그 국 정산 후 점수:", JSON.stringify(settle));
