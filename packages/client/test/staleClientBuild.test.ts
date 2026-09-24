/**
 * 배포 뒤 낡은 탭 감지 (2026-09-24).
 *
 * 서버 재시작 뒤 새로고침 없이 재접속한 탭이 옛 번들로 새 증강의 액션 id
 * (`yggdrasil_call`)를 버튼에 그대로 찍었다. 서버가 알려 준 빌드와 이 탭의 빌드를
 * 비교해 다르면 새로고침한다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isStaleClientBuild } from "../src/buildId.js";

const here = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(here, "../src/App.tsx"), "utf8");

describe("isStaleClientBuild", () => {
  it("둘 다 알고 다르면 낡은 탭", () => {
    expect(isStaleClientBuild("index-OLD.js", "index-NEW.js")).toBe(true);
  });

  it("같으면 낡지 않았다", () => {
    expect(isStaleClientBuild("index-NEW.js", "index-NEW.js")).toBe(false);
  });

  it("한쪽이라도 모르면(vite dev·정적 빌드 없는 서버) 건드리지 않는다", () => {
    expect(isStaleClientBuild(null, "index-NEW.js")).toBe(false);
    expect(isStaleClientBuild("index-OLD.js", undefined)).toBe(false);
  });
});

describe("App 배선", () => {
  it("serverInfo.clientBuild 를 보고 판 밖이면 새로고침, 판 안이면 띠를 띄운다", () => {
    expect(APP).toContain("isStaleClientBuild(ownClientBuild(), servedBuild)");
    expect(APP).toMatch(/if \(!staleBuild \|\| inGame \|\| inWaiting\) return;/);
    expect(APP).toContain('className="stale-build-bar"');
  });

  it("같은 서버 빌드로는 한 번만 새로고침한다 (캐시로 옛 번들이 다시 떠도 무한 반복하지 않게)", () => {
    expect(APP).toContain("safeStorage.getItem(STALE_RELOAD_KEY) === servedBuild");
  });
});
