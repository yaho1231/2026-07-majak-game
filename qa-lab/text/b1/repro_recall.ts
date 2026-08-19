/**
 * 회수(discard_recall) 문구 검증 두 가지.
 *
 * ① "자기 순에 방금 쯔모한 패를 내 바닥으로 내보내고" — 정말 '버림패'가 되는가?
 *    → 존(바닥)에는 들어가지만 `byPlayer.discardedKinds`에는 안 들어간다.
 *      후리텐은 discardedKinds로 판정되므로, **내 바닥에 뻔히 놓인 패로 내가 론한다.**
 * ② 문구에 없는 제약: 리치 중에는 회수가 아예 불가능하다(validate가 막는다).
 */
import { FlowController, createStandardGameFromState, installAugment, kindKey, standardAugments } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";

const recall = standardAugments.find((a: any) => a.id === "discard_recall")!;
const PIN3 = kindKey({ suit: "pin", rank: 3 });
const key = (s: GameState, t: number): string => kindKey(s.tiles[t]!.kind);

function give(state: GameState, player: PlayerId, id: string): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player ? { ...p, augments: [...p.augments, id] } : p)) };
}

function scene(riichi: boolean): GameState {
  let s = craft({
    hands: {
      p0: "3p111m222m333m44m5s",
      p1: "123m456m789m12p99s3p",     // 14장, 마지막 3p = 이번 쯔모패(= 내 오름패)
      p2: "*",
      p3: "*",
    },
    discards: { p0: "", p1: "1z", p2: "", p3: "" } as any,
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  s = give(s, "p1", "discard_recall");
  if (riichi) {
    s = { ...s, round: { ...s.round, byPlayer: { ...s.round.byPlayer, p1: { ...s.round.byPlayer["p1"]!, riichi: { turn: 1, double: false, ippatsu: false } as never } } } };
  }
  return s;
}

function start(s: GameState): { game: any; flow: FlowController; st: any } {
  const game = createStandardGameFromState(s);
  installAugment(game.engine, recall as any, "p1", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const st = flow.begin();
  return { game, flow, st };
}

// ── ② 리치 중 회수 가능한가 ─────────────────────────────────────────────
for (const r of [false, true]) {
  const { st } = start(scene(r));
  const pr = st.prompts?.find((p: any) => p.player === "p1");
  const n = pr?.options.filter((o: any) => o.type === "recall").length ?? 0;
  console.log(`리치=${r} → p1에게 제시된 recall 후보 수 = ${n}`);
}

// ── ① 회수로 내보낸 패로 나중에 론할 수 있는가 ──────────────────────────
{
  const { game, flow, st } = start(scene(false));
  const s0: GameState = game.engine.state;
  const drawn = s0.round.lastDrawnTile!;
  console.log(`\n쯔모패=${key(s0, drawn)}  p1 바닥=${s0.zones["discards:p1"]!.tileIds.map((t) => key(s0, t)).join(",")}`);
  const pr = st.prompts.find((p: any) => p.player === "p1");
  const opt = pr.options.find((o: any) => o.type === "recall");
  let cur: any = flow.submit("p1", opt);
  console.log(`회수 직후 프롬프트 = ${JSON.stringify((cur.prompts ?? []).map((p: any) => p.player))} (내보낸 3p에 론·후로 판정이 붙는가)`);
  const s1: GameState = game.engine.state;
  console.log(
    `회수 후: p1 손패 ${s1.zones["hand:p1"]!.tileIds.length}장, ` +
      `바닥=${s1.zones["discards:p1"]!.tileIds.map((t) => key(s1, t)).join(",")}, ` +
      `discardedKinds=${JSON.stringify(s1.round.byPlayer["p1"]!.discardedKinds)}`,
  );
  // 되가져온 9p를 다시 버려 3m 탄키 텐파이로 돌아간다
  const back = s1.round.lastDrawnTile!;
  cur = flow.submit("p1", { type: "discard", payload: { tileId: back } });
  // 나머지는 패스
  for (const p of cur.prompts ?? []) {
    const pass = p.options.find((o: any) => o.type === "pass");
    if (pass !== undefined) cur = flow.submit(p.player, pass);
  }
  // p2 → p3 → p0 순으로 진행시키고, p0가 3m을 버린다
  let guard = 0;
  while (cur.kind === "awaiting" && guard++ < 20) {
    const p = cur.prompts[0];
    const s: GameState = game.engine.state;
    if (p.player === "p0") {
      const m3 = s.zones["hand:p0"]!.tileIds.find((t) => key(s, t) === PIN3);
      if (m3 !== undefined && p.options.some((o: any) => o.type === "discard" && o.payload.tileId === m3)) {
        cur = flow.submit("p0", { type: "discard", payload: { tileId: m3 } });
        break;
      }
    }
    const d = p.options.find((o: any) => o.type === "discard") ?? p.options.find((o: any) => o.type === "pass") ?? p.options[0];
    cur = flow.submit(p.player, d);
  }
  const sN: GameState = game.engine.state;
  const p1p = cur.prompts?.find((p: any) => p.player === "p1");
  console.log(
    `\np0가 3p 버림. p1 바닥=${sN.zones["discards:p1"]!.tileIds.map((t) => key(sN, t)).join(",")} ` +
      `(3p가 내 바닥에 있다) discardedKinds=${JSON.stringify(sN.round.byPlayer["p1"]!.discardedKinds)}`,
  );
  console.log(`p1 옵션=${JSON.stringify(p1p?.options.map((o: any) => o.type))} → 론 가능=${p1p?.options.some((o: any) => o.type === "win") ?? false}`);
}
