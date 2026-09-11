# 서버 성능 작업 결과 (2026-09-11)

계획은 [53_SERVER_PERF_PLAN_2026-09-11.md](53_SERVER_PERF_PLAN_2026-09-11.md). 이 문서는
**무엇을 어떻게 바꿨고, 얼마나 빨라졌고, 무엇을 일부러 안 했는가**를 적는다.

원칙: **기능 변화 0.** 판의 진행·증강·뷰·봇 판단이 한 비트도 달라지지 않는다.
그 증거가 §4의 골든 해시다.

## 1. 결과 한눈에

| 재는 자리 | 전 | 후 | 배수 |
|---|---|---|---|
| 아레나 6판(증강) CPU 프로파일 총합 | 30.6 s | 7.1 s | **4.3×** |
| 골든 해시 5구성(봇 4 × 20판) | 71.2 s | 16.5 s | **4.3×** |
| 결정 한 단계(프롬프트 + 봇 판단 + 뷰 4장 방송) | ~8 ms | ~2 ms | **4×** |
| 봇 판단만 (운영 경로, `/healthz perf`) | — | 평균 0.5 ms · p99 5 ms | — |
| 운영 실행 (`tsx` 즉석 변환 → esbuild 번들) | — | 추가 ~10% | — |

부하 측정 (`npm run load -w @majak/server`, 실제 `RoomManager`로 사람 1 + 봇 3 테이블을
동시에 돌린다):

| 조건 | 한 코어 점유 | 이벤트 루프 지연 p99 | 힙(GC 후) |
|---|---|---|---|
| 테이블 40, 생각 시간 0 (최대 속도, 20초에 41판 종국) | 92% | 217 ms (포화) | 70 MB |
| 테이블 100, 생각 시간 200 ms (실전의 ~9배 속도) | 108% | 42 ms | 113 MB |

실전 속도(한 판 30~40분)로 환산하면 **테이블 하나가 한 코어의 0.05~0.1%**, 테이블당
붙드는 메모리 **~1 MB**다. 맥미니 한 대(코어 8, 노드는 1개 사용)로 **수백 테이블**까지
이벤트 루프가 한가하다. 작업 전에는 같은 계산이 60~100 테이블에서 한 코어를 채웠다.

## 2. 무엇을 어떻게 바꿨나

### 2-1. 코어 엔진 (`packages/core`)

프로파일에서 시간의 58%가 `winningKinds`(34종 × 화료형 판정)였고, 그 대부분이
**턴 프롬프트의 리치 검증**(버릴 패 14장마다 34종 판정 = 턴마다 ~476회)과 뷰의
후리텐 계산이었다. 봇 본체는 23%뿐. 메모 캐시의 **키 문자열 만들기**(map·sort·join)가
판정 자체만큼 비쌌다.

| 파일 | 변경 | 왜 같은 답인가 |
|---|---|---|
| `mahjong/scoring/standardShape.ts` (신규) | 표준 규칙 + 순환 슌쯔·자패 슌쯔·5멘쯔·왕의 징표·비대칭 치또이의 화료형 판정을 **34칸 정수 배열**로. 조커·혼색 몸통·양극·국사 외길·울어 국사는 일반 분해기에 그대로 맡긴다 | 일반 분해기의 «첫 번째 남은 패는 지금 소비된다» 기법을 그대로 옮겼고, 치또이·국사 조건도 원문 그대로. `StandardShapeFastPath.test.ts`가 무작위 손 10만+개로 일반 경로와 대조한다 |
| `mahjong/scoring/decompose.ts` | `winningKindsOf`: 옵션 정규화·옵션 키를 34종 훑는 동안 **한 번만**. 메모 키를 배열 없이 문자열 결합으로. 표준 universe 34개 객체를 호출마다 만들지 않음(돌려주는 대기는 복사) | 메모는 순수 함수 캐시 — 키에 분해 규칙 전부가 들어간다(빠지면 오답이 캐시된다는 원칙 유지) |
| `mahjong/scoring/shanten.ts` | 표준 손 샹텐을 정수 배열에서 직접(`shantenFast`). 무늬 프로필 캐시 키를 문자열 → 16진 접은 **숫자**. 무늬 조합을 **재귀 곱(수천 갈래) → 합계 DP**(`combineGroups`). 캐시 키의 `JSON.stringify(opts)` 제거. 우케이레가 34번 손을 복사하지 않고 마지막 칸만 바꿈 | 최종 점수는 (멘쯔 수·부분 수·머리 유무)의 **합계**만 보므로 같은 합계를 접어도 최솟값이 같다. `shantenOfGeneric`(테스트 전용)과 무작위 대조 |
| `mahjong/flow/helpers.ts` | `tenpaiAfterDiscardMemo`: 리치 검증의 «이 종류를 버리면 텐파이인가»를 **상태·종류별** 메모(같은 5만 둘은 같은 13장). `furitenWaitsOf`: 후리텐 대기를 상태별 캐시로 — 리액션 프롬프트·론 검증·뷰 방송(사람 넷 + 관전자)이 나눠 쓴다 | 상태 객체가 키(불변, 이벤트마다 새 객체)라 무효화가 필요 없다. 키에 `rules.version`을 넣어 **증강 설치로 규칙만 바뀐** 경우도 잡는다(`true_dragon` 테스트가 그 창을 정확히 찌른다) |
| `mahjong/flow/standardActions.ts`, `FlowController.ts`, `information/PlayerView.ts` | 위 메모를 쓰도록 호출부만 교체 | 계산식은 그대로 |

### 2-2. 서버 (`packages/server`)

| 파일 | 변경 |
|---|---|
| `package.json`, `scripts/majak.sh` | `npm run build:server` = esbuild 번들(`dist/index.mjs`, 소스맵). `start`/`restart`가 클라이언트와 함께 빌드하고 `node --enable-source-maps dist/index.mjs`로 띄운다. 번들이 없으면 예전 `tsx` 경로 |
| `src/perfMonitor.ts` (신규) | 이벤트 루프 지연 히스토그램(`monitorEventLoopDelay`), 봇 판단 시간 히스토그램, 힙. `/healthz`의 `perf`로 나간다(마지막 조회 이후의 창) |
| `src/BotAgent.ts` | `decide()`가 판단 시간을 잰다(산술 몇 번) |
| `src/index.ts` | `/healthz`에 `perf` |
| `scripts/watchdog.sh` | 1분마다 `.majak/perf.log`에 한 줄(연결·테이블·루프 지연·봇 판단·힙). 14,400줄(10일) 넘으면 세대를 민다 |
| `src/goldenCli.ts` (신규) | 같은 시드로 이벤트 전부 + 봇에게 간 뷰 전부를 해시 — §4 |
| `src/loadCli.ts` (신규) | 실제 `RoomManager`로 테이블 N개 동시 부하 — §1 |
| `test/Resume.test.ts` | «1.5초 뒤 판 중간» 가정을 뷰 30개 대기로. 엔진이 빨라져 1.5초면 동풍전이 통째로 끝나 되살릴 판이 없었다 |

## 3. 프로파일 전후

| | 전 (30.6 s) | 후 (7.1 s) |
|---|---|---|
| `winningKinds` 포함 | 58% | 24% (남은 건 조커·혼색 등 일반 경로 + 정수 지름길 자체) |
| 턴 프롬프트 리치 검증 | 43% | 25% |
| `shantenOf` (봇 우케이레) | 12% | 13% (절대값은 1/4) |
| `buildPlayerView` | 14% | 18% (절대값은 1/3) |
| 메모 키 만들기 (`shapeMemoKey`) | 13% self | 사라짐 |
| GC | 7% | 4% |

측정 명령:
```
cd packages/server
node --cpu-prof --cpu-prof-dir=/tmp/prof --import tsx/esm src/arenaCli.ts --games 6 --augments
```

## 4. 기능 불변의 증거 — 골든 해시

`npm run golden -w @majak/server -- --games 4 --seed 3 --augments` 는 봇 넷이 같은 시드로 판을
돌리는 동안 나가는 **이벤트 전부**와 봇에게 배달되는 **뷰 전부**(사람이 받는 것과 같은
`PlayerView`)를 순서대로 SHA-256에 넣는다. 결정·프롬프트 순서·뷰의 필드 하나만 달라져도
해시가 바뀐다. 아레나 집계표는 합계라 미세한 차이를 덮지만 이건 덮지 않는다.

작업 전 기록해 둔 다섯 구성(반장/동풍 × 증강 유무, 시드 1·2·3·4·99, 각 4판)의 해시가
매 단계마다 **전부 동일**했다:

```
golden b246627cfafe3190bae3f785  games=4 seed=1 augments=false events=6807 views=11732
golden 63048a6d116f7fc00b057c7a  games=4 seed=2 augments=false events=3517 views=5992   (tonpuu)
golden 4029112ef6eb9d4555311cc8  games=4 seed=3 augments=true  events=7141 views=10768
golden f7f63eea8a26d75f799fffe2  games=4 seed=4 augments=true  events=4343 views=6124   (tonpuu)
golden 8c9a4a17bc7e6b4953b96287  games=4 seed=99 augments=true events=8121 views=11940
```

이 해시는 **봇 정책이나 증강을 일부러 바꾸면 당연히 바뀐다** — 그래서 테스트로 박아 두지
않았다. 성능 작업처럼 «판이 그대로여야 하는» 변경을 할 때 앞뒤로 찍어 비교하는 도구다.

그 밖에: `npm test` 382 파일 / 4,328 통과, 타입체크 4종 0 에러. 지름길 ≡ 일반 경로 무작위
대조 테스트(`packages/core/test/StandardShapeFastPath.test.ts`) 5건 추가.

## 5. 일부러 하지 않은 것 — 그리고 언제 하는가

계획의 2·3단계는 **측정 뒤에 판단한다**고 적어 두었고, 1단계 뒤의 숫자가 답을 냈다.

### 봇을 worker_threads로 (계획 2단계)
안 했다. 봇 한 결정이 **평균 0.5 ms**가 됐다. 워커로 보내려면 결정마다 `PlayerView`
(수 KB)를 `structuredClone`으로 넘기고, 봇이 받는 **모든 뷰 방송**(이벤트마다 좌석 셋)을
워커에도 전달해야 한다 — 그 직렬화가 지금의 판단 시간보다 크다. 결정론(시드 PRNG)을
워커 경계 너머로 지키는 것도 별도 작업이다. 이득이 없고 위험만 있다.
`setImmediate` 양보도 넣지 않았다 — 0.5 ms짜리 계산을 양보해 얻는 것이 없다.

**다시 볼 때**: `.majak/perf.log`의 `bot p99`가 수십 ms로 오르면(증강 정책이 무거워졌을 때)
그때 이 판단을 다시 한다.

### 테이블 단위 격리 · DB 큐 (계획 3단계)
안 했다. 게임 중 동기 SQLite 호출은 **국이 끝날 때 upsert 하나**(`saveLiveGame`)와 판 끝의
`recordGame`뿐이다 — 이벤트마다 치지 않는다. 프로파일에서 DB·리플레이 기록은 1% 아래다.
`RoomManager`(7,100줄) 분리는 성능 이득이 0이고 회귀 위험이 가장 큰 리팩토링이라, 이번
«기능 불변» 작업의 범위에 넣지 않았다.

**다시 볼 때 = 클라우드로 옮길 때.** 그때 필요한 것은 «한 테이블은 한 프로세스에 있다»는
구조이고, 순서는 계획 문서 3단계 그대로다: (a) 게임 진행을 `TableRunner`로 떼고 →
(b) 프로세스 경계 확인 → (c) `rememberLiveGame` 등 프로세스 메모리에 기대는 재접속 상태를
외부 저장으로. 한 프로세스가 수백 테이블을 감당하므로 그 전까지는 **한 프로세스**가 맞다.

## 6. 앞으로 «느리다»가 느껴지면

1. `tail -50 .majak/perf.log` — `loop p99`가 수십 ms를 넘는가, `bot p99`가 오르는가, 힙이 자라는가.
2. `npm run load -w @majak/server -- --tables 40 --seconds 20` — 지금 코드의 수용량(§1 표와 비교).
3. `node --cpu-prof … arenaCli.ts` — 엔진·봇 쪽이면 여기서 보인다.
4. 판을 바꾸지 않는 최적화라면 앞뒤로 `npm run golden` 을 찍어 비교한다.
