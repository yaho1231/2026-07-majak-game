/**
 * 책임전가(blame_shift)의 약속: "쏜 사람이 전액 물던 점수가 나를 뺀 세 명에게 고르게 3분할.
 * 손해 보는 사람도 이득 보는 사람도 없다."
 * 뒤에 도는 Transfer 단계(뚫린 천장·가불 인생)와 겹칠 때도 지켜지는가?
 * (덤터기 scapegoat는 같은 이유로 Reassert 재확인을 갖고 있다 — blame_shift에는 없다)
 */
import { contentAugments } from "@majak/content";
import { scene, settle, realWinPayload, win, sum } from "./rig.js";

const byId = new Map(contentAugments.map((d) => [d.id, d]));
const blameShift = byId.get("blame_shift")!;
const aotenjou = byId.get("aotenjou_ceiling")!;
const scapegoat = byId.get("scapegoat");

// p3가 blame_shift + 뚫린 천장 동시 보유, 8판 40부 론(만관 상한이 걸리던 손)
{
  const g = scene({ augments: { p3: [blameShift, aotenjou] } as never });
  const info = win({ winner: "p3", from: "p1", winType: "ron", points: 12000, han: 8, fu: 40 });
  const out = settle(g, realWinPayload(g, {
    deltas: { p0: 0, p1: -12000, p2: 0, p3: 12000 },
    winInfos: [info],
  }));
  const d = out.deltas as Record<string, number>;
  console.log(`blame_shift + aotenjou:  ${JSON.stringify(d)} sum=${sum(d)}`);
  const payers = ["p0", "p1", "p2"].map((id) => d[id] ?? 0);
  console.log(`  지불 3인: ${payers.join(" / ")}  (고르게 3분할이면 셋이 거의 같아야 한다)`);
  console.log(`  augPoints=${JSON.stringify(out.augPoints)}`);
}

// 비교군: 덤터기(scapegoat)는 Reassert 재확인이 있다
if (scapegoat !== undefined) {
  const g = scene({ augments: { p3: [scapegoat, aotenjou] } as never, data: { [`scapegoat:target:p3`]: "p0" } });
  const info = win({ winner: "p3", from: "p1", winType: "ron", points: 12000, han: 8, fu: 40 });
  const out = settle(g, realWinPayload(g, {
    deltas: { p0: 0, p1: -12000, p2: 0, p3: 12000 },
    winInfos: [info],
  }));
  console.log(`(비교) scapegoat + aotenjou: ${JSON.stringify(out.deltas)}`);
}
