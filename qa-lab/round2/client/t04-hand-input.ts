/**
 * 손패 입력(드래그·두 번 탭) 관련 확정 건들의 구조 확인.
 *
 * A. suppressClickRef 는 **타일 onClick 안에서만** 풀린다 → 드래그가 다른 요소 위에서
 *    끝나면(재정렬로 옆 슬롯, 드롭존에 버리기) 그 타일의 click 이 안 나므로 플래그가
 *    남아 **다음 진짜 클릭 한 번이 통째로 먹힌다.**
 * B. 드래그 window 리스너의 의존성이 `[drag !== null]` 뿐 → onMove/onUp 이
 *    드래그 시작 렌더의 discardOptionFor·armedAug·autoSort·props.onSubmit 을 박제한다.
 *    드래그 중 프롬프트가 죽으면(초읽기 만료) 죽은 옵션이 그대로 제출되고,
 *    submitOption 이 성공 시 무조건 dropPrompt 를 불러 **새로 온 프롬프트가 지워진다.**
 * C. armedTileId(두 번 탭의 «들어 올림»)는 promptSeq 변화와 tapTwice OFF 에서만 풀린다
 *    → riichiMode 전환에서는 안 풀려 **한 번 탭에 리치가 확정**된다.
 * D. 무장형 리치(open/stealth/all_in …) 분기는 tapTwiceToDiscard 검사 **앞에서** return
 *    → 그 상태에서는 오탭 한 번이 곧 오픈/올인 리치 확정.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../../../packages/client/src/App.tsx"), "utf8");
const L = APP.split("\n");
const at = (re: RegExp): [number, string][] =>
  L.map((l, i) => [i + 1, l] as [number, string]).filter(([, l]) => re.test(l));

const p = (label: string, hits: [number, string][]): void => {
  console.log(`\n${label}`);
  for (const [n, l] of hits) console.log(`  App.tsx:${n}  ${l.trim()}`);
};

p("A. suppressClickRef 쓰기/읽기", at(/suppressClickRef/));
p("B. 드래그 리스너 의존성", at(/^\s*\}, \[drag !== null\]\);/));
p("B. onUp 의 제출 경로", at(/const opt = discardOptionFor\(b\.id\);|props\.onSubmit\(opt\)|sel\.submit\(opt\)/));
p("B. submitOption 의 무조건 dropPrompt", at(/if \(seat !== undefined\) dropPrompt\(seat\)/));
p("C. armedTileId 리셋 경로", at(/setArmedTileId\(null\)/));
p("C. armedTileId 리셋 이펙트의 의존성", at(/\}, \[props\.promptSeq\]\);|\}, \[props\.tapTwiceToDiscard\]\);/));
p("C/D. 두 번 탭 게이트 위치", at(/if \(props\.tapTwiceToDiscard && armedTileId !== id\)/));
const gate = at(/if \(props\.tapTwiceToDiscard && armedTileId !== id\)/)[0]?.[0] ?? 0;
p("D. 무장 분기 — 게이트보다 위에서 return 한다", at(/if \(armedAug !== null\) \{$/).filter(([n]) => n < gate && n > gate - 100));
console.log(`   (게이트는 App.tsx:${gate})`);
console.log("\nriichiMode 변화로 armedTileId 를 푸는 코드가 있는가 :",
  /setArmedTileId\(null\)[\s\S]{0,200}riichiMode/.test(APP) || /riichiMode[\s\S]{0,120}setArmedTileId\(null\)/.test(APP));
