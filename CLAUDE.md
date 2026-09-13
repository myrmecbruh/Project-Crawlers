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

## What the game is

A realtime isometric dungeon crawler, life sim, colony manager and idle game.
3D geometry rendered at low resolution so it reads as 2D sprite work. Grimdark
low fantasy. Spatially like Final Fantasy Tactics — elevation, ramps, cover, a
see-through fourth wall. Explored like Core Keeper: a small community that
branches slowly outward into an eternal labyrinth. Populated like The Sims
crossed with Dwarf Fortress — people come and go gradually.

**The player is a head coach, not a hand.** You make strategic suggestions.
The characters act on their own initiative.

---

## The non-negotiables

*Thirteen rules about what this game **is**. Each is one sentence of rule and a
paragraph of what it protects. Do not re-litigate these; do not quietly drift
away from them. Add to the list the moment something is argued twice.*

**1. Characters improve by failing forward. Succeeding teaches them NOTHING.**
Failure is the only teacher; failing narrowly teaches most of all. A crawler who
has mastered something stops improving entirely until the labyrinth gives them
something harder. The slowdown in rule 1 is therefore never a curve in the code:
it is what happens when someone stops failing. Any progression that speeds up
with mastery is wrong, and so is any system that punishes failure with nothing
but lost time.

**2. Every roll comes from a skill; every skill is one PAIR of the six natural
attributes; all fifteen pairs exist. Ask, never invent.** There is one framework for how characters and
creatures function, and a new feature is not finished until it is wired into that
framework. When a feature needs a new tag, skill, stat or system, **ask, with
suggestions, and wait.** Inventing a parallel system is the failure this rule
exists to prevent — two frameworks that half-agree are worse than one that is
inconvenient.

**3. Combat is about 20% of the game.** The other 80% is exploring, camping,
entertaining, cooking, farming, building, crafting, repairing, studying, hunting,
fishing, singing, lockpicking, mapmaking, trap disarming and everything like them.
A feature that only pays off in a fight is a feature in the wrong fifth of the
game. Non-combat work gets the same depth of skills, tools, failure states and
visible payoff as swinging a sword.

**4. If it exists on a character, it is visible on the character.** A new hat is
seen. A chipped blade is seen. Diablo 4 is the standard: equipment, injury,
filth, burden and mood read off the figure without opening a panel.

**5. The labyrinth is ever-shifting and branching, and its environments are highly
varied.** It is not a dungeon with rooms; it is an eternal, changing structure.
Two stretches of it should not look or play alike.

**6. Creatures are generated procedurally and described by tags.** Not a
bestiary of hand-authored monsters — a generator, and tags that say what a thing
is and what it does. (Rule 2 governs how a new tag gets added: ask.)

**7. One tile is one square metre.** The whole world model is metric and
grounded at that scale. Nothing is measured in abstract units.

**8. Anything visible can be hovered — outline highlight and an info tooltip, on
mouseover or on tap.** If the player can see it, the player can interrogate it,
on desktop and on a phone. Tooltips carry the thing's tags.

**9. Build from the master spreadsheet of knobs and names. Do not hardcode what
could be adjusted later.** Numbers and names live in `docs/crawlers.xlsx`, which
is the authority. This is also the safety net under rule 2: anything proposed in
the sheet is theirs to rename, retune or delete without a conversation.

**10. The picture is pixel perfect, and the scale is locked at 32 pixels to the
metre.** A crawler is 52 px tall and stays 52 px tall. Zoom changes how many
REAL screen pixels one game pixel covers -- by a whole number -- and the picture
is drawn smaller to match; it never scales the world. The camera only ever sits
on whole pixels. No fractional scaling, no smoothing, nothing that puts an edge
halfway across a pixel.

**11. Time only runs while the view is moving.** Stop scrolling and the
labyrinth stops with you. This is the idle-game clock: the world advances
because the player is looking around it. Nothing in the simulation may move the
camera, or time would wind itself forward for ever. There is a short coast
(`time.coast_ticks`, currently 45 = three quarters of a second) so a phone does
not look frozen between drags; set it to 0 for the strict reading.

**13. Gear does three things at once, and it is the same twelve parts that are
seen.** A piece of gear SHIFTS an attribute (a pack makes you stronger-backed
and slower), BONUSES a skill (boots help you keep your feet), and some work
REQUIRES it (building with bare hands is thirty points harder, which is close to
impossible). All three go through `ability()`, so there is still exactly one
place anything is resolved. A gear row carries its look and its effect on the
same line of the spreadsheet, so the two can never drift apart.

**12. The view turns, and it can be raised.** Four quarter turns and two
angles, Final Fantasy Tactics style, with the swing animated and the focus held
still so the world turns around what you were looking at. The swing runs on real
time rather than game time -- the view must move smoothly whether or not the
world is running. Raising the angle opens the ground out (`tile_h`) and leaves
wall heights alone, so rule 10's locked 32 pixels to the metre holds at both
angles. Turning or raising the view is moving it, so it also runs time.

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
                      (--sheet / --out build a variant without touching docs/)
src/defaults.json     every knob and name, as the code default
src/shell.html        the page; build.py fills in {{STYLE}} and {{CODE}}
src/style.css         all of the page styling
src/js/*.js           the game, assembled in filename order
  00-version.js       the ONLY place a version is declared
  05-rand.js          seeded RNG - the simulation never touches Math.random
  08-knobs.js         the spreadsheet, inlined; K/G/N/TILE/TAG/ATTR/SKILL, CFG
  10-state.js         one match: world, crawlers, camp, camera, what is hovered
  12-world.js         rooms and halls from a seed; the walking and sight rules
  14-actors.js        the six attributes, skills, rolls, learning, crawlers
  16-camp.js          choosing a room, laying out a camp, and working at it
  18-figure.js        the skeleton, the poses, and one crawler's geometry
  20-input.js         key / mouse / touch, all writing the same state
  30-sim.js           one fixed simulation step
  40-render.js        isometric blocks, figures, the pick pass, `consumed`
  45-ui.js            the inspector: describe() returns data, render() shows it
  90-boot.js          the pixel-perfect buffer, whole-number zoom, the loop
  99-test.js          window.__test - the only way a test touches the game
tests/run.mjs         headless tests, driven through window.__test
tools/sheet.py        how the spreadsheet is laid out, read and reconciled
tools/make_sheet.py   create docs/crawlers.xlsx (refuses to clobber hand edits)
tools/tweak_sheet.py  a one-value copy of the sheet, for tests only
docs/crawlers.xlsx    THE AUTHORITY on every number and name
dist/                 built output, never committed
```

---

## The character framework (rule 2)

One framework, and everything that resolves goes through it:

```
six attributes  ->  a skill (one PAIR of them)  ->  ability  ->  one roll
```

- The six are **Might, Agility, Endurance, Presence, Intellect, Willpower**, in
  that order, and they are rows in the `attributes` tab.
- **A skill is exactly one pair of the six, and all fifteen pairs exist.** That
  makes the skill list a complete grid rather than a list somebody keeps adding
  to. The build refuses to build if a pair is missing, doubled, self-paired, or
  drawn from anything but the six. Clambering is MGT+AGI, Labouring MGT+END,
  Building MGT+INT, Studying INT+WIL, and so on for all fifteen.
- Each skill is a FAMILY of work, not one action: Crafting covers cooking,
  sewing and mending; Studying covers lore, mapmaking and deciphering.
- `ability = average of the pair x roll.attribute_weight
            + practice x roll.skill_weight`. Practice eventually outweighs talent.
- `attempt()` in `14-actors.js` is the ONLY place anything is ever resolved.
  A new thing a crawler can do is a call to `attempt()` naming one of the
  fifteen -- never a second way of deciding whether something worked.
- Gear reaches the roll through the same funnel: `effAttr()` applies its
  attribute shifts, `gearBonus()` its skill bonuses, and `toolPenalty()` the
  cost of working without the tool a skill names in `needs_tag`.

**Rule 1 is not a curve.** There is no code anywhere that slows progress down.
Failing teaches 2.2, only just failing teaches 3.6, and **succeeding teaches 0**.
A crawler who has got good at something fails less often and is therefore taught
less often; master it entirely and they stop dead until something harder turns
up. A test holds the success rate at zero and requires progress to come out
perfectly flat, which is the only way to prove no curve was smuggled in.

---

## The labyrinth, and the camp

- `12-world.js` cuts **rooms** out of solid rock and digs **halls** between them.
  Rooms sit on different levels; halls do all their climbing in the rock, a
  metre at a time, with a ramp at every step.
- A hall takes its level from **every room it passes through**, which is why it
  can cross a third room without cutting it in half.
- Connectivity is **measured, not hoped for**. After digging, the generator
  floods the place, digs again to whatever is cut off, and finally **fills in
  any room it still cannot reach**. So "every room is walkable from every other"
  is true by construction, and a test checks it across many seeds.
- `16-camp.js`: the crawlers pick the largest room they can *all* reach, walk to
  it, clear the ground (Labouring against the floor's `clear` difficulty) and
  raise the camp (Building against each structure's difficulty). Nobody is told
  to; the player is a head coach.
- A structure grows to its real height as it is built, so how far the camp has
  got is something you can see rather than read.

---

## Gear: the twelve slots, and the figure

A crawler is twelve parts, which are their gear, both visually and mechanically:

```
1  Head       5  Gloves  (elbow down)   9  Legs      (hips to knees)
2  Neck       6  Mainhand              10  Feet      (knees down)
3  Back       7  Offhand               11  Trinket 1
4  Torso      8  Belt                  12  Trinket 2
```

**The figure is real 3D, posed and lit, drawn into the same small buffer as
everything else.** That is what makes it read as sprite work: the geometry is
real, the resolution is not. It is NOT pre-rendered sprites and must not become
them.

- `bones` in the sheet is a skeleton, seventeen bones, measured in metres from
  the parent. The character's own space has **+Y forward, +Z up**, and the root
  carries the facing.
- `figure` rows are **tapered boxes** hung off a bone: `from_m`/`to_m` along the
  bone, `w_top`/`w_bot` and `d_top`/`d_bot` across it, `ox`/`oy` to sit a pack
  behind a chest. The taper is what makes a figure read as a person rather than
  a stack.
- A row is drawn if its slot is `body`, or if the item it names is the one worn
  in its slot. **There is no other path to the screen**, and the build refuses
  any piece of gear that no row draws (rule 4) or any slot nothing can fill.
- Back faces are dropped and each face is lit by its own normal against a light
  fixed in the WORLD, so the sun does not spin when the view does. A convex box
  shows at most three faces; a test asserts exactly that.
- Parts are depth-sorted within a figure along the camera axis, which swings
  with the view.

**Animation is procedural, and split on purpose:** the SHAPE of each clip (walk,
work, idle) is code in `18-figure.js` because it is logic; every AMOUNT is a
knob, so the stride can be widened or the work slowed without touching it.
Crawlers turn the short way round to face where they are going.

Animation runs off `state.tick`, so under rule 11 it stops when the view stops.
That is intended.

---

---

## The camera

- The camera holds a **focus** -- a point on the ground it keeps in the middle
  of the picture. Turning and tilting keep that point still, so the world turns
  around whatever you were looking at.
- **Yaw is continuous**, which is what lets the swing animate; it settles on
  multiples of a quarter turn. Painter's order is therefore no longer the order
  cells are stored in: everything visible goes into one list with its depth
  along the view direction and is sorted.
- **The cutaway follows the camera.** Which cell is "behind" another depends on
  which quarter you are looking from (`BEHIND` in `10-state.js`), and how much
  is hidden depends on the angle, so it is recomputed when the view settles --
  not every frame.
- The swing and the tilt advance on **real milliseconds**, not game ticks,
  because rule 11 stops game time when you are not moving and the view must
  still move smoothly.

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

### The master spreadsheet, which is the authority

`docs/crawlers.xlsx` holds every number and every piece of wording, across twelve
tabs: `knobs`, `geometry` (read only), `names`, `tags`, `tiles`, `attributes`,
`skills`, `figure`, `structures`, `bones`, `slots`, `gear`. `src/defaults.json` carries the same values so a fresh
checkout still builds. The build reconciles the two and inlines the result.

1. **Change a number in the sheet, not in the code.** If the code default must
   move too, move both and say so. (`python3 tools/make_sheet.py --force`
   regenerates the sheet from the defaults - it DESTROYS hand edits, so only use
   it while the sheet has none.)
2. **A key in only one of the two stops the build, in both directions.** A dial
   connected to nothing and a number nobody can reach are the same failure. So
   does a skill drawing on a seventh attribute, a tile claiming an unknown tag,
   or a figure part with no height.
3. **Geometry is recorded, never tuned.** Editing it stops the build on purpose.
4. **Row order is meaningful** and is preserved end to end - the attributes are
   shown in the order the tab lists them, and a figure is authored ground-up.
5. The build prints a receipt of every value the sheet moved. If a change is not
   on that receipt, it did not reach the game.

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
9. **Order that carries meaning must be preserved AND asserted.** The build
   alphabetised the data on its way into the game. Nothing errored: the six
   attributes quietly came out agility-first instead of might-first, and a
   crawler's legs were painted over their own head, so every hat was invisible
   while every test still passed - the hat *was* in the draw list. Two fixes,
   because either alone would have rotted: stop re-sorting, and make the
   renderer sort the figure ground-up itself so no row order can ever bury a
   hat. Generalised: if the order of a list means something, something must
   fail loudly when it changes.

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
