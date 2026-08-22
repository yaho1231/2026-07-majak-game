/**
 * 확정 3 재현: 중계용 «오버레이 모드»(투명/초록)가 관전을 끝낸 뒤에도 남아,
 * **자기 대국 화면**이 크로마키 초록으로 칠해지고 빠른 토글 바가 사라진다.
 * 그런데 그걸 되돌릴 단추는 관전석에만 있다 → 새로고침 말고는 탈출구가 없다.
 *
 * 소스에서 세 가지를 확인한다.
 *  ① setOverlayMode 를 부르는 곳이 «관전 중에만 넘기는 콜백» 하나뿐이다.
 *  ② 어떤 리셋 경로(resetGameState / clearProductions / spectateEnded / returnHome)도
 *     overlayMode 를 되돌리지 않는다.
 *  ③ overlayMode 는 spectator 여부와 무관하게 GameTable 로 내려가 .table 에 붙고,
 *     CSS 가 배경을 덮고 .quick-toggles 를 감춘다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../../packages/client/src");
const APP = readFileSync(join(SRC, "App.tsx"), "utf8").split("\n");
const CSS = readFileSync(join(SRC, "styles.css"), "utf8");

const show = (re: RegExp, label: string): number[] => {
  const hits = APP.map((l, i) => [i + 1, l] as const).filter(([, l]) => re.test(l));
  console.log(`\n${label}`);
  for (const [n, l] of hits) console.log(`  App.tsx:${n}  ${l.trim()}`);
  return hits.map(([n]) => n);
};

show(/setOverlayMode/, "① setOverlayMode 호출 지점");
show(/overlayMode(\?\?|=| )/, "③ overlayMode 를 읽는 지점");

// ② 리셋 함수 본문에 overlayMode 가 등장하는가
const text = APP.join("\n");
for (const fn of ["function resetGameState", "function clearProductions", "function returnHome", "function continueInRoom"]) {
  const at = text.indexOf(fn);
  const body = text.slice(at, at + 2200);
  console.log(`② ${fn} 이 overlayMode 를 되돌리는가 :`, /setOverlayMode/.test(body));
}
const spectEnded = text.indexOf('msg.type === "spectateEnded"');
console.log("② spectateEnded 핸들러가 되돌리는가      :", /setOverlayMode/.test(text.slice(spectEnded, spectEnded + 900)));

console.log("\n③ CSS 효과:");
console.log(
  CSS.split("\n")
    .map((l, i) => [i + 1, l] as const)
    .filter(([, l]) => /table-overlay-(green|clear)|#00b140|quick-toggles/.test(l))
    .slice(0, 12)
    .map(([n, l]) => `  styles.css:${n}  ${l.trim()}`)
    .join("\n"),
);
