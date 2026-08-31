/**
 * 유국(황패유국) 정산 하네스 — 패산을 비우고 한 장 버려 유국까지 몰아간다.
 * 유국 계열(유국역만·승승장구·역만 방어술의 유국 면제)을 같은 조건에서 재기 위한 도구.
 */
import {
  FlowController,
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft, h } from "../../../packages/content/test/helpers.js";

const DEFS = new Map<string, AugmentDef>(contentAugments.map((a) => [a.id, a]));
export const P: PlayerId[] = ["p0", "p1", "p2", "p3"];

export interface DrawOpts {
  /** 좌석별 손패(13장) — 텐파이/노텐을 직접 정한다 */
  hands: Record<PlayerId, string>;
  /** 좌석별 «버린 이력»(discardedKinds) — 유국역만·바닥의 족보 판정의 근거 */
  discards?: Partial<Record<PlayerId, string>>;
  augs: Partial<Record<PlayerId, string[]>>;
  data?: (s: GameState) => Record<string, unknown>;
  /** 마지막으로 p0가 버릴 패 (손에 있어야 한다) */
  lastDiscard: string;
  dealerSeat?: number;
}

export interface DrawResult {
  settled: RoundSettledPayload;
  deltas: Record<string, number>;
  total: number;
}

export function runDraw(o: DrawOpts): DrawResult {
  let state = craft({
    hands: { ...o.hands },
    discards: o.discards as Record<PlayerId, string>,
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  } as never);
  if (o.dealerSeat !== undefined) {
    state = { ...state, round: { ...state.round, dealerSeat: o.dealerSeat } };
  }
  // 패산을 비운다 → 이번 버림으로 황패유국
  state = {
    ...state,
    zones: { ...state.zones, [WALL]: { ...state.zones[WALL]!, tileIds: [] } },
  };
  state = {
    ...state,
    players: state.players.map((p) => ({ ...p, augments: [...(o.augs[p.id] ?? [])] })),
  };
  if (o.data !== undefined) {
    state = { ...state, augmentData: { ...state.augmentData, ...o.data(state) } };
  }
  const game = createStandardGameFromState(state);
  for (const p of state.players) {
    for (const id of o.augs[p.id] ?? []) {
      const def = DEFS.get(id);
      if (def === undefined) throw new Error(`unknown augment ${id}`);
      installAugment(game.engine, def, p.id, { yaku: game.yaku });
    }
  }
  const flow = new FlowController(game.engine);
  const begun = flow.begin();
  if (begun.kind !== "awaiting") throw new Error(`begin: ${begun.kind}`);
  // p0 손에서 지정한 종류의 패를 찾아 버린다
  const want = kindKey(h(o.lastDiscard)[0]!);
  const hand = game.engine.state.zones[handZone("p0")]!.tileIds;
  const tileId = hand.find((t) => kindKey(game.engine.state.tiles[t]!.kind) === want);
  if (tileId === undefined) throw new Error(`p0 손에 ${o.lastDiscard} 없음`);
  let st = flow.submit("p0", { type: "discard", payload: { tileId } } as never);
  let guard = 0;
  while (st.kind === "awaiting" && guard++ < 12) {
    const pr = (st as { prompt: { player: PlayerId; options: { type: string }[] } }).prompt;
    const pass = pr.options.find((x) => x.type === "pass") ?? pr.options[0]!;
    st = flow.submit(pr.player, pass as never);
  }
  if (st.kind !== "roundOver") throw new Error(`유국까지 못 감: ${st.kind}`);
  const log = game.engine.eventLog;
  let settled: RoundSettledPayload | null = null;
  for (let i = log.length - 1; i >= 0; i--)
    if (log[i]!.type === ROUND_SETTLED) { settled = log[i]!.payload as RoundSettledPayload; break; }
  if (settled === null) throw new Error("no RoundSettled");
  const deltas = settled.deltas as Record<string, number>;
  return { settled, deltas, total: Object.values(deltas).reduce((a, b) => a + b, 0) };
}

export function dtable(title: string, rows: { label: string; r: DrawResult }[]): void {
  console.log(`\n### ${title}`);
  console.log(`| 조합 | ${P.join(" | ")} | 합계 | 텐파이 | augPoints |\n|---|---|---|---|---|---|---|---|`);
  for (const { label, r } of rows) {
    const notes = (r.settled.augPoints ?? [])
      .map((n) => `${n.player}:${n.augId}=${n.points}`).join(", ");
    console.log(
      `| ${label} | ${P.map((p) => String(r.deltas[p] ?? 0)).join(" | ")} | ${r.total}` +
      ` | ${(r.settled.tenpaiPlayers ?? []).join(",")} | ${notes} |`,
    );
  }
}
