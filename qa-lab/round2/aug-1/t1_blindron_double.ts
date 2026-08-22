/**
 * 눈먼 총알(blind_ron)을 **두 좌석**이 동시에 들면 같은 재배선이 두 번 적용된다.
 * 기대: 지불자만 한 번 바뀐다(총액 불변, 쏜 사람은 손 지불분만큼만 면제).
 * 실제: 쏜 사람이 오히려 owed만큼 **번다**, 피해자는 2×owed를 문다.
 */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, win, sum, roundKeyOf } from "./rig.js";

const A = new Map(contentAugments.map((d) => [d.id, d]));
const blind = A.get("blind_ron")!;

// armOnNextRound가 굳히는 키를 직접 세팅해 "이번 국에 켜져 있음"을 만든다
const armed = (h: string, rk: string) => ({ [`blind_ron:armedRound:${h}`]: rk });

function run(holders: string[]) {
  const augments: Record<string, typeof blind[]> = {};
  for (const h of holders) augments[h] = [blind];
  // roundKey를 알기 위해 먼저 빈 scene을 만든다
  const probe = scene({ augments: {} });
  const rk = roundKeyOf(probe);
  let data: Record<string, unknown> = {};
  for (const h of holders) data = { ...data, ...armed(h, rk) };
  const gm = scene({ augments: augments as never, data });
  // p1이 p2에게 8000 론 (본장 0, 공탁 0)
  const info = win({ winner: "p1", from: "p2", winType: "ron", points: 8000 });
  const before = { p0: 0, p1: 8000, p2: -8000, p3: 0 };
  const out = settle(gm, realWinPayload(gm, { deltas: { ...before }, winInfos: [info] }));
  const d = out.deltas as Record<string, number>;
  console.log(`holders=${JSON.stringify(holders)}`);
  console.log(`  before=${JSON.stringify(before)}`);
  console.log(`  after =${JSON.stringify(d)}  sum=${sum(d)}`);
  console.log(`  쏜 사람 p2 = ${d["p2"]}  (기대: 0 또는 -8000, 절대 양수 아님)`);
  return d;
}

// 무장(arm) 키 이름을 확인해야 한다 — util.armedRoundKey 규약
console.log("=== 1인 보유 ===");
run(["p0"]);
console.log("=== 2인 보유 (p0, p3) ===");
run(["p0", "p3"]);
console.log("=== 3인 보유 (p0, p2, p3) ===");
run(["p0", "p2", "p3"]);
