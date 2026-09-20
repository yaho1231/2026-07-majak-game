/**
 * 리치 BGM 미리듣기 — 곡이 끝까지 가면 스스로 정지 상태로 돌아간다 (2026-09-21).
 *
 * 미리듣기는 루프를 끄고 트니 곡이 끝나면 그냥 멈추는데, 예전엔 그때 아무것도
 * 정리하지 않았다: previewing 상태가 남아 버튼은 계속 "정지"였고 다시 눌러도
 * previewStop()만 불려 소리가 안 났다. 루프도 꺼진 채라 그 뒤 실제 리치에서
 * 그 트랙이 한 번만 나왔다.
 *
 * 이 패키지에는 jsdom이 없다 — window/Audio 를 최소 스텁으로 세우고 sfx.ts 를
 * 동적으로 불러 실제 로직을 돌린다.
 */

import { beforeAll, describe, expect, it } from "vitest";

class FakeAudio {
  static made: FakeAudio[] = [];
  src: string;
  loop = false;
  preload = "";
  volume = 1;
  currentTime = 0;
  paused = true;
  private listeners = new Map<string, Set<() => void>>();
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {}
  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  /** 브라우저가 곡 끝에서 하는 일 — 멈추고 ended 를 쏜다. */
  end(): void {
    this.paused = true;
    for (const fn of [...(this.listeners.get("ended") ?? [])]) fn();
  }
}

let riichiBgm: (typeof import("../src/sfx.js"))["riichiBgm"];

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g["window"] = {
    addEventListener() {},
    removeEventListener() {},
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
  g["document"] = { addEventListener() {}, visibilityState: "visible" };
  g["Audio"] = FakeAudio;
  ({ riichiBgm } = await import("../src/sfx.js"));
});

describe("리치 BGM 미리듣기 종료", () => {
  it("곡이 끝나면 previewing 이 풀리고 콜백이 불리며 루프가 복원된다", () => {
    let endedCalls = 0;
    riichiBgm.preview(0, () => endedCalls++);
    const el = FakeAudio.made.at(-1)!;
    expect(riichiBgm.previewing()).toBe(0);
    expect(el.loop).toBe(false);
    expect(el.paused).toBe(false);

    el.end();
    expect(riichiBgm.previewing()).toBe(-1);
    expect(endedCalls).toBe(1);
    expect(el.loop).toBe(true);
    expect(el.listenerCount("ended")).toBe(0);

    // 다시 누르면 처음부터 다시 재생된다
    el.currentTime = 42;
    riichiBgm.preview(0, () => endedCalls++);
    expect(riichiBgm.previewing()).toBe(0);
    expect(el.currentTime).toBe(0);
    expect(el.paused).toBe(false);
    riichiBgm.previewStop();
    expect(el.listenerCount("ended")).toBe(0);
  });

  it("수동 정지 뒤에는 늦게 온 ended 가 콜백을 부르지 않는다", () => {
    let endedCalls = 0;
    riichiBgm.preview(1, () => endedCalls++);
    const el = FakeAudio.made.at(-1)!;
    riichiBgm.previewStop();
    el.end();
    expect(endedCalls).toBe(0);
    expect(riichiBgm.previewing()).toBe(-1);
  });
});
