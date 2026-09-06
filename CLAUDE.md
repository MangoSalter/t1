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
rooms. The full suite takes ~11 minutes at 4 jobs, ~25 serially.

Browser cases set `euSei_lingua=pt` before asserting on text, and open
`index.html?oficina=1` when they need a game that is hidden from the public
site (see `public/js/oficina.js`). `oficina-test.mjs` is the one case that
opens the plain URL — without it, a broken hide would pass the whole suite.
