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
rooms. The full suite is 91 cases and takes **14m09s at 4 jobs** (measured
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

A fourth, found in September by reading `board-room.js` for this shape: the
Forca's secret word. It lives only in the pen-holder's browser (never in the
room — with no server, anything stored there is readable by every player), and
`recoverSecretWord` already refused a word from an earlier match when reading
it back from `sessionStorage`: same room code, same mask shape, revealed
letters matching. **That exam was never applied to the live variable.** Leave a
room mid-word through the lobby — no F5, which is what cleared it by accident
— and the next room's board greeted you as if you knew its word: no prompt to
retype it, "Palavra: banana" on screen, and every guess in the new room judged
against the old word. Both paths share `palavraDestaFolha` now, and
`mp-board-reload` step 7 walks Carla out of one room and into another to watch
it. Falsified by removing the call: "Palavra: banana", on a sheet that spells
something else.

Then I swept the rest of the module-level state for this shape and it is
clean, so **don't re-audit these**: `pagoNestaSala` keys itself by room code;
`hangmanJudging` is released in a `finally`; `paleta.js` nulls its callback in
`fechar()` and every close path (button, backdrop, Escape) goes through it;
`caos.js`'s `limparCaos` strips `.chaos-wobble` from every element rather than
only the one it remembered; `esquecerMapaDaSala` clears both `ligado` and
`ultimaManga`; and in `app.js` the ball-click flag resets per ball phase while
the render caches key off content, not position.

## Ranking by array index invents a result
`renderFinal` sorted players by score and gave the crown to index 0, `#2` to
index 1, and so on. Two people tied for first therefore read "👑" and "#2",
and what decided it was the order they had joined the room — something nobody
can see or argue with. The final screen is what is left of the evening.
`classificacaoFinal` (in `room.js`, so a pure test can reach it) gives tied
players the same place, competition style: two firsts, then third. The map's
live table had the same shape and now shares places too, though it is much
rarer there — it breaks ties three deep (countries, points, fewest errors)
before position can matter.

Falsified both ways: the pure check went red with `lugar = 1` for everyone,
and `mp-album` step 7 — which reads the crowns off the real screen — went red
with `primeiro: i === 0`. Worth having both: the pure one states the rule, the
browser one proves the screen uses it.

Then I grepped for the same shape elsewhere and found a third:
`renderOptionsLeaderboard`, the live standings behind the ⚙️ button, which is
where people look mid-game to see who is winning. Same fix, same guard
(`mp-options` step 9).

The part worth remembering: **the rule already existed in this codebase.**
`board-room.js`'s match table has handled ties correctly for ages, under a
comment that says it in one line — "Empate fica no mesmo lugar: dois primeiros
são dois primeiros." It just never reached the two screens where it mattered
most. When you fix something like this, grep for the pattern before assuming
the instance you found is the only one; and when you get it right somewhere,
that corner is worth copying rather than re-deriving.

## Two lines apart, two different rules
`renderLobby` gates the mini-game buttons on `connectedCount` — players whose
`connected` flag is true — and tells you why when one is blocked. Two lines
above, the button that starts the CLASSIC match, which is the main game,
gated on `players.length`: everyone the room document has ever seen. So one
person closing their phone left the host able to start a full match with a
single live player and a ghost sitting in the standings. Same file, same
function, adjacent lines, opposite rules — the correct one was already there
to copy.

That is the third time this shape has turned up (after the tie ranking and the
Forca's word). The lesson keeps being the same: when you find a rule that is
right somewhere, check the neighbours before assuming it is applied
everywhere.

So I grepped every place that counts or picks from `room.players`, and found
a fourth — the worst of them. `startTagTeam` chose the first infected player
by shuffling ALL players, disconnected included. A dot that does not move
never catches anyone: if patient zero had closed their phone, the whole round
ran its timer with no infection at all and everybody survived. Not a scoring
quirk — the game simply did not happen. And the rule was already written
twice elsewhere: the drawing game filters connected for its turn order, and
`pickRandomPenHolder` filters for exactly this reason ("a um jogador que já
saiu deixava o quadro trancado"). It is `primeiroInfetado` now, a pure
exported function so `test-arenas` can state the rule; it falls back to all
players when nobody is connected, because returning nobody is the same broken
round by another route.

The same hole exists MID-round, and fixing only the start would have been
half a fix: if the infected player closes their phone before catching anyone,
nobody can catch anybody and the round runs its timer with nothing happening.
The host loop already computed `connectedIds` right there to decide when
everyone is infected, so `reatribuirInfecao` slots in beside it — it hands
the infection to a connected player when no connected player has it. It does
nothing when only one player is left connected: infecting the last person
standing would take the round off them for being alone, with nobody to run
from. `precisaDeNovoInfetado` is the pure half, and `test-arenas` states all
four cases.

The rest of the sweep came back clean or owner-blocked: `startBattleTeam`
shuffles only to hand out spawn points (no role to miss), and everything else
that iterates all players is either scoring — which lands squarely in the
survival-scoring decision that is the owner's — or harmless.

## Measuring with your own comparison instead of the real one
The game claims PT/EN/ES, so I checked what the map does with Spanish. My
first pass compared strings by hand and reported **11 of 18 country names
missing** — Grécia/Grecia, Itália/Italia, Suécia/Suecia and so on. Every one
of those was wrong. `limpar` strips accents before matching, so those pairs
are the SAME WORD, and the `alt` lists cover the genuinely different ones
(Alemania, Francia, Suiza). Measured again through the real `limpar` and
`quaseIgual`: **37 of 37**, and the one apparent miss was my own bad test
input ("Nueva Guinea" instead of "Papua Nueva Guinea").

The capitals were the real gap: **10 of 64** did not resolve, all the same
shape — an article in front (`El Cairo`, `La Habana`, `Puerto España`,
`Ciudad de México`) or a genuinely different word (`Tiflis`, `Yakarta`,
`Jartum`, `Dacca`). `quaseIgual` insists the FIRST LETTER matches, and
rightly so, so "El Cairo" could never reach "Cairo" by similarity — it had to
be in the list. They are in `cap.alt` now, guarded by `test-mapa` step 24,
falsified by removing one.

The lesson is the one this file keeps relearning from the other direction:
when you measure a rule, measure it with the code that implements the rule.
A hand-rolled comparison invented a crisis and hid a real (smaller) defect
behind it.

## A test that reaches its subject by chance fails by chance
`solo-monkey-test` played classic rounds until the random bonus draw happened
to land on Cada Macaco, with a ceiling of sixteen tries. One full run in this
session went red with nothing broken: sixteen draws, no monkey. A test that
fails a few times in a hundred teaches people to ignore red, which is the
worst thing a test can do.

The menu has a button per mini-game (`#solo-play-monkey-btn`), and the
sibling case `solo-monkey-lifesaver-test` was already using it — the right
approach, again, one file away. Entering by the door made the case
deterministic and cut it from 28s to 21s. One assertion had to go with the
dice: "and then it goes back to the letter pick" is the MARATHON's behaviour,
not the monkey's, and every solo case that plays a bonus already exercises it
through `backToLetterpick`.

Three other cases still roll dice, with the ceilings measured: `solo-bug`
(40 tries), `solo-wordflash` (30), `solo-memory` (20). Their margins are far
wider than monkey's sixteen, so they are left alone — and `solo-full-regression`
rolls on purpose, since exercising the draw across every game IS its subject.
If one of them ever goes red with nothing broken, this is the fix, and
`solo-memory` would gain from it twice: entering at round 1 lets it assert
exactly 5 cards instead of the 5-to-8 range it had to accept because the draw
decided which round the game landed in.

## A check after the file's failure summary is not a check
`test-mapa-sala.mjs` ends with
`if (falhas > 0) { ...; process.exit(1); }`. I appended a new block AFTER that
line, and it ran, printed, counted its failures — and the process had already
decided its exit code, so the case passed with the old broken palette in
place. Found only by falsifying. When you add to a pure case, put the new
block BEFORE the summary line, or move the summary to the end (which is what
I did here).

It caught me a second time, mildly, in `test-scoring`: I appended the ties
block after `console.log("Todos os testes passaram")`. That line only prints
— it does not exit — so the checks could still fail the case, but the summary
was printed before them and said everything had passed. Moved to the end.

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
I wrote it. It is `a11y-varrimento-test` step 2 now, and the run that put it there found
the category checkboxes at 40px on three screens — the lobby included, where
a mis-tap changes what the whole room is about to play. The CSS said 40 was
"the compromise between hitting it and not scrolling for ever"; the grid has
had `max-height: 240px` all along, so it already scrolled, and the compromise
was paying for nothing.

Step 1 of the same case covers the sixteen overlays, which no sweep could ever
have reached: they sit OUTSIDE `[data-screen]`, and they are born `hidden`, so
a sweep that skips what it cannot see skips all of them. Open each one by hand
(`classList.remove("hidden")`), measure, put it back. Fifteen of the sixteen
carry controls at load; only the Forca's colours are built when it opens, and
the step prints which came back empty so an overlay that measures nothing is
visible instead of silently green. What it found: the seven colours you draw
your own avatar with, at 26px, with no phone rule anywhere — the very first
screen, before anyone joins a room.

The four sweeps live in `a11y-varrimento-test`, not in `a11y-test`. They were
one file until the set crossed the **five minutes the runner allows a single
case** and got SIGKILLed halfway — and a killed case prints nothing useful,
so the symptom was a silent failure with no error text. That cliff is visible
now: the runner prints each case's duration, says `MORTO ao fim de Ns` instead
of a bare `FALHOU` when it was the ceiling that killed it, and ends the run by
listing anything past 60% of the limit. The threshold is 60% and not 70%
because measured, the longest case is `a11y-test` at **191s** — at 70% (210s)
the warning would not name the one file that has actually died. Everything
else is under 111s. They split cleanly:
`a11y-test` keeps focus, reduced motion and contrast; the sweeps measure size
and name, screen by screen and overlay by overlay. Two cases also finish
sooner than one, because the runner parallelises by case.

The last of those sweeps measures the "a carregar..." label itself, which is
UI I added and therefore UI that had never been measured. It holds the
`solo.js` request open with `page.route` for a second and a half and reads the
button mid-flight: **342x50 on an iPhone 13**, before and during, so the label
swap never shrinks the target under the thumb. It also checks the old label
comes back.

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

The sweeps measure text inputs too, since September — `input` (minus hidden,
checkbox and radio) and `textarea` alongside the buttons. Two results. Every
input is already **at or above 44px**, so nothing to fix there; but seven were
relying on their `placeholder` for a name: the player's name, the room code,
the Forca solo's letter and whole-word boxes, Palavra Relâmpago's word box,
and the map's two answer boxes. A placeholder is a browser's last-resort name
— so strictly they were not mute — but it VANISHES the moment you type, and
someone using a screen reader who comes back to a half-filled field then hears
nothing. They carry `aria-label` now, and the check deliberately does not
accept a placeholder as a name.

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
iPhone 13; and the classic game's four dynamic screens — the letter vote, the
answer sheet, "porquê estes pontos" and the end of the match — which
`a11y-varrimento-test` step 3 drives on a phone through the stub, because step 2 only ever sees
what is written in `index.html` and every button on those four is built in
JavaScript.

## First load has a budget now, not a note
The old note here said 868 KB across 23 files. Measured again in September:
**913 KB across 23 files** — it had grown 45 KB while the number in this
document stayed still, which is what a measurement does when nothing guards it.
`carga-inicial-test` is that guard: it counts BYTES and FILES, never seconds
(this container's seconds are not a phone's, and four jobs in parallel make
them noise), with ceilings at 1100 KB and 32 files — the point where something
changed by an order of magnitude, not a target to chase. Falsified by making
`app.js` fetch `paises.json` at the top: 1104 KB, red.

What the guard showed on its first run: `paises.json` (191 KB) was deferred
until the map opens, but the map's three JS modules travelled in everyone's
first load anyway — `app.js` imported `mapa-sala.js`, and `index.html` loaded
`mapa-ecra.js` as a module script, and each drags `mapa.js` behind it. So the
whole of Conquistar o Mapa now arrives only when someone opens it:
**913 KB / 23 files down to 847 KB / 20**, and the test asserts the invariant
in both directions — no file matching `mapa` at first load, and those same
files present after the map opens. Falsified by putting one static import back:
918 KB with `mapa-sala.js, mapa-ecra.js, mapa.js` named in the failure.

The solo whiteboard went the same way in the same session — 43 KB, one leaf
module nobody imports, entered only by `[data-open-board]` — so the load is
**804 KB across 19 files**. It needed one new export (`abrirQuadro`, which is
what the old inline listener did) because the loader has to open the screen
itself for the click that triggered the import.

Then `solo.js`, the big one at 143 KB, which brings the first load to
**661 KB across 18 files** — 28% below where this started. Both obstacles
written up the night before turned out to be real and both were tractable:

- It painted the home screen at load, so deferring it blindly would blank the
  daily challenge's status and streak — the one thing on that screen designed
  to bring someone back tomorrow. `desafio.js` now holds `lerDesafio`,
  `guardarDesafio`, `diaAnterior` and the status text; `app.js` imports it and
  paints the home screen immediately, `solo.js` imports the same functions for
  the solo menu. One sentence, written once, so the two can never disagree.
- Five cases went red (`solo-catpicker`, `solo-chaos`, `solo-voice`, and then
  `board-test` and `sfx-test`, which only the full suite caught), and none was
  a real defect: entering solo mode is now ASYNCHRONOUS, and each of them
  clicked the entry button and read the DOM in the same breath.
  `page.evaluate` and `locator.textContent` do not auto-wait the way `click`
  does, so they read the unpainted HTML. `entrarNoSolo` in `test-helpers.mjs`
  clicks and waits for the screen. Nothing a person can see is affected: every
  element involved lives inside a solo screen, and those only become visible
  after the module lands.

  Two process notes from that hunt. A narrow run is not proof: `node
  tests/run.mjs solo` was green while `board-test` and `sfx-test` were broken,
  because neither has "solo" in its name and both enter the solo menu. And
  when a "fix" does not take, check that it was applied — my `entrarNoSolo`
  import matched `import { chromium } from "playwright"` exactly, so it
  silently skipped `board-test`, which imports `{ chromium, devices }`. The
  test then failed with `entrarNoSolo is not defined`, which I could not see
  because the runner printed only the last 40 lines of a run whose Playwright
  stack trace is longer than that. It prints 120 now.

All four doors now share ONE loader at the bottom of `index.html` instead of a
copy each. Three things it has to get right, all learned the hard way:

- each door opens what the click asked for (`__mapa.abrirMapa()`,
  `abrirQuadro()`, `abrirMenuSolo()`, `abrirDesafioDoDia()`), because in that
  first instant the module's own listeners do not exist yet; afterwards a
  `Set` of loaded modules makes the loader stand down. Without it the second
  `[data-open-mapa]` button would import again and open twice;
- the button says "a carregar..." while the module travels. On a slow phone
  143 KB is seconds, and a button that neither acts nor speaks reads as
  broken. The old label goes back BEFORE `abrir(m)` runs, never after — the
  daily-challenge button repaints itself on load, and restoring afterwards
  would overwrite what the module just wrote;
- `onRoomUpdate`'s `case "mapa"` shows the screen first and renders when the
  module lands, reading `state.room` at THAT moment rather than the room it
  was called with: an update can arrive between the request and the response,
  and the one that counts is the last. `esquecerMapaDaSala` is only called if
  the module was ever loaded — there is nothing to forget otherwise.

A deferral has a blast radius bigger than the module: **anything that sends
someone to a screen the lazy module owns now sends them to a dead screen.**
Grepping for that found exactly one, and it was in the map: `sairDoMapa`
activated `solo-menu` unconditionally, so opening the map from the HOME
screen and pressing "← Voltar" landed you in a solo menu `solo.js` had never
painted. (It was already the wrong screen to land on before the deferral —
just harmless.) `abrirMapa` remembers where it was called from and
`sairDoMapa` goes back there; `mapa-ecra-test` step 18 walks both entry
buttons and checks the return. Worth re-running that grep after making
anything else lazy — `esconderAOficina` is called from `app.js`, so the
workshop stays hidden either way, which is the one thing that would have
been serious.

One editing note, since it cost a rebuild: `index.html`'s loaders were not
adjacent (the board one sat before `i18n-ecra.js`, the map one after), so a
slice from "first loader" to "last loader" spans the wrong region and
duplicates the tail. Check `grep -n "<script"` after any surgery down there.

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
