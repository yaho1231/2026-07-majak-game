/**
 * 이면투시(ura_peek)의 **바꿔치기**를 뒷도라를 여는 다른 카드와 겹친다.
 *
 *  - × hidden_blade / soul_hunt : 리치를 걸지 않고 뒷도라를 여는 카드에 "내 손에 맞는
 *    뒷도라를 직접 심는" 능력을 붙이면, 다마텐 론 한 방이 몇 판이 되는가.
 *  - × no_retreat : 뒷도라가 장당 2판인 리치에 심은 뒷도라를 얹으면 몇 판인가.
 *
 * 장면: 뒷도라 표시패는 9m(내 손과 무관), 영상패 자리 0번에 1p를 놓아 둔다.
 *       p0가 이면투시 → 바꿔치기(0번)로 뒷도라 표시패를 1p로 만든다 → 222p가 뒷도라 3장.
 */
import {
  craft, mkGame, setIndicators, stackWall, withAugments, withRiichi, optionsFor,
  settledOf, winRow, table, FlowController, drive,
} from "./lib.js";
import { DEAD_WALL, WALL, kindKey } from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { h } from "../../../packages/content/test/helpers.js";

/** 왕패 영상패 0번 자리에 원하는 패를 놓는다 */
function putRinshan(state: GameState, spec: string): GameState {
  const key = kindKey(h(spec)[0]!);
  const dead = [...(state.zones[DEAD_WALL]?.tileIds ?? [])];
  for (const z of [WALL, "hand:p2", "hand:p3"]) {
    const ids = [...(state.zones[z]?.tileIds ?? [])];
    const i = ids.findIndex((id) => kindKey(state.tiles[id]!.kind) === key);
    if (i < 0) continue;
    const tmp = dead[0] as TileId;
    dead[0] = ids[i] as TileId;
    ids[i] = tmp;
    return {
      ...state,
      zones: {
        ...state.zones,
        [DEAD_WALL]: { ...state.zones[DEAD_WALL]!, tileIds: dead },
        [z]: { ...state.zones[z]!, tileIds: ids },
      },
    };
  }
  throw new Error(`no free ${spec}`);
}

function scene(augs: string[], p1riichi: boolean): GameState {
  let s = craft({
    hands: { p0: "123m456m789m222p1s9s", p1: "234567m123p4455z", p2: "*", p3: "*" },
    discards: { p0: "123z", p1: "67z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  s = setIndicators(s, "3z", "9m"); // 뒷도라 표시패 = 9m (p0 손과 무관)
  s = putRinshan(s, "1p");
  s = stackWall(s, ["1s"]);
  s = withAugments(s, { p0: augs });
  return p1riichi ? withRiichi(s, "p1") : s;
}

function run(
  augs: string[],
  opts: { swap?: boolean; riichiAction?: string | null; p1riichi?: boolean } = {},
): { row: ReturnType<typeof winRow>; 바꿔치기: boolean } {
  const st = scene(augs, opts.p1riichi ?? false);
  const game = mkGame(st);
  const flow = new FlowController(game.engine);
  let status: unknown = flow.begin();
  let swapped = false;
  if (opts.swap === true) {
    const reveal = optionsFor(status, "p0").find((o) => o.type === "ura_peek_reveal");
    if (reveal === undefined) throw new Error("이면투시 없음");
    status = flow.submit("p0", reveal);
    const sw = optionsFor(status, "p0").find(
      (o) => o.type === "ura_swap" && (o.payload as { deadIndex: number }).deadIndex === 0,
    );
    if (sw === undefined) throw new Error("바꿔치기 후보 없음");
    status = flow.submit("p0", sw);
    swapped = true;
  }
  const is9s = (o: ActionOption): boolean => {
    const id = (o.payload as { tileId?: number }).tileId;
    if (id === undefined) return false;
    const k = game.engine.state.tiles[id]!.kind;
    return k.suit === "sou" && k.rank === 9;
  };
  const act = opts.riichiAction === undefined ? "discard" : (opts.riichiAction ?? "discard");
  const d = optionsFor(status, "p0").find((o) => o.type === act && is9s(o));
  if (d === undefined) throw new Error(`p0 ${act} 불가`);
  status = flow.submit("p0", d);
  // p1이 1s를 버릴 때까지
  for (let i = 0; i < 8; i++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") break;
    const pr = s.prompts?.find((x) => x.player === "p1" && x.options.some((o) => o.type === "discard"));
    if (pr !== undefined) {
      const one = pr.options.find((o) => {
        const k = game.engine.state.tiles[(o.payload as { tileId: number }).tileId]!.kind;
        return o.type === "discard" && k.suit === "sou" && k.rank === 1;
      });
      if (one === undefined) throw new Error("p1이 1s를 못 버린다");
      status = flow.submit("p1", one);
      break;
    }
    const p = s.prompts?.[0];
    if (p === undefined) break;
    const pass = p.options.find((o) => o.type === "pass");
    if (pass === undefined) break;
    status = flow.submit(p.player, pass);
  }
  drive(game, flow, status, { winFor: ["p0"] });
  const settled = settledOf(game);
  return { row: settled === null ? null : winRow(settled, "p0"), 바꿔치기: swapped };
}

const rows: Record<string, ReturnType<typeof winRow>> = {};
rows["없음(다마텐, p1리치)"] = run([], { p1riichi: true }).row;
rows["A hidden_blade"] = run(["hidden_blade"], {}).row;
rows["B ura_peek(바꿔치기)만"] = run(["ura_peek"], { swap: true }).row;
rows["A+B hidden_blade+ura_peek"] = run(["hidden_blade", "ura_peek"], { swap: true }).row;
rows["C soul_hunt (p1리치)"] = run(["soul_hunt"], { p1riichi: true }).row;
rows["C+B soul_hunt+ura_peek"] = run(["soul_hunt", "ura_peek"], { swap: true, p1riichi: true }).row;
rows["D no_retreat 리치"] = run(["no_retreat"], { riichiAction: "no_retreat_riichi" }).row;
rows["D+B no_retreat+ura_peek"] = run(["no_retreat", "ura_peek"], {
  swap: true,
  riichiAction: "no_retreat_riichi",
}).row;
console.log(table(rows));
