/**
 * s02 — 송출 딜레이(C1) × 게임 종료.
 *
 * 기대: 지연을 건 관전석은 «N초 전의 판»을 본다. 판이 끝나면 그 관전석은
 *       적어도 자기가 보던 시점부터 끝까지를 본 뒤 종료를 받아야 한다.
 * 관측: 종료는 **즉시** 가고(지연 없음), 대기 중이던 프레임은 전부 버려진다.
 *       → 관전 화면에서 마지막 N초(=마지막 국의 화료 장면)가 통째로 사라진다.
 * 덤: 감사 로그(C3)는 «관전 종료»를 남기지 않는다 — 자발적 spectateStop 만 남는다.
 */
import { admin, botTable, ok, sleep, autoPlay, signup } from "./lib.js";

const DELAY = 15;

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");

const A = await admin();
A.c.send({ type: "spectate", code, delaySeconds: DELAY });
await A.c.wait("spectateStarted", 8000);
console.log("spectateStarted", JSON.stringify(A.c.last("spectateStarted")));

// 판이 충분히 흐르게 둔다 — 지연이 걸려 있으니 관전석은 뒤처져 있어야 한다.
await sleep(DELAY * 1000 + 4000);
const specViews = A.c.count("view");
const spTurn = (A.c.last("view") as any)?.view?.round;
const plTurn = (P.c.last("view") as any)?.view?.round;
console.log(`관전석 view ${specViews}장, 관전석 turnCount=${spTurn?.turnCount} / 대국자 turnCount=${plTurn?.turnCount}`);
ok(specViews > 0, "지연 관전석도 뷰를 받는다");

// 이제 판을 강제 종료한다 (대회에서 «마지막 국이 끝났다»와 같은 자리).
const beforeViews = A.c.count("view");
A.c.send({ type: "adminAbortGame", code, reason: "QA" });
await A.c.wait("spectateEnded", 8000);
const t0 = Date.now();
console.log("spectateEnded 도착 (요청 직후):", Date.now() - t0, "ms 이내");
await sleep(DELAY * 1000 + 3000); // 지연분이 흘러올 시간을 충분히 준다
const afterViews = A.c.count("view");
ok(
  afterViews > beforeViews,
  `종료 뒤에도 대기 중이던 ${DELAY}초 분량 뷰가 도착한다`,
  { before: beforeViews, after: afterViews },
);
console.log(
  afterViews === beforeViews
    ? `→ 확정: 대기 중이던 프레임 전부 폐기. 관전 화면은 종료 시점보다 ${DELAY}초 전에서 멈춘 채 끝난다.`
    : "→ 대기분이 도착했다",
);
console.log("관전석 마지막 메시지들:", A.c.log.slice(-5).map((m) => m.type).join(","));

P.c.close();
A.c.close();
await sleep(500);
process.exit(0);
