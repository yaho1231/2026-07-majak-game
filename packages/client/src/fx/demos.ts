/**
 * 점검 페이지에 뜨는 연출 목록.
 *
 * **연출을 만들면 반드시 여기에 등록한다.** 등록하지 않으면 점검 페이지에 안 뜨고,
 * 안 뜨면 아무도 확인하지 않는다.
 *
 * 각 항목의 `when`(언제 나오는가)과 `freq`(빈도)는 장식이 아니다 — 연출 예산이 그것으로
 * 정해진다. 매 순 보이는 것에 0.5초를 쓰면 지연이고, 판에 한 번 보이는 것에 0.1초만 쓰면
 * 사건이 사건처럼 안 보인다.
 */
import type { FxDemo } from "./catalog";
import { shakeBoard, flashBoard, ringAt, attention } from "./effects/board";
import { drawTile, discardTile, meldTiles, reflowHand, throwTile } from "./effects/tiles";
import { centerOf, canDecorate } from "./core";
import { gsap } from "./setup";
import { DUR, EASE } from "./motion";
import { playCutIn, playBanner, playRiichiStage } from "./effects/production";
import { flushSync } from "react-dom";

export const DEMOS: FxDemo[] = [
  // ─────────────────────────── 손패 ───────────────────────────
  {
    id: "tile-draw",
    group: "손패",
    name: "쯔모 — 패산에서 들어온다",
    when: "내 차례가 되어 패를 한 장 가져올 때",
    freq: "매순",
    intent:
      "지금은 패가 그냥 나타난다. 패산에서 왔다는 것이 보이면 '어디서 온 패인가'를 매번 확인하지 않아도 된다. 매 순 일어나므로 0.26초를 넘기지 않는다.",
    play: (s) => {
      const last = s.tiles().at(-1) ?? null;
      drawTile(last, s.wall);
    },
  },
  {
    id: "tile-discard",
    group: "손패",
    name: "타패 — 바닥에 놓인다",
    when: "패를 버릴 때마다",
    freq: "매순",
    intent:
      "손에서 바닥으로 가는 경로가 보이고, 닿는 순간 살짝 눌렸다 펴진다. 물체가 안 튀면 무게가 없어 보인다 — 다만 UI가 아니라 패에만 준다.",
    play: (s) => {
      const t = s.tiles().at(-1) ?? null;
      discardTile(t, s.discard);
    },
  },
  {
    id: "hand-sort",
    group: "손패",
    name: "정렬 — 열세 장이 제자리로",
    when: "자동정렬을 켜거나 손패를 직접 재배열할 때",
    freq: "가끔",
    intent:
      "지금은 순간이동한다. 마작에서 손패 순서는 곧 사고 과정이라, 어느 패가 어디로 갔는지 보이는 것이 곧 정보다. 총량 0.22초로 잡아 열세 장이어도 기다림이 안 생긴다.",
    play: (s) => {
      /*
       * `flushSync` 가 필수다 — `reflowHand` 는 mutate 가 **끝나면 DOM 이 이미 바뀌어
       * 있다**고 가정한다(FLIP 의 전제). React 의 setState 는 비동기라 그냥 부르면
       * 아직 안 바뀐 DOM 을 두고 Flip 을 걸어 아무 일도 안 일어난다.
       * 게임 쪽(`OwnArea`)은 렌더 단계에서 캡처하고 `useLayoutEffect` 에서 재생하는
       * 다른 방식을 쓰므로 이 문제가 없다.
       */
      reflowHand(s.hand, () => flushSync(() => s.shuffleHand()));
      s.log("손패를 섞었다 — 다시 누르면 정렬로 돌아간다");
    },
  },
  {
    id: "hand-sort-back",
    group: "손패",
    name: "정렬 — 되돌리기",
    when: "위와 같음 (정렬된 상태로 복귀)",
    freq: "가끔",
    intent: "같은 연출의 반대 방향. 두 방향이 같은 리듬인지 확인한다.",
    play: (s) => reflowHand(s.hand, () => flushSync(() => s.sortHand())),
  },
  {
    id: "tile-meld",
    group: "손패",
    name: "후로 — 멜드 자리로 간다",
    when: "폰·치·깡을 했을 때",
    freq: "가끔",
    intent:
      "지금은 손패에서 사라지고 오른쪽에 생긴다. 어느 패가 나갔는지 안 보이면 상대가 무엇을 울었는지 매번 손패를 다시 세어야 한다. 이건 장식이 아니라 정보다.",
    play: (s) => {
      const tiles = s.tiles().slice(0, 3);
      meldTiles(tiles, s.meldSlot);
    },
  },
  {
    id: "tile-throw",
    group: "손패",
    name: "패가 판을 가로질러 날아간다",
    when: "등가교환·통째로 바꾸기 등 자리를 옮기는 증강",
    freq: "희귀",
    intent:
      "긴 이동은 호를 그린다 — 직선이면 '미끄러졌다'로 보이고 호를 그리면 '던졌다'로 보인다. 짧은 이동에는 호를 주지 않는다(그냥 흔들린 것처럼 보인다).",
    play: (s) => {
      const t = s.tiles()[0] ?? null;
      const seat = s.seats[0] ?? null;
      throwTile(t, seat, {
        onComplete: () => {
          s.log("도착 — 실제 게임에서는 여기서 손패 상태가 바뀐다");
          /*
           * 점검 페이지에서는 **반드시 되돌린다.**
           *
           * 실제 게임이라면 도착과 동시에 그 패가 손패에서 빠지고 저쪽에 생긴다 —
           * 남아 있는 것이 맞다. 하지만 여기는 상태가 바뀌지 않으므로, 안 돌려놓으면
           * 패 한 장이 판 밖에 붙박이로 남아 **다음 연출을 점검할 수 없게 된다.**
           * (실제로 21종을 연속 재생했더니 그렇게 됐다.)
           */
          if (t === null) return;
          gsap.to(t, {
            x: 0,
            y: 0,
            duration: DUR.panel,
            ease: EASE.soft,
            delay: 0.35,
            clearProps: "transform",
          });
        },
      });
    },
  },


  // ─────────────────────── 연출 큐 (컷인 · 배너) ───────────────────────
  //
  // 게임의 `styles.css` 규칙을 **그대로** 쓴다. 점검 페이지가 흉내 낸 것을 보고
  // 판단하면 그 판단이 게임으로 옮겨가지 않는다.
  {
    id: "cutin-ron",
    group: "연출 큐",
    name: "컷인 — 론",
    when: "누군가 화료했을 때",
    freq: "드묾",
    intent:
      "국이 끝나는 사건. 밴드가 들어오고 글자가 꽂힌다. 연출 속도를 0.35×로 바꾸고 다시 눌러 보라 — 예전에는 여기서 밴드가 다 들어오기 전에 잘렸다.",
    play: (s) => {
      playCutIn(s.overlay, { tone: "ron", text: "론!", sub: "하가 — 12000점", ttl: 1500 }, canDecorate());
      shakeBoard(s.table, 3, { anticipate: true });
    },
  },
  {
    id: "cutin-tsumo",
    group: "연출 큐",
    name: "컷인 — 쯔모",
    when: "스스로 화료했을 때",
    freq: "드묾",
    intent: "론보다 한 단계 가볍다 — 쏘인 사람이 없으니 충격도 덜해야 한다.",
    play: (s) => {
      playCutIn(s.overlay, { tone: "tsumo", text: "쯔모!", sub: "나 — 7700점", ttl: 1400 }, canDecorate());
      shakeBoard(s.table, 2);
    },
  },
  {
    id: "cutin-yakuman",
    group: "연출 큐",
    name: "컷인 — 역만",
    when: "역만 화료 (판에 한 번 있을까)",
    freq: "희귀",
    intent:
      "예산을 몰아주는 자리. 광선·파문 두 겹·섬광이 붙고 흔들림도 최대다. 이게 매 국 나오면 통과의례가 되지만, 진짜로 드물기 때문에 세게 가도 된다.",
    play: (s) => {
      playCutIn(s.overlay, { tone: "yakuman", text: "국사무쌍", sub: "대면 — 32000점", ttl: 2600 }, canDecorate());
      shakeBoard(s.table, 4, { anticipate: true });
      flashBoard(s.table, { peak: 0.2 });
    },
  },
  {
    id: "cutin-augment",
    group: "연출 큐",
    name: "컷인 — 증강 발동",
    when: "증강이 발동할 때",
    freq: "가끔",
    intent:
      "대각 섬광과 스캔라인이 붙어 다른 컷인과 구분된다. 국마다 여러 번 나올 수 있어 론보다 짧게 잡는다.",
    play: (s) => {
      playCutIn(
        s.overlay,
        { tone: "augment", text: "투시", sub: "나 — 상대 손패를 본다", aug: true, ttl: 1600 },
        canDecorate(),
      );
      shakeBoard(s.table, 2);
    },
  },
  {
    id: "cutin-call",
    group: "연출 큐",
    name: "컷인 — 후로 (폰)",
    when: "폰·치·깡",
    freq: "가끔",
    intent:
      "가장 자주 나오는 컷인이라 가장 짧고 가볍다. **흔들림은 없다** — 한 국에 여러 번 일어나는 일이라 그때마다 판이 떨면 국이 도는 내내 화면이 흔들린다. 무엇이 일어났는지는 글자와 소리가 이미 전한다.",
    play: (s) => {
      playCutIn(s.overlay, { tone: "pon", text: "폰", sub: "상가", call: true, ttl: 1050 }, canDecorate());
    },
  },
  {
    id: "riichi-stage",
    group: "연출 큐",
    name: "리치 무대",
    when: "리치 선언",
    freq: "가끔",
    intent:
      "리치는 **알고 나서 버려야 하는** 유일한 통지라, 늦게 뜨면 그대로 오판이 된다(연출 큐가 등급을 두는 이유). 비네트로 판을 눌러 시선을 강제로 끌어온다.",
    play: (s) => {
      playRiichiStage(s.overlay, "하가", 1700);
      shakeBoard(s.table, 2);
    },
  },
  {
    id: "banner-draw",
    group: "연출 큐",
    name: "배너 — 유국",
    when: "국이 무승부로 끝날 때",
    freq: "드묾",
    intent: "컷인보다 판을 덜 가린다. 정산 화면이 바로 뒤에 오므로 여기서 길게 끌 이유가 없다.",
    play: (s) => {
      playBanner(s.overlay, "draw", "유 국", "텐파이 2명", 1300);
      shakeBoard(s.table, 4);
    },
  },
  // ─────────────────────────── 판 ───────────────────────────
  {
    id: "shake-1",
    group: "판",
    name: "흔들림 1 — 깡",
    when: "깡 (도라가 늘어 판이 실제로 바뀐다)",
    freq: "가끔",
    intent:
      "가장 약한 단계(실측 약 1px). 있는지 없는지 애매할 정도가 맞다. 폰·치에는 **아예 안 넣는다** — 너무 자주 일어난다.",
    play: (s) => shakeBoard(s.table, 1),
  },
  {
    id: "shake-2",
    group: "판",
    name: "흔들림 2 — 리치·증강 발동",
    when: "리치 선언, 증강 발동",
    freq: "가끔",
    intent: "판이 흔들렸다는 것이 인지되는 최소 단계(실측 약 2px).",
    play: (s) => shakeBoard(s.table, 2),
  },
  {
    id: "shake-3",
    group: "판",
    name: "흔들림 3 — 론",
    when: "화료(론)",
    freq: "드묾",
    intent: "국이 끝나는 사건(실측 약 4px). 앞의 두 단계와 구분되되, 판을 흔들어 어지럽게 하지는 않는다.",
    play: (s) => shakeBoard(s.table, 3),
  },
  {
    id: "shake-4",
    group: "판",
    name: "흔들림 4 — 역만",
    when: "역만",
    freq: "희귀",
    intent:
      "가장 센 단계인데도 실측 약 6px 이다. 예전에는 14px 였고 그게 **볼 때마다 어지러웠다**(2026-08-22 사용자 보고). 흔들림은 '무언가 일어났다'는 신호지 사건 자체가 아니다 — 사건은 컷인 글자와 소리가 전한다.",
    play: (s) => shakeBoard(s.table, 4),
  },
  {
    id: "shake-antic",
    group: "판",
    name: "흔들림 · 예고형 (뒤로 당겼다 터진다)",
    when: "론처럼 '맞았다'인 사건",
    freq: "희귀",
    intent:
      "지금의 CSS 키프레임으로는 만들 수 없는 결이다. 한 번 뒤로 당기는 동작이 붙으면 같은 세기여도 '터졌다'로 읽힌다. 흔한 사건에 쓰면 피로해지므로 아껴 쓴다.",
    play: (s) => shakeBoard(s.table, 3, { anticipate: true }),
  },
  {
    id: "flash",
    group: "판",
    name: "섬광",
    when: "화료·역만 컷인의 첫 프레임",
    freq: "드묾",
    intent:
      "불투명도 상한을 0.24로 낮게 잡았다 — 흰 화면을 덮는 것은 광과민 위험이 있다. 프로토타입에서는 0.9까지 갔는데 그건 실험실이라 가능했던 값이다.",
    play: (s) => flashBoard(s.table),
  },
  {
    id: "ring",
    group: "판",
    name: "파문 — 자리를 지목한다",
    when: "증강 발동 대상, 후로 대상 표시",
    freq: "가끔",
    intent:
      "컷인처럼 판을 덮지 않고 '어디서 일어났는지'만 가리킨다. 판을 계속 보면서 읽을 수 있어, 판단을 끊지 않는다.",
    play: (s) => {
      const seat = s.seats[2];
      if (seat === undefined) return;
      const c = centerOf(seat);
      const host = s.table.getBoundingClientRect();
      ringAt(s.table, c.x - host.left, c.y - host.top);
    },
  },
  {
    id: "attention",
    group: "판",
    name: "주목 — 한 번만 숨 쉰다",
    when: "내 차례가 되었을 때, 새 정보가 붙었을 때",
    freq: "매순",
    intent:
      "맥동을 반복하지 않는 것이 요점이다. 상시 반복하는 강조는 몇 순이면 배경이 되어 아무도 안 보고, 그때부터는 그냥 시끄러운 것이다.",
    play: (s) => attention(s.center),
  },
];
