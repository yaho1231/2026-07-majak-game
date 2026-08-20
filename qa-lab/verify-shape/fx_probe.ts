/**
 * live 의심 1 재검증 — 정보형 증강 발동에 컷인이 뜨는가.
 *
 *   npx tsx qa-lab/verify-shape/fx_probe.ts [판수]
 *
 * 두 겹을 각각 확인한다.
 *  ① 서버(HanchanController): 발동 액션에 `actionFx`를 **누구에게** 보내는가.
 *     - FX_SILENT_ACTION_TYPES면 아무에게도 안 보낸다
 *     - FX_PRIVATE_ACTION_TYPES면 보유자 + 관전자에게만
 *     - 그 외엔 전원
 *     실제 대국을 돌려 `PlayerAgent.notify`로 들어오는 메시지를 전수 기록한다.
 *  ② 클라(App.tsx): 그 메시지를 받고 컷인을 띄우는가 — 소스 정적 확인.
 */
import { readFileSync } from "node:fs";
import { PERSONAS, PersonaAgent, runMatch, SEATS } from "../shape/h2.js";
import type { PlayerId } from "@majak/core";

// ── ① 서버: 실제 대국에서 actionFx가 나가는지 ──
interface Rec { to: PlayerId; player: PlayerId; actionType: string }
const recs: Rec[] = [];
const specRecs: Rec[] = [];
(PersonaAgent.prototype as unknown as { notify: (m: unknown) => void }).notify = function (
  this: PersonaAgent,
  msg: unknown,
): void {
  const m = msg as { type?: string; player?: PlayerId; actionType?: string };
  if (m.type === "actionFx") {
    recs.push({ to: this.id, player: m.player as PlayerId, actionType: m.actionType as string });
  }
};

const N = Number(process.argv[2] ?? 4);
const INFO = ["tenpai_scan", "danger_sense", "xray_hand", "triple_peek"];
for (let i = 0; i < N; i++) {
  const preset = Object.fromEntries(SEATS.map((s) => [s, INFO])) as Record<PlayerId, string[]>;
  const personas = Object.fromEntries(SEATS.map((s) => [s, PERSONAS["masher"]!])) as never;
  await runMatch({ seed: 9100 + i * 13, mode: "tonpuu", preset, personas, noDraft: true, timeoutMs: 180_000 });
}

const byType = new Map<string, { fired: number; recipients: Set<string> }>();
for (const r of recs) {
  const e = byType.get(r.actionType) ?? { fired: 0, recipients: new Set<string>() };
  e.fired += 1;
  e.recipients.add(r.to === r.player ? "본인" : "타인");
  byType.set(r.actionType, e);
}
console.log(`=== ① 서버가 보낸 actionFx (${N}판 · 총 ${recs.length}건) ===`);
for (const [t, e] of [...byType].sort((a, b) => b[1].fired - a[1].fired)) {
  console.log(`  ${t.padEnd(22)} ${String(e.fired).padStart(4)}건  수신자=${[...e.recipients].join("+")}`);
}
if (byType.size === 0) console.log("  (한 건도 없다)");
void specRecs;

// ── ② 클라: 그 메시지로 컷인을 띄우는가 (소스 정적 확인) ──
const CTRL = readFileSync("packages/core/src/match/HanchanController.ts", "utf8");
const APP = readFileSync("packages/client/src/App.tsx", "utf8");
const setBody = (name: string): string => {
  const at = CTRL.indexOf(`const ${name} = new Set([`);
  if (at < 0) throw new Error(`${name} 없음`);
  return CTRL.slice(at, CTRL.indexOf("]);", at));
};
const SILENT = setBody("FX_SILENT_ACTION_TYPES");
const PRIVATE = setBody("FX_PRIVATE_ACTION_TYPES");
// AUG_EVENTS 표의 키 = 전용 컷인이 따로 있는 증강 (actionFx 컷인은 여기서 return)
const augEvAt = APP.indexOf("const AUG_EVENTS: Record<");
const augEvBody = APP.slice(augEvAt, APP.indexOf("\n};", augEvAt));

console.log("\n=== ② 클라 컷인 경로 (App.tsx:4075 actionFx 핸들러) ===");
for (const t of ["tenpai_scan_use", "danger_sense_use", "xray_reveal", "triple_peek_use", "spy_mark", "free_discard", "future_arm"]) {
  const silent = SILENT.includes(`"${t}"`);
  const priv = PRIVATE.includes(`"${t}"`);
  const augId = (APP.match(new RegExp(`\\n\\s+${t}:\\s*"([a-z0-9_]+)"`)) ?? [])[1] ?? "?";
  const dedicated = augEvBody.includes(`augId: "${augId}"`);
  const verdict = silent
    ? "컷인 없음 (서버가 안 보냄)"
    : dedicated
      ? "전용 사건 컷인이 대신 뜬다 (actionFx는 무시)"
      : "showCutIn 1600ms 컷인이 뜬다";
  console.log(
    `  ${t.padEnd(18)} silent=${String(silent).padEnd(5)} private=${String(priv).padEnd(5)} augId=${(augId).padEnd(18)} 전용컷인=${String(dedicated).padEnd(5)} → ${verdict}`,
  );
}
// showCutIn 지속시간 확인
const cut = APP.match(/showCutIn\(label, "augment", `\$\{who\} — 증강 발동`, (\d+)/);
console.log(`  actionFx → showCutIn 지속: ${cut?.[1] ?? "?"}ms`);
