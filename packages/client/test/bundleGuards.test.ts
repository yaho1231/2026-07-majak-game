/**
 * 번들·전송 크기 회귀 가드 (감사 2026-08-17 §7-1·7-2·7-3).
 *
 * 여기서 지키는 것은 **한 줄로 되돌아간다**. `import { contentAugments }` 한 줄이면
 * 증강 구현 117개(1.2MB)와 서버 전용 엔진이 첫 화면 번들로 되돌아오고, 그래도 화면은
 * 멀쩡히 동작하므로 아무도 눈치채지 못한다. 실측(2026-08-18):
 *
 *   전:  단일 청크 794,650 B · 압축 없음        → 브라우저가 794 KB를 받는다
 *   후:  첫 청크 533,212 B · gzip 170,930 B     → 171 KB
 *        리플레이 청크 368,075 B는 **리플레이를 여는 사람만** 받는다
 *
 * 정적 소스 스캔이다(빌드 산출물을 요구하지 않는다 — 테스트가 빌드에 의존하면
 * 빌드 안 한 워크트리에서 전부 실패한다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const SERVER = readFileSync(join(HERE, "../../server/src/index.ts"), "utf8");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const SERVER_CODE = code(SERVER);

describe("첫 화면이 서버 엔진과 증강 117개를 받지 않는다", () => {
  it("App이 @majak/content 를 정적으로 들여오지 않는다", () => {
    // 값 import 한 줄이면 배열이 참조되고, 배열이 참조되면 117개가 전부 산다.
    // (트리셰이킹으로 못 뺀다 — defineAugment 가 throw 하는 부수효과 함수라
    //  롤업이 각 모듈을 순수로 판정하지 못한다.)
    expect(APP_CODE).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+"@majak\/content"/m);
  });

  it("증강 종수는 서버가 알려 준 값을 쓴다", () => {
    // 클라가 직접 세려면 content 를 들여와야 한다 — 그게 애초의 원인이었다.
    expect(APP_CODE).toContain("serverInfo?.augmentKinds");
  });

  it("리플레이 재구성은 동적 import 다", () => {
    // replayRebuild 가 content 를 끌고 온다. 판을 되짚으려면 그때 그 증강이 실제로
    // 있어야 하므로 의존 자체는 옳다 — 옳지 않았던 건 그게 **첫 화면에** 있던 것이다.
    expect(APP_CODE).not.toMatch(/^import\s+\{[^}]*rebuildReplay[^}]*\}\s+from/m);
    expect(APP_CODE).toMatch(/import\("\.\/replayRebuild\.js"\)/);
  });

  it("워크스페이스 패키지가 sideEffects 를 선언한다", () => {
    for (const pkg of ["core", "content"]) {
      const json = JSON.parse(
        readFileSync(join(HERE, `../../${pkg}/package.json`), "utf8"),
      ) as { sideEffects?: unknown };
      expect(json.sideEffects, `${pkg}: 선언이 없으면 번들러가 미사용 모듈을 못 버린다`).toBe(
        false,
      );
    }
  });
});

describe("텍스트 자산이 압축되어 나간다", () => {
  it("서버가 압축 가능한 종류를 gzip 한다", () => {
    expect(SERVER_CODE).toContain("COMPRESSIBLE");
    expect(SERVER_CODE).toContain("createGzip");
    expect(SERVER_CODE).toContain('"Content-Encoding"');
  });

  it("이미 압축된 것은 다시 압축하지 않는다", () => {
    const m = /const COMPRESSIBLE = new Set\(\[([^\]]*)\]\)/.exec(SERVER_CODE);
    expect(m, "COMPRESSIBLE 목록을 못 찾았다").not.toBeNull();
    const list = m?.[1] ?? "";
    for (const already of [".png", ".jpg", ".woff2", ".ico"]) {
      expect(list, `${already} 는 다시 압축해도 이득이 없다`).not.toContain(already);
    }
  });

  it("Accept-Encoding 에 따라 갈리므로 Vary 를 붙인다", () => {
    // 안 붙이면 중간 캐시가 압축본을 gzip 못 받는 클라이언트에게 내줄 수 있다.
    expect(SERVER_CODE).toContain('Vary: "Accept-Encoding"');
  });

  it("리버스 프록시 예시에도 압축이 켜져 있다", () => {
    // 배포 경로가 둘이다(Caddy / Cloudflare Tunnel 직결) — 한쪽에만 두면
    // 다른 쪽에서 압축이 통째로 빠진다. 실제로 빠져 있었다.
    const caddy = readFileSync(join(HERE, "../../../deploy/Caddyfile.example"), "utf8");
    expect(caddy).toMatch(/^\s*encode\s+.*gzip/m);
  });
});
