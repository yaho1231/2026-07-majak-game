/**
 * 서빙 중인 클라이언트 빌드를 `serverInfo.clientBuild` 로 알린다 (2026-09-24).
 *
 * 배포 뒤 새로고침 없이 재접속한 옛 탭이 새 증강의 액션 id(`yggdrasil_call`)를 버튼에
 * 그대로 찍었다. 클라이언트가 자기 번들과 비교해 새로고침하려면 서버가 이 값을
 * **인증 전 첫 프레임**에 실어 줘야 한다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { clientBuildOf } from "../src/clientBuild.js";

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  on(): void {}
  close(): void {
    this.readyState = 3;
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const managers: RoomManager[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function firstServerInfo(build: string | null | undefined): Promise<any> {
  const dir = await mkdtemp(join(tmpdir(), "majak-build-"));
  dirs.push(dir);
  const manager = new RoomManager(dir);
  managers.push(manager);
  if (build !== undefined) manager.setClientBuild(build);
  const sock = new FakeSocket();
  manager.handleConnection(sock.asWs());
  return sock.sent.find((m) => m.type === "serverInfo");
}

describe("clientBuildOf — index.html 의 진입 번들 파일명", () => {
  it("vite 빌드의 module script 에서 파일명을 뽑는다", () => {
    const html =
      '<head><script type="module" crossorigin src="/assets/index-DBQqZbdu.js"></script>' +
      '<link rel="stylesheet" href="/assets/index-qDfRMNDO.css"></head>';
    expect(clientBuildOf(html)).toBe("index-DBQqZbdu.js");
  });

  it("module 이 아닌 script 와 src 없는 script 는 건너뛴다", () => {
    const html =
      '<script>window.x=1</script><script src="/legacy.js"></script>' +
      '<script type="module" src="/assets/index-AAA.js"></script>';
    expect(clientBuildOf(html)).toBe("index-AAA.js");
  });

  it("번들이 없으면 null", () => {
    expect(clientBuildOf("<html><body>개발 서버</body></html>")).toBeNull();
  });
});

describe("serverInfo.clientBuild", () => {
  it("설정하면 연결 직후 첫 serverInfo 에 실린다", async () => {
    const info = await firstServerInfo("index-DBQqZbdu.js");
    expect(info.clientBuild).toBe("index-DBQqZbdu.js");
  });

  it("정적 빌드가 없는 서버(null·미설정)에서는 필드가 붙지 않는다", async () => {
    expect("clientBuild" in (await firstServerInfo(null))).toBe(false);
    expect("clientBuild" in (await firstServerInfo(undefined))).toBe(false);
  });
});
