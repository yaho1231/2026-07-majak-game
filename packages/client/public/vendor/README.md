# 벤더 번들 — fx-bakeoff 전용 (게임 번들에는 안 들어간다)

`fx-bakeoff.html`(라이브러리 비교 실험, docs/38 §10-7 0단계)에서만 쓴다.
게임 클라이언트(`src/`)는 이 파일들을 import 하지 않는다 — 정적 파일이라
Vite 번들과 무관하다.

## 어떻게 만들었나

```bash
npm install gsap animejs            # 측정 시점: gsap 3.15.0 · animejs 4.5.0
# gsap.esm.js
esbuild gsap-src.js  --bundle --minify --format=esm --target=es2020 --outfile=gsap.esm.js
# anime.esm.js
esbuild anime-src.js --bundle --minify --format=esm --target=es2020 --outfile=anime.esm.js
```

`gsap-src.js` = gsap + Flip · Draggable · Inertia · MotionPath · CustomEase ·
CustomWiggle · CustomBounce · Physics2D 를 `registerPlugin` 까지 마친 뒤 재수출.
`anime-src.js` = animejs 루트에서 쓰는 것만 재수출.

**실험이 끝나면 지운다.** 도입을 결정하면 npm 의존성으로 제대로 들어가야 한다.
