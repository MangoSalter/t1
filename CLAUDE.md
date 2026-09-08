# Eu sei! — working notes for Claude

## Token economy (standing rule)
Before finishing a step — a plan, a save, a commit, a test run, a report —
check whether the same result can be reached with fewer tokens, and take the
cheaper route whenever quality does not drop. Concretely:

- Read what you need: `grep -n`, `sed -n 'A,Bp'`, `head`. Full-file reads only
  when you are about to rewrite the file.
- Test logs: pipe through `grep`/`tail`, never dump a whole run.
- Run the narrowest test set that can catch the change
  (`node tests/run.mjs mapa`), and the full suite only before publishing.
- Commit messages: one clear line plus a short body. No changelogs.
- Answers to the user: the conclusion first, no recap of what was just done,
  no option surveys, no re-deriving decisions already made.
- Never re-read a file you just wrote to confirm it was written.

Cheaper is only better when the result is the same. Do not skip a test, a
measurement, or a check the change actually needs — that is not saving, it is
guessing.

## Don't stop while there is work left (standing rule)
If the session goes quiet but the task list still has open items, keep going —
take the next one, finish it, test it, publish it. Silence is not a stop
signal. Only actually stop when every remaining task needs a decision that is
the owner's to make, and even then say which decision and carry on with
anything that doesn't depend on it.

## Language
Chat replies in English. Everything inside the product — code comments, UI
strings, commit messages, docs — stays in Portuguese, except where the i18n
module carries PT/EN/ES.

## Branch and deploy
Work on `claude/new-session-msphz6`. Publishing:

```
git push -u origin claude/new-session-msphz6
git fetch origin main && git merge-base --is-ancestor origin/main claude/new-session-msphz6 \
  && git push origin claude/new-session-msphz6:main
```

## Module boundaries
Pure logic must be importable in Node without a browser. A module that touches
`document` at load time cannot be imported by a pure test. Hence the splits:
`data.js` (no DOM), `room.js` (network), `board.js` / `board-room.js`,
`mapa.js` (engine) / `mapa-ecra.js` (screen).

## The stub must not lie
`tests/stub/firebase-init.js` stands in for Firebase. Every divergence found so
far caused a real bug to pass the tests. When you touch identity or writes,
extend `tests/cases/test-stub-fidelity.mjs`, and prefer importing the real
module in the stub over mirroring it.

## Tests
`node tests/run.mjs [filter]` — runs 4 cases in parallel (`--jobs N` to change;
`--jobs 1` to debug). Each worker gets its own port pair from 8936 up and its
own copy of the cases, because the stub shares state through localStorage,
which is per-origin: two cases on one port would silently see each other's
rooms. The full suite is 85 cases and takes **13m36s at 4 jobs** (measured,
not estimated — it said ~11 minutes for a while and had quietly grown past
it). The serial figure in here used to say ~25 minutes; I have not re-measured
it, so treat it as folklore. If you need a number, measure it.

## Counting tests per game: do not grep, and do not trust a tool either
I got this wrong three times in one session, always the same way — matching by
FILE NAME. `car` matched `cards`; `board` matched `leaderboard`; and the old
room map looked untested because no file is named after it (it is
`mp-bonus-queue-test.mjs` that plays it, thoroughly). A name grep always
returns a plausible number and never says what it over- or under-caught.

I then tried to fix this with a tool that attributes tests by CONTENT, and
threw it away: `solo-bug-test.mjs` names its game nowhere — it goes in through
`solo-letterpick`/`solo-round`, like several others. So markers can't do it
either, and a tool that is 70% over (it said 24 whiteboard cases where the true
answer is 14) is worse than no tool, because it looks authoritative.

There is no shortcut here. If a number of tests per game matters, open the
files. If it does not matter, do not put a number in the document.

## A guard is not a guard until you have watched it fail
Write the check, then BREAK what it guards and confirm it goes red. Two checks
of mine passed on deliberately broken input the same hour I wrote them:

- the whiteboard's "reveal card" check counted *shapes with area*, and called
  the Torre Eiffel blank (it is one compound path plus a zero-height ground
  line);
- its replacement counted pixels differing from the card's corner — but the
  corner is the frame, so the whole interior read as ink, and it passed with a
  monument drawn entirely outside the viewBox.

Only the third version — dark pixels inside the card, inset past the frame —
actually failed on a blank card. Nothing about the first two looked wrong.

The good news, checked by breaking each on purpose in September: the
load-bearing guards here are real. Seven, falsified one at a time:

| break this | and this goes red |
|---|---|
| kill points 15 -> 200 | `test-equilibrio` |
| board damper -> flat cap | `test-equilibrio` |
| stub mirrors identity instead of importing | `test-stub-fidelity` |
| workshop hiding switched off | `oficina-test` |
| first-letter rule out of `quaseIgual` | `test-mapa` |
| whiteboard opens without its welcome | `coesao-test` |
| map drawing made slow (185ms vs the 8ms ceiling) | `mapa-desempenho-test` |

So the suite is sound; the two that fooled me were checks I had written that
same hour, which is exactly when you already believe the thing works and the
check agreeing feels like confirmation. Spot-check others the same way rather
than trusting a green tick.

## New UI is not done until it has been measured on a phone
This is a party game: everyone joins from their own phone, so the phone is the
device, not the edge case. Two defects in one day came from checking new UI
only at desktop width, and both looked fine in a passing test:

- the "Onde Fica Isto?" reveal card covered the sentence naming the monument,
  because the sentence wraps to three lines at 390px and I had pinned both to
  the bottom at fixed distances;
- in Fuga da Infeção the ring saying which dot is *you* measured 0.85px,
  because the whole arena scales to 0.28 on a phone and the ring scaled with it.

So: open it in `devices["iPhone 13"]`, and measure — `getBoundingClientRect`
on the thing you added, and on whatever sits next to it. "The element exists"
and "the test is green" are not the same as "a person can see and hit it".
Touch targets are 44px; a check that visits one screen only proves that screen
(`a11y-test` had a touch-target step for months while the voting buttons sat
at 36px, because it only ever opened the marathon screen).

To sweep every screen cheaply, don't navigate to each one: open the page on a
phone context, then walk `[data-screen]` toggling `active` and measure every
visible `button, label` in each. It takes seconds and it found the hangman
board's tools at 40px — the mobile block raised the colours beside them to 44
and forgot the tools, while the comment above the desktop rule claimed both
were handled. Static markup is all this catches, so overlays and in-game HUDs
still need real navigation; but the sweep tells you where to go and look.

Measure BOTH sides. The map bar's mobile rule set `min-height: 44px` and left
the width to padding, so the globe button — which is only the 🌍 — came out
44 high and 38 wide, under a comment promising "os 44 px do costume". Two
rules in a row that covered half of what their comment claimed; assume the
next one does too until you have the number.

Measured and NOT a problem, so don't re-litigate: light vs dark OS theme
renders the same (every colour is explicit — total difference of 1 across the
whole lobby), and the arena games differ on purpose — Labirinto and Mini-Golfe
follow the player with a camera at scale 1, Fuga da Infeção fits the whole map
and shrinks the pieces, which is what the owner asked for.

Browser cases set `euSei_lingua=pt` before asserting on text, and open
`index.html?oficina=1` when they need a game that is hidden from the public
site (see `public/js/oficina.js`). Most cases open the plain URL — 48 of them —
but `oficina-test.mjs` is the only one that CHECKS THE HIDING: that the
workshop games are gone from the menus and unticked in the marathon. Without
it a broken hide passes the whole suite, because every other case either
doesn't look, or looks only at what it came for.

Note for whoever reads this next: `?oficina=1` writes to localStorage, so it
sticks for the rest of that browser context. A case that opens the workshop
early and later wants to see the site as a visitor has to clear
`euSei_oficina` by hand — navigating to the plain URL is not enough. That
caught me once: a check counted twelve mini-games where a visitor sees four,
and passed while measuring the wrong thing.
