/**
 * 마감 품질 회귀 가드 (감사 2026-08-17 §5 잔여분).
 *
 * 이 묶음은 "없어도 굴러가는" 것들의 모음이라 되돌아가기가 특히 쉽다.
 * 되묻는 창을 `window.confirm` 으로 되돌려도 화면은 멀쩡히 뜨고, 토스트 슬롯을
 * 하나로 줄여도 대개는 티가 안 난다 — 겹치는 날에만 드러난다.
 *
 * 정적 소스 스캔이다(이 패키지에는 jsdom이 없다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const SFX = readFileSync(join(HERE, "../src/sfx.ts"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

// ─────────────── 5-9 되묻는 창 ───────────────

describe("되묻는 창이 판을 멈추지 않는다", () => {
  it("window.confirm 을 쓰지 않는다", () => {
    /*
     * `window.confirm` 은 메인 스레드를 멈추는데 **서버의 결정 타이머는 흐른다** —
     * "정말 나갈까요?"를 읽는 사이 내 차례가 폴백으로 지나갔다. 초읽기 국(5초)에서는
     * 거의 확정이다.
     */
    expect(APP_CODE).not.toContain("window.confirm");
  });

  it("askConfirm 으로 물어보고, 호스트가 한 번 붙어 있다", () => {
    expect([...APP_CODE.matchAll(/askConfirm\(/g)].length).toBeGreaterThanOrEqual(4);
    expect([...APP_CODE.matchAll(/<ConfirmHost \/>/g)].length).toBe(1);
  });

  it("기본 포커스는 취소다", () => {
    // 되묻는 창의 기본값은 "아무 일도 일어나지 않음"이어야 한다 — Enter 를 습관적으로
    // 눌러 계정이 지워지는 일이 없게.
    const confirmSrc = readFileSync(join(HERE, "../src/confirm.tsx"), "utf8");
    expect(confirmSrc).toContain('querySelector<HTMLButtonElement>(".confirm-cancel")?.focus');
  });
});

// ─────────────── 5-8 토스트 ───────────────

describe("통지가 서로를 지우지 않는다", () => {
  it("토스트가 여러 개 쌓인다", () => {
    expect(APP_CODE).toContain("TOAST_MAX");
    expect(APP_CODE).toMatch(/const \[toasts, setToasts\] = useState<Toast\[\]>/);
  });

  it("보조기술에도 나간다", () => {
    // "시간 초과 — 패스로 자동 진행했습니다" 가 가장 중요한 통보인데 전혀 안 갔다.
    const at = APP_CODE.indexOf('className="toast-stack"');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 200)).toContain('role="status"');
  });

  it("같은 문장이 연달아 쌓이지 않는다", () => {
    const at = APP_CODE.indexOf("function showToast(");
    expect(APP_CODE.slice(at, at + 500)).toContain("cur[cur.length - 1]?.text === text");
  });
});

// ─────────────── 5-3 · 5-4 · 5-16 소리와 진동 ───────────────

describe("소리·진동이 손잡이를 갖는다", () => {
  it("효과음 음량 손잡이가 있다", () => {
    // 마스터 게인은 원래 있었고 손잡이만 없었다 — BGM 은 슬라이더가 둘인데 효과음만 on/off.
    expect(SFX).toContain("export function setSfxVolume");
    expect(APP_CODE).toContain('props.onSetting("sfxVolume"');
  });

  it("진동이 있고, 소리와 별개이며, 움직임 줄이기를 따른다", () => {
    const hap = readFileSync(join(HERE, "../src/haptics.ts"), "utf8");
    expect(hap).toContain("navigator.vibrate");
    expect(hap).toContain("prefers-reduced-motion");
    // 소리를 끈 사람에게 진동까지 사라지면 "조용히 하고 싶다"를 "신호가 필요 없다"로
    // 잘못 읽는 것이다.
    expect(APP_CODE).toContain("haptics.discard()");
  });

  it("진동 장치가 없으면 설정에 죽은 스위치를 두지 않는다", () => {
    expect(APP_CODE).toContain("hapticsSupported()");
  });

  it("설정을 켜면 그 자리에서 들린다", () => {
    // 예전에는 효과음을 켜도 아무 소리가 안 나서 켜졌는지 알 수 없었다.
    const at = APP_CODE.indexOf("function updateSetting<");
    const block = APP_CODE.slice(at, at + 900);
    expect(block).toContain("sfx.pick()");
  });

  it("죽은 별칭을 남겨 두지 않는다", () => {
    // win()/call() 은 ron()/callPon() 으로 넘기기만 하는 미사용 별칭이었다.
    expect(SFX).not.toMatch(/^\s{2}win\(\): void \{/m);
    expect(SFX).not.toMatch(/^\s{2}call\(\): void \{/m);
  });
});

// ─────────────── 5-6 · 5-7 중복·무반응 ───────────────

describe("누른 것이 눌렸다고 말한다", () => {
  it("새로 고침이 공용 버튼을 쓴다", () => {
    expect(APP_CODE).toContain("function RefreshButton(");
    expect([...APP_CODE.matchAll(/<RefreshButton /g)].length).toBeGreaterThanOrEqual(9);
  });

  it("보내는 중에는 다시 눌리지 않는다", () => {
    // 액션 제출은 규율을 지키는데 로비·인증·제보에는 그 규율이 오지 않았다.
    expect(APP_CODE).toContain("const [sending, setSending] = useState(false)");
    expect(APP_CODE).toContain("올리는 중…");
    expect(APP_CODE).toContain("확인 중…");
  });
});

// ─────────────── 5-10 · 5-11 · 5-12 리플레이 ───────────────

describe("리플레이가 손에 잡힌다", () => {
  it("끝난 판을 그 자리에서 다시 볼 수 있다", () => {
    // 예전에는 로비로 나가 목록에서 찾아야 했다 — 방금 진 판이 가장 보고 싶은 판인데.
    expect(APP_CODE).toContain("onOpenReplay");
    expect(APP_CODE).toContain("이 판 다시 보기");
    // 서버가 그 판의 id 를 결과와 함께 보내 준다.
    const room = readFileSync(join(HERE, "../../server/src/RoomManager.ts"), "utf8");
    expect(room).toContain("gameId: recordedId");
  });

  it("위치가 배열 인덱스가 아니라 국 기준이다", () => {
    // "137 / 842" 는 사람에게 뜻이 없는 수다.
    const at = APP_CODE.indexOf('className="replayer-pos"');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 400)).toContain("roundLabel");
  });

  it("키보드로 넘길 수 있다", () => {
    expect(APP_CODE).toContain('e.key === "ArrowRight"');
    expect(APP_CODE).toContain('e.key === "ArrowLeft"');
    expect(APP_CODE).toContain('e.key === "Home"');
    expect(APP_CODE).toContain('e.key === "End"');
    // 글자를 치는 칸에서는 듣지 않는다.
    expect(APP_CODE).toMatch(/INPUT\|TEXTAREA\|SELECT/);
  });
});

// ─────────────── 5-14 · 5-15 · 5-18 ───────────────

describe("모르는 사이에 일어나는 일을 줄인다", () => {
  it("자동 진행을 켜면 무슨 일이 일어나는지 말해 준다", () => {
    // 되묻는 모달은 일부러 쓰지 않는다(2026-08-12 사용자 지시) — 문제는 되묻지 않는
    // 것이 아니라 켜진 줄 모르는 것이었다.
    expect(APP_CODE).toContain("자동버림 켜짐");
    expect(APP_CODE).toContain("자동화료 켜짐");
  });

  it("연출 속도를 고를 수 있다", () => {
    expect(APP_CODE).toContain("prodSpeed");
    expect(APP_CODE).toMatch(/effectiveProdTtl\([^)]*speed/);
    expect(CSS).toContain(".settings-seg");
  });

  it("이름 없는 액션이 조용히 지나가지 않는다", () => {
    // 등록을 빠뜨리면 `swap3_give` 같은 내부 id 가 그대로 버튼에 찍혔다.
    expect(APP_CODE).toContain("function actionLabel(");
    expect(APP_CODE).toMatch(/import\.meta\.env\.DEV/);
    // 부르는 자리에서 폴백을 다시 이어 붙이면 경고가 무력해진다.
    expect(APP_CODE).not.toMatch(/ACTION_LABEL\[o\.type\] \?\?/);
  });
});
