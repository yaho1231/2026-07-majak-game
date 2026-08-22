/** lobby QA #7 — 리플레이 열람 권한·공유 토큰 (DB에 판을 직접 심어 빠르게 본다). */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { newHarness, cleanup, reg, chk, summary, tick, FakeSocket } from "./h.js";

const h = await newHarness();
const owner = await reg(h, "Owner");
const other = await reg(h, "Other");
const oid = (h.db as any).userByName("Owner").id;

// 최소 리플레이 파일
const path = join(h.replayDir, "fake.jsonl");
await writeFile(path, JSON.stringify({ type: "__init__", seq: 0, payload: {} }) + "\n", "utf-8");
const gameId = h.db.recordGame({
  code: "FAKE01",
  replayPath: path,
  startedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  players: [
    { userId: oid, nickname: "Owner", isBot: false, rank: 1, score: 40000 },
    { userId: null, nickname: "Bot_p1", isBot: true, rank: 2, score: 30000 },
    { userId: null, nickname: "Bot_p2", isBot: true, rank: 3, score: 20000 },
    { userId: null, nickname: "Bot_p3", isBot: true, rank: 4, score: 10000 },
  ],
});
console.log("심은 gameId:", gameId);

other.clear();
other.clientSend({ type: "replayGet", gameId });
await tick(50);
chk("남의 판은 못 연다", other.last("replayData") === undefined && other.last("error")?.code === "REPLAY_NOT_FOUND",
  JSON.stringify(other.last("error") ?? other.last("replayData")?.gameId));

other.clear();
other.clientSend({ type: "replayShare", gameId });
await tick(50);
chk("남의 판은 공유 링크를 못 만든다", other.last("replayShareToken") === undefined,
  JSON.stringify(other.last("replayShareToken")));

owner.clear();
owner.clientSend({ type: "replayGet", gameId });
await tick(50);
chk("참가자는 자기 판을 연다", owner.last("replayData")?.gameId === gameId, JSON.stringify(owner.last("error")));

owner.clear();
owner.clientSend({ type: "replayShare", gameId });
await tick(50);
const token = owner.last("replayShareToken")?.token;
console.log("공유 토큰:", token, "길이:", token?.length);
chk("공유 토큰 발급", typeof token === "string" && token.length >= 16);

// 비로그인 연결이 토큰으로 연다
const anon = new FakeSocket();
h.rm.handleConnection(anon.asWs());
anon.clientSend({ type: "replayGet", shareToken: token });
await tick(80);
chk("링크만으로 비로그인도 본다", anon.last("replayData")?.gameId === gameId, JSON.stringify(anon.last("error")));

// 해제
owner.clear();
owner.clientSend({ type: "replayShare", gameId, revoke: true });
await tick(50);
chk("해제하면 token=null 응답", owner.last("replayShareToken")?.token === null, JSON.stringify(owner.last("replayShareToken")));
const anon2 = new FakeSocket();
h.rm.handleConnection(anon2.asWs());
anon2.clientSend({ type: "replayGet", shareToken: token });
await tick(80);
chk("해제된 링크는 죽는다", anon2.last("replayData") === undefined, JSON.stringify(anon2.last("replayData")?.gameId));

// 다시 공유하면 새 토큰인가 (해제 후 재발급 시 옛 링크가 되살아나면 안 된다)
owner.clear();
owner.clientSend({ type: "replayShare", gameId });
await tick(50);
const token2 = owner.last("replayShareToken")?.token;
chk("재공유는 새 토큰", token2 !== token, `${token} vs ${token2}`);

// 존재하지 않는 gameId
owner.clear();
owner.clientSend({ type: "replayGet", gameId: 999999 });
await tick(50);
chk("없는 판은 REPLAY_NOT_FOUND", owner.last("error")?.code === "REPLAY_NOT_FOUND", JSON.stringify(owner.last("error")));

// 리플레이 파일이 사라진 판
const path2 = join(h.replayDir, "gone.jsonl");
const gid2 = h.db.recordGame({
  code: "FAKE02", replayPath: path2,
  startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
  players: [{ userId: oid, nickname: "Owner", isBot: false, rank: 1, score: 40000 }],
});
owner.clear();
owner.clientSend({ type: "replayGet", gameId: gid2 });
await tick(50);
chk("파일이 없으면 REPLAY_FILE_MISSING", owner.last("error")?.code === "REPLAY_FILE_MISSING", JSON.stringify(owner.last("error")));
owner.clear();
owner.clientSend({ type: "replayList" });
await tick(50);
const list = owner.last("replayList");
console.log("목록:", JSON.stringify(list.games.map((g: any) => [g.gameId, g.code])));

// 관리자는 남의 판을 본다
const adminSock = new FakeSocket();
h.rm.handleConnection(adminSock.asWs());
(h.db as any).db.prepare("UPDATE users SET is_admin = 1 WHERE username = 'Other'").run();
adminSock.clientSend({ type: "login", username: "Other", password: "pw123456" });
await adminSock.waitFor((m) => m.type === "authOk" || m.type === "error", 5000);
adminSock.clear();
adminSock.clientSend({ type: "replayGet", gameId });
await tick(80);
chk("관리자는 남의 판을 본다", adminSock.last("replayData")?.gameId === gameId, JSON.stringify(adminSock.last("error")));

summary();
await cleanup();
process.exit(0);
