/**
 * 원문 노출 차단 가드 (2026-09-25, docs/59 B01 — U64·U67·U76·U63·U68·U66).
 *
 * 내부 id·채널명·봇 서버 닉네임(`Bot_p2`)이 버튼·기록·목록·aria에 새지 않게 못을 박는다.
 * 이 패키지에는 jsdom이 없어 **정적 소스 스캔**이다(`augmentPublicChannels.test.ts`와 같은 방식).
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const REPLAY_SRC = readFileSync(join(HERE, "../src/replayRebuild.ts"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const AUG_DIR = join(HERE, "../../content/src/augments");
const PLAYER_VIEW = readFileSync(join(HERE, "../../core/src/information/PlayerView.ts"), "utf8");

function slice(from: string, to: string): string {
  const at = SRC.indexOf(from);
  expect(at, from).toBeGreaterThan(0);
  const end = SRC.indexOf(to, at);
  expect(end, to).toBeGreaterThan(at);
  return SRC.slice(at, end);
}

/** augmentLogRows 본문 — 경계는 augmentPublicChannels.test.ts와 같다 */
const LOG = slice("function augmentLogRows(", "  return rows;\n}");

/** 로그가 `continue`로 건너뛰는 head 이름 (`head === "x"` 꼴) */
const SKIPPED = new Set([...LOG.matchAll(/head === "([\w]+)"/g)].map((m) => m[1] as string));

describe("📜 기록 — 채널 이름이 태그에 새지 않는다 (U64)", () => {
  it("좌석 공개 사본·턴 쿨다운·발동 국 표식은 pill 소관이라 건너뛴다", () => {
    expect(LOG).toContain(
      'if (head === "seat" || head === "cooldownTurns" || head === "cooldownUsedRound") continue;',
    );
  });

  it("코어 SEAT_PUBLIC_PREFIXES의 모든 채널이 건너뛰기 목록에 있다", () => {
    const m = /const SEAT_PUBLIC_PREFIXES = \[([^\]]+)\]/.exec(PLAYER_VIEW);
    expect(m, "SEAT_PUBLIC_PREFIXES를 못 찾았다").not.toBeNull();
    const heads = [...m![1]!.matchAll(/"([\w]+):"/g)].map((x) => x[1] as string);
    expect(heads.length).toBeGreaterThanOrEqual(4);
    for (const h of heads) expect(SKIPPED, `${h}가 로그 건너뛰기에 없다`).toContain(h);
    expect(SKIPPED).toContain("seat");
  });

  it("이름 없는 head는 원문 폴백 대신 행을 만들지 않는다", () => {
    // 예전: `HEAD_NAME[h] ?? catalog[h]?.name ?? h` — 마지막 `?? h`가 채널 이름을 태그에 찍었다.
    expect(LOG).not.toMatch(/catalog\[h\]\?\.name \?\? h\b/);
    expect(LOG).toContain("const nameOf = (h: string): string | null =>");
    expect(LOG).toContain("return null;");
    // 수상한 주사위가 쏟아낸 증강 이름도 원문 id로 떨어지지 않는다
    expect(LOG).not.toContain("catalog[id]?.name ?? id");
  });

  it("content가 내는 뷰 채널 head는 전부 카탈로그 id·HEAD_NAME·건너뛰기 중 하나다", () => {
    /*
     * nameOf가 이름 없는 head를 **숨기므로**, 정당한 채널이 이름표에 없으면 조용히 사라진다.
     * 그래서 지금 content가 내는 head를 전부 걷어 어디에 속하는지 확인한다. 새 채널을 더했는데
     * 여기서 걸리면: 제자리(pill·뱃지·컷인)를 찾아 건너뛰기에 넣거나 HEAD_NAME에 이름을 준다.
     */
    // 증강 파일 전부 + 공용 채널(uses·cooldown·cooldownTurns·cooldownUsedRound·spent)을 내는 util.ts
    const files = [
      ...readdirSync(AUG_DIR)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(AUG_DIR, f)),
      join(AUG_DIR, "../util.ts"),
    ];
    const ids = new Set<string>();
    const heads = new Map<string, string>();
    /** 문자열로도 상수·채널 함수로도 못 푼 둘째 인자 — 이게 생기면 스캔이 눈을 감은 것이다 */
    const unresolved: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bid: "([a-z0-9_]+)"/g)) ids.add(m[1] as string);
      const fileId = /const ID = "([a-z0-9_]+)"/.exec(src)?.[1];
      if (fileId !== undefined) ids.add(fileId);
      /*
       * 둘째 인자를 원문 문자열로 푼다. 리터럴만 보면 `roundViewKey("*", TIME_PRESSURE_CHANNEL)`
       * 같은 상수 인자와 `forcedTsumogiriChannel(...)` 같은 채널 함수 호출을 놓친다 — nameOf가
       * 이름 없는 head를 숨기므로, 그 길로 더한 채널은 가드 없이 📜에서 사라진다(2026-09-25, B01 리뷰).
       * 같은 파일의 `const X = "…"`·`` const X = `…` ``·`const X = Y`·`const f = (…): string => `…``
       * 까지 따라간다. `ID`는 템플릿 속 `${ID}`처럼 파일 id로 푼다.
       */
      const resolve = (arg: string, depth = 0): string | null => {
        const lit = /^(?:`([^`]*)`|"([^"]*)")$/.exec(arg);
        if (lit !== null) return (lit[1] ?? lit[2]) as string;
        if (depth > 3) return null;
        const call = /^([A-Za-z_$][\w$]*)\(/.exec(arg);
        if (call !== null) {
          const name = call[1] as string;
          const fn = new RegExp(`const ${name} = \\([^)]*\\)(?::\\s*string)?\\s*=>\\s*(\`[^\`]*\`|"[^"]*")`).exec(src);
          return fn !== null ? resolve(fn[1] as string, depth + 1) : null;
        }
        if (arg === "ID") return "${ID}";
        const decl = new RegExp(`const ${arg}(?::\\s*string)? = (\`[^\`]*\`|"[^"]*"|[A-Za-z_$][\\w$]*);`).exec(src);
        return decl !== null ? resolve(decl[1] as string, depth + 1) : null;
      };
      // `function viewKey(player: …, key: string)` 정의 자체는 호출이 아니다
      for (const m of src.matchAll(
        /(?<!function )\b(?:round)?[vV]iewKey\(\s*[^,()]+,\s*(`[^`]+`|"[^"]+"|[A-Za-z_$][\w$]*(?:\()?)/g,
      )) {
        const raw = resolve(m[1] as string);
        if (raw === null) {
          const at = `${f.split("/").pop()}: ${m[0]}`;
          // roundViewKey가 제 인자를 viewKey로 넘기는 한 줄 — 채널은 roundViewKey 호출부가 정한다
          if (at !== "util.ts: viewKey(player, key") unresolved.push(at);
          continue;
        }
        // `${ID}`·`${ID}_x` — 파일 id로 펼친다
        const head = (raw.split(":")[0] as string).replace("${ID}", fileId ?? "${ID}");
        // `${augmentId}`·`${spec.id}`처럼 호출부가 정하는 head는 증강 id다 — 여기서는 못 푼다
        if (head.startsWith("${")) continue;
        heads.set(head, f);
      }
    }
    expect(unresolved, "뷰 채널 이름을 못 푼 호출 — resolve를 넓히거나 리터럴로 쓴다").toEqual([]);
    const headName = slice("const HEAD_NAME: Record<string, string> = {", "\n  };");
    const named = new Set([...headName.matchAll(/^\s+(\w+):/gm)].map((m) => m[1] as string));
    const orphans = [...heads.entries()].filter(
      ([h]) => /^[a-z0-9_]+$/i.test(h) && !ids.has(h) && !named.has(h) && !SKIPPED.has(h),
    );
    expect(orphans, "이름도 제자리도 없는 채널").toEqual([]);
    // 스캔이 실제로 뭔가를 걷었는지 — 정규식이 깨져 0개면 위 검사는 공허하다
    expect(heads.size).toBeGreaterThan(40);
    for (const h of ["uses", "cooldown", "cooldownTurns", "cooldownUsedRound", "spent"]) {
      expect(heads.has(h), `util.ts의 ${h} 채널을 못 걷었다`).toBe(true);
    }
    // 상수·채널 함수 인자도 실제로 풀렸는지 — time_pressure(상수)·forcedTsumogiri(함수)
    expect(heads.has("time_pressure"), "TIME_PRESSURE_CHANNEL을 못 풀었다").toBe(true);
    expect(heads.has("forcedTsumogiri"), "forcedTsumogiriChannel(...)을 못 풀었다").toBe(true);
  });
});

describe("봇 서버 닉네임 — 판 위 이름으로 부른다 (U67)", () => {
  it("게임 화면(GameTable~GameOverModal 앞)은 `.nickname`을 이모트 말풍선 말고는 쓰지 않는다", () => {
    const game = slice("const GameTable = memo(function GameTable(", "function GameOverModal(");
    const uses = game
      .split("\n")
      .filter((l) => l.includes(".nickname"))
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    // 이모트는 사람만 보낸다(서버 handleEmote는 연결된 사람 몫) — 봇 닉네임이 올 수 없다
    const allowed = [/<span className="emote-bubble-name">\{e\.nickname\}<\/span>/];
    const bad = uses.filter((l) => !allowed.some((re) => re.test(l)));
    expect(bad, "판 위는 playerName/playerNameById로 부른다").toEqual([]);
  });

  it("상대 고르기 aria와 가려진 도라 뱃지는 playerName", () => {
    // 2026-09-25 (docs/59 U29): 무엇을 하는지도 함께 읽는다 — «봇1에게 통째로 바꾸기»
    expect(SRC).toContain("? `${playerName(view, player)}에게 ${armAugName}`");
    expect(SRC).toContain(": `${playerName(view, player)} 고르기`,");
    expect(SRC).toContain('const who = others.map((p) => playerName(view, p)).join(" · ");');
  });

  it("리플레이·진행 중 방·관전 탁자 목록은 rosterNames로 봇을 «봇·봇1…»로 부른다", () => {
    // 리플레이 목록은 순위순이라 서버 닉네임(id)을 번호 순서의 키로만 넘긴다 — 판 위 좌석순 «봇N»과 맞춘다
    expect(SRC).toContain('{rosterNames(g.players, (p) => p.nickname).join(" · ")}');
    expect(SRC).toContain('{rosterNames(r.players).join(" · ")}');
    expect(SRC).toContain('title={`${rosterNames(r.players).join(" · ")}');
    const fn = slice("function rosterNames(", "\n}");
    expect(fn).toContain("p.isBot");
    expect(fn).not.toContain("Bot_");
    // «나» 판정은 표시가 아니라 계정 비교라 원문 그대로 둔다
    expect(SRC).toContain("g.players.find((p) => p.nickname === props.auth.username)");
  });

  it("playerName의 마지막 폴백은 좌석 id가 아니다", () => {
    const fn = slice("function playerName(view: PlayerView, player: PlayerInfo): string {", "\n}");
    expect(fn).not.toContain(": player.id");
    expect(fn).toContain('"이름 없음"');
  });
});

describe("대국 종료 창 — 판 위 이름과 내 줄 (U76)", () => {
  const modal = slice("function GameOverModal(", "\n// ──");

  it("순위·통계 두 탭 모두 서버 닉네임을 그대로 찍지 않는다", () => {
    expect(modal).not.toContain('{r.isBot ? "봇" : r.nickname}');
    expect(modal).not.toMatch(/^\s*\{e\.nickname\}\s*$/m);
    expect(modal).toContain("{displayName(r)}");
    expect(modal).toContain("{displayName(e)}");
    // 폴백은 봇이면 «봇» — `Bot_p2`는 어떤 경로로도 화면에 서지 않는다
    expect(modal).toContain('(e.isBot ? "봇" : e.nickname)');
  });

  it("App이 판 위 이름 해석과 내 id를 넘기고, 내 줄을 강조한다", () => {
    expect(SRC).toMatch(/nameOf: \(id: string\) => \{\s+const p = view\.players\.find/);
    expect(SRC).toContain("myId: view.playerId,");
    expect(modal).toContain('r.playerId === myId ? " rank-me" : ""');
    expect(CSS).toMatch(/\.rank-me \{[^}]+\}/);
  });

  it("모르는 성향이면 성향 칩을 빼서 «봇 BOT 봇»이 되지 않는다", () => {
    expect(modal).toContain("r.isBot && archetypeInfo(r.archetype) !== null ?");
  });
});

describe("증강 id → 이름 폴백은 한 경로 (U63·U68)", () => {
  it("augName: 카탈로그 → 전역 이름표 → 중립 문구, 개발 모드에서만 경고", () => {
    const fn = slice("function augName(", "\n}");
    expect(fn).toContain("catalog?.[id]?.name ?? NAME_BY_ID[id]");
    expect(fn).toContain("import.meta.env.DEV");
    expect(fn).toContain('return "알 수 없는 증강";');
    const disp = slice("function augmentDisplayName(", "\n}");
    expect(disp).toContain("return augName(id);");
  });

  it("이름표 pill·증강 시트·관전·드래프트 보유 목록이 원문 id로 떨어지지 않는다", () => {
    expect(SRC).not.toContain("{entry?.name ?? a}");
    expect(SRC).not.toContain("`${entry?.name ?? a} 증강 보기`");
    expect(SRC).not.toContain("{entry?.name ?? id}");
    expect(SRC).not.toContain("{catalog[id]?.name ?? id}");
    expect(SRC).not.toContain("?.name ?? locked}");
  });

  it("PILL_CUSTOM은 모르는 값을 원문 칩으로 세우지 않는다", () => {
    const pill = slice("const PILL_CUSTOM: Record<", "\n};");
    expect(pill).not.toContain("SUIT_KO[raw] ?? raw");
    expect(pill).not.toContain("YAKU_NAMES[raw] ?? raw");
    expect(pill).not.toContain("{ chip: raw, note: raw }");
  });

  it("홈 증강 통계(toAugRows)는 카탈로그에 없는 폐기 증강 행을 뺀다 — 카탈로그 도착 전에는 행을 만들지 않는다", () => {
    const fn = slice("function toAugRows(", "\n}");
    expect(fn).toContain("if (Object.keys(catalog).length === 0) return out;");
    expect(fn).toContain("if (cat === undefined) continue;");
    expect(fn).not.toContain("cat?.name ?? id");
  });

  it("봇 난이도 배지는 이름표에 없는 값이면 원문 대신 세우지 않는다", () => {
    expect(SRC).not.toContain("BOT_DIFFICULTY_LABEL[props.botDifficulty] ?? props.botDifficulty");
    expect(SRC).toContain("BOT_DIFFICULTY_LABEL[props.botDifficulty] !== undefined &&");
  });

  it("공유 링크 리플레이는 들고 온 이름표로 비어 있는 이름·계열을 채운다", () => {
    expect(SRC).toContain("rememberCatalogIfMissing(Object.values(r.catalog));");
    const fn = slice("function rememberCatalogIfMissing(", "\n}");
    // 이미 받은 서버 값은 덮지 않는다
    expect(fn).toContain("NAME_BY_ID[e.id] ??= e.name;");
    expect(fn).toContain("CATEGORY_BY_ID[e.id] ??= e.category;");
    expect(REPLAY_SRC).toContain("category: a.category,");
  });
});

describe("컷인 곁줄 — 뷰가 없으면 좌석 id 대신 주체를 비운다 (U66·U79)", () => {
  it("증강 발동·화료 컷인의 who 폴백이 좌석 id가 아니다", () => {
    expect(SRC).not.toContain("playerNameById(pv, msg.player) : msg.player;");
    expect(SRC).not.toContain("playerNameById(pv, headline.winner) : headline.winner;");
    expect(SRC).not.toContain("playerNameById(pv, w.winner) : w.winner}");
  });

  it("특수 유국 컷인 제목은 « — »와 «:» 어느 구분자든 앞 조각만 쓴다", () => {
    expect(SRC).toContain("special.label.split(/\\s*(?:—|:)\\s*/)[0] ?? special.label");
  });
});
