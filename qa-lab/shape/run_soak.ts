import { soak, SHAPE } from "./soak.js";
import type { WinRec } from "./soak.js";

const AUX = new Set(["bottom_flow", "bottom_letgo"]);
const CUSTOM = new Set([
  "tanyao_break", "mixed_nine_gates", "bottom_flow", "bottom_letgo",
  "wind_lineage_seat", "wind_lineage_prevalent", "wind_lineage_dragon",
]);

const n = Number(process.argv[2] ?? 30);
const off = Number(process.argv[3] ?? 0);
const mode = (process.argv[4] ?? "hanchan") as "hanchan" | "tonpuu";

const anomalies: string[] = [];
function checkWin(w: WinRec): void {
  const ids = new Set(w.yaku.map((y) => y.id));
  const real = w.yaku.filter((y) => !AUX.has(y.id));
  // A) 실역이 0인데 yakuless 표시가 없다 = 역 없이 화료가 통과됐는데 기록도 없다
  if (real.length === 0 && w.ym === 0 && w.yakuless !== true) {
    anomalies.push(`NO_REAL_YAKU seed=${w.seed} ${w.round} ${w.winner} augs=${w.augs} yaku=${JSON.stringify(w.yaku)}`);
  }
  // B) 보조역만으로 화료 (bottom_yaku 설명 위반)
  if (real.length === 0 && w.yaku.length > 0 && w.ym === 0 && w.yakuless !== true) {
    anomalies.push(`AUX_ONLY seed=${w.seed} ${w.round} ${w.winner} ${JSON.stringify(w.yaku)}`);
  }
  // C) 커스텀 역이 그 증강 미보유자에게 붙었다
  for (const y of w.yaku) {
    if (!CUSTOM.has(y.id)) continue;
    const owner =
      y.id === "tanyao_break" ? "tanyao_break"
      : y.id === "mixed_nine_gates" ? "mixed_nine_gates"
      : y.id.startsWith("bottom_") ? "bottom_yaku"
      : "wind_lineage";
    if (!w.augs.includes(owner)) {
      anomalies.push(`YAKU_LEAK seed=${w.seed} ${w.round} ${w.winner} yaku=${y.id} augs=${w.augs}`);
    }
  }
  // D) 치또이 + 국사 동시 (형태 모순)
  if (ids.has("chiitoitsu") && [...ids].some((i) => i.includes("kokushi"))) {
    anomalies.push(`SHAPE_CONFLICT seed=${w.seed} ${w.round} ${JSON.stringify(w.yaku)}`);
  }
  // E) 판수 음수/과다
  if (w.han < 0 || w.han > 60) anomalies.push(`HAN_ODD seed=${w.seed} han=${w.han} ${JSON.stringify(w.yaku)}`);
  if (w.fu < 20 && w.ym === 0 && !ids.has("chiitoitsu")) anomalies.push(`FU_LOW seed=${w.seed} fu=${w.fu} ${JSON.stringify(w.yaku)}`);
  // F) 역 목록 합 != yakuHan (역만 제외)
  if (w.ym === 0) {
    const sum = w.yaku.reduce((a, y) => a + y.han, 0);
    if (sum > w.han) anomalies.push(`HAN_SUM seed=${w.seed} sum=${sum} han=${w.han} ${JSON.stringify(w.yaku)}`);
  }
  // G) tanyao_break + 표준 탕야오 동시
  if (ids.has("tanyao_break") && ids.has("tanyao")) {
    anomalies.push(`TANYAO_DOUBLE seed=${w.seed} ${JSON.stringify(w.yaku)}`);
  }
}

const seeds = Array.from({ length: n }, (_, i) => off + i + 1);
const r = await soak({ seeds, mode, personaNames: ["masher", "riichiRusher", "caller", "chaos"], onWin: checkWin });
console.log(`matches=${r.matches} mode=${mode} wins=${r.wins.length}`);
console.log(`crashes=${r.crashes.length} effErrs=${r.effErrs.length} viols=${r.viols.length} anomalies=${anomalies.length}`);
for (const c of r.crashes.slice(0, 5)) console.log("CRASH:", c);
const eu = new Map<string, number>();
for (const e of r.effErrs) { const k = e.replace(/seed=\d+ /, "").slice(0, 200); eu.set(k, (eu.get(k) ?? 0) + 1); }
for (const [k, v] of eu) console.log(`EFFERR x${v}: ${k}`);
const vu = new Map<string, number>();
for (const v of r.viols) { const k = v.replace(/seed=\d+ /, "").replace(/tile \d+/, "tile N").slice(0, 160); vu.set(k, (vu.get(k) ?? 0) + 1); }
for (const [k, v] of [...vu].slice(0, 20)) console.log(`VIOL x${v}: ${k}`);
const au = new Map<string, number>();
for (const a of anomalies) { const k = a.split(" ")[0] as string; au.set(k, (au.get(k) ?? 0) + 1); }
for (const [k, v] of au) console.log(`ANOM ${k} x${v}`);
for (const a of anomalies.slice(0, 25)) console.log("  ", a);
// 커스텀 역 커버리지
const cov = new Map<string, number>();
for (const w of r.wins) for (const y of w.yaku) cov.set(y.id, (cov.get(y.id) ?? 0) + 1);
console.log("custom yaku hits:", [...cov].filter(([k]) => CUSTOM.has(k)).map(([k, v]) => `${k}:${v}`).join(" ") || "(none)");
console.log("SHAPE list:", SHAPE.length);
