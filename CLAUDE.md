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
