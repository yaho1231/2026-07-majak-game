/**
 * ErrorBoundary — 렌더 중 예외가 화면을 통째로 지우지 않게 막는다.
 *
 * **왜** (감사 2026-08-17 §2-1): 예전에는 바운더리가 하나도 없었다. App은 사실상
 * 하나의 큰 트리라서, 어느 하위 렌더 한 곳이 던지면 React가 트리 전체를 언마운트해
 * `#root`가 비고 **화면이 완전히 하얘졌다**. 토스트도 재연결 배너도 함께 사라졌다.
 *
 * 진짜 문제는 그게 일회성이 아니라는 것이었다. 새로고침하면 → 재접속 → tokenLogin →
 * joinRoom → 서버가 **똑같은 뷰를 다시 밀어 주고** → 같은 자리에서 또 던진다. 즉
 * 서버 상태가 바뀔 때까지(그 판이 끝날 때까지) 그 사람은 게임에 못 들어왔다.
 * 그래서 이 화면의 핵심은 "다시 불러오기"가 아니라 **그 판에서 빠져나오는 길**이다.
 *
 * 복구 수단을 셋 준다 — 왼쪽일수록 잃는 게 적다:
 *   1. 다시 불러오기    상태만 초기화하고 같은 화면을 다시 시도 (일시적 오류)
 *   2. 방에서 나가기    lastRoomCode만 지우고 새로고침 (그 판이 문제일 때)
 *   3. 처음부터         저장된 것 전부 지우고 새로고침 (최후)
 */

import React from "react";
import { clearAllStorage, forgetLastRoom } from "./storage.js";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  /** 같은 자리에서 계속 터지는지 — 1회성인지 구조적인지 사용자에게 알려 준다. */
  count: number;
  detailOpen: boolean;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null, count: 0, detailOpen: false, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // 콘솔에는 스택을 그대로 남긴다 — 개발자 도구를 연 사람이 가장 먼저 보는 자리다.
    console.error("[render] 화면을 그리다 실패했습니다:", error, info.componentStack);
    this.setState((s) => ({ count: s.count + 1 }));
  }

  private retry = (): void => {
    this.setState({ error: null, detailOpen: false, copied: false });
  };

  private leaveRoom = (): void => {
    forgetLastRoom();
    window.location.reload();
  };

  private resetAll = (): void => {
    clearAllStorage();
    window.location.reload();
  };

  private report = (): void => {
    const err = this.state.error;
    const text = [
      `이능마작 오류 보고`,
      `시각: ${new Date().toISOString()}`,
      `주소: ${window.location.href}`,
      `브라우저: ${navigator.userAgent}`,
      ``,
      `${err?.name ?? "Error"}: ${err?.message ?? "(메시지 없음)"}`,
      err?.stack ?? "",
    ].join("\n");
    void navigator.clipboard
      ?.writeText(text)
      .then(() => this.setState({ copied: true }))
      .catch(() => this.setState({ detailOpen: true }));
  };

  override render(): React.ReactNode {
    const { error, count, detailOpen, copied } = this.state;
    if (error === null) return this.props.children;

    const repeated = count >= 2;
    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <div className="crash-icon" aria-hidden="true">
            ⚠
          </div>
          <h1 className="crash-title">화면 구성중 문제가 생겼습니다</h1>
          <p className="crash-lead">
            {repeated
              ? "같은 문제가 반복됩니다. 지금 있는 방이 원인일 수 있으니 아래 ‘방에서 나가기’를 눌러 보세요."
              : "대국은 서버에 그대로 있습니다. 아래 버튼으로 다시 시도해 보세요."}
          </p>

          <div className="crash-actions">
            <button className="crash-btn primary" onClick={this.retry}>
              다시 불러오기
            </button>
            <button className="crash-btn" onClick={this.leaveRoom}>
              방에서 나가기
            </button>
            <button className="crash-btn danger" onClick={this.resetAll}>
              처음부터
            </button>
          </div>

          <div className="crash-report">
            <button className="crash-link" onClick={this.report}>
              {copied ? "✓ 오류 내용을 복사했습니다 — 제보 게시판에 붙여 주세요" : "오류 내용 복사"}
            </button>
            <button
              className="crash-link"
              onClick={() => this.setState((s) => ({ detailOpen: !s.detailOpen }))}
              aria-expanded={detailOpen}
            >
              {detailOpen ? "자세히 접기" : "자세히"}
            </button>
          </div>
          {detailOpen ? (
            <pre className="crash-stack">
              {error.name}: {error.message}
              {"\n"}
              {error.stack ?? ""}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}
