/**
 * 신뢰 프록시 판정 회귀 테스트 — 감사 2026-08-12 §H-2.
 *
 * 이 판정 하나가 서버의 모든 IP 기반 방어의 입구다. 지금까지 **두 번** 조용히
 * 뚫렸고(2026-08-05 #1 위조 IP 면제, 2026-08-12 H-2 헤더 없음 면제), 두 번 다
 * 실패가 로그 없이 일어났다. 그래서 "누가 면제되는가"를 표로 못박아 둔다.
 */

import { describe, expect, it } from "vitest";
import { resolveClientOrigin } from "../src/trustProxy.js";

const probe = (socketIp: string, headers: Record<string, string> = {}) => ({
  socketIp,
  headers,
});

describe("프록시 없음(TRUST_PROXY=\"\") — 종전 동작 그대로", () => {
  it("루프백 연결은 면제된다 (로컬 개발·테스트 경로)", () => {
    const r = resolveClientOrigin(probe("127.0.0.1"), "");
    expect(r).toMatchObject({ ip: "127.0.0.1", exempt: true, direct: true });
  });

  it("원격 연결은 면제되지 않고 소켓 주소가 곧 키다", () => {
    const r = resolveClientOrigin(probe("203.0.113.7"), "");
    expect(r).toMatchObject({ ip: "203.0.113.7", exempt: false, direct: false });
  });

  it("프록시 헤더를 실어 보내도 무시된다 (프록시를 설정하지 않았으므로)", () => {
    const r = resolveClientOrigin(
      probe("127.0.0.1", { "cf-connecting-ip": "203.0.113.9" }),
      "",
    );
    expect(r.ip).toBe("127.0.0.1");
  });
});

describe("TRUST_PROXY=cloudflare", () => {
  it("헤더가 있으면 그 IP를 쓰고, 면제하지 않는다", () => {
    const r = resolveClientOrigin(
      probe("127.0.0.1", { "cf-connecting-ip": "203.0.113.7" }),
      "cloudflare",
    );
    expect(r).toMatchObject({ ip: "203.0.113.7", exempt: false, direct: false });
    expect(r.missingHeader).toBeNull();
  });

  /**
   * H-2의 본체. 예전에는 여기서 `local: true`가 나왔고, 그 값이 그대로
   * `conn.exempt`가 되어 연결 상한·메시지 토큰버킷·인증 무차별대입 차단·방 생성
   * 제한이 **전부** 꺼졌다.
   */
  it("헤더가 없어도 면제되지 않는다 — 프록시 설정이 깨져도 방어는 남는다", () => {
    const r = resolveClientOrigin(probe("127.0.0.1"), "cloudflare");
    expect(r.exempt).toBe(false);
    expect(r.ip).toBe("127.0.0.1");
  });

  it("헤더가 없으면 그 사실을 알린다 (조용히 실패하지 않는다)", () => {
    expect(resolveClientOrigin(probe("127.0.0.1"), "cloudflare").missingHeader).toBe(
      "CF-Connecting-IP",
    );
  });

  it("빈 헤더는 없는 것으로 친다", () => {
    const r = resolveClientOrigin(probe("127.0.0.1", { "cf-connecting-ip": "  " }), "cloudflare");
    expect(r).toMatchObject({ exempt: false, missingHeader: "CF-Connecting-IP" });
  });

  it("외부에서 포트에 직접 붙어 헤더를 위조해도 진짜 원격 주소가 쓰인다", () => {
    const r = resolveClientOrigin(
      probe("198.51.100.4", { "cf-connecting-ip": "127.0.0.1" }),
      "cloudflare",
    );
    expect(r).toMatchObject({ ip: "198.51.100.4", exempt: false, direct: false });
  });
});

describe("TRUST_PROXY=xff", () => {
  it("마지막 홉을 쓴다 — 앞쪽 항목은 클라이언트가 위조할 수 있다", () => {
    const r = resolveClientOrigin(
      probe("127.0.0.1", { "x-forwarded-for": "127.0.0.1, 10.0.0.1, 203.0.113.7" }),
      "xff",
    );
    expect(r).toMatchObject({ ip: "203.0.113.7", exempt: false });
  });

  it("헤더가 없어도 면제되지 않는다", () => {
    const r = resolveClientOrigin(probe("127.0.0.1"), "xff");
    expect(r).toMatchObject({ exempt: false, missingHeader: "X-Forwarded-For" });
  });
});

describe("설정 오타는 닫는 쪽으로", () => {
  it("모르는 TRUST_PROXY 값이면 면제하지 않는다", () => {
    expect(resolveClientOrigin(probe("127.0.0.1"), "cloudlfare").exempt).toBe(false);
  });
});

describe("direct — /healthz 같은 로컬 전용 문의 열쇠", () => {
  it("감시자의 직접 호출(프록시 헤더 없는 루프백)은 direct다", () => {
    expect(resolveClientOrigin(probe("127.0.0.1"), "cloudflare").direct).toBe(true);
  });

  it("터널을 통해 들어온 요청은 direct가 아니다", () => {
    const r = resolveClientOrigin(
      probe("127.0.0.1", { "cf-connecting-ip": "203.0.113.7" }),
      "cloudflare",
    );
    expect(r.direct).toBe(false);
  });

  it("원격 직접 접속도 direct가 아니다", () => {
    expect(resolveClientOrigin(probe("198.51.100.4"), "cloudflare").direct).toBe(false);
  });

  it("면제와 direct는 다른 판단이다 — 프록시 뒤 로컬 호출은 direct지만 면제는 아니다", () => {
    const r = resolveClientOrigin(probe("::1"), "cloudflare");
    expect(r.direct).toBe(true);
    expect(r.exempt).toBe(false);
  });
});
