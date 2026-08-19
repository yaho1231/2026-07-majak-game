/**
 * 2026-08-19 사용자 보고 두 건 — 정적 소스 스캔 회귀 가드.
 *
 * ① 제보 게시판의 **제목 칸 안내가 버그 제보용 하나뿐**이었다. 증강 아이디어 탭으로
 *    바꿔도 "리치 후 쯔모가 두 번 들어옵니다"가 그대로 서 있어서, 지금 무엇을 쓰는
 *    자리인지 안내가 오히려 거짓말을 했다. 본문 칸은 이미 탭에 따라 갈렸다 —
 *    제목만 안 갈렸다.
 *
 * ② 홈의 **"진행하던 방으로 재접속"이 죽은 방에도 계속 서 있었다.** 저장된 코드는
 *    방이 사라지는 어느 길에서도 지워지지 않아, 눌러야 "그 방은 이미 사라졌습니다"를
 *    보는 버튼이 평소 모습이었다. 이제 로그인할 때 서버가 알려 주는
 *    `authOk.resumeRoom`으로 맞추고, 거절당한 코드는 그 자리에서 버린다.
 *
 * 이 패키지에는 jsdom이 없다 — 다른 클라이언트 가드와 같은 방식으로 소스를 읽는다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

describe("제보 게시판 — 제목 안내가 탭을 따라간다", () => {
  it("제목 칸 placeholder가 kind로 갈린다", () => {
    const at = APP_CODE.indexOf('className="fb-title"');
    expect(at).toBeGreaterThan(0);
    const field = APP_CODE.slice(at, at + 400);
    expect(field).toContain("placeholder={");
    expect(field).toContain('kind === "bug"');
  });

  it("증강 아이디어 쪽 예시는 버그 예시와 다른 문장이다", () => {
    const at = APP_CODE.indexOf('className="fb-title"');
    const field = APP_CODE.slice(at, at + 400);
    // 버그 예시 하나만 남아 있으면(= 예전 상태) 이 갈래가 없다
    const examples = field.match(/제목 \(예: [^"]+"/g) ?? [];
    expect(examples.length).toBe(2);
    expect(examples[0]).not.toBe(examples[1]);
  });
});

describe("진행하던 방으로 재접속 — 죽은 방에는 뜨지 않는다", () => {
  it("버튼이 보는 값은 저장소 직접 읽기가 아니라 상태다", () => {
    // 저장소를 그릴 때마다 직접 읽으면 코드를 지워도 리렌더가 안 걸려
    // 죽은 버튼이 그대로 선다.
    expect(APP_CODE).toContain("const [lastRoomCode, setLastRoomCode]");
    const renders = APP_CODE.match(/safeStorage\.getItem\(LAST_ROOM_KEY\)/g) ?? [];
    // 남은 세 곳은 초기값과, "거절당한/강퇴당한 코드가 그 코드였나" 비교뿐이다
    expect(renders.length).toBe(3);
  });

  it("저장소와 화면 상태는 rememberLastRoom 한 곳에서만 움직인다", () => {
    for (const call of ["safeStorage.setItem(LAST_ROOM_KEY", "safeStorage.removeItem(LAST_ROOM_KEY"]) {
      const uses = APP_CODE.split(call).length - 1;
      expect(uses).toBe(1); // rememberLastRoom 안의 한 번뿐
    }
  });

  it("로그인 응답의 resumeRoom으로 맞춘다", () => {
    expect(APP_CODE).toContain("msg.resumeRoom !== undefined");
    expect(APP_CODE).toContain("rememberLastRoom(msg.resumeRoom)");
  });

  it("못 들어간 방 코드는 그 자리에서 버린다 (내 재접속 코드였을 때만)", () => {
    const at = APP_CODE.indexOf("joinTargetRef.current === safeStorage.getItem(LAST_ROOM_KEY)");
    expect(at).toBeGreaterThan(0);
    const around = APP_CODE.slice(at - 300, at + 120);
    expect(around).toContain("ROOM_NOT_FOUND");
    expect(around).toContain("KICKED");
    expect(around).toContain("rememberLastRoom(null)");
  });

  it("방 참가는 어디서 보내든 무엇을 향한 시도였는지 남긴다", () => {
    // 남기지 않으면, 남의 방 코드를 잘못 쳐서 난 ROOM_NOT_FOUND가
    // 멀쩡한 내 재접속 코드를 지운다.
    // joinRoom을 보내는 곳은 joinTargetRef를 남기는 joinRoomByCode 하나뿐이다
    expect((APP_CODE.match(/type: "joinRoom"/g) ?? []).length).toBe(1);
    const at = APP_CODE.indexOf('type: "joinRoom"');
    expect(APP_CODE.slice(at - 200, at)).toContain("joinTargetRef.current = code");
  });
});
