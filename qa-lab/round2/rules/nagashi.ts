/**
 * nagashi.ts — 유국만관(流し満貫)의 실제 지불. 증강 없음.
 * docs/01_GAME_RULES §6: "황패유국 시 버림패가 전부 요구패·자패이고 아무도 울어 가지 않았으면
 *  쯔모 만관 지불(오야 12000 / 자 8000). 노텐 벌점과 함께 정산되며, 여럿이면 각각 받는다."
 */
import { FlowController, handZone, kindKey, discardsZone } from "@majak/core";
import type { GameState, PlayerId, TileKind, TileId } from "@majak/core";
import { craft, gameOf, h } from "./flow.js";

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = ""): void => { results.push({ name, ok, note }); };

interface Setup {
  hands: Record<string, string>;
  discards: Record<string, string>;
  turn: PlayerId;
  honba?: number;
  /** 이 좌석의 버림패 1장을 "울려 나간" 것으로 만든다 (강에서만 제거) */
  stolenFrom?: PlayerId;
}

function settle(s: Setup): { deltas: number[]; special: string; state: GameState } {
  let st = craft({
    hands: s.hands as never, discards: s.discards as never,
    phase: "turn.act", turnSeat: ["p0", "p1", "p2", "p3"].indexOf(s.turn),
    drawnLastFor: s.turn, wallLeft: 0, honba: s.honba ?? 0,
  });
  if (s.stolenFrom !== undefined) {
    const z = st.zones[discardsZone(s.stolenFrom)]!;
    st = { ...st, zones: { ...st.zones, [discardsZone(s.stolenFrom)]: { ...z, tileIds: z.tileIds.slice(1) } } };
  }
  const before = st.players.map((p) => p.score);
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let status = flow.begin();
  // 마지막 패를 버려 황패유국을 만든다 (요구패로 버려 유국만관을 깨지 않게)
  const hand = game.engine.state.zones[handZone(s.turn)]!.tileIds;
  const lastKind = h(s.hands[s.turn]!.slice(-2))[0] as TileKind;
  const tileId = hand.find((id) => kindKey(game.engine.state.tiles[id]!.kind) === kindKey(lastKind)) as TileId;
  status = flow.submit(s.turn, { type: "discard", payload: { tileId } });
  for (let i = 0; i < 8 && status.kind === "awaiting"; i++) {
    let moved = false;
    for (const pr of status.prompts) {
      const pass = pr.options.find((o) => o.type === "pass");
      if (pass === undefined) continue;
      try { status = flow.submit(pr.player, pass); moved = true; break; } catch { /* */ }
    }
    if (!moved) break;
  }
  const after = game.engine.state.players.map((p) => p.score);
  const ev = [...game.engine.eventLog].map((e) => JSON.stringify(e)).reverse().find((e) => e.includes("drawSpecial"));
  return { deltas: after.map((v, i) => v - (before[i] ?? 0)), special: ev === undefined ? "" : "nagashi_mangan", state: game.engine.state };
}

// 손패: 전원 노텐(그러면 노텐 벌부가 0이 되어 유국만관만 보인다)
const NOTEN = {
  p0: "19m19p19s1234z5z6z",   // 국사 텐파이가 되지 않도록 아래에서 갈아끼운다
  p1: "258m258p258s1234z",
  p2: "369m369p369s1234z",
  p3: "147m147p147s1234z",
};

function main(): void {
  // ① 자(p1)의 유국만관 — 전원 노텐
  {
    const r = settle({
      hands: {
        p0: "258m258p258s5566z", p1: "369m369p369s7z7z2m2p9s", p2: "147m147p147s3z4z4z2s", p3: "258m258p147s3z3z4z5s",
      },
      discards: { p1: "19m19p1z2z", p0: "2345m", p2: "3456p", p3: "4567s" },
      turn: "p1",
    });
    check("① 자의 유국만관 = 오야 4000 · 자 2000씩 (합 8000)",
      r.deltas[1] === 8000 && r.deltas[0] === -4000 && r.deltas[2] === -2000 && r.deltas[3] === -2000,
      `deltas=${r.deltas.join("/")} special=${r.special}`);
  }
  // ② 오야(p0)의 유국만관 = 4000 올 (합 12000)
  {
    const r = settle({
      hands: {
        p0: "369m369p369s7z7z2m2p9s", p1: "258m258p258s5566z", p2: "147m147p147s3z4z4z2s", p3: "258m258p147s3z3z4z5s",
      },
      discards: { p0: "19m19p1z2z", p1: "2345m", p2: "3456p", p3: "4567s" },
      turn: "p0",
    });
    check("② 오야의 유국만관 = 4000 올 (합 12000)",
      r.deltas[0] === 12000 && r.deltas.slice(1).every((d) => d === -4000),
      `deltas=${r.deltas.join("/")} special=${r.special}`);
  }
  // ③ 버림패 하나가 울려 나갔으면 불성립
  {
    const r = settle({
      hands: {
        p0: "258m258p258s5566z", p1: "369m369p369s7z7z2m2p9s", p2: "147m147p147s3z4z4z2s", p3: "258m258p147s3z3z4z5s",
      },
      discards: { p1: "19m19p1z2z", p0: "2345m", p2: "3456p", p3: "4567s" },
      turn: "p1", stolenFrom: "p1",
    });
    check("③ 버림패가 울려 나갔으면 불성립", r.deltas.every((d) => d === 0), `deltas=${r.deltas.join("/")}`);
  }
  // ④ 버림패에 중장패가 하나라도 섞이면 불성립
  {
    const r = settle({
      hands: {
        p0: "258m258p258s5566z", p1: "369m369p369s7z7z2m2p9s", p2: "147m147p147s3z4z4z2s", p3: "258m258p147s3z3z4z5s",
      },
      discards: { p1: "19m5p1z2z", p0: "2345m", p2: "3456p", p3: "4567s" },
      turn: "p1",
    });
    check("④ 중장패가 섞이면 불성립", r.deltas.every((d) => d === 0), `deltas=${r.deltas.join("/")}`);
  }
  // ⑤ 본장 2개 — 유국만관에 본장 지불(300×2)이 붙는가 (표준: 붙는다)
  {
    const r = settle({
      hands: {
        p0: "258m258p258s5566z", p1: "369m369p369s7z7z2m2p9s", p2: "147m147p147s3z4z4z2s", p3: "258m258p147s3z3z4z5s",
      },
      discards: { p1: "19m19p1z2z", p0: "2345m", p2: "3456p", p3: "4567s" },
      turn: "p1", honba: 2,
    });
    check("⑤ 본장 2 → 유국만관에 600 가산", r.deltas[1] === 8600,
      `deltas=${r.deltas.join("/")} (본장 미가산이면 8000)`);
  }
  // ⑥ 마지막 버림패도 판정에 들어가는가 — 마지막에 중장패를 버리면 불성립이어야 한다
  {
    const r = settle({
      hands: {
        p0: "258m258p258s5566z", p1: "369m369p369s7z7z2m2p5s", p2: "147m147p147s3z4z4z2s", p3: "258m258p147s3z3z4z5s",
      },
      discards: { p1: "19m19p1z2z", p0: "2345m", p2: "3456p", p3: "4567s" },
      turn: "p1",
    });
    check("⑥ 마지막에 중장패(5s)를 버리면 불성립", r.deltas.every((d) => d === 0), `deltas=${r.deltas.join("/")}`);
  }
  void NOTEN;
  for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} 통과`);
}
main();
