/**
 * 정산 계열 담당 증강의 문구 약속을 정산 리그에서 숫자로 확인한다.
 *  - 핏빛 계약: 배수는 손의 화료점만 (공탁·본장 제외)
 *  - 큰손: 그 국 수령 총액 하한 (오야 12000 / 자 8000)
 *  - 모 아니면 도: 화료 시 +판돈, 타가 화료 시 −판돈/2
 *  - 가불 인생: 만관 이상 화료에 상대 셋 −3000, 보유자 증감 불변
 *  - 죽기살기: 음수만큼 부호가 뒤집힌다
 *  - 승승장구: 유국에 노텐 상대당 −2000 → 보유자 +
 *  - 뚫린 천장: 상한 해제분을 지불자가 낸다
 */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, drawPayload, win, sum } from "./rig.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));
const g = (id: string) => A.get(id)!;
const show = (name: string, before: Record<string, number>, out: { deltas: unknown; augPoints?: unknown }): Record<string, number> => {
  const d = out.deltas as Record<string, number>;
  console.log(`\n### ${name}\n  before=${JSON.stringify(before)}\n  after =${JSON.stringify(d)}  sum=${sum(d)}\n  augPoints=${JSON.stringify(out.augPoints ?? [])}`);
  return d;
};

// ── 핏빛 계약: 공탁 2000 회수 + 본장 900 이 섞인 8000점 론 ──
{
  const gm = scene({
    augments: { p0: [g("blood_contract")] },
    data: { [`blood_contract:yaku:1-1-3:p0#round`]: "tanyao" },
    honba: 3,
  });
  const info = win({
    winner: "p0", from: "p1", winType: "ron", points: 8000,
    yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
    honbaBonus: 900, riichiPotGain: 2000,
  } as never);
  const before = { p0: 10900, p1: -8900, p2: 0, p3: 0 };
  const d = show("blood_contract 1.5x (손 8000, 본장900, 공탁2000)", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info], honba: 3 })));
  const expect = 10900 + 4000; // 8000*1.5 - 8000
  console.log(`  기대 p0=${expect} 실제=${d["p0"]} ${d["p0"] === expect ? "OK" : "❌"}`);
}

// ── 큰손: 자(子) 하한 8000, 공탁 2000 회수 포함 ──
{
  const gm = scene({ augments: { p0: [g("big_hand")] }, data: { "big_hand:round:p0": "1-1-0" } });
  const info = win({ winner: "p0", from: "p1", winType: "ron", points: 3900, riichiPotGain: 2000 } as never);
  const before = { p0: 5900, p1: -3900, p2: 0, p3: 0 };
  const d = show("big_hand 하한(자 8000)", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] })));
  console.log(`  기대 p0=8000 실제=${d["p0"]} ${d["p0"] === 8000 ? "OK" : "❌"}`);
}

// ── 모 아니면 도 ──
for (const scenario of ["win", "lose"] as const) {
  const gm = scene({
    augments: { p0: [g("all_or_nothing")] },
    data: { "all_or_nothing:active:1-1-0:p0#round": 12000 },
  });
  // 리치 중이어야 판돈이 산다
  (gm.engine.state.round.byPlayer as Record<string, { riichi: unknown }>)["p0"] = {
    ...(gm.engine.state.round.byPlayer["p0"] as object),
    riichi: { turn: 1, ippatsu: false, double: false },
  } as never;
  const infos = scenario === "win"
    ? [win({ winner: "p0", from: "p1", winType: "ron", points: 8000 })]
    : [win({ winner: "p2", from: "p1", winType: "ron", points: 8000 })];
  const before = scenario === "win"
    ? { p0: 8000, p1: -8000, p2: 0, p3: 0 }
    : { p0: 0, p1: -8000, p2: 8000, p3: 0 };
  const d = show(`all_or_nothing 판돈12000 (${scenario})`, before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: infos })));
  const expect = scenario === "win" ? 8000 + 12000 : -6000;
  console.log(`  기대 p0=${expect} 실제=${d["p0"]} ${d["p0"] === expect ? "OK" : "❌"}`);
}

// ── 가불 인생 폭발 ──
{
  const gm = scene({ augments: { p0: [g("devils_advance")] } });
  const info = win({ winner: "p0", from: null, winType: "tsumo", points: 8000, limit: "mangan" } as never);
  const before = { p0: 8000, p1: -2000, p2: -2000, p3: -4000 };
  const d = show("devils_advance 폭발(만관 쯔모)", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] })));
  console.log(`  보유자 증감 불변? ${d["p0"] === 8000 ? "OK" : `❌ ${d["p0"]}`} / 상대 각 −3000 추가? ${d["p1"] === -5000 && d["p2"] === -5000 && d["p3"] === -7000 ? "OK" : "❌"}`);
}

// ── 죽기살기 ──
{
  const gm = scene({ augments: { p0: [g("die_hard")] }, scores: { p0: 4000 } });
  const info = win({ winner: "p1", from: "p0", winType: "ron", points: 12000 });
  const before = { p0: -12000, p1: 12000, p2: 0, p3: 0 };
  const d = show("die_hard (4000점에서 12000 방총 → −8000)", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] })));
  console.log(`  최종점수=${4000 + (d["p0"] ?? 0)} (기대 +8000) ${4000 + (d["p0"] ?? 0) === 8000 ? "OK" : "❌"}`);
}

// ── 승승장구 ──
{
  const gm = scene({ augments: { p0: [g("always_tenpai")] } });
  const before = { p0: 3000, p1: -1000, p2: -1000, p3: -1000 };
  const d = show("always_tenpai (홀더만 텐파이, 노텐 3인)", before,
    settle(gm, drawPayload(gm, { deltas: { ...before }, tenpaiPlayers: ["p0"] })));
  console.log(`  기대 p0=9000 실제=${d["p0"]} ${d["p0"] === 9000 ? "OK" : "❌"} sum=${sum(d)}`);
}

// ── 뚫린 천장: 8판 40부 론 (표준 만관 8000 → 상한 해제) ──
{
  const gm = scene({ augments: { p0: [g("aotenjou_ceiling")] } });
  const info = win({ winner: "p0", from: "p1", winType: "ron", points: 8000, han: 8, fu: 40 });
  const before = { p0: 8000, p1: -8000, p2: 0, p3: 0 };
  const d = show("aotenjou 8판40부 론", before,
    settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] })));
  // base = 2000 + 3*1000 = 5000 → 자 론 5000*4 = 20000
  console.log(`  기대 p0=20000 / p1=-20000 실제 ${d["p0"]}/${d["p1"]} ${d["p0"] === 20000 && d["p1"] === -20000 ? "OK" : "❌"}`);
}
