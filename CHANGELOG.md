# Project Crawlers — changelog

**The permanent playable link: https://myrmecbruh.github.io/Project-Crawlers/**

`python3 publish.py` builds the game and puts it there. The address never changes,
so the link the person holds always works. A new address would silently strand
them on an old build.

---

## The link moved, and publishing is now something I can do (no game change)

The permanent link used to be a Claude artifact:
`https://claude.ai/code/artifact/4938012a-682f-46b7-8ca3-41ecef8219b6`. That
address belongs to the tool in the chat where the game was first built, and a
session working in VS Code with Copilot **cannot publish to it**. The rule at the
top of this file said "publish to that address every time, forever", so for as long
as that was impossible the link and the game came apart: the game kept moving, the
link did not. Asked for a publishing tool, this is one:

- **`publish.py`** — one command that builds the game and puts the build on the
  web. It pushes the freshly built page to a `gh-pages` branch of the project's own
  GitHub repo, as `index.html` and under its version number, and GitHub serves that
  branch as an ordinary web page. The project's own account holds it, so there is
  no third party in the way, no account to keep alive and nothing to install.
- **The address is worked out, not typed in** — from the repo the tool is sitting
  in — so it cannot drift out of step with where the game actually lives.
- **Publishing always builds first**, so the page on the web can never be a build
  behind the source it came from, which is the failure this note is about. Every
  earlier publish stays on the branch, so a version that misbehaves can still be
  opened by name.
- **Nothing in the working tree is touched.** The published copy is assembled in
  git's own store, from the file the build just wrote, so a half-finished edit in
  the source cannot end up published.

**The game did not change, which is why no new version sits above this note.** The
picture on the web is still v0.22.0 and the tests are untouched; what changed is
that there is now somewhere to put it, and a command that puts it there. The old
artifact link still opens, holding whatever was last published through it.

---

## v0.22.0 — the pointer works the answer out instead of painting one

Since the beginning, "what is under the mouse" was answered by **drawing the whole
scene a second time** into a canvas nobody sees, flat and untextured, in colours
that spell out the numbers of the things drawn, and then reading back the single
pixel the mouse is on. It worked, and it was the most expensive thing in the
game: a full second picture, on the frame, every time the pointer asked. It is
gone. The answer is now **worked out from the shapes the picture was already
built from**.

**How it works, in one breath.** The list of shapes is in the order the picture is
painted — furthest back first, so the last thing painted is the thing in front.
Walking that list **backwards and stopping at the first shape that contains the
point** therefore finds exactly what the last brush stroke would have left there,
which is the same answer the painted version read back. Nothing is drawn. Shapes
carry a rectangle around themselves and are skipped when the point is outside it;
a rectangle can only ever add tests, never remove an answer, and that is what the
suite's comparison against a box-free walk guards.

**What it costs now.** Measured in one build with both ways alternating, best of
three, seed 1, 900 × 700 window, the view riding a walking crawler with the
pointer on the picture — this is the case the old code repainted on:

| | painted answer (v0.21.0) | worked-out answer (v0.22.0) |
|---|---|---|
| one frame, 12 pieces / 37,632 squares | 6.93 ms | **5.53 ms** |
| one frame, 56 pieces / 175,616 squares | 6.91 ms | **5.48 ms** |
| one answer on its own | 1,494 µs | **1.8 µs** |
| one answer on its own, 56-piece world | 1,418 µs | **0.5 µs** |
| a whole second of hovering (60 answers) | 89.6 ms | **0.1 ms** |

**1.40 and 1.43 ms a frame** — the price of the second picture — and it does not
grow with the world, because the second picture never did either: 12 pieces and 56
pieces cost the same 1.4 ms. **One answer goes from about a millisecond and a
half to about a microsecond**, a thousand times cheaper, which is why a second of
hovering costs a tenth of a millisecond of drawing instead of 89.6 ms of it. The
instrument counts its own work so that a silent no-op cannot look like a result:
**30 questions asked in 30 frames the new way and 30 the old way, 30 repaints
counted the old way, 269 shapes in both worlds, and 400 of 400 sample points
landing on something both ways**. (The number of asks in a second follows the
browser's clock, not this code, so the test that guards all this holds the
pointer on a crawler and checks that questions really were asked, rather than
guessing at a frame rate.)

**The old way was also sometimes wrong, and now it is known exactly how.** The
identity colours packed a thing's number into the three colour bytes of a pixel.
Canvas, when it paints a shape, **blends a pixel that a shape only partly covers**
— and it turns out it does this even when the shape covering it is the *same
colour*, and it loses the bottom bit of a channel when it does. Measured on a bare
canvas, with no game involved: a pixel filled `rgb(68,110,0)` and then covered
partly with that same colour reads back as `67,110,0` at 10% coverage, `68,109,0`
at 25%, `68,109,0` at 75%, and `68,110,0` only at 100% — six of eight partial
coverages lost a bit, and the same with transparency on or off. One lost bit is
enough: `67 + 109 × 256` is **27,971**, and the square next door is **27,970**, so
a partly covered pixel could quietly name the neighbouring thing. That is exactly
what the last stubborn "disagreement" of the previous session turned out to be —
a pixel on the outline of a spade that decodes to the square beside it. The new
answer names the shape covering the **middle** of the pixel, which is the thing
canvas itself fills, and it cannot lose a bit because nothing is ever written
down. **A cost saving that was only a speed-up became a correctness fix.**

**And that is proved, not argued.** The two ways are run in the same build on the
same frozen moment, pixel for pixel: **52 cases, four of them at every single
pixel of the picture, 610,496 pixels asked both ways**. **569,234 of them — 93.24%
— got the identical answer.** The remaining **41,262 differ only on a shape's own
edge**, where the painted number is a blend of the two colours meeting; **in the
middle of a shape, 0 differ**, and on those edges **not once did one of the two
say something while the other said nothing** — they never disagree about whether
there is anything there, only about which of two touching things a boundary pixel
belongs to, which is a question with no right answer. The battery reports **46 of
its 52 cases reaching a world of their own**, which is the check that its seeds,
turns, zooms and raised angles are really doing something: the same battery was
silently comparing one frozen view 52 times before this session, because it read
the world out of the game *before* asking for a new one, and the game hands out a
brand-new world when you ask for a seed.

**The number ceiling this was heading for is gone with it.** Colours hold
24 bits, which capped the labyrinth at about 5,350 pieces, and `ROADMAP.md` had
that written down as the next thing to break. A thing's number never goes near a
colour any more, so there is no ceiling. What is still waiting is the memory —
nothing is ever thrown away yet — and that is `forget-and-remake`.

**And the same broken ruler was found under an older claim.** The proof that
v0.21.0's ground-skipping keeps the same picture had the very same fault: it read
the world out of the game before asking for a new one, so its 240 cases were 240
looks at one frozen picture, and three of its published figures were nonsense. Run
properly — 237 of the 240 cases now reaching a world of their own — it still says
what it said: the picture is identical, 0 squares missing, 0 things painted twice,
in all 240 cases. But the numbers beside it moved: 38,757 squares kept and 41,028
things drawn, not 50,520 and 53,040, and **89.9% of the square measurements saved,
not 75.9%** (88,384,435 of them down to 8,917,751). The v0.21.0 entry above has
been corrected and says so; a wrong number left in the notes is worse than no
number at all.

**Two tests stand in place of the old one.** The old test asked that the second
picture was painted *only when somebody read it*. That is now the strong thing
instead: **the picture is never painted a second time at all** — not with the
pointer off the canvas, and not while riding a crawler, which is when the old code
repainted every frame — with the guard that questions really were asked, and asked
with the picture out of date, so that it cannot pass by asking nothing. The second
test compares the new answer against a deliberately slow walk in the paint
direction that ignores the rectangles entirely, over a sweep of the whole picture
plus **every pixel of a 30 × 30 patch in the middle**: 3,729 points, all 3,729
landing on something, 0 wrong. `drawPick` stays in the file as the yardstick the
comparison is made against, with a note on it saying nothing in the game reads it
any more.

---

## v0.21.0 — the ground arrives as you walk, and the picture only pays for what it can see

v0.20.0 made the world underneath endless: a piece of ground is worked out from
the match seed and its address alone, so the piece four kilometres away was
already exactly as real as the one underfoot. What it did not do was **behave**
like that. A match still made the one piece the camp stood in and stopped there,
and the picture walked every piece the match had ever made, every frame, for as
long as the match lasted. Both of those are now the other way round.

**The ground is fetched as it is walked to.** Every frame, the picture asks which
pieces it can reach, which pieces the crawlers are standing in, and which pieces
the camp occupies — `world.liveRing` rings of pieces around each of them — and
makes the ones that are not there yet, **nearest the middle of the picture first,
two a frame** (`world.chunksPerFrame`). Both are dials in `docs/crawlers.xlsx`
rather than numbers buried in the code, because how far ahead the ground should
be made is a feel decision and not a fact.

**The square underfoot is never late, and it beats the budget.** Whatever else is
still waiting its turn, the piece a crawler is standing in, the piece the camp is
standing in and the piece at the middle of the view are made **that very frame**,
however many that turns out to be. The camera's reach is the wider ask, so it can
want a piece somebody is standing in before that somebody asks for it; the two
asks are de-duplicated and the *urgent* mark is carried over, so the answer is
still "make it now". Somebody standing in a hole for even one frame is the thing
this rule exists to stop. Measured: **1,800 checks of the square a crawler stood
on while walking, and 0 holes**, plus the same again riding a crawler and letting
it drag the camera with it.

**A fresh match no longer opens onto one piece and a wall of nothing.** Seed 1
from cold: **1 → 3, 5, 7, 9, 11, 12 pieces over seven frames**, settling at 12
pieces and 37,632 squares, with the view reaching 13.02 squares and nothing left
wanted. Dragging the view away instead of walking it fetches ground exactly the
same way, because the ask runs on every frame of the picture rather than every
step of the game: twelve long drags from the camp out to (169, 46), and the world
held went 9 pieces and 28,224 squares, 12 and 37,632, 15 and 47,040, 20 and
62,720, **22 and 68,992** — it grows with the walking and never with the time
spent standing still.

**A piece fetched late is the piece it would have been fetched first**, which is
rule 5 and the only reason any of this is allowed: one piece, made on its own
before anything else existed and made again after twenty-two pieces of ground had
been built around it, **40,779 characters of ground both times**.

**And the picture only pays for the ground it can see.** A piece standing
off-screen is skipped whole — **eight points around its outside are asked about
instead of all 3,136 of its squares** — so the squares of ground that are nowhere
near the view are never measured at all. Measured in one build with the skip
switched off and on, seed 1, 900 × 700 window, best of three alternating passes of
30 frames each:

| the world holds | every piece walked (v0.20.0) | off-screen pieces skipped (v0.21.0) |
|---|---|---|
| 1 piece, 3,136 squares | 4.20 ms | **4.19 ms** |
| 9 pieces, 28,224 squares | 7.53 ms | **4.39 ms** |
| 25 pieces, 78,400 squares | 13.95 ms | **4.37 ms** |

About **0.41 ms for every extra piece the match is holding**, and now no trend at
all — 4.19, 4.39, 4.37 — because what a frame costs has stopped being a question
about how much ground exists and become a question about how much of it is on the
screen. There is nothing to skip when the world holds one piece, so the first row
is the same either way; that is the check that the measurement is not just
measuring itself.

**Skipping a piece is only allowed to be a SUBSET of the work the old per-square
test did, and that is proved rather than argued.** The proof runs both ways in one
build across 3 rings × 5 seeds × 2 zooms × 4 turns × 2 raised angles: 240 cases,
**every one of them painting the identical picture** — 38,757 squares kept and
41,028 things drawn, both ways, in all 240 — with **0 squares missing and 0 extra
things painted in any case**, while **89.9% of the square measurements stopped
happening** (88,384,435 → 8,917,751; the best case skips 95.6% of them). Nothing a
player can see moved; nine tenths of the work did.

*(That paragraph was corrected in v0.22.0. As first written it said 50,520 squares
kept, 53,040 things drawn and 75.9% of measurements saved. The probe behind those
figures was reading the world out of the game **before** asking for a new one, so
all 240 of its cases were measuring one frozen picture; re-run properly, 237 of the
240 reach a world of their own. The claim itself — the picture is identical, not a
square missing, not a thing painted twice — held in all 240 cases both times.)*

**New ground arrives at the end of the list of live squares, and every number
after it slides along.** Pick numbers run the squares, then the crawlers, then the
camp sites, so making a piece pushes every crawler's number and every site's
number up — and whatever is picked or hovered has to be told, or the panel and the
outline would quietly start naming somebody else. `updateLiveWorld` slides them.
This is a real limit and it is written down rather than hidden: **a match that
walks for long enough runs the square numbers past what one colour can carry**
(see the pick-table note in `ROADMAP.md`). It cannot bite yet — the window is 25
pieces of the 16 million a colour can name — but the next piece of this job is
forgetting ground as well as fetching it, and that is when it will.

**Nothing is forgotten yet.** The window fetches; it never throws anything away,
so the ground held only ever grows with the walking. That is the next job, and it
is why the numbers above are quoted at 1, 9 and 25 pieces rather than at whatever
a long match would hold. What is proved here is that the *fetching* works and that
the picture has stopped paying for ground it cannot see; bounding what is held is
a separate promise, made when forgetting exists to keep it.

**Four tests were quietly claims about a world that no longer exists, and were
restated.** None of them was a bug in the game — every one was a test that had
been true when the world was one fixed patch and had gone on passing for the wrong
reason afterwards.

- **"Pointing away from the labyrinth shows nothing"** slid the view 6,000 squares
  out and expected the far side of the batch. There is no far side now: the world
  lays ground there as readily as at the camp. Restated as what it was really
  about — **pointing at nothing at all names nothing, and there is no edge to walk
  off**: the ground at the middle of the view exists, things are drawn, a point
  outside the picture is −1 with no panel and no outline left behind.
- **The two tests that point at a crawler** asked for its pick number *before*
  painting, and the painting itself fetched ground, which moved the number they
  were hunting by 3,136 — the size of one piece. The number is a value with a
  lifetime now, and is worked out in the same breath as the list it counts.
- **"Turning the view does not disturb the labyrinth or the camp"** took its
  "before" picture immediately after the seed, when the world held one piece, and
  then turned the view, which let the picture fill the window to nine. It was
  measuring the view *opening* and blaming it on the view turning. It now fills
  the window first and turns from there: **0 squares moved and 0 lost across a
  turn, a tilt, a turn, a tilt and a turn, at nine pieces before and nine after**.
- **The test that walks every square of the world** for the tallest ground was
  making one piece and checking twenty of them; `frame()` after each seed is what
  it meant. **564,480 squares now, and the tallest is 7 metres on the nose.**

---

## v0.20.0 — the labyrinth goes on forever

Chosen in September 2026 ahead of hunger, creatures and the cave below. **The
world used to be one fixed patch of 56 × 56 metres with a rock wall at the edge of
it, and asking what lay past the wall had exactly one answer: nothing.** Now the
ground is a plain of pieces, each 56 m on a side, and every piece is worked out
from **the match seed and its address alone** — which column it is in and which
row. Nothing keeps a list of pieces, no piece is fetched or asked about, and the
piece four kilometres away is exactly as real this instant as the one underfoot.
Throw one away and make it again from the same two numbers and it comes back
identical, which is the whole of rule 5. The piece at address 0,0 keeps the plain
seed, so the ground under the camp is the ground a seed has always named and every
test quoting "seed 23" or "seed 777" still means the same world.

**Pieces are filed by column and then by row** — two plain numbers, so finding one
costs no more than filing it did, and the plane never runs out of addresses
however far it is walked. Squares are handed out by `world.at(x, y)`, which
**makes nothing**; only `ensure(x, y)` makes a piece, so no stray lookup can
quietly generate an endless maze. `at` remembers the piece the last lookup landed
in — squares get asked for in bursts, this one and then the one beside it — so
nearly every lookup is two subtractions and a compare, and only a square outside
that piece pays for an address. That is not a detail: worked out on every single
lookup it cost three times as much (the light 13.5 → 34 µs, the fading of the near
walls 98.5 → 298 µs, boot 2.8 → 8.1 ms). Remembering turned it back into 14.5 µs,
159 µs and 4.0 ms.

**Two pieces either side of a seam never talk to each other, and they still open
their doorways in the same places at the same heights.** A join belongs to the
piece with the smaller column for a join that runs up a column of pieces, and to
the piece with the smaller row for one that runs along a row, so both sides name
the join identically. `joinSeed` mixes the match seed with that one address, and
`joinOpenings` reads the single stream it makes for **how many doorways the join
gets, where along the rim each lands, and how high it is**. Two pieces that rolled
their own doorways would put them in different places and the two sides would not
meet; agreeing the height the same way is what makes walking out of one piece
walking into the next **at the same level**.

**A doorway is a rim square opened at the agreed height with a corridor dug inward
to ground the piece already had, and it only ever cuts rock.** It runs along the
rim until it finds a row with room to climb — it cannot climb faster than a metre
per square, and a doorway that would have to is simply **not dug** — then goes
straight in until it meets ground this piece could already walk to: the flood
taken *before* any doorway was dug, or a corridor dug a moment ago. Coming out
into a pocket nobody can reach is refused, because that is a doorway into nowhere.
A doorway that is not dug leaves the rim looking exactly as it would have without
any of this, and the piece counts it as sealed rather than pretending.

**So joining two pieces cannot take ground away from either, and that is proved
rather than hoped.** The rule the proofs hold to is that no square a crawler could
stand on may ever change: same height, same tile, same room, still walkable. The
only squares allowed to differ are the ones **the old build's own flood could not
reach**, because those were never anywhere a crawler could go — bare rock, or the
floor of a room the old build wrote down but had cut off — and the count of them
may not exceed the ground that sat in rooms the old build could not walk to.

| proof | seeds | pieces | squares of rock dug into corridor | old-unreachable squares redone | squares moved | squares of walkable ground lost |
|---|---|---|---|---|---|---|
| a whole 3 × 3 block of pieces, against the same build with its doorways switched off | 70–110 | **369** | 32,873 | 305 | **0** | **0** |
| the one piece the camp is in, against the same build with its doorways switched off | 1–120 | **120** | 11,164 | 0 | **0** | **0** |

All 305 of the redone squares were ground the old build had written into rooms it
could not walk to — measured exactly equal to that area, 305 to 305 — and no piece
changed its list of rooms. In the second proof the two builds also agree on the
rooms, the camp, and where six crawlers stand and what they are doing after two
hundred frames: **959 doorways agreed, 1 refused**. Same promise, checked the other
way round: the grid proof saw **2,905 doorways agreed and 11 refused**.

**The joins themselves**, across 26 seeds and 234 pieces, nine pieces per seed:
**2,068 rooms and none that nobody can walk to, 1,889 doorways dug and 3 refused,
260 joins and 0 with no doorway open on both sides.** Mouths pair up at equal
heights, and wherever both sides are open `canStep` works both ways. One doorway
is open on one side only — a corridor that dead-ends against the neighbour's rock
— which is the allowed case (the neighbour refused that one) and is counted and
reported rather than swallowed.

**Two bugs turned up on the way, and both were fixed.**

- **Rooms cut off from the rest of their own piece.** The old generator dug its
  halls, measured once, and filled back in whatever that one measurement found cut
  off — but filling a room back in takes its floor away, and that floor can be the
  only way through to somewhere else. Measured over 2,250 pieces (250 seeds, each
  made at nine addresses across a 3 × 3 block), the one-shot version left **16
  rooms in 8 pieces** cut off from the rest of their own piece. It now measures,
  fills, and **measures again until a measurement turns up nothing new**, which
  always ends because every round that changes anything leaves one fewer room to
  measure. The same 2,250 pieces now have none. That was a bug in the generator,
  not in the test, and it was not caused by this version.
- **A ramp that climbed into a wall.** Every ramp must climb exactly one metre
  toward ground exactly one metre higher, and the suite checks that on seed 1. It
  reported **1 of 30 ramps climbing to nowhere**: a square on a piece's rim,
  leaning *inward* at a rock wall **7 m taller than itself**. A doorway's corridor
  runs sideways along the rim before it turns inward, and the code leaned a ramp
  inward whenever the next square along the corridor was higher — which is simply
  wrong when that next square is a *sideways* one. It now leans at the square that
  really is higher, which is the whole of what a ramp means. Zero after the fix on
  seed 1, and the doorways contribute **0** wrong ramps across twelve seeds
  measured (seed 1, 2, 3, 4, 5, 6, 7, 8, 23, 72, 101, 777).

**Seven crooked ramps on five of those seeds are older than this version and are
left alone.** Seed 2 at (18,28) and (18,30), seed 3 at (42,9), seed 7 at (47,4),
seed 8 at (30,29) and (31,29), seed 777 at (37,25): ramps leaning at a wall two
metres taller than themselves. They are identical with the doorways switched off
in both the old and the new build, so the room and hall shaping is the source, not
the joins — and fixing them would move room shapes, which is exactly the promise
proved above. They are cosmetic (a ramp tile drawn against a cliff), they are
parked in `ROADMAP.md` with their seeds, and the suite cannot see them because it
only ever checks seed 1.

**What it costs**, one instrument run over three builds in the same sitting — the
last shipped build, this build with its doorways switched off (the pieces alone)
and this build — viewport 1280×800, zoom 2, the game paused:

| what | v0.19.0 | v0.20.0, pieces only | v0.20.0, shipped |
|---|---|---|---|
| shape work (`Render.build`) | 1.5 ms | 1.4 ms | **1.5 ms** |
| a whole frame (`Game.render`) | 1.2 ms | 1.2 ms | **1.2 ms** |
| making one piece | 1.0 ms | 1.6 ms | **1.4 ms** |
| making the world around one piece | 1.0 ms | 1.2 ms | **1.4 ms** |
| a whole boot (`newState`) | 2.4 ms | 4.2 ms | **4.6 ms** |
| fading the near walls, whole grid | 92 µs | 144.5 µs | **170.5 µs** |
| one walk-to-somewhere flood | 0.085 ms | 0.18 ms | **0.195 ms** |
| light, whole grid, 2 sources | 11.5 µs | 20 µs | **16 µs** |
| one piece in memory | 111,659 B | 176,796 B | **171,896 B** |

So the doorways' own price is **+0.1 ms to make a piece** (inside the run-to-run
spread), **+0.4 ms to a whole boot** once per match, **+26 µs on the wall fading**
and **+15 µs on the flood** per frame — and **nothing at all to the picture's shape
work or to a frame**. What is left over is the honest price of not knowing the
world's size: a walk-to-somewhere now collects the squares it actually reaches
instead of allocating an array as big as the whole patch, which is ~2.2× its old
self and is exactly the shape bounded pathing needs.

**Two numbers in the plan were wrong, and are corrected.** Pieces do not need to
shrink: one costs 1.4 ms, well inside the plan's 4 ms line, so they stay 56 m. And
a piece weighs **a few hundred kilobytes, not the third of a megabyte the plan
guessed** — two readings of one build, 100 pieces apart inside the same run, came
out 100 kB apart (226,756 B and 126,836 B), so the order of magnitude is the
honest statement. Sixteen live pieces is a couple of megabytes and a walk of two
hundred pieces is a few tens of megabytes: keeping pieces is cheap, and forgetting
them (todo 9) is worth having but is not the emergency the plan implied.

**One more instrument bug, caught by the instrument.** `state.light` became
`state.lit` (it now names the squares the last pass lit rather than the light
itself) and one line of the picture's own bookkeeping was still reading the old
name, so it reported zero light sources reaching the screen. Nothing looked wrong
and no test failed; the measuring tool said 0 and that is how it was found.

**What this version does NOT do.** Nothing in the game fetches pieces as the
crawlers walk to them yet: a match still starts by making the one piece the camp
is in, so walking to the edge still arrives at rock — just rock with doorways in
it. The part that makes pieces as they are needed, and the builder that visits only
the ground on screen (393 of 3,136 squares matter), are the next two pieces of work
and they are where the frame cost stops depending on how big the world is. The test
suite is otherwise unchanged: it works on squares rather than array positions now,
and durable tests for the endless world are still to come — the proofs above are
session instruments (`compare-worlds.mjs`, `probe-seams.mjs`).

Three new knobs, so the sheet now carries **88 rows and the build refuses to run if
the sheet and the code disagree**: `world.join_min` (1, the fewest ways out of a
piece — never below 1, or the promise that you can always walk onward is not kept),
`world.join_max` (3) and `world.join_margin` (3 tiles, how far a doorway keeps from
the corner, so the four corners of the world do not meet in one heap).

Lessons 20, 21 and 22 in `CLAUDE.md`.

---

## v0.19.0 — a walking crawler is never painted under the ground they walk on

**Reported as: "units moving clip behind the ground they are walking on".** They
were right, and the middle of a step is the whole of it: **180 to 208 px of a
~700 px crawler** — their bottom 14 to 16 rows — vanished into a flat square of
floor part way through a stride, and came back at each end of it.

**One number, read at the wrong moment.** Every shape in the game is painted in
order of how near it is to the camera, and a ground square's nearness is worked
out from its **centre**. A crawler halfway between two squares is drawn at the
point their feet are at, which is strictly *inside* the square they are walking
towards — or outside the one they left, on the way out. So whichever of those
two squares is the nearer one painted **after** the figure and ate its legs. At
rest it cannot happen: standing on a square, the feet and the square's centre
agree to the pixel, which is why this had been there since v0.12.0 gave crawlers
a stride and nobody had seen it in a still frame.

**The rule now.** A crawler part way through a step is painted after the whole of
the ground that step covers: their own square, the square they left and the
square they are heading into. Flat ground can no longer paint over their legs.
Rock in front of them still does, and should — rock has real height, so a crawler
behind it is genuinely behind it. Standing is provably untouched, by a gate on the
stride itself (`actor.moveT < 1`): with the feet on a square the three depths are
the same number, so nothing about a settled crawler changes.

**What was measured**, seeds 1–8, camera quarter per seed, zoom 4, both rules
painted of the very same instant inside one build (`__test.stepGround`), paused
repaint:

| seed | steps walked | clean at both ends |
|---|---|---|
| 1 | 20 | 7 |
| 2 | 22 | 0 |
| 3 | 21 | 0 |
| 4 | 22 | 11 |
| 5 | 18 | 3 |
| 6 | 22 | 15 |
| 7 | 19 | 0 |
| 8 | 17 | 5 |
| **all** | **161** | **41** |

The 41 clean steps, by direction: north 12, east 11, south 12, west 6. Worst
hidden pixel count part way through those steps: **208 px with the old rule,
3 px with the new one**. Across all 41: old rule
`{0:1, 120:2, 140:1, 160:8, 180:23, 200:6}` — **40 of the 41 hide more than
20 px**, the largest 208, and the *quietest* step of the 41 still hides 193 px at
one end of it; new rule `{0:25, 1:12, 2:3, 3:1}` — **nothing over 3 px**. The
three worst steps under the new rule leave 1–3 px hidden, which is the scale of a
soft edge rather than of a covering shape — the largest measured is a single
pixel row — which is why the test's bound is 8 px rather than 0: a bound of
nothing would be a bound that nothing could meet.

**Why only 41 of 161 steps can be judged, and why that is the honest number.**
"Hidden" on its own is not a fault: a rock in front of a crawler is supposed to
cover them, and on the worst case measured — one crawler with 750 of their 776
pixels behind rock — the figure shifting one or two pixels between the two
frames moves that count by **±14 px** with nothing having changed at all. A step
is only evidence if **both ends are clean**, because that is the only way to know
the middle is being covered by the floor and not by scenery. Four of eight seeds
give nothing clean, which is the correct answer for a seed whose crawlers are
always standing beside rock, not a failure to measure.

**Why the ends are exact and the middle is not.** The figure is drawn with its
bottom edge sitting on its ground point, so a crawler standing on a square is
painted either wholly after that square or wholly before it — and against flat
floor it comes out the same either way. Mid-stride the bottom edge is *between*
two squares' centres, and no per-object depth can be right for both. The fix is
therefore not a better depth but a wider one: paint after everything the step
touches. The counting rule for the test falls straight out of that — if either
end of the step is occluded, the middle cannot be attributed to the floor.

**The switch is what makes it provable.** `render.stepGround` is a Render flag,
default `true`, flipped off **only** by the test that walks one stride both ways
and counts the crawler's own pixels both times — the same house idiom as
`clipWalls` in v0.18.0. The test asserts the game ships with it on, that 25 or
more clean steps survive the seeds, that no clean step loses more than 8 px under
the shipping rule, and — the negative control — that with the old rule at least
three quarters of those clean steps hide more than 20 px. Without that last
assertion the test would pass on a picture with no crawler in it.

Two harness seams were added to make a single instant measurable at all:
`__test.midStep(...)` places a named crawler part way through a chosen stride, and
`__test.actorOwnPixels(...)` returns four pictures of that one instant — the
crawler alone, blank, the scene, and the scene without them — so "this many of
their pixels are covered" is a count rather than an opinion.

---

## v0.18.0 — the walls buried in the rock are not painted

**Every rock column used to paint its side walls from its own top all the way
down to the floor of the world**, whatever was standing in front of them. Counted
in v0.17.0 at 1100×760: 686 faces, **2.9 ms of the 7.0 ms of drawing**, and ten
screenfuls of pixels of which 90–96% is inside the rock standing next to it. In
the 624×368 picture measured below, seed 1 alone is **786 face paints covering
4,677,632 pixels** — twenty screenfuls of wall into a screen. The game was
painting the inside of solid stone.

Now a side wall drops only as far as **the neighbour it faces**. Where the two
meet is worked out once, in `build()`, alongside the rest of the shapes, so what
reaches the painter is a genuinely shorter quad rather than a clipped one; the
wall's own visible sliver is still painted, at full length, exactly as before.
Out of 786 wall faces on seed 1, **164 are painted and 622 are dropped**.

Each wall drops to the top of the neighbour across the edge it faces, so the cut
is a function of the two columns' heights and of `render.rise` — one number, and
screen x does not enter into it, which is why it can be solved in the geometry
pass with no pixels involved.

**The catch, which the roadmap had already spotted.** The see-through fourth wall
fades a near column when it is between the camera and the room, and you really
can see through it — so those neighbours must NOT be clipped, or a faded block
would open a hole in the wall behind it. The guard is the fade itself: a wall is
only cut when the neighbouring column's alpha is exactly 1. `alphaOf` is the same
number `draw()` was already using, so there is no second opinion about how
transparent a block is. There is a test for exactly this, because it is the way
this change fails loudly.

**What was measured**, on the built file with the flag A/B-ed inside one build
(`__test.clipWalls`), paused repaint, 624×368:

| seed | wall faces painted | wall pixels | dropped walls | repaint |
|---|---|---|---|---|
| 1 | 786 → **164** | −81% | 622 | 5.92 → **4.38** ms |
| 2 | 762 → **170** | −71% | 592 | 6.87 → **4.92** ms |
| 3 | 474 → **105** | −78% | 369 | 5.00 → **3.56** ms |
| 7 | 814 → **183** | −79% | 631 | 5.35 → **3.81** ms |
| 777 | 378 → **92** | −76% | 286 | 4.06 → **3.35** ms |

Between 17% and 29% off drawing the picture, and the pixels thrown away are
pixels that were covered by the rock next door. The wall pixel counts are in the
same table because they are the reason: 786 faces painted 4,677,632 pixels of
wall on seed 1 and now paint 884,736 — 20.4 screenfuls of wall into a picture of
229,632 pixels, down to 3.9.

**The picture is not unchanged, and cannot be.** The roadmap asked for it
"provably unchanged" and that was the wrong thing to ask for. Where a wall is
removed from underneath a shape that shares an edge with it, the covering shape
has a one-pixel antialiased edge, and through that edge the pixel now blends with
whatever is behind it instead. Painting the same frame twice is **exactly**
identical, pixel for pixel — that is now asserted, so the measurement above can be
trusted — but painting it with the clip and without it is not: 2.6% to 4.8% of
the picture moves, and the worst single pixel in any of the nine cases measured
(five seeds, two other camera quarters, zoom 1 and zoom 3) moved **20/255**.
That is a shade or two on the edge of a block, and nowhere near what a missing
surface looks like: the same measurement with the see-through guard taken out
moves 14% of the picture and up to 184/255.

The thing that settled it was not a percentage but a **census of where the
difference is**. For every single differing pixel, across seeds 1, 2, 3, 7 and
777, the topmost fill covering that pixel in the old picture was a shape that is
still there — **never a removed wall**. Nothing that was visible moved. What is
left is a hairline seam where two soft edges overlap, and four tests hold it
there: the census itself (buried walls exist and are not painted), same-frame
identity, the seam bounds, and the fade guard.

Lesson 17, written up in `CLAUDE.md`: when a change deletes work that something
else was covering, expect a seam, measure the seam's *extent* instead of arguing
about its existence, and write the bound down where a later session can fail
against it.

---

## v0.17.0 — the grit comes off, and the frame gets counted

**The grit is gone.** It had been there since v0.02: a generated speckle tile
laid over every face in the game — ground, rock, crawlers, campfire, everything.
They asked what it was, and then asked for it to go. It did not read as a
surface; it read as dirt on the lens, and it was the same dirt on a stone floor,
a leather boot and a flame.

What survives is the thing that actually IS a surface: the eight generated
materials from v0.16.0 — flagstone, dirt, moss, water, rubble, bones, raw rock,
masonry — which live on the ground and on laid walls, where they belong. A
crawler and a piece of the camp are now flat-coloured lit faces, and the figure
is what you read them by. Side effect worth having: a crawler used to be a dark
smudge at this resolution, because the speckle was competing with the shading for
the same eight pixels. They read as people now.

`texture.strength` was kept and repointed: it used to say how hard the grit bit,
and now says how strongly a material marks its surface. 0 still leaves plain flat
colour everywhere, which is what the test diffs against. `texture.floor_px`,
`texture.fine_px` and `texture.speck` were the grit's own dials and are deleted
from both the sheet and the code defaults.

**The old test proved the wrong thing.** It compared a grained picture against a
flat one and asserted more colours along three lines — which would still pass
with the grit back on crawlers, since it only ever asked "is anything textured".
The new one counts what KIND of fill every face got, and fails if the number of
patterned fills ever exceeds the number of ground squares. That is the assertion
that keeps the grit off, rather than merely faint.

**What it bought, and what it did not.** Drawing a frame went 9.3 → 7.0 ms (seed
1, camp in view, 80 draws of one frame). Patterned fills went 1,009 → 343, and
the pattern cache 668 → 20, because crawlers and camp pieces no longer need a
baked pattern for every colour at every light level.

**Then the frame was counted properly**, which is the part worth keeping:

| | ms |
|---|---|
| drawing the picture | 7.0 |
| the hidden picture the pointer is found in | 4.8 |
| working out the shapes | 1.4 |
| cutaway + light map + simulation, together | <0.3 |

And inside the drawing, the answer to "what else is killing performance" is not
what anyone had been guessing at. **Two thirds of it is rock side walls** — 686
faces, 2.9 ms, covering ten screenfuls of pixels into a picture 534×348 across.
They are painted from the top of each column *all the way down to the floor of
the world*, whatever is standing in front of them. Across seeds 1, 2, 3, 7 and
777, **90–96% of every metre of wall painted is buried inside the rock next to
it**. Crawlers and the whole camp together are 666 faces and under 10,000 pixels
— about 5% of one screenful. They were never the problem, and two earlier
sessions had gone looking at them.

Parked in `ROADMAP.md` rather than fixed here, because it is a separate change
with one real catch: where the see-through fourth wall fades a near column you
*can* see through it, so those neighbours must not be clipped.

Lesson 14 again, and it worked again: count the expensive thing, price one of
it, and the answer falls out. Five guesses had been wrong in a row the last time
this was done by A/B-ing whole features.

---

## v0.16.0 — materials for everything, and a camp with real shape

Research first: the standard dark-fantasy tile vocabulary is twelve floors —
flagstone, cobble, dirt, moss, rubble, wood, water and so on — and the rule that
makes such a set hang together is **one locked palette, so anything you put down
belongs with everything else**. Also worth stealing: hue-shifted shadows, which
are what stop a dark picture reading as grey mud.

**Nothing was downloaded.** Photographic tiles would have to be embedded in the
one playable file, they carry licences that do not obviously permit publishing
them onward, and the whole texture system here is generative and tunable from the
sheet. The research informed eight new GENERATED materials instead: flagstone,
dirt, moss, water, rubble, bones, raw rock and the masonry already built. Every
tile in the game now names one, the tile colours were retuned to a single
grimdark palette, and a shaded face now goes cold as well as dark.

**The camp is real geometry.** A new `structure_parts` tab, the same lathe as a
crawler's parts but hung at an offset from the square instead of off a bone, with
its own lean and spin. A campfire is three hearth stones, three logs leaning in,
embers and a flame. A store is a hooped barrel with a lid. A bedroll is a mat
with the blanket rolled at the head. A windbreak is two posts, a cross-piece and
stretched cloth. Parts marked `grows` rise out of the floor as the work goes on —
which is how you can still SEE how far a camp has got — and parts that do not
grow (the flame, the lid, the blanket) are simply absent until the job is done.
The build refuses a structure with no parts and a part hung on a structure that
does not exist.

**And the performance mistake, which took five wrong guesses to find.** Drawing
went from 7.96 ms to 43 ms. In order, the things it was not: the pattern matrix
being reallocated per face (reusing one changed nothing); the material tile being
32px instead of 16 (8px was no faster); the camp's new geometry (removing the
whole camp did not help); the crawlers (removing them made it *worse*, which is
how noisy that probe was). Counting the actual transform calls found it: **686
mapped fills a frame, at about 50 microseconds each** — because giving raw rock a
material meant every rock side face got the texture mapped onto it.

Masonry has to be mapped onto the face; courses run along a wall. Fractured rock,
dirt and moss have no direction to get wrong. So only masonry is mapped now, and
everything else takes the cheap pinned path on the top with flat sides — which is
the decision this project had already made about rock walls, for exactly the same
reason, and which I had quietly undone. **7.96 ms → 9.78 ms**, for eight new
materials and a camp made of eighteen parts instead of four boxes.

The camp geometry was also cut to a budget on the way past: these things are
fifteen to twenty-five pixels across, and nine sides with five rings is detail
nobody can see.

## v0.15.0 — walls somebody built

A new tile, **Stone Block Wall**, tagged `stone` and `constructed` as they asked.
Two more tags come with it and are not decoration: `solid`, so it fills its
metre, and `blocks-sight`, without which firelight would pour straight through
the masonry.

**The stonework is generated, not painted.** Irregular blocks, big ones packed
among small, laid in courses that stagger, with the joints showing dark — built
to match the photo they sent. It tiles seamlessly by construction: course
heights are chosen to sum exactly to the tile height and each course's stones to
sum exactly to its width, so there is no seam to find. Every stone takes its own
shade, and roughly one in five spans two courses at once, which is most of what
stops it reading as brickwork. Seven knobs shape it, so it can be pushed from
neat ashlar to rough rubble without touching code.

The first version walked its randomness twice — once to shade the stones, once
to place the joints — and the two walks drifted apart, so the joints did not land
on the stones. It now builds the wall as a model and draws from that, which
cannot disagree with itself.

**The texture is MAPPED ONTO THE WALL, not pasted across the screen.** This was
their correction and it was the right one. The grain gets away with being pinned
to the world in screen space because it is isotropic noise — turn it and nothing
looks wrong. Masonry is directional: pasted flat it sheared with the isometric
projection and slid across the wall as the camera moved. Each face is now given
its own affine map, one tile of texture to one metre of wall, built from the
face's own corners. Under an isometric projection a planar quad's map is exactly
affine, so no perspective term is needed and none is missing. The courses run
along the wall, the stones sit on its surface, and the whole thing turns with the
geometry.

A test states that precisely rather than describing it: it takes the transform
the renderer actually used, applies it to the texture's own corners, and fails
unless one tile of stonework lands within a hundredth of a pixel of the far end
of the wall it is on — at all four camera turns, and differently at each, since
identical results at every turn would mean it was screen-space after all.

**Where the walls appear:** rock that closes in a room somebody MADE — a chapel,
a cistern, a gaol — is faced with the blocks they laid. Rock that was merely dug
through stays raw rock, so a mine and a quarry keep the stone they were hacked
out of. Done last in generation, after the halls are cut, so a doorway punched
through the ring is left as a doorway rather than walled up again.

**It costs almost nothing**: 7.6 ms → 8.0 ms of drawing. Graining *every* rock
wall was measured at 10.7 ms and rejected for that reason; this is cheap because
only about a hundred cells in a world are built walls, and only the ones in shot
are drawn.

## v0.14.0 — the crawlers are one person, not a pile of parts

They asked for better human models. What the measurement found was worse than
"could be prettier": **in 37 of 64 poses the figure had three or four completely
empty rows of picture in it** — at 63–69% down the body (the knee) and 84–89%
(the ankle). The crawlers were not badly drawn humans. They were a head, a blob
and two floating feet, and they had been since the figure was first authored.

**What was doing it: `cap_top` and `cap_bot`.** A cap rounds a lathed part's end
down to a POINT. That is right for a skull or a toe. Every limb had them on the
ends BURIED inside the next limb, so both sides of every joint tapered to
nothing and met as two points. The knee necked down to one pixel and then to
none. Caps now stay only on ends you can actually see — the crown, the sole, the
fingertips — and the buried ends are flat and full width.

Four other things were wrong and are fixed, all of them numbers in the sheet:

- **A 3.7cm hole at the throat.** The torso stopped at 1.28m and the neck began
  at 1.32m. The head was joined to the body by nothing at all.
- **Joints authored to MEET, not to touch** — the neck and head overlapped by
  2mm, the elbows and wrists by 1cm. That is lesson 7, which this project already
  had written down, happening again in a different system.
- **Shoulders at 19% of height** where a person is about 23%, which is why the
  torso read as a slab. Now 21–22%, with the shoulder bones moved out to match.
- **Feet 1.6cm below the floor.** They stood in the ground, not on it.

Values were also lifted off the floor of the palette: the legs were `#33302c`,
which on a shaded face is rgb(28,26,24) against a rgb(6,8,11) background. Under
rule 4 a leg that exists has to be SEEN, and at 32 pixels to the metre that one
was not.

**Two tests now hold this.** One reads the figure back out of the buffer and
counts how many pixels of the crawler land on each row, for five poses times four
camera turns times dressed and bare — 40 renders — and fails on an empty row or a
row one pixel wide. The other checks every joint in the skeleton actually
overlaps, and that the result is still shaped like a person: height within 6% of
the sheet's `actor.height_m`, head 11–17% of it, shoulders 17–27%.

The first cut of the row test failed 26 poses for the wrong reason: it counted
the crown of the head and the toe of a boot as defects, when both are supposed to
taper. A ruler that reports real geometry as a bug is worse than no ruler
(lesson 2), so it now trims two rows at the crown and three at the sole and
argues only about the body in between. Proof that it still bites: rebuilt with
the old leg numbers restored, it catches 37 of 64 poses; with the new ones, 0.

## v0.13.0 — rooms are places, and places are built out of words

Every room in the labyrinth was one flat sheet of floor. Measured: **90 of 90
rooms dead flat**, 69% of all walkable ground inside a room, and 1% of the floor
a ramp. All of the labyrinth's height lived in the corridors. They said it went
when we moved to rooms and halls, and they were right — the room generator laid
`c.h = r.elev` across the whole rectangle and never touched it again.

**A room is now a PLACE, and the place is built out of words.** One `function`
word says what it was built to be — a cistern, an arena, a slave market. Up to
two `condition` words say what has happened to it since — flooded, collapsed,
haunted. An optional `people` word says whose it was. "Haunted Silent Miners'
Bathhouse", "Ruined Shattered Orcish Granary", "Weeping Burnt Quarry" are four
rows of a new `words` tab found together, and 84 words make about a quarter of a
million of them.

The design decision that makes it work: **a word carries both halves of itself on
one line of the sheet** — what it means (its tags) and what it does to the ground
(its shape moves, the floor it lays). "Flooded" is not a label somebody remembered
to apply after filling the low ground with water; filling the low ground with
water IS what the word does. The name and the place cannot drift apart, for the
same reason a piece of gear carries its look and its effect on one row. Seven
moves exist — pit, platform, terrace, ring, pillars, rubble, water — and the build
refuses a word that asks for anything else.

**Their nature is discovered, not given.** A room starts unnamed. A crawler
standing in one will stop and try to read it — the walls, the bones, what is left
of the fittings — which is a Studying roll against `room.study_difficulty` like
anything else, so failing at it teaches them (rule 1) and a place that will not
give up its name is a place they get better at reading. Three tries each and they
let it lie, so a crawler with no head for it does not stand in a doorway forever.
Until somebody reads it, a square there is just floor; afterwards it carries the
room's name and the room's tags as well as its own.

**Connectivity is guaranteed, not hoped for**, and it took two goes to earn that.
Heights only ever step by one metre — `smoothRoom()` pulls down anything higher,
because a pit inside a ring left a two-metre drop and stranded twenty-one squares
of a flooded orcish arena. Ramps are then placed per PAIR of touching shelves,
found by flood-filling equal-height regions; grouping them by row instead put a
ramp in every row and turned each ledge into an open slope. And a block — a
pillar, a fallen slab — is placed only if the room is still whole with it there,
checked one block at a time. 0 broken rooms in 154, then 0 in 30 seeds' worth
under test.

**The mistake that cost 25 tests:** pillars were allowed to stand on a room's
centre square. The generator uses that square AS the room — it is what a hall is
aimed at and what the final reachability sweep tests — so a pillar there did not
block one square, it deleted the whole room. Every room in the world vanished,
there was no camp, and twenty-five tests failed at once with `undefined`.

**And one test was quietly measuring luck.** "The crawlers gather in one room and
build a camp" asserted that somebody learned Labouring. On the baseline that
passed with a single failed clearing roll in the entire match — 0.1 of a pip,
twice — and one luckier roll would have failed it. The new world rolled slightly
better and it went red, looking exactly like a broken mechanic. It was not: rule 1
says succeeding teaches nothing, and the crawler doing the clearing was good at
it. The claim is now made where it can be made honestly, across six seeds, and
the single-run test asserts only what a single run can support.

## v0.12.1 — the controls that walking broke

Four bugs, all children of v0.12.0. Making crawlers move continuously turned
several things that had quietly been "true most of the time" into "false every
frame", and the interface fell over.

**The close button, and the folds, could not be clicked at all.** `renderPanel()`
writes `innerHTML` every time it is called, and it is called whenever the view
is dirty. Riding a crawler calls `camRefresh()` every frame, which marks the view
dirty every frame, so the panel destroyed and rebuilt its own buttons **sixty
times a second**. The listener is delegated on the panel so it survived; the
BUTTON did not. A click needs the same element under the press and the release,
and the element the player pressed was gone a sixtieth of a second later. Both
surfaces now write to the DOM only when the words actually changed — the panel
went from 60 rebuilds a second to 2. Measured with a MutationObserver, and the
test presses the real close button rather than asserting about state.

**You clicked a crawler and selected the rock behind them.** Selection read
`state.hover`, which is sampled each frame, at the moment the button came UP. A
real click lasts about a tenth of a second and a crawler crosses a square in
0.37s, so they routinely walked out from under the cursor mid-click. The pick is
now taken at the press and held until the release. Pressing on a crawler and
holding the button for 400ms while they walk: **1 in 6 kept their crawler before,
6 in 6 after.**

**Two boxes appeared at once, naming different things.** This was the same event
seen from the other end: picking a crawler locks the view onto them, the whole
world slides, and whatever drifts under the stationary pointer gets a tooltip —
beside a panel naming the crawler. The tooltip now says nothing until the pointer
is actually moved again (`pointer.quiet`), and never describes the thing that is
already pinned. Both are right independently of the camera: something that slid
under a still cursor was not pointed at, and a second box repeating the panel was
never useful.

**Everything felt sluggish.** Painting the whole scene a second time in identity
colours, for the pick buffer, cost 2.74ms of a 16ms frame and was being done
after every geometry rebuild — which, once the view rides a walking crawler, is
every frame, forever, whether or not anything was going to read it. It is now
painted on demand, inside `pickAt()`. On a phone, where there is no hover at all,
it now runs on a tap instead of sixty times a second.

Closing the panel also lets go of the crawler, which it should have done from the
start: nothing is pinned, so nothing should be ridden.

The general shape of all four: **v0.12.0 changed how often things move, and every
piece of code that had been sampling "the current state" got away with it only
because the answer used to sit still.** Continuous motion is not a bigger version
of discrete motion.

## v0.12.0 — walking, and the crawler you are watching

Three things about the same moment: you have picked someone, and you want to
keep your eye on them.

**Crawlers walk between squares instead of appearing in the next one.** A step
was resolved and applied in the same instant, so a crawler blinked a metre
sideways every time a Clambering roll came good. The roll still happens all at
once -- that is the mechanic, and it is not moving -- but the *arrival* is now
spread over `anim.step_ticks` (22), with the position and the ground height eased
in and out so a crawler climbing a ramp rises as they cross it. `actorPos()` is
the one place that answers "where is this crawler right now", and the renderer
asks it both for where to draw the figure and for how far back to paint it, so a
crawler mid-stride sorts against the world at the place they actually are rather
than the square they are filed under.

The test does not assert that a number moved: it collects the position the figure
*reached the buffer* at, every tick for 900 ticks, and fails if any single frame
moved a crawler more than half a metre, or if every drawn position sat exactly on
a square centre. Teleporting would pass the first check and fail the second; a
stride that snapped at the end would fail the first.

**A selection outranks the pointer.** The ring used to be drawn on whatever was
under the mouse, falling back to the selection, which meant the crawler you had
pinned lost their outline the moment you moved the pointer -- and, since they
walk, the moment they left the square you were hovering. Selection now wins.
Hover still rings things you have not pinned anything.

**The view rides the crawler you pick, and lets go when you touch it.** Clicking
or tapping a crawler sets `cam.follow`; the camera's focus is then moved to their
drawn position every frame, so turning and tilting still pivot around them and
the ride glides with the stride instead of hopping a square at a time. Panning by
hand -- drag, arrow keys -- releases them, as does tapping anything that is not a
crawler. `camera.follow` in the sheet turns the whole behaviour off.

Following is done in `Game.render()` rather than in `Game.loop()`. The first
attempt put it in the loop, and the tests all failed identically: the harness
drives frames through `Game.frame()`, which never enters the loop, so the camera
never moved and three tests reported the view staying behind. Putting it in
`render()` -- the one place every path draws through -- means the view keeps up
however the frame was driven, which is also the honest answer to where it
belongs.

## v0.11.0 — the dark, and what you carry into it

The labyrinth is dark now. You can just make out shapes; everything else is
something a crawler brought with them or built.

**Light is worked out per square, not as a glow on the screen.** Each source
floods outward through whatever does not block sight, so a fire lights its room
and the hall leading out of it and stops dead at the rock. Rock catches the light
on the face pointing at the flame and passes none of it on. That is the whole
reason it is done per square rather than as a radial gradient: a gradient would
have lit the room next door straight through the wall, which in a labyrinth is
not a subtlety, it is the game.

A test walks outward from every light in eight directions, finds the first rock,
and fails if the square behind it is lit.

**What throws light is a column in the sheet**, in metres: candle 3, lantern 6,
torch 8, campfire 9. A crawler uses the brightest thing they are carrying, and
the off hand now has three things that can turn up in it rather than one. Add a
row with a light value and it lights the way; a flame part marked `glow` is never
darkened by the room it is lighting, because it *is* the light.

Light is **stepped** rather than smooth, so it reads as painted pools — which is
rule 10's tactility, and also keeps the pattern cache from exploding. Lit things
go warm, because what is doing the lighting is a fire.

**Three balance problems the new scale had hidden, which the dark exposed.**
Moving the numbers to 1–6 quietly made everything too easy: a crawler brings
about 4 and throws 2d6, so any difficulty under 7 can never be failed. Crossing
ordinary stone was 4 and clearing it was 8 — both unfailable, so **nobody
stumbled and nobody learned a thing**. Rule 1 needs failure to be reachable or
the whole progression is dead. Ground and clearing difficulties raised so that
ordinary stone trips you occasionally and rubble is genuinely hard.

That is the standing order working as written: a number so wrong it hides the
mechanic is not a balance question, and it got moved far enough to see the thing
work.

**And one honest weakening of a test.** Whole pips make progress steppy — a
crawler gains nothing for a while and then a whole point at once — so the
block-by-block monotonic check on rule 1 was wrong, not the game. It now asserts
the trend across halves, which is what rule 1 actually claims.

---

## v0.10.0 — low numbers, and dice

Rule 10 arrived nine releases late: **boardgame aesthetics, low numbers, and
tactility**, carried over from the previous project. It was never in the
handover, and asking "do you have my rule about..." is the only reason it
surfaced. Everything numeric has been rescaled to match.

**Attributes run 1 to 6.** Skills 0 to 6. An attempt is now
`attribute + skill + 2d6` against a difficulty of about a dozen — a campfire is
15, crossing rubble is 11, building bare-handed costs you 6. The triangular
noise of ±22 is gone; two six-sided dice give the same bell shape in a form
anybody already knows.

**Whole pips only.** A skill of 5.5 counts as 5 in a roll. Practice still
accumulates in fractions, but it buys the next pip rather than dribbling into
the result, so every roll comes out in whole numbers: *Clambering 5 + 11 = 16
against 11*. The panel shows the last roll exactly that way, and shows skills as
six pips rather than a decimal — which is the tactility half of the rule, not
just the low-numbers half.

**The build now watches the scale.** An attribute range, skill cap, die or dice
count that climbs out of boardgame territory stops the build with rule 10 quoted
at it. The cost of finding this out late is precisely why that guard exists.

**One thing to flag:** gear shifts attributes, so a crawler in a jerkin and
breeches can show Endurance 7. Natural attributes are 1–6; gear can push past
it. Say if that should be clamped instead.

---

## v0.9.0 — crawlers stop being boxes, and everything gets grit

**Parts are lathed now, not boxed.** A figure part is a stack of rings: `sides`
round it, `rings` along it, `bulge` to swell the middle, and `cap_top`/`cap_bot`
to round an end off along a circle. A head domes, a hand is not a brick, a thigh
swells and tapers, a torso pinches at the waist. Four sides and two rings is
exactly the tapered box this replaced, so nothing was lost — there is just
somewhere to go now, and it is all spreadsheet columns.

**A trap worth writing down:** with only two rings and a rounded end, *both*
rings sit inside the cap, both collapse to a point, and the part vanishes
entirely. Nine parts were authored that way and a crawler came out with no
pelvis. The build refuses the combination now.

**Cost, which was the real work.** Rounded parts went from 81 visible faces to
244 and the frame from 6.7 ms to 9.7. Three things brought it back:

- ring and side counts trimmed to what reads at 52 pixels tall;
- faces smaller than `render.min_face_px` are skipped, which on a rounded limb
  is most of them;
- and, for the grain, colour and texture **baked together into cached patterns**
  rather than painted as a second fill per face. The second fill cost 8 ms — half
  the frame. Baking costs one fill again, at the price of stepping the lighting
  so the cache stays small. The banding that costs is not a loss: at this
  resolution it reads as paint.

That left a floor: if every face of a worn part comes out too small to bother
with, the largest is drawn anyway. Rule 4 does not bend for an optimisation. And
small gear — a bone charm, a rope coil — is now drawn deliberately larger than
life, because at 32 pixels to the metre a true-scale knuckle bone is under one
pixel wide and rule 4 will not have that either.

**The grain.** Two seeded tiles, coarse for the ground and fine for crawlers,
laid over everything as an overlay so one tile works on every material. The first
attempt was per-pixel white noise and looked like a dither checkerboard with a
visible repeating grid; what reads as damp and soot is **low-frequency mottling
with sparse hard specks**, which is what it is now. Pinned to the world for the
ground and to the crawler for a crawler, so nothing swims. Side walls of blocks
stay flat — grain there cost a third of the frame and read as almost nothing.

Frame cost with the camp in view: 8.7 ms, of which 1.9 ms is geometry.

**Still open, and asked in the reply:** whether "boardgame aesthetics, low
numbers, tactility" is a rule from the previous project. It was never in the
handover and is not in this project's memory — and it matters, because the
numbers here are not low ones.

---

## v0.8.0 — a silhouette highlight, and an inspector that folds

**The highlight follows the shape now.** Selecting a crawler used to draw a box
round them, because a posed figure has no single flat top to trace. It now
traces the silhouette: the thing's own polygons are painted in the highlight
colour *underneath* it, fattened by a stroke, and then the thing is drawn on top
and covers all of it except the ring that stuck out. Internal edges never show
because they are covered. One pass, any shape — it works identically for a posed
figure, a block of rock and a half-built store, and nothing needed to know which
it was dealing with.

**The popups are called the inspector**, and it is now two things rather than
one that was trying to be both:

- **the tooltip** follows the pointer, gives the name and one line, and cannot
  be clicked;
- **the panel** is pinned by clicking or tapping, stays put, and *can* be
  clicked — which is the whole reason the lists can fold.

The panel opens with the six attributes showing and **skills and gear folded
away** behind clickable headers that carry their counts (`gear 4/12`). Twelve
gear slots unfolded is exactly what had made the old popup bury the game.

**A real bug, found by the tests rather than by looking.** The panel's click
handler had closed over the match that existed when the page loaded. It worked
perfectly in play — the match is never replaced there — but starting a new one
left every fold and the close button quietly wired to a game nobody was playing.
It now reads the current match at click time. Worth noting because it is a class
of bug that only shows up where state is swapped, which is to say only in tests
and only later, in whatever feature first restarts a match mid-session.

---

## v0.7.0 — pause, and four speeds

A pause button and a speed control, to the left of the view controls: pause,
minus, the current speed, plus. Space pauses; comma and full stop change speed.
The buttons switch themselves off at either end and the pause button shows
whether it is on, because a paused game and a broken one otherwise look
identical.

Speeds are **rows in the sheet** — 1×, 2×, 4×, 8× — so a faster one is a new row
and an unused one can be deleted. The build refuses a list whose first row is not
1×, since the first row is what "normal" means, and refuses two rows at the same
multiplier. `time.max_steps_per_frame` caps how far the world may lurch in one
drawn frame, so a slow machine or a backgrounded tab catches up smoothly instead
of jumping.

**Pause does not touch the camera.** The swing and the tilt were already on real
milliseconds rather than game ticks, which turns out to be exactly what this
needed: the view still turns and rises while the world is frozen. A test pauses
the world, swings the view a quarter, and fails if either the swing did not
finish or a single tick went by.

There are now two clocks with the same name, so they are kept apart on purpose:
`Game.paused` is the test freeze, `state.paused` is the player's.

---

## v0.6.1 — time was never supposed to stop

**"game only runs time when scrolling" was a bug report.** It arrived in a list
of five other requests and was read as a sixth. It was not: it was a complaint
that the world appeared to stall. That misreading then got built on purpose,
written into the non-negotiables as rule 11 as though it had been asked for,
defended across two releases, and at one point *measured on an emulated phone* --
where the measurement dutifully confirmed the bug was being reproduced faithfully
and was reported back as the rule working correctly. Nothing caught it except
being asked, directly, "I never made a time rule, did I?".

So: **time runs on its own now**, like any game. The motion gate is gone, the
coast knob with it, and a test sits still, touches nothing, and fails if the camp
has not built itself in the meantime.

**The non-negotiables are theirs again.** Four of the thirteen had been promoted
there out of passing instructions. The list is back to the nine they actually
wrote out as rules, and `CLAUDE.md` now says plainly: an instruction is not a
rule, do not add to that list yourself, ask first. The other three decisions --
the locked pixel scale, the turning camera, the gear hybrid -- moved to a
**Decisions so far** section, still built exactly as they were, but changeable
without anyone announcing that a rule is being broken.

That distinction is not bookkeeping. A rule in that list gets defended; putting
something there that nobody made law is how a bug survives two releases wearing
the author's name.

Written up as lesson 10: a statement of what the game currently DOES is not a
request for it to do that.

---

## v0.6.0 — crawlers become real figures

Posed, lit, three-dimensional people, drawn into the same small buffer as
everything else. Not sprites: the geometry is real and the resolution is not,
which is the whole point.

**The skeleton.** Seventeen bones measured in metres from their parents, in a
space where the crawler faces +Y with +Z up. Every visible part is a **tapered**
box hung off a bone — wider at the shoulder than the waist, narrower at the
wrist than the elbow — and the taper is most of what makes a figure read as a
person rather than a stack of blocks. The build refuses a skeleton with a loop
in it, because a loop hangs the game rather than failing it.

**Real 3D, not a trick.** Corners are transformed by the bone chain, projected,
and then each face is tested against the camera axis and dropped if it faces
away. A convex box shows at most three faces and a test asserts exactly that —
81 faces across 27 parts, which is three each. Lighting is by face normal
against a light fixed in the **world**, not the camera, so the sun does not spin
when the view swings. Parts are depth-sorted along the camera axis.

**Animation is procedural and deliberately split.** The shape of each clip —
walk, work, idle — is code, because it is logic: a knee only folds one way, a
work swing goes up slowly and down fast. Every amount is a knob, so the stride
can be widened or the work slowed from the spreadsheet without touching the
code. Crawlers turn the short way round to face where they are going, rather
than snapping.

**The twelve slots, settled and built.** Head, Neck, Back, Torso, Gloves (elbow
down), Mainhand, Offhand, Belt, Legs, Feet (knees down), Trinket 1, Trinket 2.
A figure row is drawn if its slot is body, or if the item it names is the one
worn in that slot — and there is no other path to the screen. Rule 4 is now
enforced by the build itself: a piece of gear that no row draws stops it, and so
does a slot nothing can fill. A test dresses a crawler in each of the twelve in
turn and fails if any of them does not appear.

**Gear does all three things.** Asked and answered as a hybrid, so:

- it **shifts an attribute** — a pack is +1 Might and −1 Agility, and the cost is
  the point;
- it **bonuses a skill** — boots are +8 Clambering;
- and some work **requires** it — Building without a tool is 30 points harder,
  Labouring 20, which is close to impossible without ever needing a second rule
  that says "you cannot".

All three arrive through `ability()`, so there is still exactly one place in the
game where anything is resolved. A gear row carries its look and its effect on
the same line of the sheet, so the two cannot drift apart. Measured: a crawler
with a tool belt builds at 31; stripped naked, −4.5.

**One thing the screenshot caught that no test would have.** Crawlers were
standing *on* the structure they were building — they pathed to the site square
and worked from it, which drew a figure on top of a half-built store and read as
standing on a crate. They now work from alongside, and turn to face what they
are working on. Nobody builds a fire while standing in it.

**Still not decided:** what happens to gear over time. It does not wear out,
break, get lost or get taken off. Rule 2 says ask.

---

## v0.5.0 — the view turns, and it can be raised

Final Fantasy Tactics' answer to the problem this project kept running into:
things hiding behind their own near walls. Four quarter turns and two angles.

**Turning.** Q and E, or the buttons under the picture, swing the view a quarter
turn. The swing is animated and the camera's **focus** — the point of ground it
keeps in the middle — is held still, so the world turns around whatever you were
looking at rather than sliding out from under you.

Two things had to change underneath. Yaw is now **continuous**, which is what
lets the swing animate at all; it merely settles on multiples of a quarter.
And because of that, painter's order is no longer the order the cells happen to
be stored in — everything visible now goes into one list with its depth along
the view direction and gets sorted. The cutaway had to follow too: which cell is
"behind" another depends entirely on which quarter you are looking from, so
that is recomputed when the view settles rather than every frame.

**Raising the angle.** R, or the middle button. It opens the ground out and
leaves wall heights exactly alone, which is deliberate: rule 10 locks 32 pixels
to the metre, and a true camera pitch would have broken it by making a standing
crawler shorter. Opening the ground instead keeps the rule intact AND does the
job better — from up there the whole floor plan of a room reads at once, and
less than a third as much rock needs fading. A test asserts a metre of height is
still exactly `render.rise` pixels at both angles.

**The swing runs on real milliseconds, not game ticks.** It has to: rule 11
stops game time whenever the view is not moving, and a view that only animates
while it is already moving would never start.

**On the cutaway, again, and the same lesson twice.** Turning the view made the
translucent-rock problem worse in some directions, for the same reason as last
release: the rule is correct and applying it broadly is unusable. Cut to the
immediately adjacent wall only (`render.cutaway_depth` 2 → 1). Worth writing
down as a pattern: an occlusion rule that is right about *what* is in the way is
still wrong about *how much* to do something about it, and only a picture tells
you which.

**Time on a phone.** Rule 11 was working exactly as written — measured on an
emulated handset, a drag bought 22 ticks and then time stopped dead — but with
nothing between drags the game reads as broken rather than paused. Added a short
coast (`time.coast_ticks` 0 → 45, three quarters of a second). That is a knowing
softening of a non-negotiable, it is recorded in rule 11, and setting the knob
back to 0 restores the strict reading.

**The twelve gear slots are settled** and written into `CLAUDE.md`: Head, Neck,
Back, Torso, Gloves, Mainhand, Offhand, Belt, Legs, Feet, Trinket 1, Trinket 2.
Nothing is built against them yet.

**What this release deliberately is not.** The animated 3D figures were asked
for first and are not here. The camera had to come first: a skeleton, its parts
and their shading would all have been built against a fixed viewpoint and then
rebuilt the moment the view could turn. Figures are next, and now they only have
to be got right once.

---

## v0.4.0 — rooms, halls, a camp, and a locked pixel scale

Six decisions arrived at once. Five are in; the sixth is answered below.

**The scale is locked at 32 pixels to the metre, and the picture is pixel
perfect.** Zoom no longer touches the world — it changes how many real screen
pixels one game pixel covers, by a whole number, and the picture is drawn
smaller to match. A crawler is 52 px tall at every zoom. The camera only ever
sits on whole pixels, which is what stops ground shimmering along an edge as the
view slides. A test walks every zoom from 1 to 6 and fails if the camera, the
picture size or the zoom is ever fractional, and another asserts a metre is
exactly `render.rise` pixels before and after zooming.

**Time only runs while the view is moving.** Stop scrolling and the labyrinth
stops with you. That forced one structural change worth recording: the arrow
keys now pan from the loop rather than from inside the simulation, because if
the simulation moved the camera then time would wind itself forward for ever.

**Every skill is one pair of the six attributes, and all fifteen pairs exist.**
Clambering is Might+Agility, Labouring Might+Endurance, Building Might+Intellect,
Studying Intellect+Willpower, and so on. That turns the skill list from
something people keep adding to into a complete grid that can be checked: the
build refuses if a pair is missing, doubled, self-paired, or drawn from anything
but the six. Each is a family of work rather than a single action — Crafting
covers cooking, sewing and mending. **All fifteen names are proposals in the
spreadsheet and are meant to be argued with.**

**Nothing is learned from succeeding.** `learn.gain_on_success` is 0. Failing
teaches 2.2, only just failing teaches 3.6, succeeding teaches nothing, so a
crawler who masters something stops dead until the labyrinth offers something
harder. Rule 1 now has no soft edge at all.

**Rooms and halls.** Solid rock with rooms cut out of it and halls dug between,
across six levels, connected by ramps that climb a metre at a time. Two things
here took real work and are worth not undoing:

A hall takes its elevation from **every room it passes through**, not just from
its two ends. That is why a hall can cross a third room without cutting it in
half — the room is an anchor, not an obstacle. The first version anchored only
the ends, and eight of nine rooms came out sealed off.

And connectivity is now **measured rather than hoped for**. Halls cross each
other and the last one dug wins, so a room can always end up walled in. The
generator floods the place, digs again to whatever is cut off, and finally fills
back in any room it still cannot reach — because a room nobody can walk to is
not a room, it is a rumour, and leaving one in the list would make "every room is
reachable" a hope instead of a fact. Forty seeds, zero rooms cut off.

**The camp.** The crawlers choose the largest room they can *all* reach, walk to
it, clear the ground and put up a fire, four bedrolls, a store and two
windbreaks. Clearing is a Labouring roll against the floor's clearing
difficulty; raising is a Building roll against the structure's. Nobody is told
to do any of it. A structure grows to its real height as it goes up, so how far
the camp has got is something you can see rather than read.

**The see-through fourth wall, and a lesson about "correct but unusable".** Rock
that stands between the camera and a floor behind it goes translucent. The rule
falls straight out of the projection — a column of height H hides the cell k
steps back when H ≥ h + k·(tile_h/rise) — and the first version applied it to
every column that qualified. It was correct and the picture was unusable: most
of the rock in view qualified, and the whole scene turned to milky haze. Fixed
with a depth limit (only the near wall fades) and by halving the height of the
rock. The screenshot is what caught it; no test would have.

**On the Blender human base meshes.** They download fine — 48 MB, one .blend
file holding 24 assets. They are not usable here, for reasons that are about
what they are rather than about getting hold of them, and the argument is in the
reply rather than buried here: they are sculpting clay, not game characters, and
a 52-pixel-tall figure needs a readable silhouette rather than a realistic mesh.

---

## v0.3.0 — the six attributes, and the first people in the labyrinth

Rule 2 was answered: **Might, Agility, Endurance, Presence, Intellect,
Willpower**. That unblocked everything this release, because rule 2 does not
merely ask for six names — it says there is *one* framework and nothing resolves
outside it.

**The framework.** Six attributes feed skills; skills give an ability; one
function, `attempt()`, turns an ability and a difficulty into a result. There is
no second path. A skill declares what it draws on as a weight list in the
spreadsheet (`agility:2,endurance:1`), and the build refuses to build a skill
that draws on a seventh attribute, or on nothing. Practice is worth as much per
point as talent is worth per three, so a dogged crawler eventually beats a gifted
one — which is the point of a game where people come and go.

**Rule 1, built as a consequence rather than a curve.** There is no code
anywhere that slows progress down. Failing teaches 2.2, failing *narrowly*
teaches 3.6, succeeding teaches 0.35. A crawler who has got good at something
fails less often and is therefore taught less often, and that is the whole
slowdown. On seed 12 at difficulty 55 they gain 34.5, then 11.8, then 5.3, then
5.3 per fifteen attempts, while their successes go 3, 13, 15, 15 — and they never
reach the practice ceiling, so the ceiling is not what flattened it.

The test that matters most here is the negative one: hold the success rate at
zero by setting an impossible difficulty, and progress must come out *perfectly
flat* — 22, 22, 22, 22. If a curve had been smuggled in anywhere, that test
fails. It is the only way to prove rule 1's "therefore" is real.

**Crawlers.** Six of them, generated from the seed, standing on ground they could
actually stand on, wandering on their own initiative — the player is a head
coach, and nothing waits to be told. Every step onto difficult ground is a
Clambering roll against that tile's crossing difficulty, so the framework above is
reachable in a real match and not only on a bench. Water and rubble are genuinely
hard; they stumble, and stumbling is how they learn. A test walks 900 ticks and
fails if anyone ever crosses a metre step without a ramp.

**They are visible, and so is what they carry (rule 4).** A crawler is assembled
from rows in a `figure` tab — legs, torso, head, and a hat for those who turn up
with one. A part that is worn is a part that is drawn and there is no other path
to the screen. Hovering one gives an outline and their six attributes, every
skill with the attributes it derives from written beside it, what they are
wearing, and their tags.

**The mistake this release cost, and it is now lesson 9.** The build was
alphabetising the data on its way into the game. Nothing errored. The six
attributes silently came out agility-first instead of might-first, and — worse —
a crawler's *legs were painted over their own head*, so every hat in the game was
invisible. The hat test passed the whole time, because the hat genuinely was in
the draw list; it was simply buried. It took a screenshot to catch, which is
exactly the failure mode the project already knew about from the other direction.
Fixed twice over, because either fix alone would have rotted: the build no longer
re-sorts anything, and the renderer now sorts a figure from the ground up itself,
so no row order can ever bury a hat again. Two new tests hold both ends.

**Deliberately not built:** the camp. Clearing, hauling and building are the next
release and are now cheap, because the framework they hang on exists and is
proven. Adding one is a row in the skills tab and a call to `attempt()`.

---

## v0.2.0 — the labyrinth in three dimensions, and the master sheet

The game got told what it is. Nine rules went into `CLAUDE.md` as the
non-negotiables, and two of them were immediately due: rule 9 (build from a
master spreadsheet) and rule 8 (anything visible can be hovered). Rule 2 — every
roll comes from a skill, every skill from six natural attributes, and **ask
before inventing** — blocks the character framework entirely, so this release
builds everything rule 2 does not gate and stops at the line.

**The master spreadsheet, `docs/crawlers.xlsx`.** Forty-nine settings across five
tabs: tunable numbers, read-only geometry, every piece of wording the player
reads, the tag vocabulary, and the catalogue of ground and walls. The build reads
it, inlines the whole thing into the playable file, and prints a receipt of every
value it moved. A key that exists in only one of the sheet and the code stops the
build, in both directions — a dial connected to nothing and a number nobody can
reach are the same failure. Geometry is recorded, never tuned: editing it stops
the build on purpose, because one tile being one square metre is rule 7, not a
setting.

The reconciler self-checks before every test run, nine ways, including that it
really does catch a missing key in each direction. A broken ruler is worse than
no ruler — and it earned that: the run is also covered end to end by a test that
changes a number in a copy of the real spreadsheet, rebuilds, and asserts the
picture on screen came out the new size. That test is the only proof that rule 9
is true rather than merely intended.

**The world.** A 28×28 metre chunk with elevation up to six metres, drawn as real
projected blocks — top face and two shaded walls — into a 480×270 buffer that is
then blown up with hard pixel edges. That is the whole trick behind 3D that reads
as sprite work: the geometry is real, the resolution is not. Painter's order for
a heightfield is simply back to front, and a test asserts the blocks came out in
that order rather than trusting that they did.

Ramps climb exactly one metre and are placed last, because a ramp is a
relationship between two cells and not a property of one. A test walks every ramp
on seed 1 and fails if any of them climbs to nowhere.

**The inspector (rule 8).** Hovering or tapping anything gives it an outline and
a panel with its name, its elevation in metres, its footing and its tags. It is
built on a pick pass — the same scene painted flat in identity colours, one pixel
of which is read under the pointer. That is more work than inverting the
projection by hand, and it is the only honest way to answer "what can the player
actually SEE", because it gets elevation, ramps and overlap right for free.

The description and the panel are deliberately separate: `describe()` returns
data, `render()` puts it on the page, and the test asserts **both**. A perfect
description that never reaches the screen is the same failure as an overlay
nothing draws — which cost three versions in the previous project.

Blocks standing between the camera and whatever is being inspected fade out. That
is the see-through fourth wall, and it is a knob in the sheet, not a law.

**What this is not.** The terrain generator is a placeholder: varied ground for
the view and the inspector to work against, not the ever-shifting branching
labyrinth of rule 5. And the renderer paints blocks with a 2D painter — the world
model underneath (metre cells, elevation, corner heights, tags) is what survives
when the picture is upgraded, and none of it has to change when it is.

**Deliberately not built:** characters, creatures, skills, rolls. Rule 2 says ask,
with suggestions, and wait. The six attributes have been asked for.

---

## v0.1.0 — the machinery, and the smallest thing that runs

Session one. There is no game yet — what the game *is* has not been decided, and
guessing it here would be exactly the mistake the handover warns against
("do not build a tool that generates content they should be choosing"). So this
release builds the plumbing instead, which is cheap now and expensive to retrofit.

**One command, one playable file.** `python3 build.py` inlines the code and the
styling into a single self-contained HTML file with no engine, no framework and
nothing fetched at runtime. It writes the standalone file (playable from disk on
a phone) and the fragment that gets published, from the same source. It also
refuses to quietly overwrite a build of the same version whose content changed —
that is lesson 5 from the previous project made into a guard, after three
sessions were lost A/B-ing a change against a "baseline" that had already been
overwritten by a build of the change itself.

**A fixed-timestep, seeded simulation.** The simulation only ever advances in
whole 1/60s steps and never touches `Math.random` — every match runs from a
named seed. This is lesson 4 ("a number without its seeds is not a number") built
into the foundation rather than bolted on once numbers start mattering.

**The test harness, and seven tests using it.** `window.__test` exposes the
game's state and lets a test seed a match, hold an input, step the simulation and
read what reached the renderer. Two details matter more than the tests themselves:

- `Render.draw()` records `consumed` — what actually reached the canvas — and
  tests assert against that, never against the batch that was built. In the
  previous project three overlays were computed perfectly every frame into caches
  nothing read: no error, no cost, three missing pictures, three versions.
- The harness self-checks on every run, and the runner refuses to trust a single
  game assertion until that passes. A broken ruler is worse than no ruler.

**The placeholder.** One shape on a bounded field, moved with the arrow keys,
WASD, or a drag. It is not a design decision and will be deleted whole. It exists
so that the pipeline — build, test, publish, play on a phone — is proven end to
end before any real mechanic is laid on top of it.

**Not built yet, deliberately:** the balance spreadsheet. It earns its place the
first time a number matters to more than one thing, and right now no number does.
