/**
 * 후로 계열 집중 시나리오 — 강제 배패로 깡·후로 경로를 매 국 밟게 만든다.
 * 사용: tsx qa-lab/defcall/callscenes.ts <scene> <from> <to>
 *   scene: snake | void | bloom | dissolve | kokushi | bluffsilent | omni
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runDefcall } from "./run.js";
import { makeChecks } from "./checks.js";

const QUAD = (k: string): string[] => [k, k, k, k];
// 3456 연속 + 나머지
const RUNQUAD = [
  "sou3", "sou4", "sou5", "sou6",
  "man2", "man3", "man4",
  "pin7", "pin8", "pin9",
  "dragon1", "dragon1", "dragon1",
];
const FOURKAN = [
  ...QUAD("man1"), ...QUAD("pin2"), ...QUAD("sou3"), "wind1",
];
const ORPHANS = [
  "man1", "man1", "man9", "pin1", "pin1", "pin9", "sou1", "sou9",
  "wind1", "wind2", "wind3", "dragon1", "dragon2",
];
const PONFOOD = [
  "dragon1", "dragon1", "dragon2", "dragon2", "wind1", "wind1",
  "man1", "man2", "man3", "pin4", "pin5", "pin6", "sou7",
];
const SINGLES = [
  "dragon1", "dragon2", "dragon3", "wind1", "wind2", "wind3", "wind4",
  "man1", "man5", "pin1", "pin5", "sou1", "sou5",
];

type Scene = { preset: Record<PlayerId, string[]>; hands?: any; personas: any };

const F = PERSONAS.folder, C = PERSONAS.caller, M = PERSONAS.masher, R = PERSONAS.riichiRusher;

const SCENES: Record<string, Scene> = {
  // 장사진: 4연속을 매 국 손에 쥔다
  snake: { preset: { p0: ["snake_kan"], p1: ["snake_kan"], p2: [], p3: [] },
    hands: { p0: RUNQUAD, p1: RUNQUAD }, personas: { p0: M, p1: C, p2: F, p3: C } },
  // 성립하지 않는 깡: 상대가 깡을 남발하게 만든다
  void: { preset: { p0: ["void_kan"], p1: [], p2: [], p3: [] },
    hands: { p1: FOURKAN, p2: FOURKAN, p3: FOURKAN }, personas: { p0: F, p1: M, p2: M, p3: M } },
  // 절벽 위에 피어난 꽃: 한 국에 깡 두 번
  bloom: { preset: { p0: ["cliff_bloom"], p1: ["cliff_bloom"], p2: [], p3: [] },
    hands: { p0: FOURKAN, p1: FOURKAN }, personas: { p0: M, p1: M, p2: C, p3: F } },
  // 파혼: 울보 + 후로 해체
  dissolve: { preset: { p0: ["meld_dissolve"], p1: ["meld_dissolve"], p2: [], p3: [] },
    hands: { p2: PONFOOD, p3: PONFOOD }, personas: { p0: C, p1: C, p2: M, p3: M } },
  // 우는 국사무쌍
  kokushi: { preset: { p0: ["open_kokushi"], p1: [], p2: [], p3: [] },
    hands: { p0: ORPHANS, p1: ORPHANS }, personas: { p0: C, p1: M, p2: C, p3: C } },
  // 허장성세 + 묵계 (한 장짜리 패로 퐁)
  bluffsilent: { preset: { p0: ["bluff_pretense"], p1: ["silent_pact"], p2: ["bluff_pretense", "silent_pact"], p3: [] },
    hands: { p0: SINGLES, p1: PONFOOD, p2: SINGLES }, personas: { p0: C, p1: C, p2: C, p3: M } },
  // 사방치기
  omni: { preset: { p0: ["omni_chi"], p1: ["omni_chi"], p2: [], p3: [] },
    personas: { p0: C, p1: C, p2: C, p3: M } },
  // 승부수 — 리치 돌격 4인
  laststand: { preset: { p0: ["last_stand"], p1: ["last_stand"], p2: [], p3: [] },
    personas: { p0: R, p1: R, p2: R, p3: R } },
  // 방어 3종 vs 리치 돌격
  defense: { preset: { p0: ["invincible"], p1: ["no_ron_pact"], p2: ["yakuman_shield", "always_tenpai"], p3: ["die_hard"] },
    personas: { p0: R, p1: R, p2: R, p3: M } },
  // 후로 증강 혼합 (묵계 → 파혼, 국사 → 파혼 …)
  mix: { preset: { p0: ["silent_pact", "meld_dissolve"], p1: ["bluff_pretense", "meld_dissolve"], p2: ["open_kokushi", "omni_chi"], p3: ["snake_kan", "cliff_bloom"] },
    personas: { p0: C, p1: C, p2: C, p3: C } },
};

const scene = process.argv[2] ?? "snake";
const from = Number(process.argv[3] ?? 1);
const to = Number(process.argv[4] ?? 10);
const gmode = (process.argv[5] === 'tonpuu' ? 'tonpuu' : 'hanchan') as 'hanchan' | 'tonpuu';
const sc = SCENES[scene];
if (sc === undefined) throw new Error(`unknown scene ${scene}`);

const agg: Record<string, number> = {};
const seen = new Set<string>();
let rounds = 0;
for (let seed = from; seed <= to; seed++) {
  const chk = makeChecks(sc.preset, gmode);
  const r = await runDefcall({
    seed, mode: gmode, preset: sc.preset, personas: sc.personas, noDraft: true,
    ...(sc.hands !== undefined ? { presetHands: sc.hands } : {}),
    onState: chk.onState, onEvent: chk.onEvent,
  });
  rounds += r.rounds;
  for (const [k, v] of Object.entries(chk.stats)) agg[k] = (agg[k] ?? 0) + v;
  if (r.crash !== undefined) console.log(`CRASH seed=${seed} :: ${r.crash.split("\n").slice(0, 5).join(" | ")}`);
  for (const ee of r.effectErrors.slice(0, 3)) {
    const k = `EFF ${ee.slice(0, 110)}`;
    if (!seen.has(k)) { seen.add(k); console.log(`${k}  seed=${seed}`); }
  }
  for (const v of r.violations) {
    agg[`viol:${v.kind}`] = (agg[`viol:${v.kind}`] ?? 0) + 1;
    const k = v.kind + v.detail.slice(0, 30);
    if (!seen.has(k)) { seen.add(k); console.log(`VIOL ${v.kind} seed=${seed} seat=${v.seat ?? "-"} r=${v.round} :: ${v.detail.slice(0, 260)}`); }
  }
}
console.log(`\n=== scene=${scene} seeds ${from}..${to}: rounds=${rounds}`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(agg).sort())));
