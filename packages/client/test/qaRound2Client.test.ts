/**
 * QA 2차 클라이언트 감사(`qa-lab/round2/client.md`) 수리 회귀 가드.
 *
 * 여기 걸린 것들은 전부 **기존 556개 그물 바깥**에서 잡힌 것이다. 대부분 «어느
 * 조건에서만 드러나는 배치·상태 누수»라 화면을 열어 보는 것으로는 다시 못 찾는다 —
 * 되돌아가면 조용히 되돌아간다. 그래서 못을 박는다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔 + 순수 모듈 단위 테스트**다
 * (`codexFilter.test.ts`·`bootAndCrashGuards.test.ts`와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");
const REBUILD = read("../src/replayRebuild.ts");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** `selector {` 부터 짝이 맞는 `}` 직전까지 — 한 규칙 블록의 본문 */
function ruleBody(selector: string): string {
  const at = CSS_CODE.indexOf(`${selector} {`);
  expect(at, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  const start = CSS_CODE.indexOf("{", at);
  return CSS_CODE.slice(start, CSS_CODE.indexOf("}", start));
}

// ─────────────── 확정 1·2·15 (앞선 시도가 남긴 CSS 수리의 검증) ───────────────

describe("화면 아래 고정 표면이 내 손패를 덮지 않는다", () => {
  it("연출 «건너뛰기» 알약이 토스트와 같은 기준으로 비켜선다", () => {
    // 토스트는 2026-08-19에 이 수리를 받았는데 이 알약만 `bottom: 12px`로 남아,
    // 375×812 폰 세로에서 손패 가운데 다섯 장을 타일 높이 전부 가렸다.
    expect(ruleBody(".prod-skip")).toContain("--own-band-full");
    expect(ruleBody(".toast-stack")).toContain("--own-band-full");
  });
});

describe("좁은 배치의 보호 장치가 UI 배율에서도 걸린다", () => {
  it("`--own-reserve`를 켜는 블록이 @container ui 기준이다", () => {
    /*
     * 배치를 가르는 규칙은 전부 `@container ui`(배율이 곱해진 가상 뷰포트)인데
     * 그 배치의 부작용을 막는 값만 `@media`(실제 기기 px)에 있었다. 800×1200 창 +
     * 배율 2.0이면 좁은 배치는 전부 켜지는데 이 블록만 하나도 안 걸렸다 —
     * 큰 글씨를 쓰려고 배율을 올린 사람이 정확히 그 보호를 못 받았다.
     */
    const at = CSS_CODE.indexOf("--own-reserve: 68px");
    expect(at).toBeGreaterThan(0);
    const before = CSS_CODE.slice(0, at);
    const query = before.slice(before.lastIndexOf("@"));
    expect(query.startsWith("@container ui (max-width: 480px)")).toBe(true);
  });

  it("`--own-reserve`를 켜는 곳은 여전히 한 곳뿐이다", () => {
    // 두 저울에 나눠 걸리면 같은 어긋남이 되살아난다.
    expect([...CSS_CODE.matchAll(/--own-reserve:\s*68px/g)]).toHaveLength(1);
  });
});

describe("포커스 링을 지우기만 하는 규칙이 없다", () => {
  it("「대화」 버튼에 링이 되돌아왔다", () => {
    // 전역 `:where(...)` 규칙과 `.emote-toggle`이 같은 특이성 (0,1,0)이라 파일에서
    // 뒤에 온 `.emote-toggle`이 이겼고, 링이 통째로 덮여 `outline: none`만 남았다.
    expect(ruleBody(".emote-toggle:focus-visible")).toContain(
      "0 0 0 4px var(--brass-bright)",
    );
  });

  it("공지 띠 머리의 링이 황동 두 겹이다 (의심 9)", () => {
    // `--line-strong` 링은 공지 배경 위에서 ≈1.5:1 — WCAG 2.4.11(3:1) 미달인데
    // 특이성 (0,2,0)이라 보이는 전역 링을 밀어냈다.
    const body = ruleBody(".notice-head-clickable:focus-visible");
    expect(body).toContain("0 0 0 4px var(--brass-bright)");
    expect(body).not.toContain("outline: 2px solid var(--line-strong)");
  });
});

// ─────────────── 확정 3 튜토리얼 코치 누수 ───────────────

describe("튜토리얼 코치가 판을 나가면 함께 꺼진다", () => {
  const body = (() => {
    const at = APP_CODE.indexOf("function resetGameState()");
    expect(at).toBeGreaterThan(0);
    return APP_CODE.slice(at, APP_CODE.indexOf("\n  }", at));
  })();

  it("resetGameState가 coachOn·coachLock·hold를 모두 되돌린다", () => {
    /*
     * 끄는 자리가 코치 자신의 onFinish와 «연습 대국(안내 없음)» 둘뿐이라, 강의
     * 도중 「나가기」를 누르면 코치가 켜진 채 홈으로 나왔다. 그 뒤 아무 실전 판에
     * 들어가면 `how: "augment"` 잠금이 걸려 **어떤 패도 버릴 수 없는** 구간이
     * 생겼다 — 소프트락에 가장 가까운 건이었다.
     */
    expect(body).toContain("setCoachOn(false)");
    expect(body).toContain("coachOnRef.current = false");
    expect(body).toContain("setCoachLock(null)");
    expect(body).toContain("coachHoldSent.current = false");
  });

  it("방을 떠나는 경로가 전부 resetGameState를 지난다", () => {
    for (const fn of ["function returnHome()", "function logout("]) {
      const at = APP_CODE.indexOf(fn);
      expect(at, `${fn} 이 없다`).toBeGreaterThan(0);
      expect(APP_CODE.slice(at, at + 1400)).toContain("resetGameState()");
    }
  });
});

// ─────────────── 확정 4·5 드래그 입력 ───────────────

describe("드래그가 낡은 판단으로 수를 내지 않는다", () => {
  it("리스너가 최신 값을 ref에서 읽는다", () => {
    // window 리스너는 `[drag !== null]` 하나로만 재구독한다 — 드래그가 시작된
    // 렌더의 `discardOptionFor`·`autoSort`·`onSubmit`을 붙잡고 있었다.
    expect(APP_CODE).toContain("const dragLiveRef = useRef({");
    expect(APP_CODE).toContain("const live = dragLiveRef.current;");
    expect(APP_CODE).toContain("live.discardOptionFor(b.id)");
    expect(APP_CODE).toContain("if (!dragLiveRef.current.autoSort)");
  });

  it("손을 뗄 때 드롭존 위인가를 다시 잰다", () => {
    // `b.overDiscard`는 마지막 pointermove의 값이라, 포인터를 멈춘 채 프롬프트가
    // 죽어 드롭존이 언마운트돼도 true로 남았다.
    expect(APP_CODE).toContain("const overDiscardNow =");
    const at = APP_CODE.indexOf("function onUp(");
    const onUp = APP_CODE.slice(at, APP_CODE.indexOf("window.addEventListener", at));
    expect(onUp).not.toContain("if (b.overDiscard)");
  });

  it("프롬프트는 방금 보낸 수의 것일 때만 걷는다", () => {
    // 전송 성공만으로 무조건 걷어서, 그 사이 도착한 론/치·펑 프롬프트가 사라졌다.
    const at = APP_CODE.indexOf("function submitOption(");
    const fn = APP_CODE.slice(at, APP_CODE.indexOf("\n  }", at));
    expect(fn).toContain("shown.options.some((o) => o.type === option.type)");
    expect(fn).not.toMatch(/if \(seat !== undefined\) dropPrompt\(seat\);/);
  });

  it("드래그 뒤 유령 click 무시가 시각 기준이다 (확정 5)", () => {
    // boolean 플래그는 타일 onClick 안에서만 풀려서, 재정렬·드롭존 드롭처럼 click이
    // 타일이 아닌 조상에서 나는 경우 true로 남아 **사람의 진짜 클릭 한 번**이 먹혔다.
    expect(APP_CODE).not.toContain("suppressClickRef");
    expect(APP_CODE).toContain("suppressClickUntil.current = Date.now() + SUPPRESS_CLICK_MS");
    expect(APP_CODE).toContain("if (Date.now() < suppressClickUntil.current)");
  });
});

// ─────────────── 확정 6 우마·오카 단위 ───────────────

describe("최종 순위표의 세 숫자가 같은 단위다", () => {
  it("우마·오카를 점 단위로 환산해 찍는다", () => {
    // 서버는 k단위(`uma: [5, 15]`)로 싣는데 옆 `rawScore`·`score`는 점 단위라,
    // «40,000점 · 우마 +15» 옆에 «+30,000»이 섰다 — 1000배 어긋난 세 수.
    expect(APP_CODE).toContain("(r.uma * 1000).toLocaleString()");
    expect(APP_CODE).toContain("(r.oka * 1000).toLocaleString()");
  });
});

// ─────────────── 확정 7·8 두 번 눌러 버리기 게이트 ───────────────

describe("«두 번 눌러 버리기» 게이트에 구멍이 없다", () => {
  it("리치 모드가 바뀌면 들어 올린 패를 내린다 (확정 7)", () => {
    // 리치 전환은 같은 프롬프트 안에서 일어난다 — 들어 올린 뒤 [리치]를 누르고
    // 같은 패를 한 번 더 탭하면 게이트를 건너뛰고 **리치가 그대로 확정**됐다.
    const at = APP_CODE.indexOf("setArmedTileId(null);\n  }, [props.riichiMode]);");
    expect(at, "riichiMode 리셋 이펙트가 없다").toBeGreaterThan(0);
  });

  it("무장형 리치에도 게이트가 걸린다 (확정 8)", () => {
    // 무장 분기가 게이트보다 위에서 return 해서, 오픈 리치·올인 리치가 오탭 한 번에
    // 확정됐다 — 더 되돌릴 수 없는 수에 게이트가 더 약할 이유가 없다.
    const at = APP_CODE.indexOf("if (armedAug !== null) {\n                    const opts = armedByTile.get(id);");
    expect(at).toBeGreaterThan(0);
    const branch = APP_CODE.slice(at, at + 900);
    expect(branch).toContain("props.tapTwiceToDiscard");
    expect(branch).toContain("DRAG_DISCARD_ARM_TYPES.has(armedAug)");
    // 게이트를 통과한 뒤에는 들어 올림을 반드시 내린다
    expect(branch.indexOf("setArmedTileId(null);")).toBeLessThan(
      branch.indexOf("sel.submit(opts[0]!)"),
    );
  });

  it("프롬프트 취소도 promptSeq를 올린다 (의심 4)", () => {
    // 도착 경로에만 있어서, 시간 초과로 접힌 순에는 «한 번 더» 뱃지가 남았다.
    const at = APP_CODE.indexOf('if (msg.type === "promptCancel")');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, APP_CODE.indexOf("\n      return;", at))).toContain(
      "setPromptSeq((s) => s + 1)",
    );
  });
});

// ─────────────── 확정 9 진동 스위치 ───────────────

describe("«진동»을 끄면 그 자리에서 멎는다", () => {
  it("동기화 이펙트가 haptics·sfxVolume까지 의존성에 담는다", () => {
    expect(APP_CODE).toContain(
      "}, [settings.sfxOn, settings.sfxVolume, settings.haptics]);",
    );
  });

  it("updateSetting이 끄기도 즉시 반영한다", () => {
    // 예전에는 `key === "haptics" && value === true` 뿐이라 끄기 경로가 없었고,
    // 이펙트마저 의존성이 빠져 있어 그 세션 내내 계속 울렸다 — 죽은 접근성 스위치.
    expect(APP_CODE).toContain(
      'setHapticsEnabled(value === true && hapticsSupported());',
    );
  });
});

// ─────────────── 확정 10 중계 오버레이 ───────────────

describe("중계 오버레이가 내 대국 판을 칠하지 않는다", () => {
  it("관전 중이 아니면 GameTable에 «off»가 내려간다", () => {
    expect(APP_CODE).toContain('overlayMode={spectating === null ? "off" : overlayMode}');
  });

  it("방을 떠나면 값 자체도 되돌아간다", () => {
    const at = APP_CODE.indexOf("function resetGameState()");
    expect(APP_CODE.slice(at, APP_CODE.indexOf("\n  }", at))).toContain(
      'setOverlayMode("off")',
    );
  });
});

// ─────────────── 확정 11 후로 줄 ───────────────

describe("내 후로 줄이 손패 위로 올라타지 않는다", () => {
  it("폭 상한과 스크롤이 있다", () => {
    const body = ruleBody(".own-corner-right");
    expect(body).toContain("max-width: var(--own-corner-max, none)");
    expect(body).toContain("overflow-x: auto");
  });

  it("남는 폭을 OwnArea가 실측해 올려 준다", () => {
    // CSS만으로는 손패 레일 폭을 알 수 없다(`--hand-w`·`--hand-slots`는 레일에서만 산다).
    expect(APP_CODE).toContain('root.style.setProperty("--own-corner-max"');
    expect(APP_CODE).toContain('root.style.removeProperty("--own-corner-max")');
  });
});

// ─────────────── 확정 12 액티브 증강 버튼 ───────────────

describe("예지 재배열만 남은 순에 «(0)» 버튼이 서지 않는다", () => {
  it("버튼이 보는 목록에서 foresight_order를 뺀다", () => {
    // 콘텐츠는 발동을 못 쓰는 순에 후보를 ORDER만 24개 낸다 → usable=true·types=[]
    // → 활성인데 «(0)», 빈 메뉴, 그리고 툴팁에 «undefined 사용»이 그대로 떴다.
    expect(APP_CODE).toContain(
      'const menuOptions = augOptions.filter((o) => o.type !== "foresight_order");',
    );
    expect(APP_CODE).toContain("const usable = menuOptions.length > 0;");
    expect(APP_CODE).toContain("if (!hasActive && menuOptions.length === 0) return null;");
  });

  it("툴팁이 내부값을 흘리지 않는다", () => {
    expect(APP_CODE).not.toContain("augNameFor(types[0]!)");
    expect(APP_CODE).toContain("usable && types.length > 0");
  });
});

// ─────────────── 확정 13 리플레이 z축 ───────────────

describe("「이 판 다시 보기」가 순위표 위에 선다", () => {
  it(".replayer가 자기 쌓임 맥락을 만든다", () => {
    // z-index: auto 라 자손인 `.replayer-bar`(60)만 순위표 `.overlay`(50) 위로
    // 삐져나오고 판은 뒤에 깔렸다 — 재생 바가 안 보이는 판을 조작했다.
    const body = ruleBody(".replayer");
    expect(body).toContain("isolation: isolate");
    expect(body).toMatch(/z-index:\s*55/);
  });
});

// ─────────────── 확정 14 리플레이 재구성 ───────────────

describe("리플레이가 한 줄 때문에 통째로 닫히지 않는다", () => {
  it("JSON 파싱과 dispatch를 모두 감싼다", () => {
    // 서버 ReplayReader와 같은 정책 — 잘린 마지막 줄에서 끊고 «여기까지»로 물러난다.
    expect(REBUILD).toContain("try {\n      event = JSON.parse(line) as GameEvent;");
    expect(REBUILD).toContain("state = game.engine.reducers.dispatch(state, event);\n    } catch");
  });

  // 이 하나만 실제 모듈을 불러 돌린다 — `@majak/content` 전량(증강 117종)을 함께
  // 끌어오므로 병렬 부하에서는 기본 5초를 넘긴다. 넉넉히 준다.
  it("잘린 줄이 있어도 그 앞까지 되살린다", { timeout: 30_000 }, async () => {
    const { rebuildReplay } = await import("../src/replayRebuild.js");
    const good = rebuildReplay(SAMPLE_LINES);
    // 마지막 줄을 반만 써 놓는다(SIGKILL로 끊긴 append와 같은 모양)
    const torn = rebuildReplay([...SAMPLE_LINES, '{"type":"Roun']);
    expect(torn.events.length).toBe(good.events.length);
    expect(torn.states.length).toBe(good.states.length);
  });
});

/** `__init__` 한 줄짜리 최소 리플레이 — 재구성이 «끊고 물러나는지»만 본다 */
const SAMPLE_LINES: string[] = [
  JSON.stringify({
    type: "__init__",
    payload: {
      config: { playerIds: ["p0", "p1", "p2", "p3"], seed: 1 },
      options: {},
    },
  }),
];

// ─────────────── 확정 16·17 색·단위 ───────────────

describe("폐기 선언된 값이 남아 있지 않다", () => {
  it("#5f7469 리터럴이 사라졌다 (확정 16)", () => {
    // 패널 채움 위에서 3.68:1 — 본문 4.5:1 미달. §1 토큰 주석이 스스로 «못 쓴다»고
    // 적어 두었는데 아홉 곳에 그대로 남아 있었다.
    expect(CSS_CODE).not.toContain("#5f7469");
  });

  it("화면 비례 단위가 전부 cq* 다 (확정 17)", () => {
    // 파일 규약(§1 :127). `vw`는 UI 배율을 안 봐서, 390px 폰 + 배율 2.0이면
    // 상자가 화면 폭의 1.7~1.8배가 됐다.
    expect(CSS_CODE).not.toMatch(/\d(vw|vh|vmin)\b/);
  });
});

// ─────────────── 확정 18 함구령 잔량 ───────────────

describe("함구령의 «남은 횟수»가 pill에 뜬다", () => {
  it("call_seal 분기가 usesStatus 뒤에 있고 withUses를 쓴다", () => {
    // 이 분기가 usesStatus보다 위에서 곧바로 return 해서, 봉인 전·만료 후에는 아무
    // 칩도 없고 봉인 중에는 «6순»만 떠 잔량이 통째로 묻혔다. 바로 아래 hand_swap3는
    // 같은 자리에서 옳게 처리하고 있었다.
    const seal = APP_CODE.indexOf('if (augId === "call_seal")');
    const uses = APP_CODE.indexOf("const usesStatus: PillStatus | null =");
    expect(seal).toBeGreaterThan(uses);
    const branch = APP_CODE.slice(seal, seal + 500);
    expect(branch).toContain("return usesStatus");
    expect(branch).toContain("return withUses({");
  });
});

// ─────────────── 확정 19 박무의 «최신 타패» 링 ───────────────

describe("«최신 타패» 금색 링은 판에 하나뿐이다", () => {
  it("테이블 최신 버림의 주인일 때만 rt-latest를 붙인다", () => {
    // 박무의 count_only 구간에서는 네 사람이 저마다 «자기 마지막 한 장»을 띄우므로
    // 강 네 개가 동시에 금색 링을 달았다 — 누가 방금 버렸는지 판독 불가.
    expect(APP_CODE).toContain(
      "const isTableLatest = last !== null && last.player === playerId;",
    );
    expect(APP_CODE).toContain('`rt${isTableLatest ? " rt-latest" : ""}${rot}`');
  });

  it("key에 tileId가 들어가 착지 플래시가 다시 재생된다", () => {
    expect(APP_CODE).toContain("key={`h${i}:${ownLastId}`}");
  });
});

// ─────────────── 확정 20 «처음부터» ───────────────

describe("«처음부터»가 정말 처음부터다", () => {
  it("튜토리얼 열쇠가 목록에 있다", async () => {
    const { STORAGE_KEYS } = await import("../src/storage.js");
    const { TUTORIAL_KEY } = await import("../src/tutorial.js");
    expect([...STORAGE_KEYS]).toContain(TUTORIAL_KEY);
  });
});

// ─────────────── 확정 21·22·23 위쪽 고정 표면 ───────────────

describe("화면 위쪽 고정 표면들이 서로를 가리지 않는다", () => {
  it("배치 안내가 봇 난이도 배지 아래로 내려간다 (확정 21)", () => {
    // z 310 짜리 안내가 z 40 배지를 정면으로 덮어, 배지의 유일한 쓰임(툴팁으로
    // 난이도 읽기)이 통째로 막혔다.
    const hint = ruleBody(".layout-hint");
    const top = /top:\s*(\d+)px/.exec(hint)?.[1];
    expect(Number(top)).toBeGreaterThanOrEqual(94); // .bot-diff-badge 아래끝
  });

  it("재연결 띠가 떠 있으면 무효 투표 배너가 그 아래로 내려간다 (확정 22)", () => {
    expect(CSS_CODE).toContain("body.reconnecting .abort-banner");
    expect(APP_CODE).toContain('document.body.classList.toggle("reconnecting"');
  });

  it("좁은 폭에서 방 공지가 아이콘 줄 아래로 내려간다 (확정 23)", () => {
    expect(CSS_CODE).toContain(".room-notice:not(.room-notice-spec)");
  });
});

// ─────────────── 확정 24 드래프트 «자세히» ───────────────

describe("증강을 고른 뒤에도 설명을 읽을 수 있다", () => {
  it("카드에 disabled를 걸지 않는다", () => {
    // `disabled`를 걸면 카드 **안**의 «자세히 ▾»까지 함께 죽는다(포인터 이벤트가
    // 통째로 꺼진다) — 바로 위 주석이 잠긴 카드에 대해 이미 말한 것과 같은 이유다.
    expect(APP_CODE).not.toContain("disabled={picked}");
    expect(APP_CODE).toContain("aria-disabled={lockedOut || picked || undefined}");
    expect(APP_CODE).toContain("onClick={lockedOut || picked ? undefined : () => onPick(c.id)}");
  });

  it("잠긴 카드 묶음에서도 «자세히»만은 클릭이 산다", () => {
    expect(CSS_CODE).toContain(".draft-cards-locked .draft-card .augdesc-more");
    expect(ruleBody(".draft-cards-locked")).not.toContain("pointer-events: none");
  });
});

// ─────────────── 확정 25·27·28·31 리플레이·되감기 조작 ───────────────

describe("리플레이 조작이 사람 손을 따라간다", () => {
  it("열어 둔 정산을 배열 위치가 아니라 이벤트 인덱스로 기억한다 (확정 25)", () => {
    // 길이가 변하는 배열의 인덱스라, 되감으면 «닫힌 것처럼» 사라졌다가 앞으로 가면
    // 저절로 다시 떴다 — 사용자는 닫은 적이 없다.
    expect(APP_CODE).toContain("const openSettlement =");
    expect(APP_CODE).toContain("shownSettlements.find((sx) => sx.index === openSettle)");
    expect(APP_CODE).toContain("if (openSettle !== null && idx < openSettle) setOpenSettle(null);");
  });

  it("드래프트 경고가 실제 남은 초를 말한다 (확정 26)", () => {
    expect(APP_CODE).toContain("`🎲 ${remainSec}초 남았습니다");
    expect(APP).not.toContain('"🎲 10초 남았다');
  });

  it("⏮ 이 «이 국의 처음»으로 간다 (확정 27)", () => {
    const at = APP_CODE.indexOf("function jumpRound(");
    const fn = APP_CODE.slice(at, APP_CODE.indexOf("\n  }", at));
    expect(fn).toContain("const here = replay!.roundStarts[currentRound - 1];");
    expect(fn).toContain("if (here !== undefined && idx > here)");
  });

  it("Space가 포커스된 버튼에 양보한다 (확정 28)", () => {
    // `preventDefault()`가 버튼 활성화를 막아, 키보드 사용자는 🧾·속도·⏮ 을
    // Enter로만 쓸 수 있었다.
    expect(APP_CODE).toContain("const onButton =");
    expect(APP_CODE).toContain("el.closest(\"button, [role='button'], a[href]\")");
  });

  it("맨 앞·맨 뒤에서 이동 버튼이 잠긴다 (확정 31)", () => {
    expect(APP_CODE).toContain("disabled={idx <= 0}");
    expect(APP_CODE).toContain("disabled={idx >= total}");
    expect(APP_CODE).toContain("disabled={!playing && idx >= total}");
    // 관전 되감기 ◀ 도 같은 규칙 (짝인 ▶ 에만 있었다).
    // 도크로 옮기면서 rewindLen 이 필수 prop 이 되어 `?? 0` 이 사라졌다 — 규칙은 그대로다.
    expect(APP_CODE).toContain("disabled={(props.rewindAt ?? props.rewindLen - 1) <= 0}");
  });
});

// ─────────────── 확정 29 가깡 칸 수 ───────────────

describe("후로 줄 예산이 «칸» 수를 센다", () => {
  it("가깡은 장수(4)가 아니라 칸수(3)로 센다", () => {
    // `--meld-n`은 칸 예산인데 `tileIds.length`를 그대로 셌다. 가깡은 4장째를 울어
    // 온 패 위에 겹쳐 쌓으므로 3칸이다 — 1회당 1칸씩 과다 계상되어, 뒷면과 예산을
    // 나눠 갖는 구조 탓에 상대 손패 뒷면까지 함께 작아졌다.
    expect(APP_CODE).toContain("melds.reduce((n, m) => n + meldSlotCount(m), 0)");
    expect(APP_CODE).toContain("function meldSlotCount(");
  });

  it("치·퐁·안깡은 그대로 장수와 같다", async () => {
    // 순수 함수가 아니라 소스로만 확인할 수 있는 자리라 분기 자체를 못 박는다.
    const at = APP_CODE.indexOf("function meldSlotCount(");
    const fn = APP_CODE.slice(at, APP_CODE.indexOf("\n}", at));
    expect(fn).toContain('m.kind === "kan_added" && m.calledTileId !== undefined');
    expect(fn).toContain("return m.tileIds.length;");
  });
});

// ─────────────── 의심 1·2·7·8 넘침 ───────────────

describe("넘칠 수 있는 줄이 자기 폭을 지킨다", () => {
  it("오름패 뱃지가 줄바꿈·상한을 갖는다 (의심 1)", () => {
    // `.game-root { overflow: hidden }` 이라 넘친 부분이 스크롤도 없이 잘렸다 —
    // 9종 + 후리텐 태그에서 좌우 끝 오름패가 한 장씩 사라졌다.
    const body = ruleBody(".waits-badge");
    expect(body).toContain("flex-wrap: wrap");
    expect(body).toContain("max-width:");
  });

  it("맞은편 줄의 폭 예산이 실제로 지켜진다 (의심 2)", () => {
    // 줄바꿈 없는 한 줄 flex는 자식의 min-content 합이 예산을 넘으면 max-width를
    // 지키지 않는다 — docs/34 §1 #6이 고친 「이름표 × 📘」 겹침이 되살아나는 길.
    expect(ruleBody(".opp-strip-top > *")).toContain("min-width: 0");
  });

  it("「대화」 알약이 접힌 액션 바 위에 선다 (의심 7)", () => {
    // 150px 은 «액션 바 한 줄»의 실측이라 여유가 7px 뿐이었다.
    expect(CSS_CODE).toContain("max(150px, calc(var(--own-band-full, 0px) + 10px))");
  });

  it("정형구 말풍선이 화면 밖으로 나가지 않는다 (의심 8)", () => {
    // `position: fixed` 라 `.game-root` 의 overflow:hidden 으로도 안 잘린다.
    expect(ruleBody(".emote-feed")).toContain("max-width:");
    const bubble = ruleBody(".emote-bubble");
    expect(bubble).not.toContain("white-space: nowrap");
  });
});

// ─────────────── 의심 3·10·11 상태 누수 ───────────────

describe("국을 넘어 남으면 안 되는 상태가 남지 않는다", () => {
  it("왕패 교환 큐가 국 경계에서 비워진다 (의심 3)", () => {
    // 접는 조건이 «프롬프트가 왔는데 그 쌍이 후보에 없다» 하나뿐이라, 남은 채로
    // 국이 넘어가면 다음 국에서 지시하지 않은 교환이 나갈 수 있었다.
    expect(APP_CODE).toContain("setDwQueue([]);\n    dwSentPromptRef.current = null;");
  });

  it("연출 펌프가 이펙트 이중 실행에 하나를 흘리지 않는다 (의심 10)", () => {
    // React 18 StrictMode는 이펙트 **본문 자체**를 두 번 실행한다 — 두 번째에도
    // activeProd가 아직 null이라 큐에서 하나를 더 shift 하고 앞의 연출이 유실됐다.
    expect(APP_CODE).toContain("if (prodPumpPending.current) return;");
    expect(APP_CODE).toContain("prodPumpPending.current = next !== undefined;");
  });

  it("점수 변동 타이머가 겹치면 앞엣것을 취소한다 (의심 11)", () => {
    expect(APP_CODE).toContain("if (scoreFxTimer.current !== null) window.clearTimeout(scoreFxTimer.current)");
  });
});

// ─────────────── 정보 누출 방어선 ───────────────

describe("중계 해설이 대국자 화면에 서지 않는다", () => {
  it("specDanger에 spectator 가드가 있다", () => {
    // 지금은 서버가 대국자에게 insight 를 안 보내므로 안전하지만, 그 한 줄이
    // 유일한 방어선이었다 — 그리는 쪽에도 조건을 둔다.
    const at = APP_CODE.indexOf("const specDanger = useMemo(");
    const fn = APP_CODE.slice(at, APP_CODE.indexOf("  );", at));
    expect(fn).toContain("props.spectator === true");
  });
});
