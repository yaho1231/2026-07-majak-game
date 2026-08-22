/**
 * 13 — 샌드박스가 «지정한 대로» 도는가, 그리고 밖으로 새지 않는가.
 *  - sandboxReset(hands) 로 지정한 손패가 실제 손에 들어오는가
 *  - sandboxReset(augments)/sandboxGrant 가 실제로 붙는가
 *  - 샌드박스 판이 도감(catalog 해금)·전적·리플레이·증강통계에 남는가
 */
import { check, cleanup, connectAs, newHarness, report, sleep } from "./lab.js";
import { readdir } from "node:fs/promises";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true, autoRespond: true });

  admin.clientSend({ type: "sandboxStart", mode: "tonpuu" });
  await admin.waitFor((m) => m.type === "view", 10_000);
  await sleep(400);
  const sb = admin.last("sandbox");
  console.log("sandbox state:", JSON.stringify(sb)?.slice(0, 200));
  const seat = sb?.seat ?? "p0";

  // ── 지정 손패 + 지정 증강으로 리셋 ──
  const wantHand = ["man1", "man1", "man1", "pin2", "pin3", "pin4", "sou5", "sou6", "sou7", "man9", "man9", "east", "east"];
  admin.clear();
  admin.clientSend({
    type: "sandboxReset",
    mode: "tonpuu",
    augments: { [seat]: ["spy"] },
    hands: { [seat]: wantHand },
  });
  await admin.waitFor((m) => m.type === "view", 15_000);
  await sleep(800);

  const view = admin.last("view").view;
  const ids = (view.zones[`hand:${seat}`]?.tileIds ?? []) as number[];
  const names = ids.map((id) => {
    const k = view.tiles[String(id)].kind;
    return k.suit === undefined ? `${k.suit ?? "honor"}${k.rank}` : `${k.suit}${k.rank}`;
  });
  console.log("실제 손패:", JSON.stringify(names), "지정:", JSON.stringify(wantHand));
  const hits = wantHand.filter((w) => names.includes(w)).length;
  check("지정한 손패가 실제로 들어온다", hits >= 10, `일치 ${hits}/13 — 실제=${names.join(",")}`);

  const augView = JSON.stringify(view.players);
  check("지정한 증강(spy)이 실제로 붙는다", augView.includes("spy"), augView.slice(0, 300));

  // ── 실행 중 grant ──
  admin.clear();
  admin.clientSend({ type: "sandboxGrant", augmentId: "karma", target: seat });
  await sleep(500);
  const after = JSON.stringify(admin.last("view")?.view.players ?? {}) + JSON.stringify(admin.last("sandbox")?.augments ?? {});
  check("sandboxGrant 가 즉시 붙는다", after.includes("karma"), after.slice(0, 200));

  // ── 새는가 ──
  admin.clientSend({ type: "statsRequest" });
  await admin.waitFor((m) => m.type === "stats", 5000);
  const st = admin.last("stats");
  check("샌드박스 판이 전적에 안 남는다", (st.career?.length ?? 0) === 0, JSON.stringify(st).slice(0, 150));

  admin.clientSend({ type: "replayList" });
  await admin.waitFor((m) => m.type === "replayList", 5000);
  check("샌드박스 판이 리플레이 목록에 안 남는다",
    (admin.last("replayList").games?.length ?? 0) === 0,
    JSON.stringify(admin.last("replayList")).slice(0, 200));

  const files = await readdir(h.replayDir);
  check("샌드박스 리플레이 파일이 안 남는다", files.filter((f) => f.endsWith(".jsonl")).length === 0,
    JSON.stringify(files));

  admin.clientSend({ type: "catalogRequest" });
  await admin.waitFor((m) => m.type === "catalog", 5000);
  const cat = admin.last("catalog");
  const seen = JSON.stringify(cat).match(/"seen":true/g)?.length ?? 0;
  console.log("catalog seen=", seen);

  admin.clientSend({ type: "liveGames" });
  await admin.waitFor((m) => m.type === "liveGames", 5000);
  check("샌드박스 방이 liveGames 목록에 안 뜬다",
    (admin.last("liveGames").rooms?.length ?? 0) === 0,
    JSON.stringify(admin.last("liveGames")).slice(0, 200));

  report();
  await cleanup();
  process.exit(0);
}
void main();
