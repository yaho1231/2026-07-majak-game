/**
 * ippatsu.ts — 일발(一発) 소멸 규칙. 증강 없음.
 *   ① 누군가 울면(치·펑·깡) 일발이 사라진다 — 표준 룰
 *   ② 한 바퀴(자기 다음 쯔모)를 돌면 사라진다
 *   ③ 리치 직후 자기 순 안의 안깡으로도 사라진다(표준: 자신의 깡도 일발을 지운다)
 * flow2.ts 의 일발 케이스는 "펑 기회가 안 나왔다"로 준비 단계에서 끊겨 미검증이었다.
 */
import { FlowController, handZone, kindKey } from "@majak/core";
import type { PlayerId, TileId, TileKind, StandardGame, FlowStatus, GameState } from "@majak/core";
import { craft, gameOf, h } from "./flow.js";

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (n: string, ok: boolean, note = ""): void => { results.push({ name: n, ok, note }); };
const optsOf = (p: PlayerId, s: FlowStatus): { type: string; payload: unknown }[] =>
  s.kind !== "awaiting" ? [] : ((s.prompts.find((x) => x.player === p)?.options ?? []) as never);
const idOf = (g: StandardGame, p: PlayerId, spec: string, nth = 0): TileId => {
  const kind = h(spec)[0] as TileKind;
  const ids = (g.engine.state.zones[handZone(p)]?.tileIds ?? []).filter(
    (id) => kindKey(g.engine.state.tiles[id]!.kind) === kindKey(kind));
  const got = ids[nth];
  if (got === undefined) throw new Error(`${p} has no ${spec}`);
  return got;
};
/** p0을 «리치 직후 일발 살아 있음» 으로 만든다 */
const withIppatsu = (st: GameState): GameState => ({
  ...st,
  round: {
    ...st.round,
    byPlayer: {
      ...st.round.byPlayer,
      p0: { ...st.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: true, discardIndex: 0, cost: 1000 } },
    },
  },
});

function base(): GameState {
  return withIppatsu(craft({
    // p0: 리치·3s6s 대기 / p1: 9m 3장 보유(펑 가능) / p2: 9m 버림 / p3: 잡패
    hands: {
      p0: "234m567m234p45s99p",
      p1: "999m111z222z333z44z",
      p2: "9m123p456p789p12s3s",
      p3: "258m147p369s5z6z7z1s",
    },
    phase: "turn.act", turnSeat: 2, drawnLastFor: "p2", riichi: ["p0"],
  }));
}

function testCallCancels(): void {
  const game = gameOf(base());
  const flow = new FlowController(game.engine);
  let s = flow.begin();
  const before = game.engine.state.round.byPlayer["p0"]?.riichi?.ippatsu;
  s = flow.submit("p2", { type: "discard", payload: { tileId: idOf(game, "p2", "9m") } });
  const pon = optsOf("p1", s).find((o) => o.type === "pon");
  check("① 준비: p1에게 9m 펑이 뜬다", pon !== undefined && before === true,
    `pon=${String(pon !== undefined)} 일발(전)=${String(before)}`);
  if (pon === undefined) return;
  // 다른 사람 리액션 정리
  for (const pr of s.kind === "awaiting" ? s.prompts : []) {
    if (pr.player === "p1") continue;
    const pass = pr.options.find((o) => o.type === "pass");
    if (pass !== undefined) { try { s = flow.submit(pr.player, pass); } catch { /* */ } }
  }
  s = flow.submit("p1", pon as never);
  const after = game.engine.state.round.byPlayer["p0"]?.riichi?.ippatsu;
  check("① 남이 펑하면 일발이 사라진다", after === false, `일발(후)=${String(after)}`);
}

function testAnkanCancels(): void {
  // p0이 리치 중 안깡 가능한 상태 (대기 불변 안깡) — 자기 깡도 일발을 지운다(표준)
  const st = withIppatsu(craft({
    hands: { p0: "234m567m999p11p45s9p", p2: "123p456p123s456s7s", p1: "111z222z333z44z9m", p3: "258m147p369s5z6z7z1s" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0", riichi: ["p0"],
  }));
  const game = gameOf(st);
  const flow = new FlowController(game.engine);
  const s = flow.begin();
  const kan = optsOf("p0", s).find((o) => o.type === "ankan");
  check("③ 준비: 리치 중 대기 불변 안깡이 뜬다", kan !== undefined,
    `옵션=${optsOf("p0", s).map((o) => o.type).join(",")}`);
  if (kan === undefined) return;
  flow.submit("p0", kan as never);
  const after = game.engine.state.round.byPlayer["p0"]?.riichi?.ippatsu;
  check("③ 자기 안깡으로도 일발이 사라진다", after === false, `일발(후)=${String(after)}`);
}

for (const fn of [testCallCancels, testAnkanCancels]) {
  try { fn(); } catch (e) { check(`${fn.name} — 예외`, false, String(e)); }
}
for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.note === "" ? "" : ` — ${r.note}`}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} 통과`);
