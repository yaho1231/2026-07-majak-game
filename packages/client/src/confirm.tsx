/**
 * 되돌릴 수 없는 일을 하기 전 되묻는 창 — `window.confirm` 을 대신한다.
 *
 * **왜 바꾸는가** (감사 2026-08-17 §5-9): `window.confirm` 은 **메인 스레드를 멈춘다.**
 * 게임 중에 ✕(나가기)를 눌러 네이티브 모달이 뜨면 화면이 통째로 얼어붙는데,
 * **서버의 결정 타이머는 그동안에도 흐른다.** 즉 "정말 나갈까요?"를 읽는 사이
 * 내 차례가 폴백으로 지나갈 수 있었다 — 나가지 않기로 하고 돌아와도 이미 한 수를
 * 잃은 뒤다. 초읽기 국(5초)에서는 거의 확정이다.
 *
 * 곁들여 얻는 것:
 *  · 화면과 같은 생김새 (네이티브 모달은 OS마다 다르게 뜬다)
 *  · 무엇을 잃는지 본문에 여러 줄로 적을 수 있다
 *  · Esc·포커스 관리를 우리가 쥔다
 *
 * 쓰는 법은 `window.confirm` 과 같되 **기다리지 않는다**:
 *
 *     void askConfirm({ title: "…", body: "…", confirmLabel: "나가기" })
 *       .then((ok) => { if (ok) doIt(); });
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ConfirmOptions {
  title: string;
  /** 무엇을 잃는지 — 줄바꿈으로 여러 줄. */
  body?: string;
  /** 확인 버튼 문구 (기본 "확인"). 동사로 적는다 — "예"보다 "나가기"가 낫다. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 파괴적인가 — 확인 버튼을 붉게 그린다. */
  danger?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;

let ask: Ask | null = null;

/**
 * 되묻는다. `ConfirmHost` 가 아직 안 붙었으면(이론상 부팅 직후) `window.confirm`
 * 으로 물러난다 — 되묻지 **않고** 그냥 진행하는 것보다는 낫다.
 */
export function askConfirm(o: ConfirmOptions): Promise<boolean> {
  if (ask !== null) return ask(o);
  return Promise.resolve(window.confirm(`${o.title}${o.body === undefined ? "" : `\n\n${o.body}`}`));
}

/** 앱에 **한 번만** 붙인다. 실제 창을 그리는 쪽. */
export function ConfirmHost(): JSX.Element | null {
  const [req, setReq] = useState<{ o: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const handler = useCallback<Ask>((o) => {
    return new Promise<boolean>((resolve) => {
      setReq({ o, resolve });
    });
  }, []);

  useEffect(() => {
    ask = handler;
    return () => {
      ask = null;
    };
  }, [handler]);

  const close = useCallback(
    (v: boolean) => {
      setReq((cur) => {
        cur?.resolve(v);
        return null;
      });
    },
    [],
  );

  // 열려 있는 동안 뒤를 비활성화한다(ScreenOverlay와 같은 방식 — 자세한 이유는 그쪽 주석).
  useEffect(() => {
    const el = boxRef.current;
    const parent = el?.parentElement;
    if (req === null || el == null || parent == null) return;
    const restore = document.activeElement as HTMLElement | null;
    const covered = [...parent.children].filter(
      (c): c is HTMLElement => c !== el && c instanceof HTMLElement && !c.hasAttribute("inert"),
    );
    for (const c of covered) c.setAttribute("inert", "");
    el.querySelector<HTMLButtonElement>(".confirm-cancel")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      for (const c of covered) c.removeAttribute("inert");
      el.removeEventListener("keydown", onKey);
      restore?.focus?.({ preventScroll: true });
    };
  }, [req, close]);

  if (req === null) return null;
  const { o } = req;
  return (
    <div
      className="confirm-backdrop"
      ref={boxRef}
      role="alertdialog"
      aria-modal="true"
      aria-label={o.title}
      tabIndex={-1}
    >
      <div className="confirm-box">
        <h2 className="confirm-title">{o.title}</h2>
        {o.body !== undefined ? <p className="confirm-body">{o.body}</p> : null}
        <div className="confirm-actions">
          {/*
            취소가 **먼저이고 기본 포커스**다. 되묻는 창의 기본값은 "아무 일도
            일어나지 않음"이어야 한다 — Enter 를 습관적으로 눌러 계정이 지워지는
            일이 없게.
          */}
          <button className="confirm-btn confirm-cancel" onClick={() => close(false)}>
            {o.cancelLabel ?? "취소"}
          </button>
          <button
            className={`confirm-btn confirm-ok${o.danger === true ? " confirm-danger" : ""}`}
            onClick={() => close(true)}
          >
            {o.confirmLabel ?? "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
