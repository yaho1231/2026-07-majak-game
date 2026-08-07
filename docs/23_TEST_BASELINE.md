# master 테스트 기준선 (baseline)

측정: 2026-08-01, `claude/lobby-seat-shuffle` (워크트리 alias 설정으로 core 변경까지 반영).
**측정은 반드시 메인 체크아웃에서 한다** (아래 "측정 환경 함정" 참고).

## 현재 상태 — 사실상 그린

```
npm test                   1955 / 1955 통과 (실패 0)   ← 2026-08-07 갱신 (조커 분해 성능·차등 검증 16건 추가)
npm run typecheck          0 errors
npm run typecheck:content  0 errors
npm run typecheck:server   0 errors
npm run typecheck:client   0 errors
```

전체 실행에서 간헐적으로 1건 실패가 나올 수 있다:

- `packages/server/test/RoomManager.test.ts > 게임 완주·기록 > 국 사이 대기(interRoundDelayMs>0)에서 결과 화면을 닫으면(roundContinue) 즉시 다음 국으로 진행한다` — `waitFor timeout`

- `packages/server/test/Sandbox.test.ts > 증강 테스트 — 손패 지정 > 지정한 손패로 배패되고, 그 지정이 sandbox 상태로 돌아온다` — `expected 2 to be greater than or equal to 3`
  (2026-08-04 추가) 지정 손패의 장수를 **마지막으로 받은 view**로 세는데, 부하가 걸리면 그 사이 한 순이 지나가 지정 패가 이미 버려져 있다. 단독 실행 23/23 통과.
  **판별법**: 변경을 되돌리고(`git stash`) 전체를 한 번 더 돌려 같은 실패가 나면 플레이크다 — 실제로 이 방법으로 무관함을 확인했다.

- (2026-08-05) `RoomManager.test.ts`의 **게임 완주 계열 어느 것이든** `Test timed out`으로 무더기로
  터질 수 있다. 원인은 코드가 아니라 **다른 세션이 동시에 `npm test`를 돌리고 있는 것**이었다
  (`pgrep -fl "bin/vitest"`로 확인 — 두 개 이상이면 그게 원인이다). 같은 변경으로 두 번 돌렸더니
  실패 목록이 9건 → 2건으로 **매번 달라졌고**, 파일 단독 실행은 44/44, `packages/server` 전체는
  251/251로 항상 통과했다. 실패 집합이 실행마다 바뀌면 결함이 아니다.

- **(2026-08-07) 이 플레이크의 실제 원인 일부를 제거했다.** `game_players(game_id)`에 인덱스가
  없어 `replayList`(→`hydrate`)가 게임마다 전체 스캔을 돌렸고, `node:sqlite`는 동기라 그동안
  같은 프로세스의 다른 테스트가 전부 굶었다. 인덱스 하나(`SiteDb.ts`)로:
  - `RoomManager.test.ts` 단독: 166초 → **38~44초**
  - `npm test` 전체: 368초 → **165초**
  게임 완주 계열이 여전히 무거워 전체 병렬 실행에서 간헐 실패가 남을 수 있지만 빈도는 크게 낮다.

둘 다 **타이밍 플레이크**다. 파일 단독 실행에서는 항상 통과하고, 전체 병렬 실행에서 워커가 굶을 때만 터진다. 코드 결함이 아니므로 게이트에서 이 실패들은 예외로 둔다. 자주 재현되면 `RoomManager.test.ts:64`의 `waitFor` 타임아웃을 늘리고, Sandbox 쪽은 view 대신 배패 직후 상태를 재는 쪽이 맞다.

## 게이트 기준

실패 수·타입 에러 수가 위 수치보다 **늘었으면 병합 금지**. 위 플레이크 1건은 예외.

## 측정 환경 함정 (중요)

이 기준선은 한때 "87 실패 / 타입 에러 8"로 잘못 기록돼 있었다. 둘 다 **측정 환경 문제였고 코드에는 문제가 없었다.** 같은 함정에 다시 빠지지 않도록 기록해 둔다.

1. **vitest가 워크트리까지 긁었다.** 설정 파일이 없어 기본 exclude에 `.claude/`가 빠져 있었고, `.claude/worktrees/` 아래 사본 10개의 테스트를 전부 실행했다 — 테스트 파일 99 → 981개, 165초 → 879초. 사본들이 같은 임시 디렉터리 이름을 동시에 써서 `ENOTEMPTY`로 무관한 파일이 줄줄이 실패했다. → 루트 `vitest.config.ts`에서 `**/.claude/**` 제외.
2. **워크트리에서 잰 타입체크는 낡은 코드를 봤다.** 워크트리에 `node_modules`가 없어 `@majak/core`가 상위 `/Users/skul/Documents/newMajak/node_modules/@majak/core` 심볼릭링크로 해석됐고, 그 시점 메인 체크아웃은 `c45dbab`(구 커밋)에 서 있었다. 그래서 `RoundSettledPayload.dealerContinues` 처럼 **실제로 존재하는** 필드가 "없다"고 나왔다.

교훈: **메인 체크아웃은 항상 master에 두고, 측정은 메인 체크아웃에서 한다.** 메인 체크아웃은 서버가 서빙하는 코드이기도 하므로 다른 브랜치로 옮기면 배포까지 함께 어긋난다.

## 갱신 방법

메인 체크아웃에서 `npm test` 와 `npm run typecheck:*` 를 다시 돌리고 이 문서를 덮어쓴다.
