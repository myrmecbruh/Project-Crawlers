# Project Crawlers

Read this first, every session. It is the only memory that survives.

**The permanent playable link — publish here every time, forever:**
https://claude.ai/code/artifact/4938012a-682f-46b7-8ca3-41ecef8219b6

---

## How to talk to the person you are working for

**They do not write code, and they do not speak the vocabulary.** Not just
"function" — *branch, commit, merge, repo, session, hook, build, dependency,
pull request, copy of the project* are all words they cannot check. A sentence
carrying one is a sentence they have to take on trust.

- Say what changed and what they will **see, hear, or be able to do**.
- Where the plumbing must be mentioned, name it by what it does: *the game is
  saved online*, *the work is now part of the saved game*, *the machine gets
  itself ready before I start*.
- If a word cannot be replaced, it did not need saying.

**Be brief.** A line per change. Leave out the reasoning, the measurements and
the options you rejected — those go in `CHANGELOG.md` and in code comments,
which is what they are for. Do not restate the request. **Do not explain a fix
that worked.** Flag only what will surprise them: a rule you had to break, a
cost you had to pay, something you could not do.

**When a decision is theirs, give options by their effect, never by their
implementation.** "Option A: they stop and fight; option B: they walk round and
it costs them time" — not two designs described in nouns.

**Never hand back a diff as the answer.**

**Every reply that changed the game ends with the playable link.** They cannot
run a build.

---

## The standing order of work

**MECHANICS FIRST. BALANCE LAST.** This outranks the instinct to get numbers
right on the way past.

> In the previous project, forty releases of balance figures had to be binned,
> because for all forty the swarm never once bit a wall — the cost of walking
> into a structure was set so high that going round was always cheaper. Every
> number had been measured in a game where a wall was a detour sign.

So: build the thing. Prove it **works** — that it is reachable in a real match,
that it does what it says, and that a **test** says so rather than a paragraph.
Leave the numbers roughly right, write them down, move to the next mechanic.
Tune the field once, later, when the kit is what it is going to be.

- Do not open a balance investigation to justify a piece that does not exist yet.
- Do not stop after every change to re-measure everything.
- What is deferred is **tuning**, not **measuring**. Measurement is still how
  you check a mechanic is real: is it reachable, did it ever fire, did anything
  use it.
- Exception: a number so wrong it hides the mechanic (never triggers, or ends
  every match at once) is not a balance problem. Move it enough to see the thing
  work, then stop.

---

## The non-negotiables

*Ten numbered rules about what this game **is**, each one written the moment a
decision has been re-litigated twice. One sentence of rule, one paragraph of the
mistake that caused it. Ask for these as the game takes shape — do not invent
them.*

*(Empty. Nothing has been re-litigated yet. Examples of the **form** only, from
the previous project — the content here will be entirely different:
"Elevation is information, never statistics." / "Nothing in the simulation may
move the camera." / "The board is the interface.")*

1. *(unwritten)*

---

## Commands

```
python3 build.py       # assemble the whole game into one playable file
node tests/run.mjs     # run the headless tests against that built file
```

**Run the build after every change, and the tests before every reply.** The
tests run against `dist/`, never against `src/` — the thing that ships is the
thing that gets tested.

The start-up script (`.claude/hooks/session-start.sh`) installs what a session
needs before work begins, so the first build never fails on a missing tool.

---

## Layout

```
build.py              one command, one playable file
src/shell.html        the page; build.py fills in {{STYLE}} and {{CODE}}
src/style.css         all of the page styling
src/js/*.js           the game, assembled in filename order
  00-version.js       the ONLY place a version is declared
  05-rand.js          seeded RNG — the simulation never touches Math.random
  10-state.js         geometry, placeholder numbers, a fresh match
  20-input.js         key / mouse / touch, all writing the same flags
  30-sim.js           one fixed simulation step
  40-render.js        builds a draw batch, and records what was consumed
  90-boot.js          canvas fitting and the fixed-timestep loop
  99-test.js          window.__test — the only way a test touches the game
tests/run.mjs         headless tests, driven through window.__test
dist/                 built output, never committed
docs/                 the balance sheet, once numbers matter (see below)
```

---

## The machinery, and why each piece exists

### One file, one command

`python3 build.py` inlines everything — code, styling, and eventually geometry,
audio and the balance data — into a single self-contained HTML file. No engine,
no framework, no package manager at runtime. This is why it can be published as
one artifact and played on a phone with no install.

It writes two files from the same source: `dist/crawlers-v<VERSION>.html` (the
standalone playable file) and `dist/artifact.html` (the same page as a fragment,
which is what gets published).

### The test harness, and tests that use it

`window.__test` exposes the game's own state and lets a test drive it: seed a
match, hold an input, step the simulation, read **what reached the renderer**.
Tests are Playwright scripts run headless against the built file.

> **A builder with no consumer looks exactly like working code.** In the previous
> project three overlays were computed perfectly, every frame, into caches that
> nothing read. No error, no cost — just three missing pictures, for three
> versions.

So `Render.draw()` records `consumed` — what actually reached the canvas — and
**tests assert against `consumed`, never against `Render.batch`.** Generalise it:
anything computed needs a test that something consumed it.

Tests are also how you argue. Say "7 shots fed against 4 starved on seed 777",
not "it feels slower".

**The harness reports its own self-check every run** (`__test.selfCheck()`), and
the runner refuses to trust a single game assertion until it passes. A broken
ruler is worse than no ruler.

### Version, changelog, one permanent link

- `VERSION` in `src/js/00-version.js` is the single source of truth. The build
  stamps it into the filename and shows it on screen; a test asserts the three
  agree.
- **Bump the version before building a change**, so the previous file survives as
  a baseline. `build.py` shouts if it is about to overwrite a build of the same
  version with different content.
- Every release gets a `CHANGELOG.md` entry, written as prose about what changed
  and **why**, including the mistake it fixed. The changelog is where the
  reasoning lives that the reply leaves out.
- Publish to the **same** artifact address every time, forever. It is recorded at
  the top of this file and of `CHANGELOG.md`. Publish `dist/artifact.html` to it;
  a session that did not publish it must pass that address explicitly, or it will
  create a second link and strand them on the old one.

### A spreadsheet that is the authority on balance — not yet

Not built. Add `docs/balance.xlsx` **the first time a number matters to more than
one thing**, and then:

1. **Change a balance number in the sheet, not in the code.** If the code default
   must move too, move both and say so.
2. The build reads the sheet, inlines it, and **prints every number the sheet
   moved**. A number that exists in only one of the two is the failure this
   arrangement prevents.
3. **Geometry is not balance.** Board dimensions and the like are read-only.

This gives them a dial they can turn without a conversation, which is the point.

---

## The lessons that each cost a version

1. **Measure the thing you care about, not the thing that is easy to measure.**
   A sound library measured loud and sounded puny; what separated heavy from puny
   was crest factor, attack time and band energy.
2. **A broken ruler is worse than no ruler.** A harness aliased everything above
   2.7 kHz into the low bands, and tuning against it made things worse.
   Harnesses report their own self-check every run.
3. **A builder with no consumer looks exactly like working code.** (Above.)
4. **A number without its seeds is not a number.** The same build scored a weapon
   5/5 on one set of five random maps and 0/5 on another. Every figure quoted
   anywhere carries its seeds, and comparing two builds means the same seeds.
5. **A/B against a file, and check what built it.** Three sessions went on a
   change that measured identically to "the version before it", because that file
   had been overwritten by a build of the change with the version not yet bumped.
6. **A stride is a name, never a literal.** An instance layout grew from 11
   numbers to 12, and the 11 was written out by hand in a dozen places. Anything
   that must agree with itself across a system gets a name.
7. **Authoring parts to *meet* is not authoring them to *touch*.** Twenty-two of
   twenty-four creature models were in separate pieces, because a neck resting
   exactly on a torso overlaps it by nothing. "Exactly adjacent" is a bug in
   anything that moves, renders, or is sampled.
8. **A missing asset is silence, never an error.** Nothing branches on whether a
   sound exists and nothing logs about it. This let the previous game ship and
   stay shippable for forty versions with no audio at all.

---

## What not to do

- **Do not build a tool that generates content they should be choosing.** A sound
  synthesiser was built and rejected; so was a library importer with twelve
  options per channel. The decision about what a thing should *be* is not made in
  the repository. Build the *player*, leave a named empty slot, let them drop the
  finished thing in.
- **Do not commit `dist/`.** A 2 MB build file committed on every change adds
  2 MB to the history forever.
- **Do not re-measure the whole field after every change.**
- **Do not explain a fix that worked.**
