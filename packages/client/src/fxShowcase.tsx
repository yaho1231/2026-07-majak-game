/**
 * 연출 점검 페이지 — `/fx-showcase.html`
 *
 * 목적: **모든 연출을 한자리에서, 게임과 같은 조건으로 눌러 보기.**
 *
 * 두 가지를 일부러 게임과 똑같이 맞췄다.
 *  ① **조상 transform** — 판(`.sc-table`)·손패·멜드 칸이 각자 transform 을 갖는다.
 *     `uiScale.ts` 아래에서 벌어지는 좌표 문제를 여기서 먼저 잡으려는 것이다.
 *  ② **설정** — `screenFx` · `prodSpeed` 를 오른쪽에서 바꿔 가며 확인한다. 연출을 끄면
 *     정말로 조용해지는지, 끄고도 무슨 일이 일어났는지 알 수 있는지가 확인 대상이다.
 *
 * 이 페이지는 **게임 번들에 안 들어간다**(별도 Vite 진입점).
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
/*
 * **게임의 진짜 CSS 를 그대로 쓴다.**
 *
 * 점검 페이지가 자기만의 스타일로 컷인을 흉내 내면, 여기서 "괜찮다"고 판단한 것이
 * 게임에서 다르게 보인다 — 24_FX_LAB 이 같은 이유로 시각 토큰을 맞춰 두었다.
 * 컷인·배너·리치 연출은 규칙이 수십 개라 흉내 낼 수도 없다.
 *
 * 순서가 중요하다: 게임 CSS 를 먼저 깔고 점검 페이지 레이아웃을 그 위에 얹는다.
 */
import "./styles.css";
import "./fxShowcase.css";
import { applyFxSettings, type FxDemo, type FxStage } from "./fx";
import { DEMOS } from "./fx/demos";

const HAND_CODES = ["1m", "2m", "3m", "5m", "6m", "7m", "2p", "3p", "4p", "7s", "8s", "9s", "1z"];
const SORTED = [...HAND_CODES];

function Tile({ code, small }: { code: string; small?: boolean }): JSX.Element {
  return (
    <div className={`tf${small === true ? " sm" : ""}`} data-code={code} data-flip-id={code}>
      <img src={`/tiles/${code}.png`} alt="" draggable={false} />
    </div>
  );
}

function Showcase(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const meldRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [screenFx, setScreenFx] = useState(true);
  const [prodSpeed, setProdSpeed] = useState(1);
  const [slow, setSlow] = useState(false);
  const [selected, setSelected] = useState<string>(DEMOS[0]?.id ?? "");
  const [lines, setLines] = useState<string[]>([]);
  const [handOrder, setHandOrder] = useState<string[]>(SORTED);
  /** 마운트가 끝나 ref 들이 실제 DOM 을 가리키는가 (아래 stage memo 가 이걸 기다린다) */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [discards, setDiscards] = useState<string[]>(["9m", "1p", "5z", "6z"]);

  useEffect(() => {
    applyFxSettings({ screenFx, prodSpeed });
  }, [screenFx, prodSpeed]);

  // 슬로우모션 — 기법을 눈으로 뜯어볼 때 쓴다. 24_FX_LAB 이 "연출을 고를 때 이게 제일
  // 유용하다"고 적어 둔 그 손잡이다. 전역 타임라인에 걸므로 점검 페이지 전용이다.
  useEffect(() => {
    void import("./fx").then(({ gsap }) => {
      gsap.globalTimeline.timeScale(slow ? 0.25 : 1);
    });
  }, [slow]);

  const log = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    setLines((prev) => [`${t}  ${msg}`, ...prev].slice(0, 60));
  }, []);

  const stage = useMemo<FxStage | null>(() => {
    const root = rootRef.current;
    const table = tableRef.current;
    const hand = handRef.current;
    const wall = wallRef.current;
    const discard = discardRef.current;
    const meldSlot = meldRef.current;
    const center = centerRef.current;
    const overlay = overlayRef.current;
    if (!root || !table || !hand || !wall || !discard || !meldSlot || !center || !overlay) return null;
    return {
      root,
      table,
      hand,
      tiles: () => Array.from(hand.querySelectorAll<HTMLElement>(".tf")),
      wall,
      discard,
      meldSlot,
      seats: seatRefs.current.filter((s): s is HTMLDivElement => s !== null),
      center,
      overlay,
      shuffleHand: () =>
        setHandOrder((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [next[i], next[j]] = [next[j] as string, next[i] as string];
          }
          return next;
        }),
      sortHand: () => setHandOrder(SORTED),
      reset: () => {
        setHandOrder(SORTED);
        setDiscards(["9m", "1p", "5z", "6z"]);
      },
      log,
    };
    /*
     * `ready` 가 의존성에 있는 것이 **필수다.**
     *
     * useMemo 는 렌더 중에 돈다 — 그때 ref 들은 아직 `null` 이다. `ready` 없이 두면
     * 이 memo 가 마운트 전에 한 번 돌고 `null` 을 기억한 채 영영 다시 안 돈다.
     * 그러면 `play()` 가 `stage === null` 로 조용히 반환해서 **아무 연출도 안 나오는데
     * 에러도 안 난다.** 실제로 그렇게 만들었다가 점검 페이지에서 잡았다.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, ready]);

  const current = DEMOS.find((d) => d.id === selected) ?? DEMOS[0];

  const play = useCallback(
    (demo: FxDemo | undefined) => {
      if (demo === undefined || stage === null) return;
      setSelected(demo.id);
      log(`▶ ${demo.name}`);
      try {
        demo.play(stage);
      } catch (err) {
        log(`✖ ${demo.name} — ${String(err)}`);
      }
    },
    [stage, log],
  );

  const groups = useMemo(() => {
    const map = new Map<string, FxDemo[]>();
    for (const d of DEMOS) map.set(d.group, [...(map.get(d.group) ?? []), d]);
    return [...map.entries()];
  }, []);

  return (
    <div className="sc" ref={rootRef}>
      <header className="sc-head">
        <h1>연출 점검</h1>
        <p>
          왼쪽에서 고르면 바로 재생된다 · 오른쪽에서 설정을 바꿔 가며 확인한다 ·
          게임과 같은 조건(조상 transform)에서 돈다
        </p>
      </header>

      <nav className="sc-list">
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="sc-group">{group}</div>
            {items.map((d) => (
              <button
                key={d.id}
                type="button"
                className="sc-item"
                aria-current={d.id === selected}
                onClick={() => play(d)}
              >
                <span className="sc-item-top">
                  <span className="sc-item-name">{d.name}</span>
                  <span className="sc-freq" data-f={d.freq}>{d.freq}</span>
                </span>
                <span className="sc-item-when">{d.when}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sc-stage">
        <div className="sc-stagewrap">
          <div className="sc-table" ref={tableRef}>
            <div className="sc-seat sc-seat-top" ref={(el) => { seatRefs.current[0] = el; }}>
              상가 · 25000
            </div>
            <div className="sc-seat sc-seat-left" ref={(el) => { seatRefs.current[1] = el; }}>
              대면 · 25000
            </div>
            <div className="sc-seat sc-seat-right" ref={(el) => { seatRefs.current[2] = el; }}>
              하가 · 25000
            </div>
            <div className="sc-seat sc-seat-me" ref={(el) => { seatRefs.current[3] = el; }}>
              나 · 25000
            </div>

            <div className="sc-center" ref={centerRef}>
              <b>東 1국</b>
              <span>남은 패 70</span>
            </div>

            <div className="sc-wall" ref={wallRef} />

            <div className="sc-discard" ref={discardRef}>
              {discards.map((c, i) => (
                <Tile key={`${c}-${i}`} code={c} small />
              ))}
            </div>

            <div className="sc-meld" ref={meldRef} />

            <div className="sc-hand" ref={handRef}>
              {handOrder.map((c) => (
                <Tile key={c} code={c} />
              ))}
            </div>
          </div>
          <div className="sc-overlay" ref={overlayRef} />
        </div>
      </div>

      <aside className="sc-side">
        <section>
          <h2>{current?.name ?? "—"}</h2>
          <p className="sc-desc">{current?.intent ?? ""}</p>
          <div className="sc-row">
            <button type="button" className="primary" onClick={() => play(current)} disabled={!ready}>
              ▶ 다시 재생
            </button>
            <button type="button" onClick={() => stage?.reset()}>판 초기화</button>
          </div>
          <p className="sc-hint">
            언제 나오는가: {current?.when ?? "—"} · 빈도 {current?.freq ?? "—"}
          </p>
        </section>

        <section>
          <h2>설정</h2>
          <div className="sc-row">
            <label className="sw">
              <input
                type="checkbox"
                checked={screenFx}
                onChange={(e) => setScreenFx(e.target.checked)}
              />
              화면 효과 (screenFx)
            </label>
          </div>
          <div className="sc-row">
            <label className="sw">
              연출 속도
              <select value={prodSpeed} onChange={(e) => setProdSpeed(Number(e.target.value))}>
                <option value={1}>1× 그대로</option>
                <option value={0.6}>0.6× 빠르게</option>
                <option value={0.35}>0.35× 최소</option>
              </select>
            </label>
          </div>
          <div className="sc-row">
            <label className="sw">
              <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} />
              슬로우모션 0.25× (점검 전용)
            </label>
          </div>
          <p className="sc-hint">
            화면 효과를 끄면 <b>장식은 사라지고 정보는 남아야 한다</b> — 패가 어디로 갔는지는
            여전히 보여야 맞다. 그게 안 되면 그 연출은 잘못 분류된 것이다.
          </p>
        </section>

        <section>
          <h2>기록</h2>
          <div className="sc-log">{lines.length === 0 ? "아직 없다." : lines.join("\n")}</div>
        </section>
      </aside>
    </div>
  );
}

const el = document.getElementById("root");
if (el !== null) {
  createRoot(el).render(
    <StrictMode>
      <Showcase />
    </StrictMode>,
  );
}
