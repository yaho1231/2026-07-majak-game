/** 프로토콜 필드 퍼징 — 서버가 죽거나 INTERNAL 을 뱉는 입력을 찾는다. */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { signup, sleep, uniq, health } = await import("./lib.js");

const BAD: unknown[] = [
  undefined, null, 0, -1, 1.5, NaN, true, "", "x".repeat(5000), {}, [], [1, 2, 3],
  { a: { b: { c: 1 } } }, "../../etc/passwd", " ", "'; DROP TABLE users;--",
  -2147483648, 1e308,
];

const TYPES: Array<[string, string[]]> = [
  ["joinRoom", ["code"]],
  ["emote", ["id"]],
  ["ready", ["ready"]],
  ["removeBot", ["playerId"]],
  ["setBotArchetype", ["playerId", "archetype"]],
  ["setBotDifficulty", ["difficulty"]],
  ["kickPlayer", ["playerId"]],
  ["setGameMode", ["mode"]],
  ["handOrder", ["tileIds"]],
  ["action", ["actionType", "payload", "seat"]],
  ["draftPick", ["stage", "augmentId"]],
  ["draftReroll", ["stage", "slot"]],
  ["tutorialHold", ["hold"]],
  ["voteAbort", ["vote"]],
  ["replayGet", ["gameId", "shareToken"]],
  ["replayShare", ["gameId", "revoke"]],
  ["feedbackSubmit", ["kind", "title", "body"]],
  ["feedbackUpdate", ["id", "status", "reply"]],
  ["feedbackDelete", ["id"]],
  ["friendRequest", ["nickname"]],
  ["friendRespond", ["nickname", "accept"]],
  ["friendCancel", ["nickname"]],
  ["friendRemove", ["nickname"]],
  ["friendInvite", ["nickname"]],
  ["spectate", ["code", "delaySeconds"]],
  ["adminUsers", []],
  ["adminDeleteUser", ["userId"]],
  ["adminAbortGame", ["code", "reason"]],
  ["adminPauseGame", ["code", "paused", "reason"]],
  ["adminRoomNotice", ["code", "text", "seconds"]],
  ["adminExtendTime", ["code", "seat", "seconds"]],
  ["adminVoidRound", ["code"]],
  ["adminSetNotice", ["title", "body"]],
  ["sandboxStart", ["mode"]],
  ["sandboxGrant", ["augmentId", "target"]],
  ["sandboxReset", ["augments", "mode", "hands"]],
  ["sandboxBotRules", ["rules"]],
  ["sandboxControl", ["enabled"]],
  ["sandboxViewAs", ["seat"]],
  ["guestPlay", ["mode", "tutorial"]],
  ["guestResume", ["token"]],
  ["practicePlay", ["mode", "tutorial"]],
  ["changePassword", ["currentPassword", "newPassword"]],
  ["checkUsername", ["username"]],
  ["tokenLogin", ["sessionToken"]],
  ["leaderboard", []],
  ["statsRequest", []],
  ["activeGameRequest", []],
  ["catalogRequest", []],
  ["liveGames", []],
  ["adminAnalytics", []],
  ["adminAugmentTiers", []],
];

const before = await health();
console.log("before", JSON.stringify(before.faults), "rooms", before.rooms);

const internals: string[] = [];
let sent = 0;
let { c } = await signup(uniq("F"), "qatest1234", "qaadmin123");
const hook = (m: any) => {
  if (m.type === "error" && (m.code === "INTERNAL" || m.code === "NO_DB")) internals.push(JSON.stringify(m));
};
c.onMsg = hook;

for (const [type, fields] of TYPES) {
  c.send({ type });
  sent++;
  for (const f of fields) {
    for (const v of BAD) {
      const msg: any = { type };
      if (v !== undefined) msg[f] = v;
      for (const other of fields) if (other !== f && msg[other] === undefined) msg[other] = "AAAAAA";
      c.send(msg);
      sent++;
      if (sent % 40 === 0) await sleep(60);
    }
  }
  await sleep(40);
  if (c.closed) {
    console.log(`!! 소켓이 닫혔다 (${type}) code=${c.closeInfo?.code} ${c.closeInfo?.reason}`);
    ({ c } = await signup(uniq("F"), "qatest1234", "qaadmin123"));
    c.onMsg = hook;
  }
}
await sleep(1500);
console.log("보낸 메시지", sent, "| INTERNAL 응답", internals.length);
for (const i of new Set(internals)) console.log("  ", i);
const after = await health();
console.log("after", JSON.stringify(after.faults), "rooms", after.rooms, "ok", after.ok);
process.exit(0);
