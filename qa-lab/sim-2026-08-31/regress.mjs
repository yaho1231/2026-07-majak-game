/**
 * 증강의 **순수 기여도**를 회귀로 뽑는다.
 *
 * 보유 판의 평균순위는 "누가 그 증강을 집었는가"에 오염돼 있다 — 역빌드 페르소나가
 * 주로 집은 증강은 증강이 나빠서가 아니라 홀더가 나빠서 순위가 낮게 나온다. 동시에
 * 든 다른 증강의 효과도 그대로 섞여 있다(조커와 함께 든 증강은 전부 좋아 보인다).
 *
 * 그래서 순위를 증강 보유 더미 + 페르소나 + 원형으로 회귀해 **다른 조건을 고정한 채**
 * 증강 하나의 몫만 뽑는다. 계수가 음수면 순위를 끌어올린다(좋다).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const files = readdirSync("out").filter((f) => f.endsWith(".jsonl"));
const rows = [];
for (const f of files) {
  for (const line of readFileSync(`out/${f}`, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    rows.push(JSON.parse(line));
  }
}
console.error("rows", rows.length);

const augIds = [...new Set(rows.flatMap((r) => r.augments))].sort();
const personas = [...new Set(rows.map((r) => r.persona))].sort();
const archs = [...new Set(rows.map((r) => r.archetype))].sort();
// 더미는 각 축에서 하나씩 빼야 절편과 공선이 되지 않는다 (기준 범주)
const pCols = personas.slice(1);
const aCols = archs.slice(1);
const cols = [...augIds, ...pCols.map((p) => `P:${p}`), ...aCols.map((a) => `A:${a}`)];
const K = cols.length + 1; // +절편
const idx = new Map(cols.map((c, i) => [c, i + 1]));
console.error("features", K, "augments", augIds.length);

// 정규방정식 X'X, X'y 를 행마다 누적한다 — 40,200×130 행렬을 통째로 들지 않는다
const XtX = Array.from({ length: K }, () => new Float64Array(K));
const Xty = new Float64Array(K);
const Xts = new Float64Array(K); // 순위점(score) 쪽 타깃

for (const r of rows) {
  const on = [0];
  for (const a of new Set(r.augments)) { const i = idx.get(a); if (i !== undefined) on.push(i); }
  const pi = idx.get(`P:${r.persona}`); if (pi !== undefined) on.push(pi);
  const ai = idx.get(`A:${r.archetype}`); if (ai !== undefined) on.push(ai);
  for (const i of on) {
    Xty[i] += r.rank;
    Xts[i] += r.score;
    const row = XtX[i];
    for (const j of on) row[j] += 1;
  }
}

/** 능형(ridge) — 공선성으로 해가 튀는 것을 막는다. 절편에는 걸지 않는다. */
const LAMBDA = 5;
for (let i = 1; i < K; i++) XtX[i][i] += LAMBDA;

/** 가우스 소거 (부분 피벗). K=130이라 충분히 빠르다. */
function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => { const r = new Float64Array(n + 1); r.set(row); r[n] = b[i]; return r; });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-12) continue;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return Array.from({ length: n }, (_, i) => M[i][n]);
}

const clone = () => XtX.map((r) => Array.from(r));
const beta = solve(clone(), Xty);
const betaS = solve(clone(), Xts);

// 잔차분산 → 계수 표준오차. (X'X+λI)^-1 의 대각만 있으면 된다.
let sse = 0;
for (const r of rows) {
  let yhat = beta[0];
  for (const a of new Set(r.augments)) { const i = idx.get(a); if (i !== undefined) yhat += beta[i]; }
  const pi = idx.get(`P:${r.persona}`); if (pi !== undefined) yhat += beta[pi];
  const ai = idx.get(`A:${r.archetype}`); if (ai !== undefined) yhat += beta[ai];
  sse += (r.rank - yhat) ** 2;
}
const sigma2 = sse / (rows.length - K);
const inv = [];
for (let i = 0; i < K; i++) {
  const e = new Float64Array(K); e[i] = 1;
  inv.push(solve(clone(), e)[i]);
}

const out = augIds.map((id) => {
  const i = idx.get(id);
  return { id, beta: beta[i], se: Math.sqrt(sigma2 * inv[i]), betaScore: betaS[i] };
}).sort((a, b) => a.beta - b.beta);

writeFileSync("regression.json", JSON.stringify({
  rows: rows.length, lambda: LAMBDA, intercept: beta[0],
  persona: Object.fromEntries(pCols.map((p) => [p, beta[idx.get(`P:${p}`)]])),
  archetype: Object.fromEntries(aCols.map((a) => [a, beta[idx.get(`A:${a}`)]])),
  baselinePersona: personas[0], baselineArch: archs[0],
  augments: out,
}, null, 1));
console.error("잔차SD", Math.sqrt(sigma2).toFixed(4), "계수SE 중앙", out.map(o=>o.se).sort((a,b)=>a-b)[Math.floor(out.length/2)].toFixed(4));
console.error("최상위5", out.slice(0,5).map(o=>`${o.id} ${o.beta.toFixed(3)}`).join(" | "));
console.error("최하위5", out.slice(-5).map(o=>`${o.id} ${o.beta.toFixed(3)}`).join(" | "));
