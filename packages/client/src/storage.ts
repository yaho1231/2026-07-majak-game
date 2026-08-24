/**
 * safeStorage — localStorage를 **던지지 않는** 형태로 감싼다.
 *
 * **왜** (감사 2026-08-17 §2-8): 앱 곳곳이 `window.localStorage`를 맨몸으로 불렀고,
 * 그중 하나는 컴포넌트 **렌더 본문**에 있었다(`App.tsx`의 마지막 방 코드 읽기).
 * 크롬 "모든 쿠키/사이트 데이터 차단", iOS 잠금 모드 계열, 일부 인앱 브라우저에서는
 * `window.localStorage` **접근 자체가** `SecurityError`를 던진다. 그러면 첫 렌더가
 * 통째로 터지고, 에러 바운더리가 없던 시절에는 그게 곧 영구 흰 화면이었다.
 *
 * 저장이 안 되는 브라우저에서도 게임은 돌아야 한다 — 잃는 것은 자동 로그인과
 * 설정 유지뿐이다. 그래서 실패는 조용히 흡수하고, 대신 **그 세션 동안만 사는**
 * 메모리 사본을 쓴다(한 세션 안에서는 설정이 유지된다).
 */

type Backing = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const memory = new Map<string, string>();
const memoryBacking: Backing = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

/**
 * 진짜 localStorage를 쓸 수 있는지 **한 번만** 확인한다.
 *
 * 존재 여부(`"localStorage" in window`)로는 부족하다 — 사파리 프라이빗은 객체를
 * 주고 나서 `setItem`에서 터졌던 전력이 있다. 실제로 써 보고 판단한다.
 */
function probe(): Backing {
  try {
    const ls = window.localStorage;
    const probeKey = "majak.__probe";
    ls.setItem(probeKey, "1");
    ls.removeItem(probeKey);
    return ls;
  } catch {
    console.warn("[storage] localStorage를 쓸 수 없습니다 — 이 세션에서만 설정이 유지됩니다.");
    return memoryBacking;
  }
}

let backing: Backing | null = null;
function target(): Backing {
  if (backing === null) backing = probe();
  return backing;
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return target().getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      target().setItem(key, value);
    } catch {
      // 용량 초과(QuotaExceededError)도 여기로 온다. 설정 하나 못 저장한다고
      // 게임을 멈출 이유는 없다.
    }
  },
  removeItem(key: string): void {
    try {
      target().removeItem(key);
    } catch {
      /* 지우지 못해도 진행한다 */
    }
  },
};

/**
 * 이 앱이 쓰는 localStorage 키 전부. 에러 바운더리의 "저장된 상태 지우고 시작"이
 * 무엇을 지우는지 한 곳에서 보이게 하려고 모아 둔다.
 *
 * ⚠ 새 키를 만들면 여기에도 넣어라. 빠뜨리면 "처음부터"가 처음부터가 아니게 되고,
 * 그게 정확히 사용자가 마지막으로 기대는 탈출구다.
 */
export const STORAGE_KEYS = [
  "majak.serverUrl",
  "majak.sessionToken",
  "majak.sessionServer",
  "majak.guestToken",
  "majak.lastRoomCode",
  "majak.settings",
  "majak.uiZoom",
  "majak.browserZoomed",
  /*
   * 「가로로 돌리세요」 안내를 닫은 사실(App.tsx `ROTATE_HINT_KEY`). 폰 세로에서
   * 이 안내는 52px 짜리 띠를 차지하므로 한 번 닫은 것을 기억한다 — 그러니 «처음부터»
   * 에는 다시 뜨는 것이 맞다(2026-08-25 폰 세로 재설계).
   */
  "majak.rotateHintOff",
  "majak.homeFolded",
  "majak.homeTab",
  "majak.sandboxMode",
  /*
   * `tutorial.ts`의 `TUTORIAL_KEY`. 여기 빠져 있었다 — 가드 테스트가 App.tsx·
   * uiScale.ts의 **문자열 리터럴만** 훑는데 이 키는 다른 파일의 상수라 스캔에
   * 안 잡혔다. 그 탓에 에러 바운더리의 최후 탈출구를 눌러 계정까지 지우고 다시
   * 가입해도 새 계정이 가입 직후 튜토리얼 판으로 안내되지 않았다.
   */
  "majak.tutorialDone",
  /*
   * 관전 도크(중계 분석 패널)의 취향값 — `spectateDock.ts`가 쓴다.
   * 넷 다 관리자 관전 전용이지만 «처음부터»가 처음부터여야 하는 건 같다.
   * 특히 `spectateDelay`는 안전장치라, 지우고 다시 시작하면 «없음»으로 돌아가야
   * 운영자가 다시 한 번 고르게 된다.
   */
  "majak.spectateDock",
  "majak.spectateDelay",
  "majak.spectateOverlay",
  "majak.spectateFocus",
] as const;

/** 방 복귀 정보만 지운다 — 로그인은 유지한 채 "그 판"에서만 빠져나오는 용도. */
export function forgetLastRoom(): void {
  safeStorage.removeItem("majak.lastRoomCode");
}

/** 저장된 것을 전부 지운다 (로그아웃 + 설정 초기화). 최후의 탈출구. */
export function clearAllStorage(): void {
  for (const k of STORAGE_KEYS) safeStorage.removeItem(k);
}
