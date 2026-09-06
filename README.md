# 이능마작 (newMajak)

> 일본 리치마작 + Balatro — 규칙 자체를 뒤바꾸는 **증강(Augment)** 을 얹은 웹 4인 온라인 마작.

실서비스: **https://majak.yaho1231.com**

기본 플레이는 정통 일본식 리치마작을 따른다. 다만 플레이어는 게임 시작 시 1개,
남장 진입 시 1개 — 판당 총 2개의 **증강**을 뽑아 마작의 상식을 부순다.
설계 원칙과 감정 설계 목표는 [PROJECT_CHARTER.md](PROJECT_CHARTER.md)에 있다.

---

## 무엇이 들어 있나

- **리치마작 엔진** — 패산·부로·후리텐·역/부수 계산·연장전까지 포함한 순수 TypeScript 구현
- **증강 시스템** — 콘텐츠 증강 **113종** + 표준 증강 4종. 엔진 수정 없이 증강 하나 = 파일 하나
- **드래프트** — 파워 티어 가중 추출 + 좌석별 후보 비겹침(같은 스테이지 중복 제시 0%)
- **온라인 대전** — WebSocket 권위 서버, 방 코드 매치메이킹, 재접속 복구
- **봇** — 사람이 빠진 자리를 채우고, 증강까지 이해하고 두는 AI 상대
- **계정·전적·리플레이** — SQLite 계정, JSONL 이벤트 로그 기반 리플레이 재생
- **관리자 관전** — 전원 손패가 보이는 중계용 관전, 일시정지, 전역 공지

---

## 기술 스택

| 영역 | 선택 |
|------|------|
| 언어 | TypeScript (클라이언트·서버·엔진 공유) |
| 프론트 | React 18 + Vite |
| 서버 | Node.js 22 + `ws` (WebSocket), `tsx`로 TS 직접 실행 |
| 영속성 | SQLite(계정·전적) + JSONL 리플레이 로그 |
| 테스트 | Vitest |
| 배포 | macOS 단일 Node 프로세스 + Cloudflare Tunnel |

HTTP(빌드된 SPA 정적 서빙)와 WebSocket을 **단일 포트**에서 함께 서빙한다.

---

## 패키지 구조

```
newMajak/
├── packages/
│   ├── core/      # @majak/core    — 순수 게임 엔진 + 증강 훅 (I/O 없음)
│   ├── content/   # @majak/content — 증강 정의와 회귀 테스트
│   ├── server/    # @majak/server  — 권위 서버, 방, 봇, 리플레이
│   └── client/    # @majak/client  — React UI
├── docs/          # 설계·감사 문서 (00~51, 99)
├── deploy/        # 배포 스크립트 · 감시자 · 백업
└── replays/       # 게임별 JSONL 이벤트 로그
```

의존 방향은 절대 규칙이다.

```
client ──▶ core ◀── server
             ▲
          content
```

- **core는 아무것도 의존하지 않는다.** Node API·DOM·네트워크·파일시스템 금지.
  그래서 서버(권위 실행)와 클라이언트(표시·검증)가 같은 코드를 쓴다.
- **content는 core의 등록 API만 쓴다.** 증강을 넣으려고 엔진을 고치면 설계 실패다.
- **server와 client는 서로를 모른다.** 공유 타입(프로토콜 등)은 core에 둔다.

---

## 시작하기

요구 사항: Node.js 22+

```bash
npm install
```

개발 서버(터미널 2개):

```bash
npm run dev:server
```

```bash
npm run dev:client
```

로컬 통합 실행(빌드된 클라이언트를 서버가 서빙):

```bash
npm start        # npm stop / npm run restart / npm run status / npm run logs
```

---

## 개발

```bash
npm test                    # vitest 전체 (수천 개 · 수 분 소요)
npm run typecheck           # core
npm run typecheck:content
npm run typecheck:server
npm run typecheck:client
npm run build:client
```

머지 게이트는 **테스트 전부 통과 + 타입 에러 0**이다. 현재 기준선과 알려진 플레이크는
[docs/23_TEST_BASELINE.md](docs/23_TEST_BASELINE.md)가 단일 진실이다.

도구:

```bash
npm run replay -- <replay.jsonl>   # 리플레이 재생/검증
npm run arena -- ...              # 봇 자동 대국(밸런스 실측)
```

---

## 증강을 하나 추가하려면

1. `packages/content/src/augments/<id>.ts` 에 정의를 하나 만든다 — 필요한 훅만 구현한다.
2. `packages/content/src/index.ts` 의 카탈로그에 등록한다.
3. `packages/content/test/` 에 회귀 테스트를 추가한다.
4. 파워 티어를 `packages/core/src/augment/powerTier.ts` 에 넣는다(드롭 가중치의 단일 진실).

엔진(core)을 고쳐야 한다면 그건 훅이 부족하다는 신호다 —
훅부터 [docs/10_AUGMENT_SYSTEM.md](docs/10_AUGMENT_SYSTEM.md) 계약에 맞춰 연다.

---

## 문서

| 문서 | 내용 |
|---|---|
| [PROJECT_CHARTER.md](PROJECT_CHARTER.md) | 기획 원칙 — 무엇을 만들고 무엇을 만들지 않는가 |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | 진행 상황과 현재 목표 |
| [docs/00_MASTER_ARCHITECTURE.md](docs/00_MASTER_ARCHITECTURE.md) | 전체 지도 — 시스템 경계와 데이터 흐름 |
| [docs/10_AUGMENT_SYSTEM.md](docs/10_AUGMENT_SYSTEM.md) | 증강 훅·드래프트·정산 단계 계약 |
| [docs/17_AUGMENT_BALANCE.md](docs/17_AUGMENT_BALANCE.md) | 증강 밸런스 수치의 단일 진실 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 배포·감시자·백업·복구 |
| [SECURITY.md](SECURITY.md) | 보안 모델과 감사 이력 |
| [CLAUDE.md](CLAUDE.md) | 이 저장소에서 일하는 규칙(브랜치·게이트·배포 금기) |

`docs/` 에는 이 외에도 QA 라운드·감사 보고서가 번호순으로 쌓여 있다.

---

## 라이선스

비공개 프로젝트. 별도 라이선스가 없다.
