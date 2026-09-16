/**
 * B-4 약속 검사기 ③ — 약속(promises.json) vs 실측(out/*.jsonl) → report.md
 *
 *   npx tsx qa-lab/round5/promise/judge.ts [--in=out/a.jsonl,out/b.jsonl] [--out=report.md]
 *                                          [--promises=other.json]
 *   (--in 생략 시 out/promise-*.jsonl 전부, 단 파일명에 -dev 가 든 것은 뺀다.
 *    --promises 는 자기 검증용 — 약속을 바꾼 사본으로 같은 실측을 다시 판정한다, selfcheck.ts 참고)
 *
 * 판정 (docs/55 §4 B-4):
 *  1. 초과 발동      uses_match / uses_round 약속보다 많이 소모 — 잔량 채널(decrements)이 있으면
 *                    그것을, 없으면 액션 픽 수를 쓴다(다단계 액션이면 픽 수가 부풀므로 «의심»).
 *  2. 쿨다운 위반    `<id>:usedSeq` 변화열의 간격 < 약속 N(모드별). usedSeq 가 없는 카드는
 *                    픽의 국 인덱스로 재고 «의심».
 *  3. 모드 스케일    잔량 채널 total ≠ 약속(모드별) · 쿨다운 채널 최댓값 ≠ 약속 N(모드별).
 *  4. 수치 불일치    +N판(extraHanBy·augPoints.han ∉ 약속 집합) · 최소 만관(발동 국 화료 총액 <
 *                    만관) · N배(augPoints 비율이 약속 배수 어느 것과도 ±0.06 밖 → «의심»).
 *  5. 조건 위반      «리치 중 불가» 인데 리치 중 발동 · «첫 순» 인데 버림 뒤 발동(«울기 전»까지 약속한 카드는 멘쯔 뒤도).
 *  6. 공개 누설      «상대에게 공개되지 않는다» 인데 상대 뷰에 카드 채널. pill 사본
 *                    (`seat:p0:uses|cooldown*`)은 계획 P-1 판단 대기라 따로 «알려짐».
 *  7. 0회 발동       그 모드의 전 시드에서 한 번도 발동·흔적 없음 (조건 좁음 목록).
 *  8. 크래시·훅 예외·소프트락·불변식 — 무조건 결함.
 *
 * «알려짐» 태그 — 계획 §8 재보고 금지·판단 대기 목록과 겹치는 판정에 붙인다(지우지 않는다).
 * mutant 행(--mutant 로 만든 결함 주입)은 본 판정에서 빼고 «자기 검증» 절에 따로 적는다.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CardPromises, Pledge, PromisesFile } from "./parse.js";
import type { Mode, Row } from "./run.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");

type Severity = "확정" | "의심" | "관찰";
type FindKind =
  | "EXCEED_MATCH" | "EXCEED_ROUND" | "COOLDOWN_VIOLATION" | "SCALE_MISMATCH"
  | "VALUE_MISMATCH" | "COND_RIICHI" | "COND_FIRST_TURN" | "LEAK_PUBLIC" | "LEAK_PILL"
  | "ZERO_ACTIVATION" | "CRASH" | "EFFECT_ERROR" | "SOFTLOCK" | "INVARIANT" | "USES_CHANNEL";

export interface Finding {
  kind: FindKind;
  severity: Severity;
  card: string;
  mode: Mode;
  seed: number | null;
  detail: string;
  known?: string;
  repro?: string;
}

/* ───────────── §8 재보고 금지 · 판단 대기 ───────────── */

/** core standard 4종 — synergy3 계측기(wrapCatalog)가 감싸지 못한다(코어 레지스트리가 등록) */
const STANDARD_IDS = new Set(["iron_wall", "open_riichi", "yakuless_win", "discard_recall"]);

/** scaledCooldown 미적용 15종 (docs/55 P-2) — «N국에 1회» 고정이 문구와는 일치한다 */
const P2_FIXED_COOLDOWN = new Set([
  "big_hand", "dead_wall_master", "dora_afterimage", "frame_up", "even_world", "no_retreat",
  "palm_flip", "hourglass", "sign_flip", "picky_eater", "regret", "soul_strike", "triple_peek",
  "discard_lock", "pseudo_dealer",
]);

/** 문구가 «버리지도 울지도 전»·«치·퐁 직후 불가»까지 약속해 멘쯔 수도 첫 순 판정에 들어가는 카드 */
const FIRST_TURN_NO_MELD = new Set(["big_hand", "rank_gate", "full_hand_swap", "seat_swap", "table_flip"]);

function knownTag(f: Omit<Finding, "known">): string | undefined {
  if (f.kind === "LEAK_PILL") return "알려짐 · 판단 대기 P-1 (#454 pill 전원 공개 — 문구와 모순, 사용자 판단)";
  if (f.kind === "SCALE_MISMATCH" && P2_FIXED_COOLDOWN.has(f.card)) return "알려짐 · 판단 대기 P-2 (scaledCooldown 미적용 15종)";
  if (f.kind === "COND_RIICHI" && (f.card === "tile_dyeing" || f.card === "alchemist")) return "알려짐 · docs/49 B-2 (#454 리치 중 쯔모패 한 장만)";
  return undefined;
}

/* ───────────── 입력 ───────────── */

export function loadRows(files: string[]): Row[] {
  const rows: Row[] = [];
  for (const f of files) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try { rows.push(JSON.parse(line) as Row); } catch { /* 깨진 줄 무시 */ }
    }
  }
  return rows;
}

const expectedByMode = (p: { tonpuu: number; hanchan: number }, mode: Mode): number =>
  mode === "tonpuu" ? p.tonpuu : p.hanchan;

const repro = (r: Row): string =>
  `npx tsx qa-lab/round5/promise/run.ts 0 1 --cards=${r.card} --modes=${r.mode} --seed=${r.seed}` +
  (r.personas[0] === "bot" ? " --p0=bot" : "") + (r.personas[1] === "bot" ? " --opp=bot" : "") +
  (r.mutant === null ? "" : ` --mutant=${r.mutant}`);

/* ───────────── 판정 ───────────── */

export function judgeRows(promises: PromisesFile, rows: Row[]): Finding[] {
  const out: Finding[] = [];
  const byCard = new Map(promises.cards.map((c) => [c.id, c]));
  const push = (f: Omit<Finding, "known">): void => {
    const known = knownTag(f);
    out.push(known === undefined ? f : { ...f, known });
  };

  // 8. 판 단위 결함
  for (const r of rows) {
    if (r.crash !== null) push({ kind: "CRASH", severity: "확정", card: r.card, mode: r.mode, seed: r.seed, detail: r.crash.split("\n")[0] ?? "", repro: repro(r) });
    if (r.timeout) push({ kind: "SOFTLOCK", severity: "확정", card: r.card, mode: r.mode, seed: r.seed, detail: `timeout (rounds=${r.rounds})`, repro: repro(r) });
    for (const e of r.effectErrors.slice(0, 3)) push({ kind: "EFFECT_ERROR", severity: "확정", card: r.card, mode: r.mode, seed: r.seed, detail: e.slice(0, 200), repro: repro(r) });
    for (const v of r.violations.filter((x) => !x.startsWith("SOFTLOCK_TIMEOUT") && !x.startsWith("SCORE_DRIFT")).slice(0, 3)) {
      push({ kind: "INVARIANT", severity: "확정", card: r.card, mode: r.mode, seed: r.seed, detail: v, repro: repro(r) });
    }
    if (r.uses.negative || r.uses.overTotal) {
      push({ kind: "USES_CHANNEL", severity: "확정", card: r.card, mode: r.mode, seed: r.seed, detail: `uses 채널 left ${r.uses.negative ? "< 0" : "> total"} (min=${r.uses.minLeft} max=${r.uses.maxLeft} total=${r.uses.totals.join("/")})`, repro: repro(r) });
    }
  }

  // 1~6. 약속별
  for (const r of rows) {
    const c = byCard.get(r.card);
    if (c === undefined) continue;
    const multiStep = r.actionTypes.length > 1;
    for (const p of c.pledges) judgePledge(c, p, r, multiStep, push);
  }

  // 7. 0회 발동 — 카드×모드, 전 시드 합산
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.card}|${r.mode}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, rs] of groups) {
    const [card, mode] = k.split("|") as [string, Mode];
    const fires = rs.reduce((n, r) => n + r.fires.count, 0);
    const hasAction = rs.some((r) => r.actionTypes.length > 0 || (r.metrics?.optionOffer ?? 0) > 0);
    const touched = rs.some((r) => r.touched);
    const emitted = rs.some((r) => (r.metrics?.reactEmit ?? 0) > 0 || (r.metrics?.interChange ?? 0) > 0);
    const offered = rs.reduce((n, r) => n + (r.metrics?.optionOffer ?? 0), 0);
    if (hasAction && fires === 0) {
      push({ kind: "ZERO_ACTIVATION", severity: "관찰", card, mode, seed: null, detail: `액션형인데 ${rs.length}판 동안 발동 0회 (후보 제시 ${offered}회, 흔적 ${touched ? "있음" : "없음"}) — 발동 조건이 좁거나 증강광이 못 밟는 경로`, repro: repro(rs[0] as Row) });
    } else if (!hasAction && !touched && !emitted) {
      const std = STANDARD_IDS.has(card);
      push({ kind: "ZERO_ACTIVATION", severity: "관찰", card, mode, seed: null, detail: `자동형인데 ${rs.length}판 동안 상태 흔적·훅 방출이 전혀 없음${std ? " — core standard 카드는 훅 계측 밖(augmentData 흔적·액션 픽만 본다)이라 «흔적 없음»이 곧 «안 돌았다»는 아니다" : ""}`, repro: repro(rs[0] as Row) });
    }
  }
  return out;
}

function judgePledge(
  c: CardPromises,
  p: Pledge,
  r: Row,
  multiStep: boolean,
  push: (f: Omit<Finding, "known">) => void,
): void {
  const base = { card: r.card, mode: r.mode, seed: r.seed, repro: repro(r) };
  const labeled = "label" in p && p.label !== undefined;
  switch (p.kind) {
    case "uses_match": {
      const exp = expectedByMode(p, r.mode);
      // «반장전은 게임 내 1회 재장전» — 동풍전엔 그 액션이 아예 없어야 한다 (라벨과 무관)
      if (exp === 0) {
        if (r.fires.count > 0) push({ ...base, kind: "EXCEED_MATCH", severity: "확정", detail: `${r.mode}에는 «${p.src}»가 없어야 하는데 ${r.fires.count}회 발동 (${Object.keys(r.fires.types).join(",")})` });
        break;
      }
      const used = r.uses.present && r.uses.scopes.includes("match") ? r.uses.decrements : null;
      const n = used ?? r.fires.count;
      if (n > exp) {
        push({ ...base, kind: "EXCEED_MATCH", severity: labeled ? "관찰" : used !== null || !multiStep ? "확정" : "의심", detail: `«${p.src}» 기대 ${exp} < 실측 ${n} (${used !== null ? "잔량 채널 소모" : `액션 픽${multiStep ? ", 다단계 액션 " + r.actionTypes.join("/") : ""}`}; 국별 ${JSON.stringify(r.fires.perRound)})` });
      }
      if (!labeled && r.uses.present && r.uses.scopes.includes("match") && !r.uses.totals.includes(exp)) {
        push({ ...base, kind: "SCALE_MISMATCH", severity: "확정", detail: `«${p.src}» 잔량 채널 total=${r.uses.totals.join("/")} ≠ ${r.mode} 기대 ${exp}` });
      }
      break;
    }
    case "uses_round": {
      const decs = r.uses.present && r.uses.scopes.includes("round") ? Object.values(r.uses.decByRound) : null;
      const maxRound = decs !== null && decs.length > 0 ? Math.max(...decs) : r.fires.maxPerRound;
      if (maxRound > p.perRound) {
        push({ ...base, kind: "EXCEED_ROUND", severity: labeled ? "관찰" : decs !== null || !multiStep ? "확정" : "의심", detail: `«${p.src}» 국당 기대 ${p.perRound} < 실측 최대 ${maxRound} (${decs !== null ? "잔량 채널" : `액션 픽${multiStep ? ", 다단계 " + r.actionTypes.join("/") : ""}`}; 국별 ${JSON.stringify(decs !== null ? r.uses.decByRound : r.fires.perRound)})` });
      }
      if (!labeled && r.uses.present && r.uses.scopes.includes("round") && !r.uses.totals.includes(p.perRound)) {
        push({ ...base, kind: "SCALE_MISMATCH", severity: "확정", detail: `«${p.src}» 잔량 채널 total=${r.uses.totals.join("/")} ≠ 기대 ${p.perRound}` });
      }
      break;
    }
    case "cooldown_rounds": {
      const exp = expectedByMode(p, r.mode);
      if (r.seq.fireSeqs.length >= 2) {
        const bad = r.seq.intervals.filter((d) => d < exp);
        if (bad.length > 0) push({ ...base, kind: "COOLDOWN_VIOLATION", severity: labeled ? "관찰" : "확정", detail: `«${p.src}» ${r.mode} 기대 간격 ≥${exp}, usedSeq 열 [${r.seq.fireSeqs.join(",")}] 간격 [${r.seq.intervals.join(",")}]` });
      } else if (r.fires.count >= 2 && r.seq.fireSeqs.length === 0) {
        const rounds = [...new Set(r.fires.list.filter((f) => f.rejected !== true).map((f) => f.round))].sort((a, b) => a - b);
        const iv: number[] = [];
        for (let i = 1; i < rounds.length; i++) iv.push((rounds[i] as number) - (rounds[i - 1] as number));
        if (iv.some((d) => d < exp)) push({ ...base, kind: "COOLDOWN_VIOLATION", severity: "의심", detail: `«${p.src}» ${r.mode} 기대 간격 ≥${exp}, 발동 국 [${rounds.join(",")}] (usedSeq 키 없음 — 픽 기준${multiStep ? ", 다단계 " + r.actionTypes.join("/") : ""})` });
      }
      if (!labeled && r.seq.viewCooldownMax !== null && r.seq.viewCooldownMax !== exp) {
        push({ ...base, kind: "SCALE_MISMATCH", severity: "확정", detail: `«${p.src}» 쿨다운 채널 최댓값 ${r.seq.viewCooldownMax} ≠ ${r.mode} 기대 ${exp}` });
      }
      if (P2_FIXED_COOLDOWN.has(r.card) && p.tonpuu === p.hanchan && r.mode === "hanchan" && r.seq.intervals.length > 0) {
        push({ ...base, kind: "SCALE_MISMATCH", severity: "관찰", detail: `«${p.src}» 반장전 간격 [${r.seq.intervals.join(",")}] — 문구(고정 ${p.hanchan}국)와 일치, scaledCooldown 미적용` });
      }
      break;
    }
    case "cooldown_turns":
      // 순 단위 간격은 이 도구로 재지 않는다 (채널 최댓값만 기록)
      break;
    case "han_bonus": {
      const pledged = new Set(c.pledges.filter((q): q is Extract<Pledge, { kind: "han_bonus" }> => q.kind === "han_bonus").map((q) => q.han));
      for (const s of r.settles) {
        if (!s.p0Won) continue;
        const seen = [...s.extraHan, ...s.augPoints.map((a) => a.han).filter((h): h is number => h !== null && h > 0)];
        for (const h of seen) {
          if (!pledged.has(h)) push({ ...base, kind: "VALUE_MISMATCH", severity: "의심", detail: `«${p.src}» 약속 판수 {${[...pledged].join(",")}} 밖의 실측 +${h}판 (국 ${s.rk}, han=${s.han}, ${s.winType}) — 누적형(교환 횟수·안깡 묶음)이면 정상` });
        }
      }
      break;
    }
    case "mangan_floor": {
      for (const s of r.settles) {
        if (!s.p0Won || !s.firedThisRound) continue;
        const floor = s.p0Dealer ? 12000 : 8000;
        if (s.delta < floor) push({ ...base, kind: "VALUE_MISMATCH", severity: "확정", detail: `«최소 만관» 발동 국 ${s.rk} 화료 총액 ${s.delta} < ${floor} (${s.p0Dealer ? "오야" : "자"}, han=${s.han}, info.points=${s.infoPoints}, augPoints=${JSON.stringify(s.augPoints)})` });
      }
      break;
    }
    case "multiplier": {
      const factors = c.pledges.filter((q): q is Extract<Pledge, { kind: "multiplier" }> => q.kind === "multiplier").map((q) => q.factor);
      if (p.factor !== factors[0]) break; // 카드당 한 번만
      for (const s of r.settles) {
        if (!s.p0Won || s.infoPoints === null || s.infoPoints <= 0) continue;
        for (const a of s.augPoints) {
          if (a.han !== null || a.points === 0) continue;
          const ratio = (s.infoPoints + a.points) / s.infoPoints;
          if (!factors.some((f) => Math.abs(f - ratio) <= 0.06)) {
            push({ ...base, kind: "VALUE_MISMATCH", severity: "의심", detail: `«N배» 약속 {${factors.join(",")}} 밖의 실측 배율 ${ratio.toFixed(2)} (국 ${s.rk}, info.points=${s.infoPoints}, augPoints=${a.points}) — 본장·공탁·다른 산식이면 정상` });
          }
        }
      }
      break;
    }
    case "cond": {
      if (p.cond === "no_riichi" && r.fires.whileRiichi > 0) {
        push({ ...base, kind: "COND_RIICHI", severity: "확정", detail: `«${p.src}» 인데 리치 중 발동 ${r.fires.whileRiichi}회 (${r.fires.list.filter((f) => f.riichi && f.rejected !== true).map((f) => `${f.type}@${f.rk}`).slice(0, 4).join(", ")})` });
      }
      if (p.cond === "first_turn") {
        // «내 첫 순» 규약 = 이 국에 내가 아직 한 장도 버리지 않은 내 순(discardCount === 0).
        // 첫 타패 전에 남의 패를 울어 멘쯔가 생긴 순도 첫 순이다 — 멘쯔 수는 문구가
        // «울기 전»·«치·퐁 직후 불가»까지 약속한 카드에만 센다
        // (packages/content/test/first_turn_after_call_0916.test.ts, 2026-09-16 판정).
        const meldsCount = FIRST_TURN_NO_MELD.has(c.id);
        const bad = r.fires.list.filter((f) => f.rejected !== true && (f.discardCount > 0 || (meldsCount && f.melds > 0)));
        const ex = bad.slice(0, 4);
        if (bad.length > 0) push({ ...base, kind: "COND_FIRST_TURN", severity: multiStep ? "의심" : "확정", detail: `«${p.src}» 인데 ${meldsCount ? "버림/멘쯔" : "버림"} 뒤 발동 ${bad.length}회 (${ex.map((f) => `${f.type}@${f.rk} d=${f.discardCount} m=${f.melds}`).join(", ")})${multiStep ? " — 다단계 액션의 후속 단계면 정상" : ""}` });
      }
      if (p.cond === "hidden_from_opponents") {
        const mixed = c.pledges.some((q) => q.kind === "cond" && q.cond === "public");
        for (const l of r.leaks.public) {
          push({ ...base, kind: "LEAK_PUBLIC", severity: mixed ? "의심" : "확정", detail: `«${p.src}» 인데 상대 뷰 augmentView[${l.key}]=${l.sample} (국 ${l.round}, ${l.afterFire ? "발동 뒤" : "발동 전"})${mixed ? " — 문구에 «공개된다»도 있어 범위 확인 필요" : ""}` });
        }
        for (const l of r.leaks.pill) {
          push({ ...base, kind: "LEAK_PILL", severity: "관찰", detail: `«${p.src}» 인데 상대 뷰에 pill 사본 ${l.key}=${l.sample} (국 ${l.round})` });
        }
      }
      break;
    }
    default:
      break;
  }
}

/* ───────────── 보고서 ───────────── */

const SECTIONS: { title: string; kinds: FindKind[] }[] = [
  { title: "1. 초과 발동 (uses > 약속)", kinds: ["EXCEED_MATCH", "EXCEED_ROUND"] },
  { title: "2. 쿨다운 위반 (간격 < N)", kinds: ["COOLDOWN_VIOLATION"] },
  { title: "3. 모드 스케일 불일치 (채널 값 ≠ 모드별 약속)", kinds: ["SCALE_MISMATCH"] },
  { title: "4. 수치 불일치 (+N판 · N배 · 최소 만관)", kinds: ["VALUE_MISMATCH"] },
  { title: "5. 조건 위반 (리치 중 · 첫 순)", kinds: ["COND_RIICHI", "COND_FIRST_TURN"] },
  { title: "6. 공개 누설 («상대에게 공개되지 않는다»)", kinds: ["LEAK_PUBLIC", "LEAK_PILL"] },
  { title: "7. 0회 발동 (조건 좁음 목록)", kinds: ["ZERO_ACTIVATION"] },
  { title: "8. 크래시 · 훅 예외 · 소프트락 · 불변식 · 잔량 채널", kinds: ["CRASH", "EFFECT_ERROR", "SOFTLOCK", "INVARIANT", "USES_CHANNEL"] },
];

/** 같은 (kind, card, mode, detail 앞부분) 은 시드만 모아 한 줄로 */
function dedupe(fs: Finding[]): (Finding & { seeds: number[] })[] {
  const m = new Map<string, Finding & { seeds: number[] }>();
  for (const f of fs) {
    const key = `${f.kind}|${f.card}|${f.mode}|${f.severity}|${f.detail.slice(0, 48)}`;
    const cur = m.get(key);
    if (cur === undefined) m.set(key, { ...f, seeds: f.seed === null ? [] : [f.seed] });
    else if (f.seed !== null && !cur.seeds.includes(f.seed)) cur.seeds.push(f.seed);
  }
  return [...m.values()];
}

function line(f: Finding & { seeds: number[] }): string {
  const seeds = f.seeds.length === 0 ? "" : ` seed=${f.seeds.slice(0, 6).join(",")}${f.seeds.length > 6 ? "…" : ""}`;
  const known = f.known === undefined ? "" : ` 〔${f.known}〕`;
  const rp = f.repro === undefined ? "" : `\n  - 재현: \`${f.repro}\``;
  return `- **${f.card}** [${f.mode}]${seeds} · ${f.severity}${known} — ${f.detail}${rp}`;
}

function summaryTable(promises: PromisesFile, rows: Row[]): string {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(`${r.card}|${r.mode}`, [...(groups.get(`${r.card}|${r.mode}`) ?? []), r]);
  const lines = [
    "| 카드 | 모드 | 판 | 발동(합/최소~최대) | 국당 최대 | 쿨다운 간격(최소) | uses 채널 | +판 실측 | 상대 뷰 채널 | 흔적 |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const c of promises.cards) for (const mode of ["hanchan", "tonpuu"] as Mode[]) {
    const rs = groups.get(`${c.id}|${mode}`);
    if (rs === undefined) continue;
    const fires = rs.map((r) => r.fires.count);
    const ivs = rs.flatMap((r) => r.seq.intervals);
    const u = rs.find((r) => r.uses.present);
    const hans = [...new Set(rs.flatMap((r) => r.settles.filter((s) => s.p0Won).flatMap((s) => [...s.extraHan, ...s.augPoints.map((a) => a.han ?? -1).filter((h) => h > 0)])))];
    const pub = [...new Set(rs.flatMap((r) => r.leaks.public.map((l) => l.key)))];
    const pill = rs.some((r) => r.leaks.pill.length > 0);
    lines.push(
      `| ${c.id} | ${mode} | ${rs.length} | ${fires.reduce((a, b) => a + b, 0)} / ${Math.min(...fires)}~${Math.max(...fires)} | ${Math.max(...rs.map((r) => r.fires.maxPerRound))} | ${ivs.length === 0 ? "-" : Math.min(...ivs)} | ${u === undefined ? "-" : `${u.uses.totals.join("/")} ${u.uses.scopes.join("/")}`} | ${hans.length === 0 ? "-" : hans.join(",")} | ${pub.length === 0 ? "-" : pub.slice(0, 3).join(" ")}${pill ? " +pill" : ""} | ${rs.some((r) => r.touched) ? "○" : "×"} |`,
    );
  }
  return lines.join("\n");
}

export function renderReport(promises: PromisesFile, rows: Row[], files: string[], promisesPath?: string): string {
  const real = rows.filter((r) => r.mutant === null);
  const mutants = rows.filter((r) => r.mutant !== null);
  const findings = judgeRows(promises, real);
  const cards = new Set(real.map((r) => r.card));
  const crashes = real.filter((r) => r.crash !== null).length;
  const timeouts = real.filter((r) => r.timeout).length;
  const effs = real.filter((r) => r.effectErrors.length > 0).length;
  const ms = real.map((r) => r.ms);
  const avg = ms.length === 0 ? 0 : Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
  const bySev = (sev: Severity): number => findings.filter((f) => f.severity === sev && f.kind !== "ZERO_ACTIVATION").length;

  const out: string[] = [];
  out.push(`# B-4 약속 검사기 보고 (${new Date().toISOString().slice(0, 16).replace("T", " ")})`);
  out.push("");
  out.push(`입력: ${files.map((f) => basename(f)).join(", ")}${promisesPath === undefined ? "" : ` · 약속: ${basename(promisesPath)}`}`);
  out.push(`판: ${real.length} (카드 ${cards.size}종, 평균 ${avg} ms/판) · 크래시 ${crashes} · 소프트락 ${timeouts} · 훅 예외 판 ${effs}`);
  out.push(`판정: 확정 ${bySev("확정")} · 의심 ${bySev("의심")} · 관찰 ${bySev("관찰")} · 0회 발동 ${findings.filter((f) => f.kind === "ZERO_ACTIVATION").length}`);
  out.push(`약속: ${promises.count}장 중 약속 없음 ${promises.emptyCards.length}장 (${promises.emptyCards.join(", ")}) · 괄호 못 읽음 ${promises.unparsedCards.length}장`);
  out.push("");
  out.push("판정 규칙: «확정»은 실측이 문구와 직접 어긋난 것, «의심»은 측정 방법의 한계(다단계 액션·누적형 판수)로 오탐일 수 있는 것, «관찰»은 라벨 붙은 한도·판단 대기 항목의 기록. 〔알려짐〕은 계획 §8 목록과 겹치는 것 — 재보고 아님.");
  out.push("");
  for (const s of SECTIONS) {
    const fs = dedupe(findings.filter((f) => s.kinds.includes(f.kind)));
    out.push(`## ${s.title} — ${fs.length}건`);
    out.push("");
    if (fs.length === 0) out.push("- 없음");
    for (const f of fs.sort((a, b) => (a.severity === b.severity ? a.card.localeCompare(b.card) : a.severity.localeCompare(b.severity)))) out.push(line(f));
    out.push("");
  }

  // 자기 검증
  out.push("## 자기 검증 (결함 주입 mutant 행)");
  out.push("");
  if (mutants.length === 0) {
    out.push("- mutant 행 없음. `--mutant=joker_fixed_cooldown --cards=joker --modes=hanchan` 으로 돌리면 «동풍전 2국·반장전 3국» 위반이 울려야 한다.");
  } else {
    const byMut = new Map<string, Row[]>();
    for (const r of mutants) byMut.set(r.mutant as string, [...(byMut.get(r.mutant as string) ?? []), r]);
    for (const [mut, rs] of byMut) {
      const fs = judgeRows(promises, rs);
      const expected = mut === "joker_fixed_cooldown"
        ? fs.filter((f) => f.kind === "COOLDOWN_VIOLATION" && f.card === "joker" && f.mode === "hanchan" && f.severity === "확정")
        : [];
      const rang = expected.length > 0;
      out.push(`- **${mut}** (${rs.length}판): ${rang ? "울림 ✓" : "안 울림 ✗ — 검사기 결함"} — ${mut === "joker_fixed_cooldown" ? "#511 이전 조커(쿨다운 고정 2국)를 되살린 것. 반장전 usedSeq 간격 2 < 약속 3 이 «쿨다운 위반 확정»으로 나와야 한다." : ""}`);
      for (const f of dedupe(fs).filter((f) => f.kind !== "ZERO_ACTIVATION")) out.push(`  ${line(f).replace(/\n  - 재현/g, "\n    - 재현")}`);
    }
  }
  out.push("");
  out.push("## 부록 A. 카드별 실측 요약 (카드 × 모드)");
  out.push("");
  out.push(summaryTable(promises, real));
  out.push("");
  out.push("## 부록 B. 약속이 안 뽑힌 카드 (사람이 검토)");
  out.push("");
  for (const id of promises.emptyCards) {
    const c = promises.cards.find((x) => x.id === id);
    out.push(`- **${id}** (${c?.name ?? ""}) — head=${c?.head === null ? "없음" : `(${c?.head})`}`);
  }
  out.push("");
  return out.join("\n");
}

/* ───────────── CLI ───────────── */

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const opt = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) opt.set(a.slice(2, eq), a.slice(eq + 1));
  }
  const promisesPath = opt.has("promises")
    ? ((p) => (p.startsWith("/") ? p : join(process.cwd(), p)))(opt.get("promises") as string)
    : join(HERE, "promises.json");
  if (!existsSync(promisesPath)) throw new Error(`${promisesPath} 이 없다 — 먼저 parse.ts 를 돌려라`);
  const promises = JSON.parse(readFileSync(promisesPath, "utf8")) as PromisesFile;
  const files = opt.has("in")
    ? (opt.get("in") as string).split(",").map((f) => (f.startsWith("/") ? f : join(process.cwd(), f)))
    : (existsSync(OUT_DIR) ? readdirSync(OUT_DIR) : [])
        .filter((f) => /^promise-.*\.jsonl$/.test(f) && !f.includes("-dev"))
        .map((f) => join(OUT_DIR, f));
  if (files.length === 0) throw new Error("입력 jsonl 이 없다 (--in= 또는 out/promise-*.jsonl)");
  const rows = loadRows(files);
  const report = renderReport(promises, rows, files, promisesPath);
  const outPath = opt.has("out") ? (opt.get("out") as string) : join(HERE, "report.md");
  writeFileSync(outPath, report);
  const head = report.split("\n").slice(0, 6).join("\n");
  console.log(head);
  console.log(`→ ${outPath}`);
}
