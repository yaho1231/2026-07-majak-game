/**
 * 관전 도크(분석 패널)의 **취향값** — 무엇을 켜 두고 무엇을 접어 두었나.
 *
 * ## 왜 별도 파일인가
 * App.tsx 안에 두면 `GameTable`(memo) 렌더 본문에서 localStorage를 직접 만지게 된다.
 * 그건 이미 한 번 크게 데인 자리다(storage.ts 머리말 — 렌더 본문의 맨몸
 * `window.localStorage` 접근이 첫 페인트를 통째로 터뜨렸다). 읽기·쓰기를 여기 모아
 * `safeStorage`만 지나가게 하고, 파싱이 실패하면 **기본값으로 조용히 되돌아간다**.
 *
 * ## 왜 저장하나
 * 중계석은 한 대회 내내 같은 화면을 쓴다. 새로고침·재접속·탁자 전환마다 「다음 쯔모
 * 미리보기」가 다시 켜지거나 「지연 15초」가 0으로 돌아가면 그건 설정이 아니라 사고다.
 * 실제로 `spectateDelay`·`overlayMode`·`focusSeat`는 여태 하나도 저장되지 않아
 * 새로고침 한 번에 전부 초기화됐다 — 지연은 **안전장치**라 특히 그렇다.
 *
 * ⚠ 여기서 만든 키는 전부 `storage.ts`의 `STORAGE_KEYS`에도 넣어야 한다. 빠뜨리면
 * 에러 바운더리의 최후 탈출구(`clearAllStorage`)가 그 키를 못 지운다.
 */

import { safeStorage } from "./storage.js";

/** 도크 구획 하나의 식별자. 순서가 곧 화면에 서는 순서다. */
export type DockSectionId = "settings" | "seats" | "waits" | "danger" | "nextDraw" | "trend";

export const DOCK_SECTIONS: readonly {
  id: DockSectionId;
  label: string;
  /** 끄고 켜는 스위치에 붙는 설명 — «이걸 끄면 무엇이 사라지나» */
  hint: string;
  /**
   * 자기 구획 상자를 갖는가. `false`면 **스위치에만** 서고 내용은 다른 구획 안에서
   * 그려진다 — 지금은 「오름패」 하나다(2026-08-24 사용자 요구: 좌석 분석 카드 안에서
   * 그 좌석의 오름패를 함께 보고 싶다). 스위치를 남겨 두는 이유는 이 값이 도크뿐
   * 아니라 **판 위의 «쏘이는 패» 표시**까지 끄는 유일한 손잡이이기 때문이다.
   */
  standalone?: boolean;
}[] = [
  { id: "settings", label: "관전 설정", hint: "탁자·되감기·오버레이·지연·중계 도구·일시정지·아래 자리" },
  { id: "seats", label: "좌석 분석", hint: "좌석별 점수·샹텐·지금 화료하면 얼마·도라·배패 점수·증강" },
  {
    id: "waits",
    label: "오름패",
    hint: "좌석 분석 카드 안의 오름패 줄 — 남은 장수와 그 패로 났을 때의 론/쯔모 값 (판 위의 «쏘이는 패» 표시도 함께 꺼집니다)",
    standalone: false,
  },
  {
    id: "danger",
    label: "위험패",
    hint: "쏘이는 패(사실) + 지금 두는 좌석의 손패 위험도 추정 (판 위의 위험도 색칠도 함께 꺼집니다)",
  },
  {
    id: "nextDraw",
    label: "다음 쯔모",
    hint: "패산 앞장과 뽑는 사람 — 가장 강한 스포일러입니다",
  },
  { id: "trend", label: "점수 추이", hint: "국별 점수 증감" },
] as const;

export interface DockPrefs {
  /** 도크 전체가 펼쳐져 있는가 */
  dockOpen: boolean;
  /** 구획이 **존재하는가** (끄면 아예 그리지 않는다) */
  on: Record<DockSectionId, boolean>;
  /** 구획이 펼쳐져 있는가 (접으면 제목줄만 남는다) */
  open: Record<DockSectionId, boolean>;
}

/**
 * 기본값. **`nextDraw`만 꺼져 있다** — 패산 앞장은 이 화면에서 가장 강한 스포일러라
 * 「보겠다」고 한 번 누른 사람에게만 보여야 한다. 나머지는 중계에서 늘 보는 것들이라
 * 켠 채로 시작한다.
 */
export const DEFAULT_DOCK_PREFS: DockPrefs = {
  dockOpen: true,
  on: { settings: true, seats: true, waits: true, danger: true, nextDraw: false, trend: true },
  open: { settings: true, seats: true, waits: true, danger: true, nextDraw: true, trend: true },
};

const DOCK_KEY = "majak.spectateDock";
const DELAY_KEY = "majak.spectateDelay";
const OVERLAY_KEY = "majak.spectateOverlay";
const FOCUS_KEY = "majak.spectateFocus";

function boolMap(raw: unknown, fallback: Record<DockSectionId, boolean>): Record<DockSectionId, boolean> {
  const out = { ...fallback };
  if (raw !== null && typeof raw === "object") {
    for (const s of DOCK_SECTIONS) {
      const v = (raw as Record<string, unknown>)[s.id];
      if (typeof v === "boolean") out[s.id] = v;
    }
  }
  return out;
}

export function loadDockPrefs(): DockPrefs {
  const raw = safeStorage.getItem(DOCK_KEY);
  if (raw === null) return DEFAULT_DOCK_PREFS;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    return {
      dockOpen: typeof j.dockOpen === "boolean" ? j.dockOpen : DEFAULT_DOCK_PREFS.dockOpen,
      on: boolMap(j.on, DEFAULT_DOCK_PREFS.on),
      open: boolMap(j.open, DEFAULT_DOCK_PREFS.open),
    };
  } catch {
    // 저장된 글이 깨졌으면 기본값이다. 여기서 던지면 관전 화면이 통째로 못 뜬다.
    return DEFAULT_DOCK_PREFS;
  }
}

export function saveDockPrefs(p: DockPrefs): void {
  safeStorage.setItem(DOCK_KEY, JSON.stringify(p));
}

/** 서버가 받아 주는 송출 지연 눈금. 목록 밖의 값이 저장돼 있으면 «없음»으로 본다. */
const DELAYS = [0, 5, 15, 30];

export function loadSpectateDelay(): number {
  const n = Number(safeStorage.getItem(DELAY_KEY) ?? "0");
  return DELAYS.includes(n) ? n : 0;
}

export function saveSpectateDelay(sec: number): void {
  safeStorage.setItem(DELAY_KEY, String(sec));
}

export type OverlayMode = "off" | "clear" | "green";

export function loadOverlayMode(): OverlayMode {
  const v = safeStorage.getItem(OVERLAY_KEY);
  return v === "clear" || v === "green" ? v : "off";
}

export function saveOverlayMode(m: OverlayMode): void {
  safeStorage.setItem(OVERLAY_KEY, m);
}

/**
 * 아래 자리 — `"dealer"` · `"turn"` · 좌석 id. 좌석 id는 방이 바뀌면 사라지는데,
 * `GameTable`이 못 찾으면 오야로 되돌아가므로 그대로 돌려줘도 안전하다.
 */
export function loadFocusSeat(): string {
  return safeStorage.getItem(FOCUS_KEY) ?? "dealer";
}

export function saveFocusSeat(s: string): void {
  safeStorage.setItem(FOCUS_KEY, s);
}
