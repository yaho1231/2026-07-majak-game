/**
 * furiten2.ts — 동순(임시) 후리텐의 **해제 시점**. 증강 없음.
 * 표준: 론을 넘겨 생긴 임시 후리텐은 «자기 다음 쯔모» 로 풀린다(리치 중이면 안 풀린다).
 * flow.ts 는 «같은 순에 막힌다» 까지만 봤다 — 풀리는지는 아무도 안 봤다.
 * 안 풀리면 플레이어가 정당한 화료를 통째로 잃는다.
 */
import { FlowController, handZone, kindKey } from "@majak/core";
import type { PlayerId, TileId, TileKind, StandardGame, FlowStatus } from "@majak/core";
import { craft, gameOf, h } from "./flow.js";

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (n: string, ok: boolean, note = ""): void => { results.push({ name: n, ok, note }); };
const optionTypes = (p: PlayerId, s: FlowStatus): string[] =>
  s.kind !== "awaiting" ? [] : (s.prompts.find((x) => x.player === p)?.options.map((o) => o.type) ?? []);
const idOf = (g: StandardGame, p: PlayerId, spec: string, nth = 0): TileId => {
  const kind = h(spec)[0] as TileKind;
  const ids = (g.engine.state.zones[handZone(p)]?.tileIds ?? []).filter(
    (id) => kindKey(g.engine.state.tiles[id]!.kind) === kindKey(kind));
  const got = ids[nth];
  if (got === undefined) throw new Error(`${p} has no ${spec}`);
  return got;
};

function run(riichi: boolean): void {
  const tag = riichi ? "[리치 중]" : "[멘젠·리치 없음]";
  const st = craft({
    hands: {
      p0: "234m567m234p45s99p",             // 3s/6s 대기
      p1: "3s6s99m111z222z333z4z",          // 14 — 3s 버리고 나중에 6s
      p2: "123p456p123s456s7s",
      p3: "258m147p369s5z6z7z1s",
    },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
    ...(riichi ? { riichi: ["p0" as PlayerId] } : {}),
  });
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  s = flow.submit("p1", { type: "discard", payload: { tileId: idOf(game, "p1", "3s") } });
  if (!optionTypes("p0", s).includes("win")) { check(`${tag} 준비: 3s 론이 뜬다`, false, `p0=${optionTypes("p0", s).join(",")}`); return; }
  s = flow.submit("p0", { type: "pass", payload: {} });
  // p2·p3·p0 순 진행 — 각자 쯔모한 패를 그대로 버린다(쯔모기리)
  let guard = 0;
  while (s.kind === "awaiting" && guard++ < 20) {
    const cur = s.prompts[0];
    if (cur === undefined) break;
    if (cur.player === "p1" && cur.options.some((o) => o.type === "discard")) break; // p1 차례로 돌아옴
    const drawn = game.engine.state.round.lastDrawnTile;
    const pick =
      cur.options.find((o) => o.type === "discard" && (o.payload as { tileId?: TileId }).tileId === drawn) ??
      cur.options.find((o) => o.type === "discard") ?? cur.options.find((o) => o.type === "pass");
    if (pick === undefined) break;
    s = flow.submit(cur.player, pick as never);
  }
  const rs = game.engine.state.round.byPlayer["p0"];
  check(`${tag} p0이 한 바퀴 돈 뒤 임시 후리텐 상태`,
    riichi ? rs?.riichiFuriten === true : rs?.temporaryFuriten !== true,
    `temporary=${String(rs?.temporaryFuriten)} riichiFuriten=${String(rs?.riichiFuriten)}`);
  if (s.kind !== "awaiting" || s.prompts[0]?.player !== "p1") {
    check(`${tag} 준비: p1 차례 복귀`, false, `s=${s.kind} prompt=${s.kind === "awaiting" ? s.prompts.map((p) => p.player).join("+") : ""}`);
    return;
  }
  s = flow.submit("p1", { type: "discard", payload: { tileId: idOf(game, "p1", "6s") } });
  const opts = optionTypes("p0", s);
  check(riichi ? `${tag} 6s 론 불가(리치 후리텐은 영구)` : `${tag} 한 바퀴 돈 뒤 6s로 론 가능`,
    riichi ? !opts.includes("win") : opts.includes("win"), `p0=${opts.join(",")}`);
}

for (const r of [false, true]) { try { run(r); } catch (e) { check(`예외(riichi=${String(r)})`, false, String(e)); } }
for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} 통과`);
