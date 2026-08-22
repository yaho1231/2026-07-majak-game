/**
 * I — north_trader(북풍 상인) 교차
 *  I1 북빼기의 패산/왕패 회계 (깡 뒤에도)
 *  I2 개인 도라 판의 합 (north × ankan_dora × mirror × afterimage)
 *  I3 북빼기가 패산 **최후미**를 가져간다 → bottom_deal의 밑장·haitei_lord의 해저패
 */
import {
  craft, setup, FlowController, kindKey, kindOf, handZone, DEAD_WALL, WALL,
  rinshanRemaining, table, extraHan, evalWin, setIndicator, reserveInWall, discardsZone,
} from "./lib.js";
import type { GameState, PlayerId, TileId } from "./lib.js";
import { northTrader } from "../../../packages/content/src/augments/north_trader.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";
import { doraAfterimage } from "../../../packages/content/src/augments/dora_afterimage.js";
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";
import { haiteiLord } from "../../../packages/content/src/augments/haitei_lord.js";

const snap = (s: GameState, tag: string) => ({
  시점: tag, 손패: s.zones[handZone("p0")]!.tileIds.length,
  왕패: s.zones[DEAD_WALL]!.tileIds.length, 영상패: rinshanRemaining(s),
  패산: s.zones[WALL]!.tileIds.length, 도라표시패: s.round.doraIndicators.length,
  lastDrawRinshan: s.round.lastDrawRinshan,
});

// ── I1: 북빼기 × 안깡 회계 ──────────────────────────────────────────────
{
  const st = craft({
    hands: { p0: "4444z1111m23456m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = setup(st, [{ def: northTrader, holder: "p0" }, { def: ankanDora, holder: "p0" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const rows = [snap(game.engine.state, "시작")];
  const pick = (t: string) => {
    const o = status.prompts.find((x: any) => x.player === "p0")?.options.find((x: any) => x.type === t);
    if (!o) { rows.push(snap(game.engine.state, `${t} 없음`)); return false; }
    status = flow.submit("p0", o);
    rows.push(snap(game.engine.state, t));
    return true;
  };
  pick("north_pull"); pick("north_pull"); pick("ankan"); pick("north_pull"); pick("north_pull");
  table("I1: 북빼기 ×2 → 안깡 → 북빼기 ×2 (왕패·패산 회계)", rows);
  console.log("    p0 extraHan(북 장수 + 안깡 4) =", extraHan(game, "p0"));
}

// ── I2: 개인 도라 판의 합 ───────────────────────────────────────────────
{
  const DEFS: Record<string, any> = { north_trader: northTrader, ankan_dora: ankanDora, mirror_dora: mirrorDora, dora_afterimage: doraAfterimage };
  function scene(): GameState {
    let st = craft({
      // 안깡 3333p 1개 + 손 10장(123456789m + 5s), 빼놓은 北 2장을 후로 자리에 둔다
      hands: { p0: "123456789m5s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kan_closed", spec: "3333p" }] },
      phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "5s" },
    });
    st = reserveInWall(st, ["4m"]);
    st = setIndicator(st, "4m"); // 도라 5m(1장) · 앞도라 3m(1장)
    // 빼놓은 北 2장 = melds Zone에 있으나 Meld가 아닌 패
    const pool = Object.values(st.tiles).filter((t) => t.kind.suit === "wind" && t.kind.rank === 4)
      .map((t) => t.id).filter((id) => (st.zones[WALL]?.tileIds ?? []).includes(id)).slice(0, 2);
    const wall = st.zones[WALL]!.tileIds.filter((id) => !pool.includes(id));
    return {
      ...st,
      zones: {
        ...st.zones,
        [WALL]: { ...st.zones[WALL]!, tileIds: wall },
        ["melds:p0"]: { ...st.zones["melds:p0"]!, tileIds: [...st.zones["melds:p0"]!.tileIds, ...pool] },
      },
    };
  }
  function run(label: string, augs: string[], prev?: any[]) {
    let st = scene();
    if (prev) {
      const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      st = { ...st, augmentData: { ...st.augmentData, "dora_afterimage:prevDora": prev, [`dora_afterimage:recalled:${rk}:p0#round`]: prev } };
    }
    const game = setup(st, augs.map((a) => ({ def: DEFS[a], holder: "p0" as const })));
    const ron = game.engine.state.zones[discardsZone("p1")]!.tileIds.at(-1) as TileId;
    const ev = evalWin(game, "p0", "ron", ron, { from: "p1" });
    const eh = extraHan(game, "p0");
    return { 조합: label, doraHan: ev?.doraHan ?? -1, extraHan: eh, "총 han": (ev?.han ?? 0) + eh };
  }
  const P = [{ suit: "man", rank: 7 }];
  table("I2: 개인 도라 4종 합산 (안깡 1개 + 빼놓은 北 2장 + 표시패 4m)", [
    run("없음", []),
    run("north만", ["north_trader"]),
    run("ankan_dora만", ["ankan_dora"]),
    run("mirror만", ["mirror_dora"]),
    run("afterimage만(7m)", ["dora_afterimage"], P),
    run("north+ankan", ["north_trader", "ankan_dora"]),
    run("north+ankan+mirror", ["north_trader", "ankan_dora", "mirror_dora"]),
    run("4종 전부", ["north_trader", "ankan_dora", "mirror_dora", "dora_afterimage"], P),
  ]);
}

// ── I3: 북빼기가 밑장·해저패를 가져가는가 ──────────────────────────────
{
  const raw = craft({
    hands: { p0: "4444z1111m23456m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const ids = [...raw.zones[WALL]!.tileIds];
  let seed = 7;
  for (let i = ids.length - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) % 2147483648; const j = seed % (i + 1); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
  const st: GameState = { ...raw, zones: { ...raw.zones, [WALL]: { ...raw.zones[WALL]!, tileIds: ids } } };
  const game = setup(st, [{ def: northTrader, holder: "p0" }, { def: bottomDeal, holder: "p1" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const s0 = game.engine.state;
  const bottom3 = s0.zones[WALL]!.tileIds.slice(-3).map((id) => kindKey(kindOf(s0, id)));
  const o = status.prompts.find((x: any) => x.player === "p0")?.options.find((x: any) => x.type === "north_pull");
  status = flow.submit("p0", o);
  const s1 = game.engine.state;
  console.log("\n--- I3: 북빼기가 패산 최후미(= 밑장빼기가 보는 3장의 오른쪽 끝 · 해저패)를 가져간다");
  console.log("    북빼기 전 밑 3장 =", bottom3.join(" "));
  console.log("    북빼기 후 밑 3장 =", s1.zones[WALL]!.tileIds.slice(-3).map((id) => kindKey(kindOf(s1, id))).join(" "));
  console.log("    가져간 자리 → 왕패 맨 앞(다음 영상패) =", kindKey(kindOf(s1, s1.zones[DEAD_WALL]!.tileIds[0]!)));
}

// ── I4: 패산 마지막 한 장을 북빼기가 가져가면 (haitei_lord와의 충돌) ────────
{
  const raw = craft({
    hands: { p0: "4444z1111m23456m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const w = raw.zones[WALL]!;
  const st: GameState = { ...raw, zones: { ...raw.zones, [WALL]: { ...w, tileIds: w.tileIds.slice(-1) } } };
  const game = setup(st, [{ def: northTrader, holder: "p0" }, { def: haiteiLord, holder: "p1" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const o = status.prompts.find((x: any) => x.player === "p0")?.options.find((x: any) => x.type === "north_pull");
  console.log("\n--- I4: 패산 1장 남은 상태에서 북빼기");
  if (!o) { console.log("    북빼기 후보 없음 (패산 1장에서는 막히는가?)"); }
  else {
    status = flow.submit("p0", o);
    const s = game.engine.state;
    console.log("    북빼기 성공 → 패산", s.zones[WALL]!.tileIds.length, "장 · 왕패", s.zones[DEAD_WALL]!.tileIds.length);
    // 버려서 다음 사람이 뽑을 차례로
    const d = status.kind === "awaiting" ? status.prompts.find((x: any) => x.player === "p0")?.options.find((x: any) => x.type === "discard") : undefined;
    if (d) status = flow.submit("p0", d);
    console.log("    p0 버림 뒤 흐름 =", status.kind, "· 국 종료 사유 =", (status as any).result?.kind ?? "-");
  }
}
