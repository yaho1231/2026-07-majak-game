import { Prng } from "@majak/core";
import { PERSONAS, SEATS, assignPreset, runMatch } from "../../harness.js";
async function main() {
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) {
    const rng = new Prng(i + 1);
    const preset = assignPreset(rng, "hanchan", ["devils_advance"], 2);
    const personas = Object.fromEntries(SEATS.map((s) => [s, Object.values(PERSONAS)[0]]));
    const r = await runMatch({ seed: i + 1, mode: "hanchan", preset, personas: personas as never, timeoutMs: 5 });
    console.log(`i=${i} crash=${r.crash?.split("\n")[0]}`);
  }
  console.log(`총 소요 ${Date.now() - t0}ms (8건 모두 5ms 타임아웃 — 순식간에 끝나야 정상)`);
  // 프로세스가 스스로 종료되는지도 확인 — 버려진 판이 이벤트 루프를 붙잡고 있으면
  // 이 스크립트가 exit 없이 걸려 있을 것이다.
  setTimeout(() => { console.log("2초 뒤에도 살아있다 — 버려진 작업이 이벤트 루프를 붙잡고 있을 수 있다"); }, 2000).unref();
}
main();
