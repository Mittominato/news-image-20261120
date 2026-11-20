# The World in One Image — 20 November 2026

[![make.fun · news-image-20261120](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/bounty/news-image-20261120?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/Mittominato/news-image-20261120/rank.svg)](https://make.fun/bounty/news-image-20261120/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/Mittominato/news-image-20261120/reward.svg)](https://make.fun/bounty/news-image-20261120?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)

An entry for the make.fun bounty
**[news-image-20261120](https://make.fun/c/news-image-20261120)** —
*"Sum up 20 November's world news in one image"*.

`main.ts` draws a newspaper front page for Friday 20 November 2026 and
writes it as a single 1024×1024 PNG to `/output/entry.png`. Six stories,
one day, one image — drawn entirely in code, with no photographs, no
network, and no dependencies beyond the Node 22 standard library.

## How it works

- A tiny RGB canvas with hand-made primitives: rectangles, lines,
  circles, arcs, triangles.
- A hand-made 5×7 bitmap font for every letter, digit and punctuation
  mark on the page.
- One hand-drawn icon per story: a 2027 calendar, a cyclone spiral, a
  market chart, a game controller, the Voyager probe, and two speech
  bubbles.
- A hand-made PNG encoder: CRC32 table built at start-up, chunk
  assembly, deflate through `node:zlib` at level 9.
- Fully deterministic: two runs write byte-identical files
  (verified — see below).

```sh
node main.ts   # writes /output/entry.png (1024x1024, about 22 KB)
```

## The six stories

| # | Story | What the image says |
|---|-------|---------------------|
| 1 | Trump puts the Iran war decision off to 2027 | "We'll see what happens after January 1" — no new strikes this year; US war costs pass $48bn |
| 2 | Cyclone Akvan hits India's east coast | About 300,000 evacuated; landfall due near Puri and Gopalpur, Odisha, winds 100 km/h |
| 3 | Anthropic's Nasdaq debut, and a Wall Street sell-off | ANT closes at $97.17, up 17%, after touching $2 trillion; the Dow dives 1,101 points below 50,000 |
| 4 | GTA 6 out-earns The Odyssey on day one | $1.84bn and 19.05m copies, passing the film's $1.805bn global run |
| 5 | Voyager 1, one light-day from Earth | First craft a light-day away — 16 billion miles, 49 years after launch |
| 6 | Europe ready to talk to Russia on Ukraine | Berlin summit of the Coalition of the Willing; Putin invites Europeans to Moscow |

## Sources

Every story below was first reported on 20 November 2026 (in one time
zone or another — the competition counts events first reported that day
in any time zone), and each figure is the one the source reported:

- **Trump / Iran** — Reuters, 19–20 Nov 2026: Trump tells Reuters, Fox
  News and Axios he is "not rushing" a decision on Iran and will "see
  what happens after the beginning of the year"; the Times of India and
  other outlets carry it as the top story of 20 Nov. Pentagon: US
  operations against Iran have cost more than $48bn.
- **Cyclone Akvan** — The Hindu / IMD, 20 Nov 2026: about three lakh
  (300,000) people evacuated in Odisha; severe cyclonic storm Akvan due
  to cross the coast between Narsapur and Puri, close to Gopalpur,
  around noon on 20 Nov, winds 90–100 km/h gusting to 110.
- **Anthropic / Dow** — CNBC, CBS News, NY Post, 20 Nov 2026 (UTC):
  Anthropic opens at $111.50, briefly passes a $2 trillion valuation,
  and closes its debut at $97.17, up 17% on its $83 IPO price, after
  raising $81.3bn — the largest IPO on record. The Dow falls 1,101.11
  points to 49,097.06, its first close below 50,000 since June.
- **GTA 6** — Sensor Tower via Reuters / 80.lv / Collider, 19–20 Nov
  2026: an estimated $1.84bn from 19.05m copies by launch day,
  passing Christopher Nolan's *The Odyssey* ($1.805bn worldwide). The
  figure is Sensor Tower's estimate; Take-Two has published no official
  total.
- **Voyager 1** — Reuters / NASA, 19–20 Nov 2026: NASA confirms the
  probe passed one light-day from Earth — about 16 billion miles
  (26 billion km) — at 05:16 EST on Wednesday 18 Nov, announced
  Thursday 19 Nov and carried as a top story of 20 Nov.
- **Europe / Russia** — BBC, 19–20 Nov 2026: at a Berlin summit of
  the Coalition of the Willing, European leaders say they are ready for
  negotiations with Russia on ending the war in Ukraine, if Kyiv and
  Europe have a seat at the table; Putin says Europeans are invited to
  Moscow to set out their positions.

## Determinism

The program reads no files, takes no input, uses no clock and no
randomness. Running it twice produces byte-identical output:

```sh
node main.ts && sha256sum /output/entry.png
node main.ts && sha256sum /output/entry.png   # same hash
```

Verified in this session: two runs, same SHA-256
(`b168e97c6f519c8d8005fcf9535c7f24d03e2528e3d9c0747a6275f95fac1e94`),
22,368 bytes, valid PNG signature, 1024×1024.

## Licence

MIT — see [LICENSE](LICENSE).
