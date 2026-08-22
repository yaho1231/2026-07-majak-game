/**
 * 표시 정확성 확정 건 재현.
 *
 * A. 최종 순위표의 «우마·오카»가 **k단위**인데 그 옆의 원점·최종은 **점 단위**다.
 *    → "25000점이 왜 −5가 되는지 역산할 수 있게" 하려고 넣은 줄이 1000배 어긋난다.
 * B. 예지 재배열(foresight_order)만 남은 순에 «✦ 액티브 증강 (0)» + 빈 메뉴 +
 *    툴팁 "undefined 사용".
 * C. 리플레이 뷰어의 재생 바가 순위표 위로 삐져나온다(쌓임 맥락 없음).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const rd = (p: string): string => readFileSync(join(ROOT, p), "utf8");

// ── A. 우마/오카 단위 ────────────────────────────────────────────
console.log("A. 우마·오카 단위");
const hc = rd("packages/core/src/match/HanchanController.ts");
console.log("   기본 설정        :", /uma: \[[^\]]*\]/.exec(hc)?.[0], "/", /oka: [^,\n]*/.exec(hc)?.[0] ?? "(oka)");
console.log("   서버 계산        :", /score: raw - startScore[^\n]*/.exec(hc)?.[0].trim());
console.log("                      uma: umaValue  ← ×1000 하지 않은 **k단위** 그대로 실린다");
// 실제 숫자로 굴려 본다: 원점 25000, uma [5,15], oka 0
const startScore = 25000;
const umaArr = [-15, -5, 5, 15]; // [4위,3위,2위,1위] (서버 umaArr = [-uma[1],-uma[0],uma[0],uma[1]])
const raws = [40000, 27000, 20000, 13000];
console.log("   예시(원점 25000, uma [5,15]):");
raws.forEach((raw, i) => {
  const umaValue = umaArr[3 - i] as number;
  const score = raw - startScore + umaValue * 1000;
  console.log(
    `     ${i + 1}위  화면: "${raw.toLocaleString()}점 · 우마 ${umaValue > 0 ? "+" : ""}${umaValue}"` +
      `  →  최종 "${score > 0 ? "+" : ""}${score.toLocaleString()}"` +
      `   (${raw.toLocaleString()}−25,000=${(raw - startScore).toLocaleString()} 에 ${umaValue} 를 더해도 ${score.toLocaleString()} 이 안 된다)`,
  );
});
const app = rd("packages/client/src/App.tsx");
console.log("   클라 표기        :", /우마 \$\{[^}]*\}/.exec(app)?.[0]);
console.log("   프로토콜 주석    :", /\/\*\* 우마 점수[^\n]*/.exec(rd("packages/core/src/network/protocol.ts"))?.[0], "← 이 주석도 실제 값과 다르다");

// ── B. foresight_order ──────────────────────────────────────────
console.log("\nB. 예지 재배열만 남은 순");
const fs2 = rd("packages/content/src/augments/foresight.ts");
console.log("   콘텐츠(후보 생성):");
for (const l of fs2.split("\n").slice(290, 301)) if (l.trim() !== "") console.log("     " + l.trim());
console.log("   → REVEAL 을 못 쓰는 순에는 후보가 **ORDER 뿐**이다.");
const A = app.split("\n");
for (const n of [18654, 18684, 18752, 19281, 19297]) {
  console.log(`   App.tsx:${n}  ${(A[n - 1] ?? "").trim()}`);
}
console.log('   augNameFor(undefined) → augActionName: (catalog[undefined]?.name) ?? ACTION_LABEL[undefined] ?? type');
console.log('   → 셋 다 undefined → 툴팁이 "undefined 사용" 으로 찍힌다. 버튼은 "✦ 액티브 증강 (0)".');

// ── C. 리플레이 바 z-index ──────────────────────────────────────
console.log("\nC. 리플레이 재생 바가 순위표 위로 나온다");
const css = rd("packages/client/src/styles.css").split("\n");
for (const [i, l] of css.entries()) {
  if (/^\.replayer \{|^\.replayer-bar \{|^\.overlay \{/.test(l)) {
    console.log(`   styles.css:${i + 1}  ${l.trim()}`);
    for (const j of [1, 2, 3, 4, 5]) {
      const t = (css[i + j] ?? "").trim();
      if (/position|z-index/.test(t)) console.log(`               ${t}`);
    }
  }
}
console.log("   .replayer 는 z-index:auto → 쌓임 맥락을 만들지 않는다 → 자손 .replayer-bar(60) 가 .overlay(50) 위로 간다.");
console.log("   그리고 gameOver 경로는 rankings 를 걷지 않는다:");
for (const [i, l] of A.entries()) {
  if (/onOpenReplay: \(\) => send\(\{ type: "replayGet", gameId: lastGameId \}\)/.test(l)) {
    console.log(`   App.tsx:${i + 1}  ${l.trim()}`);
  }
}
const rdIdx = app.indexOf('if (msg.type === "replayData")');
console.log('   replayData 핸들러가 setRankings(null) 을 하는가 :', /setRankings\(null\)/.test(app.slice(rdIdx, rdIdx + 200)));
