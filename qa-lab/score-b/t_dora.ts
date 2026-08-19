/**
 * 도라 계열 최소 장면 검사 — mirror_dora / ankan_dora / dora_afterimage / soul_hunt.
 * 실행: tsx qa-lab/score-b/t_dora.ts
 */
import { DEAD_WALL, kindKey } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft, lastSettled, setDeadWallKind, start } from "./scene.js";

const out: string[] = [];
const say = (s: string): void => { out.push(s); console.log(s); };

/** p0가 9s 단기 대기, p1이 9s를 버려 p0가 론 */
function ronScene(): GameState {
  return craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
}

function report(name: string, give: Record<string, string[]>, s: GameState): void {
  let flow;
  let st;
  try {
    ({ flow } = start(s, give as never));
    st = flow.submit("p0", { type: "win", payload: {} });
  } catch (e) { say(`${name}: 장면 불가 — ${String(e).split("\n")[0]}`); return; }
  if (st.kind !== "roundOver") { say(`${name}: 화료 실패 (${st.kind})`); return; }
  const p = lastSettled(flow);
  const w = p.winInfos?.[0];
  const dw = (s.zones[DEAD_WALL]?.tileIds ?? []) as TileId[];
  say(
    `${name}: ind=${kindKey(s.tiles[s.round.doraIndicators[0]!]!.kind)} ` +
    `ura=${kindKey(s.tiles[dw[5]!]!.kind)} ` +
    `han=${w?.han} dora=${w?.doraHan} ura=${w?.uraHan} red=${w?.redHan} ` +
    `extra=${w?.extraHan} by=${JSON.stringify(w?.extraHanBy ?? [])} ` +
    `augDora=${w?.augDoraHan ?? 0} yaku=${(w?.yaku ?? []).map((y) => `${y.id}:${y.han}`).join(",")} ` +
    `pts=${w?.points}`,
  );
}

// 손패: 123m 123p 123s 678s 9s. 도라 표시패를 8s로 두면 표준 도라 = 9s (손에 1장).
// 앞도라(mirror) = 7s (손에 1장). → mirror 보유자는 dora 2, 비보유자는 1.
{
  const base = setDeadWallKind(ronScene(), 4, { suit: "sou", rank: 8 });
  report("A1 도라만(비보유)", { p0: [] }, base);
  report("A2 mirror_dora", { p0: ["mirror_dora"] }, base);
}

// 표시패가 8s, 뒷도라 표시패(deadWall[5])를 2s로 두면 뒷도라 = 3s (손에 1장), 앞뒷도라 = 1s (손에 1장)
{
  let base = setDeadWallKind(ronScene(), 4, { suit: "sou", rank: 8 });
  base = setDeadWallKind(base, 5, { suit: "sou", rank: 2 });
  // p1이 리치 중 → soul_hunt 발동 조건
  const withRiichi: GameState = {
    ...base,
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p1: { ...base.round.byPlayer.p1!, riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 } },
      },
    },
  };
  report("B1 soul_hunt(방총자 리치)", { p0: ["soul_hunt"] }, withRiichi);
  report("B2 soul_hunt+mirror_dora", { p0: ["soul_hunt", "mirror_dora"] }, withRiichi);
  report("B3 mirror_dora만(방총자 리치·내 리치X → 우라 없음)", { p0: ["mirror_dora"] }, withRiichi);
}

// ankan_dora — 안깡 하나를 들고 화료. 손패를 줄이고 안깡 1묶음.
{
  const s = craft({
    hands: { p0: "123m123p123s9s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "kan_closed", spec: "6666s" }] },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
  const base = setDeadWallKind(s, 4, { suit: "sou", rank: 8 });
  report("C1 안깡만(비보유)", { p0: [] }, base);
  report("C2 ankan_dora", { p0: ["ankan_dora"] }, base);
  report("C3 ankan_dora+mirror_dora", { p0: ["ankan_dora", "mirror_dora"] }, base);
}

// D. ankan_dora — 랭크가 섞인 깡(장사진 3-4-5-6)·안깡 2묶음
{
  const s1 = craft({
    hands: { p0: "123m123p123s9s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "kan_closed", spec: "3456s" }] },
    discards: { p1: "9s" },
    phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "9s" },
  });
  report("D1 ankan_dora 랭크혼합 깡(3456s) — +4판 기대",
    { p0: ["ankan_dora"] }, setDeadWallKind(s1, 4, { suit: "sou", rank: 8 }));

  const s2 = craft({
    hands: { p0: "123m123p9s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "kan_closed", spec: "6666s" }, { kind: "kan_closed", spec: "7777s" }] },
    discards: { p1: "9s" },
    phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "9s" },
  });
  report("D2 ankan_dora 안깡 2묶음 — +8판 기대",
    { p0: ["ankan_dora"] }, setDeadWallKind(s2, 4, { suit: "sou", rank: 8 }));

  // 손패에 같은 종류가 남아 있어도 판이 붙지 않아야 한다 (6s 깡 + 손에 6s 없음/있음 비교 불가하니 기록만)
  const s3 = craft({
    hands: { p0: "123m123p123s9s", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "kan_open", spec: "6666s", from: "p1" }] },
    discards: { p1: "9s" },
    phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "9s" },
  });
  report("D3 ankan_dora — **명깡**에는 안 붙어야 한다",
    { p0: ["ankan_dora"] }, setDeadWallKind(s3, 4, { suit: "sou", rank: 8 }));
}

// E. mirror_dora — 순환 경계 (표시패 1s → 표준 2s, 앞 9s)
{
  const s = setDeadWallKind(ronScene(), 4, { suit: "sou", rank: 1 });
  report("E1 mirror 경계 1s (표준 2s 1장 + 앞 9s 2장 = 3 기대)", { p0: ["mirror_dora"] }, s);
  const s2 = setDeadWallKind(ronScene(), 4, { suit: "wind", rank: 1 });
  report("E2 mirror 경계 동(표준 남, 앞 북 — 손에 없음 = 0 기대)", { p0: ["mirror_dora"] }, s2);
}
