# 취합 담당 메모 (Opus) — 진행 중

## 담당별 상태
| 담당 | 보고서 | 상태 |
|---|---|---|
| ops | ops.md | 완료 |
| account | account.md | 완료 |
| synergy | synergy.md | 1차 완료 → 후속 2건 추적 중 |
| firstrun | firstrun.md | 완료 (아래 오탐 1건 정정) |
| lobby · augbug · netfail · load · mobile · balance | — | 세션 SIGKILL 후 재개 |

---

## 취합 담당이 직접 확인한 것

### [오탐] firstrun P2 «BackgroundBGM.mp3 404»
**기각.** 워크트리 아티팩트다. `.gitignore:12` 가 `*.mp3` 를 제외하므로 워크트리에는
mp3 가 없다. 메인 체크아웃에는 있고, 공개 서버는 정상으로 준다:

```
$ ls /Users/skul/majak/packages/client/public/*.mp3
BackgroundBGM.mp3  richiBGM1.mp3  richiBGM2.mp3
$ curl -o /dev/null -w "%{http_code} %{size_download}" http://localhost:3011/BackgroundBGM.mp3
200 8690882bytes
```
→ 보고서에서 내려야 한다. 워크트리에서 오디오를 검사하면 항상 404가 난다는 것을
다음 라운드 브리핑에 적어 둘 것.

### [P1 신규] 오디오 에셋이 버전 관리에도 백업에도 없다
위 조사에서 파생됐다. `*.mp3` 는 `.gitignore` 대상이고(`.gitignore:12`),
`scripts/backup.sh` 는 **DB + stats + 리플레이 미러**만 뜬다(`backup.sh:37-39,102-153`) —
`packages/client/public/` 는 백업 대상이 아니다.

즉 BGM 3종(BackgroundBGM 8.7MB + richiBGM1/2)은 **사용자 맥의 메인 체크아웃
한 곳에만 존재하고, git 에도 백업에도 사본이 없다.** 디스크가 죽거나 실수로 지우면
복구 수단이 없다. 출시일에 소리가 통째로 사라지는 단일 장애점이다.

- 위치: `.gitignore:12`, `scripts/backup.sh:37-39`
- 판정: **확정** (위 명령 출력이 근거)
- 제안: 둘 중 하나 — (a) 오디오를 git-lfs 나 별도 에셋 저장소로 버전 관리,
  (b) `backup.sh` 에 `packages/client/public/` 미디어 미러를 추가.
  최소한 (b) 는 한 줄이면 된다.
