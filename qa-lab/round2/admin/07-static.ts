/**
 * 07 — 코드 정적 확인(재현 가능한 근거):
 *  (a) 전역 공지가 대국 화면·대기실에 렌더되는 자리가 없다.
 *  (b) adminSetNotice 가 재전송 정책 두 목록 어디에도 없다 (분류 누락).
 *  (c) 관전 종료 감사 로그가 «게임이 끝나서 관전이 끊긴 경우»에는 안 남는다.
 *  (d) 관전 탁자 전환 시 클라이언트가 pause/roomNotice 상태를 비우지 않는다.
 */
import { readFileSync } from "node:fs";
import { check, report } from "./lab.js";

const root = new URL("../../../", import.meta.url).pathname;
const app = readFileSync(root + "packages/client/src/App.tsx", "utf8");
const proto = readFileSync(root + "packages/core/src/network/protocol.ts", "utf8");
const policy = readFileSync(root + "packages/client/src/resendPolicy.ts", "utf8");
const rm = readFileSync(root + "packages/server/src/RoomManager.ts", "utf8");

// (a) NoticeBanner 렌더 자리
const banners = [...app.matchAll(/<NoticeBanner /g)].map((m) => {
  const line = app.slice(0, m.index).split("\n").length;
  // 그 위쪽에서 가장 가까운 최상위 function 이름
  const before = app.slice(0, m.index);
  const fn = [...before.matchAll(/^function (\w+)/gm)].pop()?.[1] ?? "?";
  return `${fn}:${line}`;
});
check(
  "전역 공지 띠가 대국/대기실 화면에도 선다 (docs/36 §1 «게임 중인 사람에게도 상단 띠로 닿는다»)",
  banners.some((b) => /Game|Table|Waiting/.test(b)),
  `렌더 자리 = ${banners.join(", ")}`,
);

// (b) 재전송 정책 분류
const clientEnd = proto.indexOf("서버 → 클라이언트");
const inClientHalf = proto.slice(0, clientEnd).includes('type: "adminSetNotice"');
check(
  "adminSetNotice 가 재전송 정책 두 목록 중 하나에 분류돼 있다",
  policy.includes('"adminSetNotice"'),
  `정책 목록에 없음 · protocol.ts 클라이언트 구간 안에 정의됨=${inClientHalf} ` +
    `(→ resendPolicy.test.ts «전체가 둘 중 한쪽» 검사가 이 메시지를 아예 못 본다)`,
);

// (c) 관전 종료 감사 로그
const endSpec = rm.slice(rm.indexOf("private endSpectating"), rm.indexOf("private endSpectating") + 500);
check(
  "게임 종료로 관전이 끊길 때도 «관전 종료» 감사 로그가 남는다 (docs/36 C3)",
  endSpec.includes("관전 종료"),
  "endSpectating() 에 로그 호출이 없다 — stopSpectating() 경로에만 있다",
);

// (d) 탁자 전환 시 상태 비우기
const switchIdx = app.indexOf("onSwitchTable: (code: string) => {");
const switchBody = app.slice(switchIdx, switchIdx + 500);
check(
  "탁자를 옮길 때 앞 탁자의 정지·공지 상태를 비운다",
  /setPause\(null\)|clearProductions\(\)/.test(switchBody),
  `onSwitchTable 본문: ${switchBody.split("\n").slice(0, 12).join(" ").replace(/\s+/g, " ").slice(0, 260)}`,
);

report();
