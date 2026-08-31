/**
 * WinContext — 화료 순간의 모든 문맥과, 분해 × 화료패 위치 조합으로 만드는
 * 채점 변형(ScoringVariant).
 *
 * 핵심: 론으로 완성된 커쯔는 명각 취급 (산안커·스안커·부 계산),
 * 대기 형태(양면/간짱/변짱/단기/샹퐁)는 변형마다 다르다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §2
 */

import { Suits, kindKey, sameKind } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";
import { decompose, runQuadRepr } from "./decompose.js";
import type { DecompSet, DecomposeOptions } from "./decompose.js";

export interface MeldInfo {
  kind: "chi" | "pon" | "kan_open" | "kan_added" | "kan_closed" | "kokushi_pon";
  /** 치·펑: 3개 / 깡: 4개 (도라 계산에 4장째도 포함) / 울어 국사: 3개(서로 다른 요구패) */
  tiles: TileKind[];
  /** 멘젠 유지 후로 (묵계) — 채점 isClosed 판정에서 안깡처럼 손을 열지 않는다 */
  silent?: boolean;
}

export interface WinContext {
  /** 손패 kind 목록 — 화료패 포함, 후로 제외 */
  hand: TileKind[];
  melds: MeldInfo[];
  winningTile: TileKind;
  winType: "tsumo" | "ron";
  /** 1동 2남 3서 4북 */
  seatWind: number;
  prevalentWind: number;
  riichi: { double: boolean; ippatsu: boolean } | null;
  flags?: {
    haitei?: boolean;
    houtei?: boolean;
    rinshan?: boolean;
    chankan?: boolean;
    tenhou?: boolean;
    chihou?: boolean;
  };
  /** 도라 그 자체의 kind (표시패 아님). 없으면 도라 0 */
  doraKinds?: TileKind[];
  /** 리치 화료 시에만 적용 */
  uraDoraKinds?: TileKind[];
  /**
   * `doraKinds`·`uraDoraKinds`의 앞에서 **몇 개까지가 판 위의 표시패에서 온 것인가**.
   *
   * 증강이 얹는 개인 도라는 표준 도라 뒤에 그대로 이어 붙는다(helpers의 doraKinds 조립).
   * 그러면 합계만 남아, 화면에 뜬 표시패 한 장으로 설명되지 않는 판수가 나와도 근거를
   * 찾을 데가 없었다. 이 경계를 알려 주면 채점이 표준분과 증강분을 갈라 셀 수 있다.
   * 생략하면 전부 표준분으로 본다(종전 동작).
   */
  standardDoraCount?: number;
  standardUraCount?: number;
  /**
   * 리치를 걸지 않았어도 뒷도라를 센다 (숨은 칼날).
   * 기본은 "리치한 손만 뒷도라"이므로 증강이 이 문을 열 때만 true다.
   */
  uraAlways?: boolean;
  /** 적도라 수 (attrs.red인 패의 수 — 호출자가 센다) */
  redCount?: number;
  /**
   * 이 화료에 역이 필요한가 (`win.requiresYaku`). 생략하면 true(표준 룰).
   *
   * false면 **역 0개로도 화료가 성립**하므로(무형화료·대기만성 만개·복수자),
   * 도라·적도라·뒷도라와 보조역이 그대로 붙는다. 표준 룰에서 이것들이 안 붙는
   * 이유는 "역이 없으면 애초에 화료가 아니다"였는데, 그 전제가 사라진 자리다 —
   * 예전에는 붉은손길로 만든 적도라를 손에 쥐고도 0판 30부로 정산됐다
   * (2026-08-17 사용자 보고).
   */
  requiresYaku?: boolean;
  /** 화료자 id — 증강이 만든 역이 보유자를 판별할 때 사용 */
  winnerId?: string;
  /** 론이면 쏜 사람 id (창깡이면 깡 선언자). 쯔모면 undefined */
  fromPlayerId?: string;
  /** 쏜 사람이 리치 중인가 (론일 때만 의미 있음) */
  fromRiichi?: boolean;
  /** 성립을 금지할 역 id 목록 (win.blockedYaku 규칙에서 유도) */
  blockedYaku?: string[];
  /**
   * 지금 무장해제된 증강 인스턴스 id 목록 (state의 DISARMED_SOURCES_KEY에서 유도).
   * 여기 실린 source로 등록된 커스텀 역은 성립하지 않는다.
   */
  disarmedSources?: readonly string[];
  /** 분해 옵션 (scoring.* 규칙에서 유도 — helpers.scoringOptionsOf) */
  options?: DecomposeOptions;
}

export type WaitType =
  | "ryanmen"
  | "kanchan"
  | "penchan"
  | "tanki"
  | "shanpon"
  | "chiitoi"
  | "kokushi";

export interface ScoringSet {
  type: "run" | "triplet";
  /** 대표 3장 (깡도 3장으로 대표, isKan으로 구분) */
  tiles: TileKind[];
  /** 암각/안깡 여부. 론으로 완성된 커쯔는 false */
  concealed: boolean;
  isKan: boolean;
  /**
   * 깡의 **실물 넉 장** — 랭크가 섞인 깡(장사진의 3-4-5-6, 바람의 계보의 동남서북)에만
   * 실린다. 대표 3장(`tiles`)에서 빠진 네 번째 패가 역 판정에서 사라지지 않도록
   * `allKinds`가 이걸 함께 본다 — 없으면 9만이 든 장사진에 탕야오가, 중장패가 든
   * 장사진에 찬타·준찬타가 붙는다(qa-lab text 확정 22).
   *
   * 부수(`fu.ts`)·도라는 종전대로 `tiles`/실물 멘쯔를 본다.
   */
  kanTiles?: TileKind[];
}

export interface ScoringVariant {
  form: "standard" | "chiitoitsu" | "kokushi";
  pair: TileKind | null;
  pairs?: TileKind[];
  /**
   * 이 변형이 보는 **손패 전체**(후로 제외, 조커는 변한 뒤의 kind).
   *
   * 치또이·국사는 sets/pair로 표현이 안 되므로 채점이 이걸 본다(`allKinds`).
   * 표준형에도 싣는데, 그쪽은 채점이 쓰지 않고 **결과 화면의 몸통 복원**(winShape)이
   * 쓴다 — 혼색 머리(2만+2통)는 `pair` 한 kind로는 짝을 되살릴 수 없다.
   */
  handKinds?: TileKind[];
  /** standard: 손패 멘쯔 + 후로 멘쯔 통합 */
  sets: ScoringSet[];
  waitType: WaitType;
  isClosed: boolean;
}

/**
 * 커쯔 후로의 대표 3장. 무늬가 섞인 커쯔(동수의 결속의 2만2통2삭 펑·깡)의 **무늬 구성을
 * 보존**한다 — first를 3번 복제하면 2만2만2만처럼 보여 청일색·혼일색·삼색동각이
 * 헛성립한다. 서로 다른 kind를 앞세우고 모자라면 마지막 것으로 채운다(순수 커쯔는 종전과 동일).
 */
function tripletRepr(tiles: readonly TileKind[]): TileKind[] {
  const uniq = new Map<string, TileKind>();
  for (const t of tiles) if (!uniq.has(kindKey(t))) uniq.set(kindKey(t), t);
  const out = [...uniq.values()].slice(0, 3);
  while (out.length < 3) out.push(out[out.length - 1] as TileKind);
  return out;
}

const NUMBERED = new Set<string>([Suits.Man, Suits.Pin, Suits.Sou]);

/**
 * 양극(scoring.polarEnds)이 만든 **1·9 혼합 커쯔**인가 — 같은 수패 무늬의 1과 9만으로
 * 이뤄진 몸통(199·119·1199 깡). 랭크가 섞여 있어도 **슌쯔가 아니라 커쯔**다.
 * 랭크가 섞인 다른 깡(장사진의 4연속 1234·바람의 계보의 동남서북)은 노두패 아닌 랭크가
 * 반드시 끼거나 자패라서 이 조건에 걸리지 않는다 — 두 계열을 가르는 유일한 안전한 기준이다.
 */
function isPolarBody(tiles: readonly TileKind[]): boolean {
  /*
   * 무늬 일치는 **요구하지 않는다** — 양극과 동수의 결속을 함께 들면 1만·9통도 한 몸통이
   * 되기 때문이다(2026-08-31 사용자 지시). 그래도 안전한 이유: 랭크가 섞인 다른 깡은
   * 노두패 아닌 랭크가 반드시 끼거나(장사진의 4연속) 자패라서(바람의 계보) 여기 들지 않는다.
   */
  return (
    tiles.every((t) => NUMBERED.has(t.suit)) &&
    tiles.every((t) => t.rank === 1 || t.rank === 9)
  );
}

function meldToSet(meld: MeldInfo): ScoringSet {
  const first = meld.tiles[0] as TileKind;
  const isKanKind =
    meld.kind !== "chi" && meld.kind !== "pon" && meld.kind !== "kokushi_pon";
  /**
   * **랭크가 서로 다른 깡**(바람의 계보의 동남서북 깡, 장사진의 4연속 깡)은
   * 커쯔가 아니라 **슌쯔성 몸통**이다. 대표 3장을 first로 복제하면 東東東 커쯔처럼 보여
   * 역패·또이또이·산안커·사희가 헛성립하고 안깡 부수(32부)까지 부당하게 붙는다.
   * 랭크 오름차순 앞 3장을 슌쯔로 내보낸다 — 깡 자체(isKan)는 유지되므로
   * 산깡쯔·스깡쯔 카운트와 영상패·새로운 도라는 그대로 동작한다.
   *
   * ⚠ 판정 기준은 **랭크**다. 예외 둘은 진짜 커쯔라 이 분기에 들면 안 된다:
   *  - 동수의 결속: 랭크가 같고 무늬만 섞인 깡(4만4통4삭4만)
   *  - 양극: 같은 무늬의 1·9만 섞인 깡(1만1만9만9만) — `isPolarBody`
   * 둘을 kind/랭크만으로 걸러 내면 또이또이·산안커가 통째로 날아간다.
   */
  if (isKanKind && meld.tiles.some((t) => t.rank !== first.rank) && !isPolarBody(meld.tiles)) {
    // 순환 4연속(끝없는 윤회 + 장사진의 8-9-1-2)은 오름차순 정렬로 순서가 복원되지
    // 않는다 — 1-2-8이 대표가 되어 존재하지 않는 몸통이 나온다. 시작 랭크에서 세어
    // 8-9-1을 내보낸다. 연속이 아닌 깡(사풍깡)은 종전대로 오름차순 앞 3장이다.
    const repr =
      runQuadRepr(meld.tiles) ?? [...meld.tiles].sort((a, b) => a.rank - b.rank).slice(0, 3);
    return {
      type: "run",
      tiles: repr,
      concealed: meld.kind === "kan_closed",
      isKan: true,
      // 대표에서 빠진 네 번째 패를 잃지 않는다 (allKinds가 본다)
      kanTiles: [...meld.tiles],
    };
  }
  return {
    type: meld.kind === "chi" ? "run" : "triplet",
    tiles: meld.kind === "chi" ? meld.tiles.slice(0, 3) : tripletRepr(meld.tiles),
    concealed: meld.kind === "kan_closed",
    ...(isKanKind ? { kanTiles: [...meld.tiles] } : {}),
    // kokushi_pon(울어 국사 특수 후로)은 깡이 아니다. 국사 폼은 이 set을 쓰지 않지만
    // 다른 계산이 깡으로 오인하지 않도록 명시적으로 제외한다.
    isKan:
      meld.kind !== "chi" && meld.kind !== "pon" && meld.kind !== "kokushi_pon",
  };
}

/**
 * 이 후로가 채점에서 **취할 수 있는 몸통 해석들** (보통 하나).
 *
 * 둘이 되는 것은 **장사진의 4연속 깡**(3-4-5-6) 하나뿐이다. 넉 장을 깡으로 눕혔다는
 * 사실 하나로 슌쯔로도, 커쯔로도 볼 수 있게 한다 — 어느 쪽이 비싼지는 변형끼리
 * 겨뤄 `evaluateWin`이 고른다(도라·역 조합에 따라 답이 달라진다).
 *
 * **왜 둘인가** (2026-08-19 사용자 지시). 예전에는 슌쯔 해석 하나뿐이라 3-4-5-6 깡을
 * 낀 또이또이·산안커·스안커가 통째로 성립하지 않았고, 커쯔로 셀 것이 그것뿐인 손은
 * **역 없음**으로 떨어졌다. 반대로 커쯔 해석만 두면 일기통관·삼색동순이 날아간다.
 * 둘 다 내놓고 비싼 쪽을 고르는 것이 "깡으로 취급할 수 있다"의 정확한 뜻이다.
 *
 * ⚠ 커쯔 해석에도 **대표 3장은 실물 그대로**(3-4-5) 둔다. first를 복제해 3-3-3처럼
 * 만들면 삼색동각·청노두·혼일색이 헛성립한다. 랭크·무늬를 요구하는 역들은
 * `isSameRankTriplet`·`isPureTriplet`으로 이미 그런 몸통을 걸러 낸다.
 * 부수는 두 해석이 같다(`fu.ts`가 깡을 type과 무관하게 센다).
 *
 * 사풍깡(바람의 계보의 동남서북)은 여기 들지 않는다 — 연속이 아니므로
 * `runQuadRepr`가 null이고, 커쯔로 세면 역패·사희가 헛성립한다.
 */
function meldToSetChoices(meld: MeldInfo): ScoringSet[] {
  const set = meldToSet(meld);
  if (set.type !== "run" || !set.isKan) return [set];
  /*
   * ⚠ 무늬를 반드시 함께 본다. `runQuadRepr`는 **랭크만** 보므로 동남서북(바람 랭크
   * 1·2·3·4)이 연속으로 잡힌다 — 이 검사가 없으면 사풍깡이 커쯔가 되어 대사희·
   * 스안커가 헛성립한다(테스트가 즉시 잡았다). 장사진은 `isRunQuad`와 같은 기준으로
   * **같은 수패 무늬 넉 장**일 때만이다.
   */
  const suit = (meld.tiles[0] as TileKind).suit;
  if (!NUMBERED.has(suit) || !meld.tiles.every((t) => t.suit === suit)) return [set];
  if (runQuadRepr(meld.tiles) === null) return [set];
  return [set, { ...set, type: "triplet" }];
}

/**
 * 후로별 해석 목록의 곱집합 — 보통 원소 하나짜리 배열 하나다.
 * (장사진 깡이 n개면 2^n. 깡은 최대 4개라 상한이 16이다.)
 */
function meldSetCombos(choices: ScoringSet[][]): ScoringSet[][] {
  let out: ScoringSet[][] = [[]];
  for (const alts of choices) {
    const next: ScoringSet[][] = [];
    for (const prefix of out) for (const alt of alts) next.push([...prefix, alt]);
    out = next;
  }
  return out;
}

function classifyRunWait(run: DecompSet, winningTile: TileKind): WaitType {
  const [a, b, c] = run.tiles as [TileKind, TileKind, TileKind];
  if (sameKind(b, winningTile)) return "kanchan";
  if (a.rank === 1 && sameKind(c, winningTile)) return "penchan"; // 12 + 3
  if (c.rank === 9 && sameKind(a, winningTile)) return "penchan"; // 89 + 7
  return "ryanmen";
}

/**
 * 분해 전체 × "화료패가 완성한 묶음" 선택지를 곱해 채점 변형을 만든다.
 * 화료 형태가 아니면 빈 배열.
 */
export function buildVariants(ctx: WinContext): ScoringVariant[] {
  // 안깡·묵계(silent)는 손을 열지 않는다 — 그 외 후로가 있어야 열린 손.
  const isClosed = ctx.melds.every((m) => m.kind === "kan_closed" || m.silent === true);
  // 장사진 깡은 슌쯔로도 커쯔로도 셀 수 있다 — 조합마다 변형을 따로 낸다(보통 1개)
  const meldCombos = meldSetCombos(ctx.melds.map(meldToSetChoices));
  const variants: ScoringVariant[] = [];
  /*
   * ── 샹퐁이 서면 그 화료패의 **단기 변형은 버린다** (2026-08-20 도입 · 2026-08-22 범위 수정) ──
   *
   * 스안커 단기가 더블 역만인 근거는 `suuankou_tanki` 주석 그대로 **"화료패가 커쯔에
   * 들어가지 않는다"**이다. 같은 해석 안에서 커쯔에 들어가는 읽기가 실제로 있다면 그
   * 근거가 거짓이므로 단기라고 부를 수 없다. 잡으려던 것은 동수의 결속(1만1통1통)·
   * 양극(1만9만9만)처럼 **커쯔의 동일성을 느슨하게 만드는 증강**이 「커쯔 3장 + 머리
   * 2장」을 「혼합 커쯔 + 같은 랭크 머리」로 다시 읽어 스안커를 항상 스안커단기로
   * 격상시키던 일이다(qa-lab shape 확정 2).
   *
   * ⚠ 도입할 때의 전제 «표준 마작에서는 두 해석이 함께 설 수 없다(같은 패 5장이
   * 필요하다)»는 **거짓이었다.** 화료패가 손에 3장 있고 그중 하나가 슌쯔로도 읽히면
   * 두 해석이 **서로 다른 분해로** 함께 선다. 그래서 필터는 이제 분해 하나 안에서만
   * 돈다 — 자세한 근거와 실례는 아래 `localShanponKeys` 주석에 있다.
   */
  /**
   * 화료패가 **조커**면 그 패는 이 분해에서 조커가 변한 것으로 친다 — 물리적인 백을
   * 그대로 찾으면 어느 몸통에도 없어 변형이 0개가 되고, 완성된 손이 화료로 안 잡힌다.
   */
  const wildKeys = new Set((ctx.options?.wildKinds ?? []).map(kindKey));
  const winIsWild = wildKeys.has(kindKey(ctx.winningTile));

  for (const decomp of decompose(ctx.hand, ctx.melds.length, ctx.options)) {
    const handKinds = decomp.effectiveHand ?? [...ctx.hand];
    // 조커 화료패가 무엇이 됐는지는 분해마다 다르다 (중복 제거)
    const winTiles: TileKind[] =
      winIsWild && decomp.wildAs !== undefined && decomp.wildAs.length > 0
        ? [...new Map(decomp.wildAs.map((k) => [kindKey(k), k])).values()]
        : [ctx.winningTile];

    if (decomp.form === "chiitoitsu") {
      variants.push({
        form: "chiitoitsu",
        pair: null,
        pairs: decomp.pairs ?? [],
        // 실제 손패 14장을 함께 실어, 이종 쌍(비대칭 치또이: 1만+1통)이 있어도
        // allKinds가 손패 전체로 무늬·노두·자패를 정확히 판정하게 한다.
        // (표준 치또이는 pairs.flatMap과 동일하므로 영향 없음)
        handKinds,
        sets: [],
        waitType: "chiitoi",
        isClosed,
      });
      continue;
    }
    if (decomp.form === "kokushi") {
      variants.push({
        form: "kokushi",
        pair: decomp.pair,
        handKinds,
        sets: [],
        waitType: "kokushi",
        isClosed,
      });
      continue;
    }

    // standard: 화료패를 품을 수 있는 곳마다 변형 하나
    const baseSets = decomp.sets;
    /*
     * **이 분해 하나 안에서** 만들어진 변형과, 그중 샹퐁이 선 화료패.
     *
     * 아래 «샹퐁이 서면 단기를 버린다» 필터는 반드시 **같은 분해 안에서만** 돌아야
     * 한다(QA 2차 rules 확정 1). 예전에는 손 서명(14장 전체) + 화료패로 묶어서
     * 분해를 가로질러 지웠는데, 손 서명은 같은 손의 모든 분해에서 **똑같다** —
     * 즉 사실상 손 단위 필터였다.
     *
     * 표준 마작에서도 두 해석은 **서로 다른 분해로** 함께 설 수 있다:
     *   3m3m3m 4m5m6m 6m6m 7p7p7p 2s3s4s · 6m 화료
     *     단기  = 333m + 456m + 777p + 234s + 머리 66m   (40부)
     *     샹퐁  = 666m + 345m + 777p + 234s + 머리 33m   (30부)
     * 필터가 손 단위라 단기가 통째로 지워져 표준보다 싸게 지불됐다(2000 대 2700).
     * 표준 룰은 여러 해석 중 **가장 비싼 것**을 고른다.
     *
     * 원래 잡으려던 것(동수의 결속·양극이 스안커를 항상 스안커단기로 격상시키던 일)은
     * **한 분해 안에서** 커쯔가 머리로 재해석되는 경우이므로 이 좁은 조건으로도
     * 그대로 잡힌다 — 그 손은 pair도 화료패, 같은 분해의 커쯔도 화료패를 품는다.
     */
    const localVariants: { v: ScoringVariant; winKey: string }[] = [];
    const localShanponKeys = new Set<string>();
    const localPush = (winKey: string, v: ScoringVariant): void => {
      localVariants.push({ v, winKey });
    };

    for (const winTile of winTiles) {
      const winKey = kindKey(winTile);

      /*
       * 머리가 품는 kind는 **하나가 아닐 수 있다.** 혼색 머리(뒤섞인 아홉 개의
       * 연꽃의 2만+2통)는 `Decomposition.pair`에 대표 한쪽만 실린다 — 대표로만
       * 견주면 다른 쪽 무늬로 화료할 때 단기 변형이 0개가 되어, 대기에는 잡히는
       * 손이 「화료형 아님」으로 떨어졌다(A-5, 역만이 통째로 사라졌다).
       */
      const pairKeys =
        decomp.pairKinds !== undefined
          ? new Set(decomp.pairKinds.map(kindKey))
          : decomp.pair !== null
            ? new Set([kindKey(decomp.pair)])
            : new Set<string>();

      for (const meldSets of meldCombos) {
        if (decomp.pair !== null && pairKeys.has(winKey)) {
          localPush(winKey, {
            form: "standard",
            pair: decomp.pair,
            handKinds,
            sets: [
              ...baseSets.map((s) => ({
                type: s.type,
                tiles: s.tiles,
                concealed: true,
                isKan: false,
              })),
              ...meldSets,
            ],
            waitType: "tanki",
            isClosed,
          });
        }

        baseSets.forEach((absorber, i) => {
          if (!absorber.tiles.some((t) => kindKey(t) === winKey)) return;
          const waitType: WaitType =
            absorber.type === "triplet" ? "shanpon" : classifyRunWait(absorber, winTile);
          if (waitType === "shanpon") localShanponKeys.add(winKey);
          localPush(winKey, {
            form: "standard",
            pair: decomp.pair,
            handKinds,
            sets: [
              ...baseSets.map((s, j) => ({
                type: s.type,
                tiles: s.tiles,
                // 론으로 완성된 커쯔는 명각 취급
                concealed: !(j === i && s.type === "triplet" && ctx.winType === "ron"),
                isKan: false,
              })),
              ...meldSets,
            ],
            waitType,
            isClosed,
          });
        });
      }
    }

    // 이 분해 안에서 샹퐁이 선 화료패의 단기 변형만 버린다.
    for (const { v, winKey } of localVariants) {
      if (v.waitType === "tanki" && localShanponKeys.has(winKey)) continue;
      variants.push(v);
    }
  }

  return variants;
}

/**
 * 몸통 하나가 **역 판정에 내놓는 패 종류**.
 *
 * 깡의 대표는 3장이라 **랭크가 섞인 깡**은 한 장이 빠진다(장사진 6-7-8-9만의 9만,
 * 동남서북 깡의 북). 대표에 없는 종류만 더한다 — 표준 깡(같은 패 넉 장)은 이미
 * 대표에 그 종류가 있으므로 아무것도 늘지 않는다(그래서 이 함수는 표준 채점을
 * 한 톨도 바꾸지 않는다).
 */
export function setKinds(s: ScoringSet): TileKind[] {
  if (s.kanTiles === undefined) return s.tiles;
  const seen = new Set(s.tiles.map(kindKey));
  const extra = s.kanTiles.filter((t) => !seen.has(kindKey(t)));
  return extra.length === 0 ? s.tiles : [...s.tiles, ...extra];
}

/** 변형의 모든 패 kind (부·역 판정용. 깡은 3장 대표, 도라 계산에는 쓰지 말 것) */
export function allKinds(variant: ScoringVariant): TileKind[] {
  if (variant.form === "chiitoitsu") {
    // 실제 손패가 있으면 그것을 쓴다(비대칭 치또이의 이종 쌍을 정확히 반영).
    // 없으면(구 경로) 종전대로 각 쌍을 동종 2장으로 펼친다.
    if (variant.handKinds !== undefined) return variant.handKinds;
    return (variant.pairs ?? []).flatMap((k) => [k, k]);
  }
  if (variant.form === "kokushi") {
    return variant.handKinds ?? [];
  }
  const tiles = variant.sets.flatMap(setKinds);
  return variant.pair !== null ? [...tiles, variant.pair, variant.pair] : tiles;
}
