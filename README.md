[![make.fun · news-image-20261127](https://make.fun/badge/news-image-20261127.svg)](https://make.fun/bounty/news-image-20261127?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261127)
[![rank](https://make.fun/badge/news-image-20261127/ardimakefun/news-image-20261127/rank.svg)](https://make.fun/bounty/news-image-20261127/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261127)
[![reward](https://make.fun/badge/news-image-20261127/ardimakefun/news-image-20261127/reward.svg)](https://make.fun/bounty/news-image-20261127?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261127)

# The World in One Day — Friday 27 November 2026

A one-image world newspaper for the [news-image-20261127](https://make.fun/bounty/news-image-20261127) bounty on make.fun: "Sum up 27 November's world news in one image".

## What it is

A procedurally rendered 1024×1024 PNG front page covering **13 stories**
from the news cycle leading the front pages on **Friday 27 November 2026**:

- **Leads:** Iran drone strike kills 2 Italians in Kuwait · Thanksgiving storm blacks out 800,000+ · 6 killed in a strike on a Gaza school shelter
- **Secondary:** Russia hits 2 grain ships off Odesa · UK net migration falls to 77,000 · 9 hurt in Bangkok refinery blast · Guinea-Bissau vote delayed to 2028
- **Also today:** NZ awaits its final election result · Spain's campaign ends before Sunday's vote · SpaceX cleared for 1 million satellites
- **Ticker:** Driver held over the Cairo fire that killed 31 · Myanmar rejects ICJ genocide orders · $40 HIV jab reaches Africa

The page also carries a region strip (Middle East 2 · North America 2 · Europe 3 · Asia 2 · Africa 3 · Oceania 1 = 13), a six-number strip (2 · 800,000+ · 77,000 · 9 · 1,000,000 · 31), a "The Day in UTC" timeline (25 Nov 16:30 → 27 Nov 23:00), a world map with 13 numbered pins, a field breakdown (politics 4 · conflict 3 · disaster 2 · law 2 · technology 1 · health 1 = 13), and an honest date-check footer.

## Date honesty

The research was done at 05:40 WIB on 27 Nov 2026, when the 27 Nov UTC day had barely begun, so most stories are the events leading the 27 Nov morning news cycle. **Every story carries its true event date beside it** — only stories 3, 8 and 9 fall wholly on 27 Nov; story 2 spans 26–27 Nov; the rest are 25–26 Nov. The footer says so plainly instead of claiming everything happened on 27 November.

## How it is built

`main.ts` (TypeScript, Node 22, standard library only) draws everything itself: its own PNG encoder (raw scanlines + `node:zlib` deflate + a hand-written CRC32 table), its own 5×7 bitmap font (stored as 5-bit row masks, fractional scales supported), a procedural RGB canvas, geometric lead scenes, and a world map from hand-defined continent polygons. No network, no clock, no unseeded randomness — the output is fully deterministic (two runs produce identical sha256).

Run it:

```
MAKEFUN_OUTPUT_DIR=/output node main.ts
```

## Sources

Reuters, AP, BBC, CNN, ONS, FCC, NZ Electoral Commission, Oman News Agency, Global Fund. Verification levels are shown beside each story (CONFIRMED / OFFICIAL / REPORTED). All facts come from `research.md` in the work directory. Cautions honoured from the research: the Gaza school story is REPORTED (single wire, weapon not stated as certain); the Odesa grain ships are REPORTED with no added damage or casualty claims; the NZ result is preliminary only (67/131, no winner printed); Bangkok uses 9 injured (updated figure, not the early 7); Cairo uses the 31 dead only; the SpaceX figure is an authorisation, not satellites in orbit.

## License

MIT — see `LICENSE`.
