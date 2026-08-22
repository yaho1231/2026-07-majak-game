/**
 * 배포 시나리오: **진행 중인 대국 한가운데서 서버를 재시작**한다(SIGTERM = deploy/serve.sh restart).
 * 재시작 뒤 같은 계정으로 돌아왔을 때 손패·점수·증강·국수가 그대로인가?
 *
 * 사용법 (두 단계):
 *   1) QA_PHASE=before tsx t13-restart-resume.ts   → 판을 벌이고 상태를 파일로 남긴 뒤 대기
 *      (다른 셸에서 서버에 SIGTERM → 재시작)
 *   2) QA_PHASE=after  tsx t13-restart-resume.ts   → 재접속해 상태를 비교
 * 상태 파일: $QA_STATE (기본 /tmp/qa-t13.json)
 */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { signup, login, sleep, uniq } = await import("./lib.js");
import { readFileSync, writeFileSync } from "node:fs";

const STATE = process.env.QA_STATE ?? "/tmp/qa-t13.json";
const PHASE = process.env.QA_PHASE ?? "before";

/** 비교 대상만 뽑는다 — 판이 계속 흐르면 달라질 값(현재 손패 등)은 국 경계에서 잰다. */
function digest(v: any) {
  return {
    round: v?.round ?? null,
    honba: v?.honba ?? null,
    scores: v?.players?.map((p: any) => p.score) ?? null,
    seats: v?.players?.map((p: any) => p.nickname) ?? null,
    myHand: (v?.hand ?? []).map((t: any) => t.id ?? t).slice().sort(),
    myAugments: (v?.players?.[0]?.augments ?? v?.myAugments ?? []).map((a: any) => a.id ?? a).slice().sort(),
    wall: v?.wallCount ?? v?.tilesLeft ?? null,
  };
}

if (PHASE === "before") {
  const { c, name, pw } = await signup(uniq("RS"));
  c.send({ type: "createRoom" });
  const rc = await c.wait("roomCreated", 60000);
  const code = rc.code as string;
  c.send({ type: "setGameMode", mode: "hanchan" });
  for (let k = 0; k < 3; k++) { c.send({ type: "addBot" }); await sleep(60); }
  await sleep(300);
  c.send({ type: "startGame" });

  let rounds = 0;
  c.onMsg = (m) => {
    if (m.type === "prompt") {
      const o = m.prompt.options?.find((x: any) => x.type === "discard") ?? m.prompt.options?.find((x: any) => x.type === "pass") ?? m.prompt.options?.[0];
      if (o) setTimeout(() => c.send({ type: "action", actionType: o.type, payload: o.payload ?? {} }), 5);
    } else if (m.type === "draftOffer") {
      setTimeout(() => c.send({ type: "draftPick", stage: m.stage, augmentId: m.choices[0].id }), 5);
    } else if (m.type === "roundOver") {
      rounds++;
      setTimeout(() => c.send({ type: "roundContinue" }), 5);
    }
  };
  // 국을 2개 끝낸 뒤(증강이 붙고 점수가 움직인 상태) 3국째 도중에 멈춘다
  for (let i = 0; i < 600 && rounds < 2; i++) await sleep(500);
  console.log("끝난 국 수:", rounds);
  await sleep(4000); // 3국째로 진입
  c.onMsg = null;    // 더 이상 응답하지 않는다 — 상태를 고정
  await sleep(1000);
  const view = c.last("view")?.view;
  const d = digest(view);
  writeFileSync(STATE, JSON.stringify({ code, name, pw, rounds, digest: d }, null, 2));
  console.log("방", code, "상태 저장:", JSON.stringify(d));
  console.log("→ 이제 서버에 SIGTERM 을 보내고 다시 띄운 뒤 QA_PHASE=after 로 실행하라");
  c.close();
  process.exit(0);
}

// ── after ──
const st = JSON.parse(readFileSync(STATE, "utf8"));
console.log("복구 대상 방:", st.code, "저장된 상태:", JSON.stringify(st.digest));
const { c } = await login(st.name, st.pw);
const active = c.last("activeGame");
console.log("홈이 알려 준 진행 중 대국:", active ? JSON.stringify(active).slice(0, 200) : "없음");
c.send({ type: "joinRoom", code: st.code });
const j = await c.wait((m) => m.type === "joined" || m.type === "error", 20000);
console.log("joinRoom →", j.type, j.playerId ?? `${j.code}: ${j.message}`);
if (j.type !== "joined") { console.log("❌ 재시작 뒤 되돌아갈 수 없다"); process.exit(1); }
const v = await c.wait("view", 20000);
const d2 = digest(v.view);
console.log("복구된 상태:", JSON.stringify(d2));
const keys = Object.keys(st.digest);
let diff = 0;
for (const k of keys) {
  const a = JSON.stringify(st.digest[k]), b = JSON.stringify((d2 as any)[k]);
  if (a !== b) { console.log(`  ❌ ${k}\n     before: ${a}\n     after : ${b}`); diff++; }
}
console.log(diff === 0 ? "✓ 상태 일치" : `❌ ${diff}개 항목이 어긋났다`);
// 계속 둘 수 있는가?
const p = await c.wait("prompt", 60000).catch(() => null);
console.log("재접속 뒤 프롬프트:", p ? `있음 (옵션 ${p.prompt.options?.length})` : "❌ 없음 — 진행이 막혔다");
c.close();
process.exit(diff === 0 && p ? 0 : 1);
