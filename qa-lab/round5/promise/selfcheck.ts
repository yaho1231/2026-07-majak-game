/**
 * B-4 약속 검사기 ④ — **자기 검증**. 검사기가 «실제로 잡는지»를 코드(packages/)를 안 건드리고
 * 보인다. 세 갈래:
 *
 *  A. 기준선: 진짜 promises.json + 진짜 joker 실측 → joker 에 쿨다운 위반·스케일 불일치가
 *     **없어야** 한다 (#511 재적용으로 «동풍전 2국에 1회 · 반장전 3국에 1회»가 코드와 일치).
 *  B. 약속 사본을 바꿔 판정: joker 괄호를 «1국에 1회»로 바꾼 사본(스크래치에 씀, 원본 불변)으로
 *     같은 실측을 다시 판정 → 쿨다운 채널 최댓값(반장전 3·동풍전 2) ≠ 1 이므로 SCALE_MISMATCH
 *     «확정»이 울려야 한다. «동풍전 3국에 1회 · 반장전 4국에 1회» 사본은 실측 간격
 *     (2 / 3) < 약속이라 COOLDOWN_VIOLATION «확정»이 울려야 한다. — 실측은 그대로, 약속만
 *     흔들어서 «약속을 읽고 대조하는 경로»가 살아 있음을 본다.
 *  C. 실측 쪽을 흔드는 결함 주입: run.ts --mutant=joker_fixed_cooldown (qa-lab 안에서만
 *     조커 쿨다운을 #511 이전의 고정 2국으로 되돌림) 행이 있으면 반장전 COOLDOWN_VIOLATION 이
 *     울려야 한다. 행이 없으면 건너뛰고 알린다.
 *
 *   npx tsx qa-lab/round5/promise/selfcheck.ts [--in=out/promise-0of1-smoke.jsonl,...]
 *   (--in 생략 시 judge 와 같은 기본: out/promise-*.jsonl, -dev 제외. joker 행이 있어야 한다)
 *
 * 종료코드 0 = 전부 기대대로, 1 = 검사기 결함.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHead } from "./parse.js";
import type { CardPromises, PromisesFile } from "./parse.js";
import { judgeRows, loadRows } from "./judge.js";
import type { Finding } from "./judge.js";
import type { Row } from "./run.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");
const SCRATCH = join(HERE, "out", "selfcheck");

/** joker 카드의 괄호(head)만 바꾼 promises 사본 — 괄호 밖 약속(+N판 등)은 그대로 둔다 */
function withJokerHead(base: PromisesFile, head: string): PromisesFile {
  const cards = base.cards.map((c): CardPromises => {
    if (c.id !== "joker") return c;
    const parsed = parseHead(head);
    const headKinds = new Set(["uses_match", "uses_round", "cooldown_rounds", "cooldown_turns", "always", "on_acquire"]);
    return { ...c, head, pledges: [...parsed.pledges, ...c.pledges.filter((p) => !headKinds.has(p.kind))], unparsed: parsed.unparsed };
  });
  return { ...base, cards };
}

const jokerFindings = (fs: Finding[]): Finding[] =>
  fs.filter((f) => f.card === "joker" && (f.kind === "COOLDOWN_VIOLATION" || f.kind === "SCALE_MISMATCH"));

const fmt = (fs: Finding[]): string =>
  fs.length === 0 ? "(없음)" : fs.map((f) => `${f.kind}/${f.severity}[${f.mode} seed=${f.seed}] ${f.detail}`).join("\n      ");

const opt = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const eq = a.indexOf("=");
  if (a.startsWith("--") && eq > 0) opt.set(a.slice(2, eq), a.slice(eq + 1));
}
const files = opt.has("in")
  ? (opt.get("in") as string).split(",").map((f) => (f.startsWith("/") ? f : join(process.cwd(), f)))
  : (existsSync(OUT_DIR) ? readdirSync(OUT_DIR) : [])
      .filter((f) => /^promise-.*\.jsonl$/.test(f) && !f.includes("-dev") && !f.includes("selfcheck"))
      .map((f) => join(OUT_DIR, f));
const promises = JSON.parse(readFileSync(join(HERE, "promises.json"), "utf8")) as PromisesFile;
const all = loadRows(files);
const real: Row[] = all.filter((r) => r.card === "joker" && r.mutant === null);
const mutant: Row[] = all.filter((r) => r.card === "joker" && r.mutant === "joker_fixed_cooldown");
if (real.length === 0) {
  console.error("joker 실측 행이 없다 — 먼저 `run.ts 0 1 --cards=joker --seed=1 --tag=smoke` 를 돌려라");
  process.exit(2);
}
const modes = [...new Set(real.map((r) => r.mode))];
console.log(`selfcheck: joker 실측 ${real.length}판 (${modes.join(",")}) · mutant ${mutant.length}판 · 입력 ${files.length}파일`);

let ok = true;
const check = (name: string, pass: boolean, fs: Finding[]): void => {
  ok &&= pass;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}\n      ${fmt(fs)}`);
};

// A. 기준선 — 진짜 약속엔 안 울려야 한다
const a = jokerFindings(judgeRows(promises, real));
check("A 기준선: 진짜 약속(동풍전 2국·반장전 3국) → joker 쿨다운·스케일 판정 0건", a.length === 0, a);

// B. 약속 사본 — 실측은 그대로, 약속만 바꿈
mkdirSync(SCRATCH, { recursive: true });
const b1p = withJokerHead(promises, "1국에 1회");
writeFileSync(join(SCRATCH, "promises-joker-1.json"), `${JSON.stringify(b1p, null, 2)}\n`);
const b1 = jokerFindings(judgeRows(b1p, real));
check(
  "B-1 사본 «1국에 1회» → 쿨다운 채널 최댓값(2/3) ≠ 1 → SCALE_MISMATCH 확정 (모드마다)",
  modes.every((m) => b1.some((f) => f.kind === "SCALE_MISMATCH" && f.severity === "확정" && f.mode === m)),
  b1,
);
const b2p = withJokerHead(promises, "동풍전 3국에 1회 · 반장전 4국에 1회");
writeFileSync(join(SCRATCH, "promises-joker-3-4.json"), `${JSON.stringify(b2p, null, 2)}\n`);
const b2 = jokerFindings(judgeRows(b2p, real));
const b2need = modes.filter((m) => real.some((r) => r.mode === m && r.seq.intervals.length > 0));
check(
  `B-2 사본 «동풍전 3국·반장전 4국» → 실측 간격(2/3) < 약속 → COOLDOWN_VIOLATION 확정 (간격이 있는 모드 ${b2need.join(",")})`,
  b2need.length > 0 && b2need.every((m) => b2.some((f) => f.kind === "COOLDOWN_VIOLATION" && f.severity === "확정" && f.mode === m)),
  b2,
);

// C. 실측 쪽 결함 주입 (run.ts --mutant)
if (mutant.length === 0) {
  console.log("  SKIP C mutant 행 없음 — `run.ts 0 1 --cards=joker --modes=hanchan --seed=1 --mutant=joker_fixed_cooldown --tag=mutant` 로 만든다");
} else {
  const c = jokerFindings(judgeRows(promises, mutant));
  const han = mutant.some((r) => r.mode === "hanchan");
  check(
    "C 결함 주입 joker_fixed_cooldown(고정 2국) → 반장전 간격 2 < 3 → COOLDOWN_VIOLATION 확정",
    han && c.some((f) => f.kind === "COOLDOWN_VIOLATION" && f.severity === "확정" && f.mode === "hanchan"),
    c,
  );
}

console.log(ok ? "selfcheck OK — 검사기가 약속·실측 양쪽의 변화를 잡는다" : "selfcheck FAIL — 검사기 결함");
process.exit(ok ? 0 : 1);
