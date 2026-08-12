/**
 * 신뢰 프록시 판정 — "이 연결의 진짜 클라이언트는 누구이고, 얼마나 믿을 수 있는가".
 *
 * `index.ts`에 인라인으로 있던 로직을 **순수 함수로** 꺼냈다. 이 판정 하나가
 * 서버의 모든 IP 기반 방어(연결 상한·메시지 토큰버킷·인증 무차별대입 차단·방 생성
 * 제한·연결 속도 제한)의 입구이고, 지금까지 **두 번** 조용히 뚫린 자리다
 * (감사 2026-08-05 #1, 2026-08-12 H-2). 서버를 띄우지 않고 표로 검증할 수 있어야 한다.
 *
 * 설계: docs/29_SECURITY_AUDIT_2026-08-12.md §H-2
 */

/** 판정에 필요한 최소 입력 — `IncomingMessage`의 부분집합이라 테스트가 표로 넣을 수 있다. */
export interface ProxyProbe {
  /** 소켓 상대 주소 (`req.socket.remoteAddress`). */
  socketIp: string | undefined;
  /** 헤더 (`req.headers`) — 이름은 소문자. */
  headers: Record<string, string | string[] | undefined>;
}

export interface ClientOrigin {
  /** 남용 방어의 키로 쓸 클라이언트 IP. */
  ip: string;
  /**
   * 원격 남용 방어를 **통째로 면제**할지.
   *
   * 참이 되는 경우는 하나뿐이다: **프록시를 아예 설정하지 않은 서버**(`trustProxy === ""`)에
   * 루프백에서 붙은 연결. 로컬 개발·테스트가 그 자리다.
   */
  exempt: boolean;
  /**
   * "이 머신에서 직접 온 요청"인가 — 소켓 상대가 루프백이고 프록시 헤더도 없다.
   * `/healthz`처럼 운영 도구에게만 열어 두는 문의 열쇠다. **면제와는 다른 판단**이라
   * 따로 들고 다닌다(겸했더니 한쪽을 고치면 다른 쪽이 깨졌다).
   */
  direct: boolean;
  /**
   * `trustProxy`가 켜져 있는데 그 헤더가 없었다 — 프록시 설정이 깨졌다는 신호.
   * 호출자가 로그로 알린다(판정 함수 자체는 부작용이 없다).
   */
  missingHeader: string | null;
}

/** 소켓 상대가 루프백(=같은 머신의 리버스 프록시)인지. */
export function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/** 헤더를 단일 문자열로 정규화 (중복 헤더는 첫 값만 취한다). */
export function headerValue(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = (v ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * 스푸핑 방지: 프록시 헤더는 **소켓 상대가 루프백일 때만** 신뢰한다. 외부에서
 * 포트에 직접 붙어 `CF-Connecting-IP`를 위조해도 그 연결의 소켓 주소는 루프백이
 * 아니므로 헤더가 무시되고 진짜 원격 주소가 쓰인다.
 *
 * ⚠ **면제는 프록시가 없을 때만이다.** 이 자리가 두 번 뚫렸다:
 *
 * 1차(2026-08-05 #1) — 헤더에서 **복원한 값**이 `127.0.0.1`처럼 보이기만 하면 면제였다.
 * 2차(2026-08-12 H-2) — 헤더가 **없으면** 면제였다. `TRUST_PROXY`를 켰다는 것은 "이 앞에는
 *   프록시가 있고 헤더는 반드시 온다"는 선언이므로 헤더 없음은 이상 신호인데, 그 이상
 *   신호를 서버의 모든 방어를 끄는 최대 권한으로 해석했다. 실패가 조용하다는 점까지 똑같았다.
 *
 * 그래서 이제 프록시가 설정된 서버에서는 **아무것도 면제하지 않는다.** 헤더가 빠지면
 * 진짜 소켓 주소를 키로 평범하게 제한을 걸고, `missingHeader`로 알린다.
 */
export function resolveClientOrigin(probe: ProxyProbe, trustProxy: string): ClientOrigin {
  const socketIp = probe.socketIp ?? "unknown";
  if (!isLoopback(socketIp)) {
    return { ip: socketIp, exempt: false, direct: false, missingHeader: null };
  }
  // 프록시를 설정하지 않은 서버 — 소켓 주소가 곧 클라이언트다 (로컬 개발·테스트).
  if (trustProxy === "") {
    return { ip: socketIp, exempt: true, direct: true, missingHeader: null };
  }
  if (trustProxy === "cloudflare") {
    // Cloudflare가 항상 덮어써 주는 헤더 — 클라이언트가 위조해도 엣지에서 교체된다.
    const cf = headerValue(probe.headers["cf-connecting-ip"]);
    if (cf !== undefined) return { ip: cf, exempt: false, direct: false, missingHeader: null };
    return { ip: socketIp, exempt: false, direct: true, missingHeader: "CF-Connecting-IP" };
  }
  if (trustProxy === "xff") {
    // 마지막 홉 = 바로 앞 프록시가 붙인 값. 앞쪽 항목은 클라이언트가 위조할 수 있다.
    const xff = headerValue(probe.headers["x-forwarded-for"]) ?? "";
    const hops = xff.split(",").map((s) => s.trim()).filter((s) => s !== "");
    const last = hops[hops.length - 1];
    if (last !== undefined) return { ip: last, exempt: false, direct: false, missingHeader: null };
    return { ip: socketIp, exempt: false, direct: true, missingHeader: "X-Forwarded-For" };
  }
  // 알 수 없는 TRUST_PROXY 값 — 설정 오타다. 면제하지 않는 쪽으로 닫는다.
  return { ip: socketIp, exempt: false, direct: true, missingHeader: null };
}
