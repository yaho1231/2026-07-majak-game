/**
 * StatsStore — 닉네임별 누적(career) 통계의 파일 영속화.
 *
 * MVP엔 계정/DB가 없으므로 통계는 닉네임을 키로 JSON 파일에 누적한다.
 * 한 판이 끝나면 그 판의 원시 통계를 닉네임별로 병합해 저장한다.
 *
 * 통계 계산 자체는 @majak/core StatsTracker/mergeStats가 하고,
 * 여기서는 로드·병합·저장(I/O)만 담당한다 (core는 I/O 없음 원칙).
 *
 * 설계: docs/14_LOBBY_STATS.md §3
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createEmptyStats, mergeStats } from "@majak/core/stats/PlayerStats.js";
import type { PlayerStatsRaw } from "@majak/core/stats/PlayerStats.js";

interface StatsFile {
  version: 1;
  players: Record<string, PlayerStatsRaw>;
}

/** 프로토타입 오염 방지 — 항상 프로토타입 없는 맵을 쓴다 (__proto__/toString 등 키 안전) */
function emptyPlayers(): Record<string, PlayerStatsRaw> {
  return Object.create(null) as Record<string, PlayerStatsRaw>;
}

export class StatsStore {
  private data: StatsFile = { version: 1, players: emptyPlayers() };
  private loaded = false;
  /** 진행 중인 쓰기 루프 (없으면 null). 동시 record가 파일을 덮어쓰지 않게 하나만 돈다. */
  private inFlight: Promise<void> | null = null;
  /** 쓰기 중에 들어온 저장 요청 — 몇 번이 오든 한 장으로 합친다. */
  private pending: Deferred | null = null;
  /** 유저별 직렬화 조각 캐시 (닉네임 → `JSON.stringify(PlayerStatsRaw)`). 바뀌면 지운다. */
  private fragments = new Map<string, string>();
  /** 내용 세대 번호 — 바뀔 때마다 1 오른다 (리더보드 캐시 무효화용). */
  private rev = 0;

  constructor(private readonly filePath: string) {}

  /** 파일에서 통계를 읽는다. 파일이 없으면 빈 상태로 시작한다. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StatsFile>;
      if (parsed !== null && typeof parsed === "object" && parsed.players !== undefined) {
        // 누락 필드 보정 (스키마가 늘어나도 안전하게 병합)
        const players = emptyPlayers();
        for (const [name, s] of Object.entries(parsed.players)) {
          players[name] = mergeStats(createEmptyStats(), s as PlayerStatsRaw);
        }
        this.data = { version: 1, players };
      }
    } catch {
      // 파일 없음/파싱 실패 → 빈 상태 유지
      this.data = { version: 1, players: emptyPlayers() };
    }
    this.fragments.clear();
    this.loaded = true;
  }

  /** 닉네임의 누적 통계 (없으면 null). */
  get(nickname: string): PlayerStatsRaw | null {
    return this.data.players[nickname] ?? null;
  }

  /** 모든 닉네임의 누적 통계 (복사본). */
  all(): Record<string, PlayerStatsRaw> {
    return JSON.parse(JSON.stringify(this.data.players)) as Record<string, PlayerStatsRaw>;
  }

  /**
   * 모든 항목을 **복사 없이** 훑는다 (읽기 전용).
   *
   * `all()`은 전체 표를 JSON으로 직렬화·역직렬화한 깊은 복사본을 만든다 —
   * 리더보드처럼 "읽고 파생값만 계산하고 버리는" 경로에서는 계정 수에 비례하는
   * 동기 비용이 그대로 이벤트 루프(=진행 중인 모든 게임)를 멈춰 세운다.
   * 여기서 돌려주는 값은 내부 객체를 그대로 가리키므로 **고치면 안 된다.**
   */
  entries(): readonly (readonly [string, PlayerStatsRaw])[] {
    return Object.entries(this.data.players);
  }

  /**
   * 내용이 바뀔 때마다 오르는 세대 번호. 리더보드 캐시가 "내가 만든 뒤로
   * 통계가 바뀌었는가"를 전체 비교 없이 판정하는 데 쓴다.
   */
  version(): number {
    return this.rev;
  }

  /** 한 판의 원시 통계를 닉네임별로 병합하고 저장한다. */
  async record(entries: { nickname: string; raw: PlayerStatsRaw }[]): Promise<void> {
    if (!this.loaded) await this.load();
    for (const { nickname, raw } of entries) {
      const prev = this.data.players[nickname] ?? createEmptyStats();
      this.data.players[nickname] = mergeStats(prev, raw);
      this.fragments.delete(nickname);
    }
    this.rev++;
    await this.save();
  }

  /**
   * **누적 통계를 새 닉네임으로 옮긴다** (닉네임 변경 시 호출, 2026-09-04 사용자 보고:
   * 「이름을 변경했을 때 내 통계 같은 게 다 사라져 버려」).
   *
   * 이 저장소의 키는 계정 id가 아니라 **닉네임**이다(파일 머리말 — 계정이 없던
   * 시절의 구조가 그대로 남았다). 그래서 관리자가 이름을 바꾸면 누적 통계와
   * 리더보드 줄이 옛 이름 밑에 남고, 그 계정에서는 «전적 없음»이 된다.
   * 기간 성적·리플레이 목록은 `user_id`로 조회하므로 멀쩡했다 — 사라진 것처럼
   * 보인 것이 정확히 이 표 하나다.
   *
   * 목적지에 이미 값이 있으면 **합친다.** 계정 이름은 서로 겹칠 수 없으므로
   * (`users.username` UNIQUE COLLATE NOCASE) 그 값은 게스트나 이미 삭제된 계정이
   * 남긴 것이고, 이제 그 이름을 쓸 수 있는 계정은 이 하나뿐이라 두면 영영 닿지 않는
   * 값이 된다. 합치는 쪽이 잃는 것이 없다.
   *
   * 대소문자만 바꾸는 개명(`Kim` → `KIM`)도 이 표에서는 **다른 키**라 반드시 옮겨야
   * 한다 — 계정 표에서는 같은 행이어서 그냥 지나가기 쉬운 자리다.
   *
   * @returns 실제로 옮겼는가 (옛 이름에 값이 없었으면 false — 할 일이 없다)
   */
  async rename(from: string, to: string): Promise<boolean> {
    if (!this.loaded) await this.load();
    if (from === to) return false;
    const moving = this.data.players[from];
    if (moving === undefined) return false;
    const prev = this.data.players[to] ?? createEmptyStats();
    this.data.players[to] = mergeStats(prev, moving);
    delete this.data.players[from];
    this.fragments.delete(from);
    this.fragments.delete(to);
    this.rev++;
    await this.save();
    return true;
  }

  /** 닉네임의 누적 통계를 삭제하고 저장한다 (계정 삭제 시 호출). */
  async remove(nickname: string): Promise<void> {
    if (!this.loaded) await this.load();
    if (this.data.players[nickname] === undefined) return;
    delete this.data.players[nickname];
    this.fragments.delete(nickname);
    this.rev++;
    await this.save();
  }

  /**
   * 현재 상태를 원자적으로(임시 파일 → rename) 파일에 쓴다.
   *
   * ## 저장 합치기 (coalesce, 2026-09-16 S-5)
   *
   * 예전에는 `save()` 호출마다 **그 자리에서** 전체를 `JSON.stringify(data, null, 2)` 해
   * 스냅샷 문자열을 만들고, 그 클로저를 `saveChain` 뒤에 매달았다. 판 종료가 디스크
   * 쓰기보다 빨리 오면 매단 클로저가 스냅샷을 하나씩 붙든 채 줄을 서고(유저 2,000명
   * ≈ 20MB/장), 큐가 길어질수록 힙이 그만큼 자랐다(seed-users 2000·think 0 에서
   * 힙 2.2GB). 게다가 줄 선 스냅샷은 모두 «낡은» 상태라 마지막 것만 의미가 있었다.
   *
   * 지금은 **쓰는 중이면 직렬화를 미룬다**: 대기 요청은 하나의 프로미스로 합쳐지고,
   * 진행 중인 쓰기가 끝난 뒤 **그때의** 상태를 한 번만 직렬화해 쓴다. 동시에 살아 있는
   * 스냅샷은 최대 1장이다. 호출자가 받는 프로미스는 «내 변경이 담긴 쓰기가 끝났을 때»
   * 해결되므로(변경은 `save()` 호출 전에 이미 `data`에 들어 있고, 미뤄진 직렬화는
   * 그 뒤에 일어난다) 의미는 예전과 같다.
   *
   * ## 증분 직렬화
   *
   * 유저별 JSON 조각(`fragments`)을 캐시해 두고 바뀐 유저만 다시 `JSON.stringify`
   * 한다. 한 판에 바뀌는 유저는 최대 4명이라 직렬화 원가가 «전체 유저 수»가 아니라
   * «바뀐 유저 수 + 조각 이어 붙이기»가 된다. 결과 바이트는 `JSON.stringify(data)`와
   * **정확히 같다** (키 순서는 `Object.keys` = `JSON.stringify` 의 열거 순서).
   * 파일에 들여쓰기는 넣지 않는다 — 파싱 결과는 같고 크기는 절반 이하다.
   *
   * ⚠ 쓰기 실패는 **쓰기 루프 안에서** 삼킨다. 예전에는 `.catch`가 없어 한 번의 일시적
   * 실패(디스크 가득 참·권한)가 `saveChain`을 거부 상태로 만들었고, 그 뒤의 모든
   * `.then`이 통째로 건너뛰어져 **프로세스가 사는 동안 누적 통계가 다시는 저장되지
   * 않았다** — 증상은 로그 한 줄뿐이었다. 호출자에게는 거부를 그대로 전달해
   * (반환 프로미스만 거부) "이번 저장이 실패했다"는 사실은 잃지 않는다.
   */
  private save(): Promise<void> {
    if (this.inFlight !== null) {
      // 쓰는 중 — 대기는 한 장으로 합친다. 직렬화는 그 차례가 왔을 때 한다.
      if (this.pending === null) this.pending = deferred();
      return this.pending.promise;
    }
    const first = deferred();
    this.inFlight = this.writeLoop(first);
    return first.promise;
  }

  /** 지금 상태를 쓰고, 그동안 쌓인 대기 요청이 있으면 그 상태로 한 번 더 쓴다. */
  private async writeLoop(first: Deferred): Promise<void> {
    let cur = first;
    for (;;) {
      const body = this.serialize();
      try {
        await mkdir(dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        await writeFile(tmp, body, "utf8");
        await rename(tmp, this.filePath);
        cur.resolve();
      } catch (err) {
        cur.reject(err);
      }
      if (this.pending === null) break;
      cur = this.pending;
      this.pending = null;
    }
    this.inFlight = null;
  }

  /**
   * `JSON.stringify(this.data)` 와 바이트 단위로 같은 문자열을 유저별 캐시 조각으로 만든다.
   * 조각이 없는 유저(바뀐 유저·처음 보는 유저)만 새로 직렬화한다.
   */
  private serialize(): string {
    const parts: string[] = [];
    for (const name of Object.keys(this.data.players)) {
      let frag = this.fragments.get(name);
      if (frag === undefined) {
        frag = JSON.stringify(this.data.players[name]);
        this.fragments.set(name, frag);
      }
      parts.push(`${JSON.stringify(name)}:${frag}`);
    }
    return `{"version":1,"players":{${parts.join(",")}}}`;
  }

  /** 대기 중인 저장이 끝날 때까지 기다린다 (종료 시·테스트). */
  async flush(): Promise<void> {
    while (this.inFlight !== null) await this.inFlight;
  }
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
