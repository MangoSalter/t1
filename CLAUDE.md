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

## Nothing in tests/cases may name this machine
Two kinds of hard-coded path were in there, and both meant "this suite only
runs here":

- the 69 browser cases each passed `executablePath: "/opt/pw-browsers/chromium"`;
- two pure cases imported the app by absolute path (below).

Now the runner decides: it exports `EU_SEI_CHROMIUM` when that folder exists
and an empty string otherwise, and the cases pass
`process.env.EU_SEI_CHROMIUM || undefined` — which is the same as not asking,
so Playwright uses the browser it installed itself. Checked by pointing the
runner at a folder that does not exist and watching the cases go red on the
default lookup. When you add a case, copy the launch line from a neighbour.

The runner also served the copies with `python3 -m http.server`, so a
JavaScript project's suite needed Python to start at all. It is twenty lines
of `node:http` now — Node and `npm install` are the whole toolchain.

## A pure test with a hard-coded path tests the wrong files
`test-data.mjs` and `test-linguas.mjs` imported
`/home/user/.../public/js/data.js` by absolute path. That is not only
unportable — it PASSES on a second checkout while reading the first one. I
proved it: broke `CATEGORIES` in a copy of the repo, and the absolute-path
version still said "todos os testes passaram". The runner hands every pure
case `EU_SEI_PUBLIC`; use it (see `test-mapa.mjs`) and nothing else.

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
rooms. The full suite is 88 cases and takes **13m48s at 4 jobs** (measured
September, not estimated — it said ~11 minutes for a while and had quietly
grown past it, and the case count sat at 85 for three cases longer than that
was true). The serial figure in here used to say ~25 minutes; I have not
re-measured it, so treat it as folklore. If you need a number, measure it.

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

## State that lives outside the room needs an owner for its lifetime
Three bugs in two days, all the same shape: something I added kept its value
in a module variable, and nothing said when to throw it away.

- the album of drawings followed you out of a room and showed up in the next
  one, made by people who were not there;
- `solo.desafio` was only cleared when a round FINISHED, so any future exit
  mid-round would have written a classic round's score into today's daily;
- the map's "x2" marks survived Recomeçar, and the map module is shared, so a
  mark left by a room appeared in a solo game where that rule does not exist.

The room document takes care of itself — `resetForRematch` and `backToLobby`
wipe it, and `mp-options-test` step 8 compares those two lists against the
games that exist. Anything OUTSIDE it (module variables in `app.js`,
`solo.js`, the shared `mapa` object) has no such owner. When you add one, say
in the same commit where it gets cleared, and prefer one shared function over
a fourth hand-written list — that is how `limparTabuleiro` came to exist.

## A check after the file's failure summary is not a check
`test-mapa-sala.mjs` ends with
`if (falhas > 0) { ...; process.exit(1); }`. I appended a new block AFTER that
line, and it ran, printed, counted its failures — and the process had already
decided its exit code, so the case passed with the old broken palette in
place. Found only by falsifying. When you add to a pure case, put the new
block BEFORE the summary line, or move the summary to the end (which is what
I did here).

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
were handled. Static markup is all this catches, so in-game HUDs still need
real navigation; but the sweep tells you where to go and look.

That sweep lived in my hands and nowhere on disk, so it only ever ran the day
I wrote it. It is `a11y-test` step 13 now, and the run that put it there found
the category checkboxes at 40px on three screens — the lobby included, where
a mis-tap changes what the whole room is about to play. The CSS said 40 was
"the compromise between hitting it and not scrolling for ever"; the grid has
had `max-height: 240px` all along, so it already scrolled, and the compromise
was paying for nothing.

The same run's step 12 covers the sixteen overlays, which no sweep could ever
have reached: they sit OUTSIDE `[data-screen]`, and they are born `hidden`, so
a sweep that skips what it cannot see skips all of them. Open each one by hand
(`classList.remove("hidden")`), measure, put it back. Fifteen of the sixteen
carry controls at load; only the Forca's colours are built when it opens, and
the step prints which came back empty so an overlay that measures nothing is
visible instead of silently green. What it found: the seven colours you draw
your own avatar with, at 26px, with no phone rule anywhere — the very first
screen, before anyone joins a room.

## The accessible name is not the textContent
Both sweeps also check that a screen reader has something to announce, and the
first version of that check was wrong in a way that looked right: it asked
whether the element's text contained a letter. I tore the `aria-label` off the
language `<select>` to watch it fail, and it stayed green — a `<select>`
carries its options inside it, so its `textContent` is "Português English
Español" and every select on earth passes. What a reader actually announces is
the label: `aria-label`, `title`, or the wrapping `<label>` with the control's
own text removed. Under that rule the language selector is still named (its
`<label>` says "Língua", so my "break" was not a break), and stripping `title`
from the palette's 🎨 button — which really is emoji and nothing else — turns
it red.

So it is measured, not assumed: **every static control on all 41 screens and
all 16 overlays has a name**, and the avatar's seven colours were the only
ones that did not — pure colour buttons, no label, in the overlay nobody had
ever opened. They now announce "Amarelo-mostarda #e3a53d" and carry
`aria-pressed`.

Also: the avatar's colours had never been CLICKED by any test either — the
whole picker was markup nobody exercised. `avatar-preview-polish-test` step 5
picks one and reads the painted pixel back off the canvas. Don't assert on a
pixel COORDINATE there: the canvas is 224px wide with a 2px border, so a click
at 25% of the bounding box lands on pixel 3, not 4. Count pixels of the chosen
colour instead.

A comment claiming something is "the only one" is a to-do list, not a fact.
`.tag-player-me` carried a note saying it was *the only* ring that doesn't
shrink with the arena — and the shield and speed rings beside it sat at 4px
inside a world scaled to 0.282, so 1.1px on a phone, for months after that
note was written. Worse, `box-shadow` replaces rather than stacks, so picking
up a shield erased which dot was you. Both measured, both fixed, both now
guarded in `mp-tag-test` by building the dots at phone scale and reading the
computed thickness.

Measure BOTH sides. The map bar's mobile rule set `min-height: 44px` and left
the width to padding, so the globe button — which is only the 🌍 — came out
44 high and 38 wide, under a comment promising "os 44 px do costume". Two
rules in a row that covered half of what their comment claimed; assume the
next one does too until you have the number.

Only ONE of the arenas scales: Fuga da Infeção fits the whole map
(`scale(escala)`, 0.282 on a phone). Labirinto and Mini-Golfe translate a
camera at scale 1, and Estrada Maluca scales but has no fixed-px decoration
inside its road (its floor is 0.45 anyway). So the "fixed px inside a shrunk
world" family of bugs can only appear in the tag arena — checked, not assumed.

Also measured clean, so don't re-sweep: every room game's screen (Desenha e
Adivinha, Fuga da Infeção, Labirinto, Mini-Golfe, mapa em sala, marcos) on an
iPhone 13, and first load — 868 KB raw across 23 files in 4 import waves, with
`paises.json` (191 KB) correctly deferred until the map opens.

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
