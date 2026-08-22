/**
 * 지불자 재배선 계열(Redistribute)이 겹칠 때 — 책임전가(blame_shift) × 눈먼 총알(blind_ron).
 * 기대: 지불자만 옮겨 다닐 뿐, **쏜 사람이 이득을 보거나 한 사람이 원래 방총액보다 더 물어서는 안 된다.**
 */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, win, sum, roundKeyOf } from "./rig.js";

const byId = new Map(contentAugments.map((d) => [d.id, d]));
const blameShift = byId.get("blame_shift")!;
const blindRon = byId.get("blind_ron")!;

// p3가 blame_shift 보유(론 화료자), p0가 blind_ron 보유
for (let honba = 0; honba < 8; honba++) {
  const augments = { p3: [blameShift], p0: [blindRon] };
  const probe = scene({ augments: augments as never, honba });
  const data = { [`blind_ron:armedRound:p0`]: roundKeyOf(probe) };
  const g = scene({ augments: augments as never, data, honba });
  const before = { p0: 0, p1: -8000, p2: 0, p3: 8000 };
  const out = settle(g, realWinPayload(g, {
    deltas: { ...before },
    winInfos: [win({ winner: "p3", from: "p1", winType: "ron", points: 8000 })],
  }));
  const d = out.deltas as Record<string, number>;
  let flag = "";
  if ((d["p1"] ?? 0) > 0) flag += ` ❌쏜사람 +${d["p1"]}`;
  const worst = Math.min(...Object.values(d));
  if (worst < -8000) flag += ` ❌한명이 ${worst}`;
  if (sum(d) !== 0) flag += ` ❌합=${sum(d)}`;
  console.log(`honba=${honba} ${JSON.stringify(d)} sum=${sum(d)}${flag}`);
}
