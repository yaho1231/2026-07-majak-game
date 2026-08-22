/** 정산 계열 담당 증강을 **두 좌석**이 동시에 들었을 때의 정산을 훑는다. */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, drawPayload, win, sum, roundKeyOf } from "./rig.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));
const g = (id: string) => A.get(id)!;

function show(name: string, before: Record<string, number>, out: { deltas: unknown }) {
  const d = out.deltas as Record<string, number>;
  console.log(`\n### ${name}\n  before=${JSON.stringify(before)}\n  after =${JSON.stringify(d)}  sum=${sum(d)}`);
  return d;
}

// ── 책임전가 2인 (p0 화료 · p1 방총 · p3도 blame_shift 보유) ──
{
  const gm = scene({ augments: { p0: [g("blame_shift")], p3: [g("blame_shift")] } });
  const info = win({ winner: "p0", from: "p1", winType: "ron", points: 8000 });
  const before = { p0: 8000, p1: -8000, p2: 0, p3: 0 };
  const d = show("blame_shift 2인(p0 화료, p3도 보유)", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] })));
  console.log(`  p0 수령 불변? ${d["p0"] === 8000 ? "OK" : `❌ ${d["p0"]}`}`);
}

// ── 승승장구 2인 (p0·p2 보유, p1·p3 노텐) ──
{
  const gm = scene({ augments: { p0: [g("always_tenpai")], p2: [g("always_tenpai")] } });
  const before = { p0: 1500, p1: -1500, p2: 1500, p3: -1500 };
  const d = show("always_tenpai 2인 (노텐 p1·p3)", before,
    settle(gm, drawPayload(gm, { deltas: { ...before }, tenpaiPlayers: ["p0", "p2"] })));
  console.log(`  노텐 1인 부담 = ${-(d["p1"] ?? 0)} (카드: 표준 1500 + 2000×보유자수)`);
}

// ── 큰손 2인 더블론 ──
{
  const gm = scene({
    augments: { p0: [g("big_hand")], p1: [g("big_hand")] },
    data: { "big_hand:round:p0": "1-1-0", "big_hand:round:p1": "1-1-0" },
  });
  const infos = [
    win({ winner: "p0", from: "p2", winType: "ron", points: 1000 }),
    win({ winner: "p1", from: "p2", winType: "ron", points: 1000 }),
  ];
  const before = { p0: 1000, p1: 1000, p2: -2000, p3: 0 };
  const d = show("big_hand 2인 더블론 (p0=오야)", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: infos })));
  console.log(`  p0=${d["p0"]} (오야 하한 12000) p1=${d["p1"]} (자 하한 8000) sum=${sum(d)}`);
}

// ── 가불 인생 2인 동시 폭발 ──
{
  const gm = scene({ augments: { p0: [g("devils_advance")], p2: [g("devils_advance")] } });
  const infos = [
    win({ winner: "p0", from: null, winType: "tsumo", points: 8000, limit: "mangan" } as never),
  ];
  const before = { p0: 8000, p1: -2000, p2: -2000, p3: -4000 };
  const d = show("devils_advance 2인 보유·p0만 만관 화료", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: infos })));
  console.log(`  보유자 p2도 -3000 물었는가: ${d["p2"]}`);
}

// ── 모 아니면 도 2인 (p0 화료, p2는 올인만 걸고 짐) ──
{
  const probe = scene({ augments: {} });
  const rk = roundKeyOf(probe);
  const gm = scene({
    augments: { p0: [g("all_or_nothing")], p2: [g("all_or_nothing")] },
    data: {
      [`all_or_nothing:active:${rk}:p0#round`]: 12000,
      [`all_or_nothing:active:${rk}:p2#round`]: 12000,
    },
  });
  for (const pid of ["p0", "p2"]) {
    (gm.engine.state.round.byPlayer as Record<string, { riichi: unknown }>)[pid] = {
      ...(gm.engine.state.round.byPlayer[pid] as object),
      riichi: { turn: 1, ippatsu: false, double: false },
    } as never;
  }
  const info = win({ winner: "p0", from: "p1", winType: "ron", points: 8000 });
  const before = { p0: 8000, p1: -8000, p2: 0, p3: 0 };
  const d = show("all_or_nothing 2인 (p0 화료 / p2 패배)", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] })));
  console.log(`  p0 +12000? ${d["p0"] === 20000 ? "OK" : `❌ ${d["p0"]}`} / p2 -6000? ${d["p2"] === -6000 ? "OK" : `❌ ${d["p2"]}`}`);
}

// ── 뚫린 천장 2인 더블론 ──
{
  const gm = scene({ augments: { p0: [g("aotenjou_ceiling")], p1: [g("aotenjou_ceiling")] } });
  const infos = [
    win({ winner: "p0", from: "p2", winType: "ron", points: 16000, han: 8, fu: 40 }),
    win({ winner: "p1", from: "p2", winType: "ron", points: 16000, han: 8, fu: 40 }),
  ];
  const before = { p0: 16000, p1: 16000, p2: -32000, p3: 0 };
  const d = show("aotenjou 2인 더블론", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: infos })));
  console.log(`  sum=${sum(d)} (0이어야 이동형)`);
}
