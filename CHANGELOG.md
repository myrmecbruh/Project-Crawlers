# Project Crawlers — changelog

**The permanent playable link: https://myrmecbruh.github.io/Project-Crawlers/**

`python3 publish.py` builds the game and puts it there. The address never changes,
so the link the person holds always works. A new address would silently strand
them on an old build.

---

## v0.45.0 — the inside of a wall is not painted, and the strips that fill the cut stay

Their words: **"make the interior faces of walls transparent (backface culling?)"**,
and when offered the two ways it could go, **"i want backface culling applied."**

v0.44.0 closed with the note that a rock block has never had a back-face cull:
its near faces are chosen by screen order and its **own far faces are painted
anyway**, as the strips this file calls `backBands`. So the request was not asking
for a cull nobody had written; it was pointing at the thing that *was* painting
the inside of the rock, and the first job was to find out what those strips are
actually for. **They are for the cut-away and nothing else.**

**The strips are what a downward camera sees instead of the inside of a block.**
A square's top diamond has a far half whose only possible cover is the block
standing behind it, whose own near wall rises out of the shared edge and reaches
as high as it is tall. It stops reaching where the cut has drawn the block behind
SHORT (`drawnM`) or taken it away altogether (`cutOut`) -- and there the far half
is bare backdrop, the black wedge at the back of a wall and along the top of a
step. The strip is that far half, painted as rock. **And the cut is the only thing
in the renderer that ever draws anything short:** at `cut_solid` 1 `drawnM` is
every square's own height and `cutOut` refuses everything, so the block behind
always covers the strip by itself and the strip fills nothing.

**Measured both ways inside one build, then, which is what settled it**
(`files/probe-backcull.mjs`: three seeds, five dragged camera positions, both
angles, all four quarters, the world given its 2,000 frames first, **120 views**,
534x348, all four arms one instant, 120 of 120 distinct pictures):

| | strips painted | pixels of rock they paint | bare backdrop | of it enclosed | views with a hole |
|---|---|---|---|---|---|
| shipped look, strips on (v0.44.0) | 4,313 | 8,276,992 | 18 px | 15 px | 6 of 120 |
| shipped look, strips off (v0.45.0) | **0** | **0** | 18 px | 15 px | 6 of 120 |
| cut-away, strips on | 3,791 | 9,646,080 | 648 px | 633 px | 36 of 120 |
| cut-away, strips off | **0** | **0** | 1,617 px | 1,577 px | 39 of 120 |

**The first two rows are the same picture to the last pixel** -- identical bare
backdrop, identical enclosed count, the same 6 views with the same worst hole of
3 pixels -- while **a sixth of the frame stops being repainted**. That is the
whole of the cull they asked for, and it opens **nothing**: the strips at the
shipped setting were painting over the block's own back faces, and what the camera
sees where they go is the rock behind, which is what a camera looking down a wall
from above is supposed to see. **The last two rows are why they are not simply
deleted**: in the cut-away the place a strip fills is a place with nothing in it,
and refusing them there adds **969 pixels of bare backdrop in 494 separate
places**, 944 of them enclosed by rock, and takes the worst view from 82 pixels of
hole to 161.

**So the strips are a GATE and not a deletion.** A new code flag beside
`backBands`, `Render.backBandsSolid` (false, and false is what ships), and one
line in `backBand()`: the strip is refused when `cut_solid` is above zero and the
flag is off. With the flag on they come back exactly as v0.44.0 painted them --
which is how the cull is proved against the picture it replaced rather than
argued at, inside one build with no rebuild between the arms. It is a **code
flag and not a sheet dial** on purpose: it is not a feel decision, it is the
consequence of whether the cut is in use, and `backBands` itself has sat beside
it as a code flag all along. `render.cut_solid` stays the dial, and the two looks
it switches between both now paint what they should.

**The old number this release had to throw away.** The block above the strips
quoted **48,197 pixels of bare far half over 240 views, against 16,952 for the
picture that still had lids on everything** -- the measurement that justified
adding the strips in the first place. It was taken with the cut in use, which is
the look that shipped then. At the setting the game uses now it is **0**, and a
strip painted there shuts no hole at all. A number is only true of the build and
the look it was measured on, and that one had gone on being quoted after its look
had gone.

**The mistake in this release was in the test, and it was a claim that could
never be true.** The first version of the new suite test asserted the picture was
**unchanged** (`moved === 0`) by refusing the strips -- the shape of claim v0.44.0
had used to justify keeping the dial where it was. It cannot hold: the strips
really are pixels, refusing them really does paint something else there, and a
test that demands zero change against a change that happens is a test that will
be red forever. What is actually true, and now what is asserted, is the thing that
matters: **the same see-through pixels, and nothing newly or no longer see-through.**

**One test, four arms, 24 cases** (`seeds 1, 2, 7 × both angles × all four quarter
turns`, half of them dragged, the world given 2,000 frames first, buffer
624x368 -- **5,511,168 pixels looked at twice**): the v0.44.0 look, the shipped
look, and the cut-away with and without the strips. Asserted: the control arm
really paints them (**1,086 strips, 1,955,840 pixels -- 35.5% of the frame**);
the shipped arm paints **0 strips and 0 strip pixels**; the see-through set is
**identical in all 24 views** (`voidDiff === 0`) and so are the enclosed and wide
counts; the picture really does move -- **782,936 pixels, 14.2% of the frame, in
all 24 views**, worst single pixel 131/255 -- and every one of them is accounted
for by a strip that was painted there, since the moved count must stay under twice
the strips' own area plus 64 pixels a view for the antialiased seam (lesson 17),
and exactly zero where a view painted no strip; the cut-away **keeps** them, and
refusing them there turns three more views into views with a hole (1 -> 4) and
grows the enclosed pixels more than half again (2,134 -> 3,973, in patches three
across or wider 236 -> 382); and a 20x20 punched hole in the picture is still
seen by the detector, so a census of zero means zero and not a broken ruler
(lessons 2, 19).

**What a person will see:** looking down at a wall from behind it, the inside of
the rock is gone and the rock behind the wall shows through instead -- the same
stone, very slightly lighter where the old near-black slab used to be. Nothing
opens up, no hole appears anywhere, and the walls still look like walls from the
side the game is played from. The strips are still there in the cut-away look, so
if the rock in the way is ever cut away again that look still works.

---

## v0.44.0 — the rock in front of you is rock again

Their words, in the chat before this one: **"enable backface culling"**, and then
**"give me the latest build"**. What they were looking at was the fourth wall --
the near side of the rock standing between the camera and the crawler, which this
renderer has cut away since v0.34.0 so the room stays legible. Asked for that and
given the build, the previous session flipped the dial **inside the open browser
page only** and reported it as done: `CFG.cutSolid = 1` on the live page, no file
written, no build, nothing they could keep. The order arrived here as a build with
no change in it.

**One number, and it was already a dial.** `render.cut_solid` (the `knobs` tab)
went 0 → 1 in both the sheet and `src/defaults.json`. Nothing in the renderer
moved. `stumpOf()` already answered "no foot" above zero, `cutOut()` already
refused to hide anything at or above zero, and `alphas()` already read the dial as
the alpha of a cut square -- so the whole of this release is one value, and the
machinery it drives stays exactly where it was, tests and all. `cell.cutaway`
still marks the same squares (`markCutaway`, `10-state.js`), so the light, the
sight rule, the pointer and the camp go on seeing the world they saw.

**What it costs, measured before it was committed to.** `files/probe-cutlook.mjs`,
seeds 1, 7, 777 and 2, the view settled: **the floor on screen falls from 38.3% of
the canvas to 26.5%** (seed 1), 54.2% → 48.8% (777), 53.1% → 35.2% (7). The
crawlers are the surprise: **399 of 13,885 of their own pixels were covered before
and 2,599 are covered now -- 2.9% up to 18.7%**, worst single crawler 29% → 96%,
and on two of the four seeds one crawler is 86-96% hidden by the rock between them
and the camera. A crawler behind a tall wall is now genuinely behind it.

**The clip does not get the saving back.** `files/probe-cutclip.mjs` runs the
suite's own nine cases at 1160x780 with both dial values inside ONE build: rock
**solid** 5,876 → 3,820 faces painted (65.0%), 26,917,888 → 9,287,680 pixels
(34.5%), 2,056 wall faces buried by the rock next door; rock **cut away** 5,690 →
3,686 faces (64.8%), 24,108,032 → 8,939,520 pixels (37.1%), 2,004 buried. Solid
rock paints **186 more faces and 348,160 MORE pixels** than the cut look, because
a square the cut used to throw away now paints its own faces and its own top. The
clip is still worth having -- it takes a wall out in 8 of the 9 cases, and with
`wallFade` off, 9 of 9 -- but this look is the more expensive of the two, and it
is the more expensive one on purpose.

**The tests were reworked, not switched off, because the machinery they cover is
still here and a hidden feature rots.** Three looks are now exercised inside one
build, since the dial can be moved at run time and a change that hides a rule is
no reason to stop checking the rule:
- the census and the `nothing you point at or select is ever drawn see-through`
  pair assert the shipped look (`cutSolid` 1: nothing is hidden, nothing is left
  behind), and the census additionally builds a small **`cutSolid = 0`** battery --
  seeds 1 and 7, two tilts, two turns -- so the cut look is still photographed;
- `a block the cut has cut away is not the block that was there` runs three arms
  per case, `ship` / `gap` / `bare`: the shipped look may leave nothing out **and**
  keep no foot; the foot look must leave nothing out either and must keep a foot;
- `nothing the picture left out can be picked` walks three looks over 24 pictures
  and the whole pointer: shipped (nothing left out), the dial down with the foot on
  (**0 squares left out**, and the feet are the ones named), and the v0.37.0 look
  (`> 0` left out, which is the claim the test was written for).

**And the mistake this fixed was in a test, and it was not the picker.** That last
test had gone red on v0.43.0 and stayed red, and the reason was that its premise
had been taken out of the game by the uncommitted work: with `cut_solid` 0 and
`cut_stump_m` 1 **every** cut square keeps a one-metre foot, so there is nothing
invisible left in the world to be picked wrongly, and the set of "squares the
picture left out" was empty **by construction** -- the test was asserting a claim
about a look that had stopped existing. Under the shipped look the same claim is
true for a different reason (nothing is hidden at all), and the look it was written
for is now built on purpose, one dial move away, inside the test.

**One control in the wall-hole test was measuring the wrong thing.** `cutting the
buried walls opens no hole and moves a hairline only` guarded itself by demanding
the clip paint strictly fewer faces **and** fewer pixels than the clip switched
off. On seed 3 with the fade off it paints the same **336 faces** both ways and
427,008 pixels against 692,224 -- a clip that is plainly working, rejected for
having the same face count. The guard is now **faces or pixels**, with the arm-wide
liveness check (`>= 8 px` was taken away, `> 500` cut faces, `> 4,000,000` cut
pixels) standing behind it.

**The black notches are gone, and not by being fixed.** `files/mark-holes.mjs`,
the flood census, run at the shipped look -- seeds 1, 2 and 3, five pans, both
tilts, four turns, **120 views**, 534x348: **180 void pixels and 18 hole pixels in
total, 6 views of 120 with any hole at all, the worst single view 8 px.** v0.42.0
left 3,472 px in 30 of its 48 views and v0.43.0 cut that to 264 px in 15 of 48;
this look simply does not cut the buried walls, so the seam the notch lived in is
not there to be seen through. That is a consequence of the look, not a repair of
it -- and the counts are not comparable view for view, because the census grid
grew from 48 views to 120.

**What was asked for and then taken back.** Part-way through, the order "disable
backface culling, if I didn't tell you to yet" arrived, and then **"sorry forget
the new order about backface culling. finish what you were doing"**. No backface
culling was changed anywhere, and this release is only the rock. For the record
the only two culls in the renderer are `structure3d()` and `figure3d()`, and a rock
block has never had one: a block's near faces are chosen by screen order and its
own far faces are painted as `backBands`.

---

## v0.43.0 — the last of the black notches: a square the cut has cut keeps its top

Their words, twice, pointing the cursor at it: **"there are still some 'holes'
created by hiding entire corner wall blocks"**, and then the same black notches at
the corners of the walls. v0.40.0 cut most of them away; what was left was the one
case where **the only surface that could cover a bare strip was the square's own
top face, and the renderer had been told not to paint it.**

**A square the cut has cut down to a foot of rock is not a wall.** `capShown()` is
the single question four things ask -- the picture, `backBand()`, the face clip and
the halo round a selected thing -- and its answer for a wall was always "a wall's
top is not painted", because something is meant to be standing in front of it. On
a cut-down square there is **nothing** standing in front of the near half of its
own diamond: the block behind it is level with the foot at best and `backBand()`
refuses at level, and its own faces stop at the foot. So the near half of its top
diamond was bare backdrop -- the notch, **124 pixels** in the view it was reported in.

The fix is **one clause in `capShown()`** -- the ITEM branch's `|| it.stumped
=== true`, plus **`|| stub > 0` in `build()`'s `lid`** -- and the second is not
tidiness: `lid` is what decides whether the far-fill bands paint at all, and a
square that paints its own top has nothing left for them to fill. **No new paint
code**: a block's top already goes to the flat-rock arm, so the cut square's top
comes out as the raw cross-section of the rock in the block's own side colour,
counted as a body and no longer as a lid.

**The obvious second half of that clause was built, measured, and thrown away.**
A square whose top is painted covers the stagger between itself and the wall face
standing in front of it, so if a stump also answered "my top is painted" when the
NEIGHBOUR asks, `cutMeet()` could cut that face a metre and a half deeper than it
otherwise would. It buys nothing and costs paint: over the same 48 views, one build
each way (`files/probe-cutmeet.mjs`), the deeper cut painted **8,504 wall
pixel-faces** where the plain answer painted **9,175**, and the bare backdrop was
**225 pixels against 211** -- one view apart, one seam's worth either way, no notch
in either. Cutting a face deeper than the last look cut it, for nothing, is the one
direction this renderer calls unsafe, so the cell branch of `capShown()` answers
about a stump exactly as it answered in v0.42.0.

**Measured, this build against v0.42.0 with one instrument and the same 48 views**
(`files/mark-holes.mjs`, the flood census -- a pixel is a hole when the backdrop
shows through and the flood from the border cannot reach it; the same command, the
same worlds, run against each build):

| | hole pixels | views | worst single hole | worst view | the view it was pointed at |
|---|---|---|---|---|---|
| v0.42.0 | 3,472 | 30 of 48 | 124 px | 372 px | 248 px, biggest notch 124 px |
| **v0.43.0** | **264** | **15 of 48** | **1 px** | **29 px** | **0 px** |

**Every one of the 15 views that changed is a raised view** -- seed 2 and seed 3 do
not have a single bare pixel left in any of their 32 views, and seed 1's sixteen
views are pixel for pixel what they were in v0.42.0. That last view in the table is
`seed 2, pan 0,0, raised`: **two bare patches, the bigger 124 pixels in a row 12
wide and 20 tall, now nothing at all.** What is left anywhere in the world is a
lone pixel: 29 of them in the worst view, each with **paint on all eight sides**.

The counters move exactly as the design says they should, which is the proof the
fix is the intended one and not a coincidence: **tops not painted 15 → 14**, wall
faces 59 → 58, rock slabs 0 → 1 -- one square stopped being a lid and started being
rock.

**`files/hole-diff.mjs` is new, and it is what makes "strictly better" sayable.**
The census says how many bare pixels a picture has; this says *which* ones. It
sweeps two builds over the same worlds and views and reports every view whose set of
bare-in-the-world pixels changed, with each departing pixel explained. **48 views:
36 identical pixel for pixel, 12 changed, 2,730 bare pixels gone, and not one
arrived** -- every patch that went was a patch of more than 64 pixels, so the
change removed the notches and touched nothing small.

**The test that was supposed to be guarding this claim was measuring nothing, and
is re-founded.** Test 4, "cutting the buried walls opens no hole and moves a
hairline only", counted a hole with `Render.pickAt() < 0` -- the pointer finding
nothing at all under a pixel -- and that is **unreachable**: 0 of 14,352 sky
samples across six cameras, so a count of zero from it meant nothing
(`files/probe-sky.mjs`). The "hairline" it also counted is **identical in v0.42.0
and v0.43.0 on all eleven of its cameras** (`files/probe-seams.mjs`), so it was
never this change's to begin with. A hole is now **a patch you could see through**
-- a region of bare backdrop holding a full 3x3 square of it -- measured on a
**settled** world (`t.advance(2000)`: step the world, then lift the fetch budget
and repaint, which is bit-for-bit what letting the game run 2,000 frames gives and
takes a tenth of a second instead of a minute -- `files/probe-settlefast.mjs`). On
settled worlds **no 3x3 window exists anywhere in any of the nine cameras** and the
biggest leftover patch is 19 px of one-pixel speckle; the control, a wall with a
deliberate gap in it, still has to show 380 px and a window, so a zero can only
come from a picture that could have failed. The movement bound tightened from 12%
of the picture to 6%.

**v0.42.0 never existed as a build**, so the rest of the wall job lands here with
it: the lids stay off (`wallCaps` false), a block paints a **strip along its own
far edge** (`backBand()`, replacing `wallLips`/`lipQuad`, which are gone), the face
clip asks `cutMeet(nbr, mine, stepM)` -- keeping a **depth step** more than the
meeting and **a metre more than that**, because the top metre of the neighbour is
dissolved upward to nothing and what shows through it has to be rock, not backdrop
-- and `wallBody` stays false. `cutMeet()`'s two controls, `--fade=0` and
`--backbands=0`, are both in `files/probe-voids.mjs`.

**And the instrument had one trap, which cost a whole run.** The explanation for an
arriving pixel has to be gathered **while that pixel's own view is on the screen**.
Asked for after the sweep, it describes whatever view the sweep finished on -- so
the first version of `hole-diff.mjs` confidently explained nine pixels using
squares from a different picture, and the answer looked convincing.

---

## v0.41.0 — a gradient is not a texture, and the ruler that had been lying about the walls

Their words, three defects at once, with a screenshot:

> "1. where the wall begins to fade to transparent, the texture stops. texture
> should continue up the wall and merely become transparent until invisible.
> 2. you are still rendering the backs & sides of walls that the characters can
> never see - by-in-large, only wall block sides facing into the room/hall (from
> the top of the screen) should be visible. 3. there are still some 'holes'
> created by hiding entire corner wall blocks (I'm pointing to one with the
> cursor in the attached screenshot)"

The look was finished in v0.40.0. What was left was that **nobody could tell**,
because the harness's own self-check had been refusing to run the suite since
v0.37.0:

    self-check (v0.37.0) FAIL  pointing at a block finds that block -- wanted 3101, got -1

and every log in `files/` from `suite-0370.log` to `suite-0380a.log` carries that
same red line. **v0.41.0 is the first build since v0.36.0 whose self-check
passes**, and that is the whole of why the suite had not been believed.

**The ruler was wrong, not the game.** `files/probe-pickwhy.mjs` asked the
self-check's own question one step at a time and found it: the check took a pixel
from the CENTRE of a block's square and then asked the picker about **`it.aim`**
— the point on the block's face the picker actually tests when a wall is tall —
about **77 pixels further down a four-metre wall face**. Nothing was wrong with
the answer; the question was about a pixel that was never the block's. The check
now requires `it.aim` to land at least **8 pixels inside** `Render.w`/`Render.h`
before it asks, so the pixel it asks about is a pixel the picture painted. That
one line is the difference between a suite that runs and a suite that cannot.

**And the census had been misreading the fade as a texture.** `fillKinds()` in
`99-test.js` sorts every fill in a frame into `plain`, `pattern` and `other`, by
looking at whether `fillStyle` is a string. The dissolve at the top of a wall is
painted with `fadeBand()`, which uses **`ctx.createLinearGradient`** — an object,
not a string — so every faded side was landing in the SAME bucket as the
materials, and the count of "textured faces" was inflated by exactly the number
of walls. `files/probe-census.mjs` showed it: **`other` always equalled
`faded`**, one non-string fill per faded side, every time, in every arm. The
census now has four named doors (`Render.ground`, `Render.wall`, `Render.wallBand`
and `fadeBand` wrapped so its gradient is attributed to walls) and a **`band`**
bucket of its own, so a graded fill can never be counted as stonework again.
**A gradient is not a texture.**

**Three of the four red tests were the same mistake in different clothes: an
identity written for an old look, asserted against a new one.** The material test
claimed `pattern === cells + walls` — true when every wall was plain-coloured and
the ground was the only texture, false the moment a wall carried material. The
census test claimed a cut-away face must be *kept* or *lost*, which cannot happen
when the block in front is a **foot of rock one metre tall**: the face is simply
shorter than the thing behind it, and `kept`/`lost` are legitimately **0 and 0**.
The clip test cached `w`/`h` from before a `t.zoom()` call — and **a zoom change
resizes the buffer**, so it was comparing 69,140 pixels of one picture against
30,078 of another. All three now assert an identity **derived from what the frame
measured**:

    ground door  === cells − body − capsOff
    wall   door  === walls + banded
    pattern door === ground door + wall door
    kept === 0 && lost === 0, and bare.lost === 0

which the census confirms in every arm: `other` is **0** everywhere now, and
`wall === walls + banded` (324 = 162 + 162 with the material on; 0 with
`mappedWalls(false)`, where the `banded` half moves to `plain`).

**Targeted: 20 of 20 pass** — `--only="wall,rock,hole,buried,cut away,material,
texture"`, the set that covers the three defects and the fade. The full 97-test
suite runs on this build (`files/suite-0410a.log`), the first full run since
v0.36.0.

---

## v0.40.0 — the clip trusted the world's height where it should have trusted what the coverer PAINTS

This is the fix for defect 3 — the corner holes — and it was one line in the
wrong place.

**A wall's face is cut short against the wall next door** (v0.18.0's clip):
`clipFaces()` compares the face's own height with the neighbour's and clears the
overlap. The neighbour's height was read as **`nbr.h` — how tall the world says
the neighbour is.** Ever since the tops of blocks began to be deleted and a
hidden block was reduced to a **foot of rock**, those are two different numbers:
a hidden block's `h` is six metres and the number of metres it actually
**paints** is one. So a six-metre face was cleared over five metres that nothing
painted — a bare strip of backdrop, exactly where two hidden blocks met, which is
to say at the corners. `pickAt` skipped it too, because nothing was painted there.

The fix is a name for "how much of this block reaches the picture", and the clip
asking for it of the neighbour:

    drawnM(cell)  →  the world height, or the foot of rock, or 0 if it paints none

`clipFaces()` and `sideShown()` both ask `Math.min(mine, drawnM(nbr))` now, and
`build()` files each block with `wallM: this.drawnM(cell)`. Zero is a height too:
a square that paints nothing hands back 0, so nothing is ever cleared for it.

**Proved a no-op where it should be one, and a fix where it should be one**
(`files/probe-voids.mjs`, the live-canvas flood — a pixel is a hole when the
backdrop shows and the flood from the border cannot reach it). Fixed protocol:
buffer 518×316, seeds 1 and 3, 80 views each way.

| build | foot of rock | void pixels | hole pixels | worst single region |
|---|---|---|---|---|
| v0.39.0 | off | 41,251 | 29,439 | — |
| **v0.40.0** | off | **41,251** | **29,439** | — |
| v0.39.0 | 1 m | 36,239 | 31,825 | 1,952 px |
| **v0.40.0** | 1 m | **4,740** | **4,660** | **7 px** |

The two `off` rows are identical to the pixel: with the foot switched off, a
hidden block has nothing drawn, so the clip has nothing to misread, and the
change **cannot** touch that picture. That is lesson 21, and it is why the third
and fourth rows mean anything: **31,825 hole pixels → 4,660**, and the worst
single hole in the world goes from a **1,952-pixel gash to a 7-pixel speck**.
What is left is 207 specks across 80 views, 1 to 8 pixels each — the hairline
where two cut faces meet at a corner, which is the same class of seam the v0.18.0
clip has always left and which **cannot** be zero for a renderer that antialiases
(lesson 17).

A test holds the promise now: **"rock in the way is cut away, and nothing is ever
drawn see-through (v0.34.0)"** asserts `kept === 0 && lost === 0` on the shipped
look, with a message naming the foot of rock as what closes the hole, plus a
`bare.lost === 0` arm for the control.

---

## v0.39.0 — a hidden block keeps a foot of rock, so there is nothing to see through

Two attempts failed before this one, and the way they failed is the interesting
part:

* **v0.38.0 painted the block's own stonework onto the square where its top used
  to be** ("rock" in `files/probe-voids.mjs`'s `--body` arm). It covers the square
  from directly above and does nothing for a wall seen from the side — and at the
  corners, where the missing block is seen edge-on, the hole was still there.
* Leaving the strip out entirely (`--lips=0`) is worse than the bug: **532,908
  pixels, 35.85% of the picture**, a lattice. And putting the lids back
  (`--caps`, the v0.35.0 look) all but closes them — **849 px, 0.06%** — which is
  the negative control that proved the holes came from deleting the tops in the
  first place.

**The answer was not to paint the missing top. It was to leave a foot of the
block standing** — `render.cut_stump_m`, default 1 m, a `knobs` row in
`docs/crawlers.xlsx` (rule 9). A block that is "cut away" is no longer deleted;
it keeps its **bottom metre**, which is exactly the part a person looks through
when they are standing beside it, and it fills the square the corner hole used to
be. `stumpOf(cell)`, a clamped `top[]`, a `stumps` counter, and `alphas()`
handing a stumped square **1** rather than the nothing-on-its-way to absent — the
trimmer at the top of a wall only had to be told which side of it the foot is on.

Honest cost, and it is in the code comments: **the bottom metre of anything
standing directly behind a hidden block is covered.** That is the trade for the
hole, and the census says it is the right way round — v0.39.0 with the foot on
took the raw void count from 41,251 to 36,239 but left the hole count *worse*
(31,825 against 29,439), because a one-metre foot covers a hole's square and
opens a smaller one beside it. It took v0.40.0's clip fix to make the foot pay.

---

## v0.37.0 — the stonework runs on up the wall and merely dissolves

*"make the top meter of all visible walls gradient fade to complete transparency"*.
Two pieces:

* **`wallFade`** — the top metre of a visible wall is painted with `fadeBand()`, a
  `createLinearGradient` from the wall's colour to fully transparent, drawn over
  the **same mapped material** as the rest of the face. That is deliberate: the
  first cut of this put the fade on as a flat colour, and the user caught it
  immediately — *"where the wall begins to fade to transparent, the texture
  stops. texture should continue up the wall and merely become transparent until
  invisible."* The material now runs the whole height and only its **alpha**
  changes; `paintSide()` returns 2 for a band that carries material, and the
  `banded` counter in the census is how that stays true.
* **`wallLips`** — a strip of face at the top edge of a block, so a wall whose
  neighbour has been cut away does not lose its own outline (`lipShown()`,
  `lipQuad()`).

**`wallCaps: false`** is the thing that started all of this: the flat stone lid on
top of every column of rock is not drawn at all, because the top of a block is
the one face the camera never needs — it is the same colour as the rock below it
and it is what was hiding the rooms. It is also what opened the holes, and the
next three versions are the account of closing them.

**And a wall buried in the rock next door is not painted**: the v0.18.0 clip,
with its 786 → 164 faces and 5.92 → 4.38 ms.

---

## v0.36.0 — the walls stop showing their faces, and the six looks that were offered

The build where the wall look was decided. Their words:

> "these partially transparent walls everywhere look terrible. give me 6 options
> for alternatives"

Six looks were built as real code paths behind one switch, and **photographed
side by side into `files/look-sheet.png`** — because a list of nouns is not
something anybody can choose from. They picked **the plainest one: the near rock
cut away completely and nothing there.** The other five (a low wall; an outline;
a checkerboard ghost; slats; only-when-pointed-at) were removed from the build
rather than left switched off, because a look nobody chose is a look that comes
back by accident.

That look is what opened the corner holes, and the four versions above this one
are the account of closing them. It also cost the harness its self-check: **every
suite log from `suite-0370.log` to `suite-0380a.log` fails at the gate**, which is
why the first full run of the 97 tests lands at v0.41.0.

---

## The versions with no entry: v0.26.0 – v0.29.0, v0.31.0 – v0.33.2

These shipped, and they are **not** described here, and the honest reason is that
the sessions that built them did not write them down — which is exactly the
failure this file exists to prevent. What is recoverable from the tests and the
roadmap, in one line each, is all that should be claimed for them:

* **v0.29.0** — creatures stop playing their walk cycle while standing still, and
  get an idle instead (*"creatures should have an idle animation when they are
  standing still - they play their walk animation even when they are standing
  still"*).
* **v0.31.0** — the pictures dropped into `textures/` stop being laid out as a
  mosaic and are chosen per square at random (*"I didn't want you to make a mosaic
  with them. use them randomly."*); more than one folder of pictures.
* **v0.32.0** — a stone floor's material stops stretching: a flat floor and a ramp
  were sharing one cached pattern, and a ramp is mapped from its own corners.
* **v0.33.0 / v0.33.2** — slopes: 145 ramps leaning inward at a rock they could
  not reach were repaired, then narrowed to the **27 that face rock**, because
  their answer to the first cut was **"I don't mind slopes leading up to walls.
  happens in caves and rubble all the time."** The rooms got their own shape back
  in the same release.

Lesson 4 applies to every line in this section: **a number without its seeds is
not a number**, and nor is a release without its reasoning.

---

## v0.35.0 — the rock is as tall as the ground it stands in, so most walls are two metres

Their words:

> "we should not see the top of wall blocks, right? also make most walls 2m tall
> instead of the current 3m to cut down on this issue. perhaps only taller walls
> in big dramatic set piece areas."

They were right about the heights, and the reason was blunter than it looked.
**Every column of rock in the labyrinth stood at the same height — one plateau at
`world.max_elevation + world.rock_height`, seven metres — wherever it was.** The
floor under a room could be at nothing or at five metres and the rock beside it
was seven either way. Measured before anything was touched
(`files/probe-rockh.mjs`, seeds 1, 3, 7, 23, 777, each a live world of 9 pieces /
28,224 squares): of the **27,165** columns of rock that touch a floor at all,
**4,479 of them stood exactly two metres above it — 16.5%** — and nearly all the
rest stood higher, because the rock was not built to the ground at all: it was
**one plateau, 77,804 of 78,063 columns up at seven metres**, wherever it was. A
floor at nothing beside a seven-metre plateau is a seven-metre wall.

**Now a column of rock is brought down to stand two metres above the ground it
stands in** (`lowerRockTops` in `12-world.js`). Every square a crawler can stand
on is a source; a flood works outward from all of them at once and each column of
rock takes the level of the NEAREST one, so rock beside a room is a two-metre wall
and rock further away from any floor — the mass of it, the stuff between rooms —
is taller, rising away from the ground like a hillside rather than standing on
stilts. Measured both ways in ONE build (lesson 21), same five seeds: **24,771 of
27,165 columns that touch a floor, 91.2%, now stand exactly two metres above it**,
and the rock left up at the old plateau falls from **77,804 of 78,063 columns to
13,851**.

**Two things make it safe where it runs, and neither is a guess.** It runs LAST —
after the halls, the walls, the doorways and the ramps, just before the piece is
moved to its address — and it may only touch a column of rock. A column of rock is
not a square anybody can stand on, so no rule above it can have depended on how
tall it was, and **nothing walkable moves by a millimetre: 0 squares of 34,833
changed height, tile, room or the way they lean**, over 8 worlds built both ways in
one build, with **64,036 columns of rock brought down and 251 built up**. The
second is the plateau itself: a column is never made TALLER than seven metres,
because two bounds in the renderer — how far the picture reaches (`screenReach`)
and whether a piece is on the screen at all (`pieceOnScreen`) — are worked out
from `max_elevation + rock_height`, and a column above that would leave a piece
culled before it was drawn, which is a hole in the world.

**The floors are the tell, and they very nearly were not checked at all.** The
first cut of this had one word the wrong way round — `if (floor[i] < 0 ||
block(c)) continue`, skipping the rock and rewriting the ground instead of
skipping the ground and rewriting the rock — and it raised every walkable square
in the game by two metres, clamped at seven. Rooms at nothing came out at two,
rooms at five came out at seven, and the world was still walkable, still
connected, and still passed a full suite of tests: the one test that was about
heights asserted `most === tallest`, which was a claim about the plateau being
FLAT, and it was as happy with the floors shoved up to meet it as it was with the
rock brought down to meet them. What caught it was **twenty seconds of a probe
printing the histogram of the thing this change is not allowed to touch** —
`floors {"2":144,"3":702,"4":1537,"5":1840,"6":2755,"7":1740}`, floors at six and
seven metres, above the ceiling the world is built to. Lesson 32.

So the suite has the promise now, not just the heights. **"bringing the rock down
leaves every square a crawler can use alone (v0.35.0)"** builds each seed twice
inside one build — once with the change switched off, which is the game as it was
— and fails if a single square moves, is retiled, changes room or changes its lean;
it also fails if the change did nothing, or if the rock is still sitting at the
plateau everywhere, and it checks that the old way really was a plateau, so the
two runs cannot both be the same world. `__test.rockTops(on)` is the switch and
`__test.rockAudit(seeds)` is the battery. The heights test that let the bug
through now asserts what it always meant to: the tallest square is never above
what the picture allows for, the tallest ground is never above the ceiling, and
the tallest rock is exactly `rock_height` above the highest floor it stands beside.

**One test was caught out by the whole thing, and it was not the game.** The
first complete run of the suite after this change came back **96 of 97**, the
failure being `the ground's material lies ON the ground, not across the screen`,
"only 2 of 4 turns found a floor to measure". It is not this release -- the same
failure comes out of the same build with the rock brought down switched OFF, so
the two ways are identical and this change is innocent -- and it is not the
renderer either.

`__test.groundFaceMap` rebuilds the pattern the picture lays a square's material
with, so that it can clear what that pattern remembers and read back where the
material landed. It rebuilt it **by hand, leaving the pick out.** Which of a
material's several pictures a square wears is part of the pattern's identity --
it is in the cache key -- so asking without it names a DIFFERENT pattern, and the
test was laying a plane on one object and reading the answer off another. Squares
whose pick came out 0 answered and every other square looked broken: **3 of 4
turns passed and the fourth looked exactly like a bug in the mapping.** It had
passed for as long as it existed because until v0.31.0 no material had more than
one picture and the pick was always 0. The fix is one line -- ask the way
`Render.ground` asks, `Render.pickFor(mat, x, y, PICK_GROUND)` included -- and the
test now prints which of its two empty answers it got and how much of the rest of
the frame did answer, so a null can never again be reported as a mystery. Lesson 33.

**Only the heights were settled here.** Whether the *tops* of wall blocks should
be visible at all, and whether some places should be allowed taller walls than
others, are questions about what the game should be and are not answered by this
release; they are written down in `ROADMAP.md` and put to them.

---

## v0.34.0 — nothing is drawn see-through, and the campfire stops opening the floor

They reported it plainly:

> "when mousing over the campfire, the tiles to the lower left and lower right of
> it go transparent."

They were right, and there were two things going on at once. Both of them were
counted on the build they were playing before anything was changed
(`files/probe-fire-hover.mjs`, seed 1, 3 and 7, all four camera quarters,
`crawlers-v0.33.2.html`).

**The walls were see-through whether the pointer was anywhere near them or not.**
In all twelve views, **33 to 47 squares of rock came out at less than full
strength in the same picture** — the rock standing between you and the room behind
it, hazed so a room is never hidden by its own near wall. That is what "these
partially transparent walls everywhere look terrible" was about, and it had
nothing to do with the fire.

**And pointing at the fire did open things — just not the floor.** Over the same
twelve views, the pointer landing on the campfire made **six things go
see-through, and not one of them was a square of ground**: the windbreak standing
on the square in front of the fire (drawn at 0.28 whenever one was in the way), and
a crawler standing on the fire's own square. Those are the pieces beside a fire
that "go transparent", and they went for the plainest reason there is — they are
the things drawn after it, and the rule of the day was *everything in front of what
you are inspecting goes see-through*. It was the look working exactly as it was
built to work. The look was the problem.

No box is involved in either of those: v0.25.0 had already stopped judging cover
from the stored box and judged it from the polygons the picture paints.
**Lesson 31 is still worth having** — a stored box is not a silhouette, and reading
one as cover is what opened the two floors beside a campfire in v0.25.0 — but what
this release fixes is the rule itself, not a stale shape inside it.

**They were offered six looks and picked the plainest one:** *the front rock is
cut away completely, nothing is there.* The other five existed as real code paths
behind one switch and were photographed side by side into
`files/look-sheet.png`; the losing five are recorded in `ROADMAP.md` and their
machinery is gone, so nothing in the build can reach them any more.

**What that means in the build: nothing is ever drawn see-through.** The rock
standing between you and the room behind it is simply not painted, and — the other
half of the promise — **what is painted is always what can be picked**.
`Render.cutOut(it)` is the one question the picture and the pointer both ask, so a
square that is skipped by the painting is skipped by the pointer in the same
breath, and the tooltip and the outline cannot land on a thing that is not there.

`render.cut_solid` is the dial (rule 9): **0** is the game as it ships, the square
is not painted at all; 1 paints it like any other rock; in between is the old haze.
It is on the sheet with a note, and the suite reads it at both ends so it cannot be
connected to nothing.

**The rule that made the whole thing safe, and it is counted rather than argued:**
a wall's face is only ever cut where the block in front of it paints **solid**, so
a block that is not painted at all cannot leave a face cut — its neighbour's whole
face comes back instead. `consumed.kept` counts those faces brought back and
`consumed.lost` counts the faces that stayed cut anyway. `lost` is a tripwire
rather than a bound (it is structurally impossible by the rule above), which is
exactly why the test that matters is the one that **fails** if `kept` is 0: a guard
that cannot fire is worth less than no guard (lesson 19).

**The proofs, three arms of one instrument (`files/probe-cut.mjs`), run against
the built file:**

| arm | what it did | what came out |
|---|---|---|
| `--what=fire` | the reported bug: every pixel of a box round the campfire, 6 seeds | 2,025 pixels, **0 open anything**; 0 walkable squares below full; 0 wall faces lost |
| `--what=census` | 112 pictures (7 seeds × 2 angles × 2 zooms × 4 turns) | built **50,402 = painted 44,913 + cut away 5,489**; `0 < alpha < 1` **exactly 0**; walkable squares painted below full **0**; walls brought back **3,013**, stayed cut anyway **0**; 2,688 pointer asks, **0** made see-through |
| `--what=pick` | the pointer walked over 24 pictures | 123,888 pixels asked, 798 cut squares in the lists, **0 answers were a square the picture skipped** |

The census arm is the one that would catch the change drifting: `built = painted +
cut` is asserted in the harness self-check every run, and the two ends of the dial
are A/B-ed inside one build.

**The suite was rebuilt around it rather than patched.** Four tests that asserted
"the faded thing is faded" were rewritten to assert the new rule at both ends of
the dial — the campfire, a selected floor, a camp structure, and the census over
112 pictures — and one was added: *nothing the picture left out can be picked*.
Two of them could only ever pass because a fade existed, and a test whose negative
control never fires is not evidence (lesson 19), so each carries an arm with the
haze switched back on that must still find the see-through it is looking for.

**Lesson 31, written down the same day it cost something:** *a stored box is not a
silhouette.* A thing the ground is drawn around — a crawler, a bedroll, a store, a
campfire — has a box that reaches out over the squares either side of it, so any
"what is in front of this" test built on boxes opens the wrong tiles, and it opens
them **beside** the thing you were pointing at, which is the one place you will not
look for the cause. See lesson 31 in `CLAUDE.md`.

---

v0.33.0 called every ramp that had stopped climbing a defect and mended all 145
of them in 270 pieces. Then they looked at it and said what a cave actually looks
like:

> "I don't mind slopes leading up to walls. happens in caves and rubble all the
> time."

They are right, and the census says most of what was mended was that. Of the 145
broken ramps, **118 were leaning into a solid block** — a bank of rubble or a
pillar with a slope fetching up against its face. That is not a wedge drawn
against a wall: you walk up the ramp, and the rock stops you, and the rock is
visibly there. Same census, same 30 seeds, with the sweep switched off
(`files/probe-slope-kind.mjs`): **118 wall, 26 drop, 1 ledge**. Only the 27 are
the thing that was ever wrong — a slope leaning at OPEN ground that is not a
metre up, where nothing explains the refusal.

**So the rule is now two rules.** A ramp leaning at a solid block is left exactly
as it is. A ramp leaning at open ground that is not a metre up is repaired as
before — re-aimed at a flat square a metre up if it has one, flattened to its own
floor if it has none, and never taking a step away. The prevention went the same
way: `blockRoom()` may put a pillar or a rubble pile on the square a ramp climbs
into again, exactly as it did before v0.33.0.

**That was the whole cost of v0.33.0, and it is now gone.** The guard changed
*which blocks were placed*, and a block placed or not placed changes the dice for
everything after it in the piece — so v0.33.0's world was not the old world with
some ramps mended, it was a different world in which a room came out shaped
slightly differently. It should not have been accepted as the price of mending
27 ramps, and it is not being paid:
`files/probe-world-diff.mjs 0.32.0 0.33.2` loads the two built files, seeds the
same nine worlds, and compares **every live square**: 254,016 squares, **13
differ, and all 13 of them are a ramp that no longer climbed** — 0 squares
differing for any other reason, and of the **720 rooms** across those nine seeds,
**0 differ** in centre, elevation, floor, name or tags.

The audit, 30 seeds × 9 pieces (sweep OFF / ON in one build, so the difference
between the columns is exactly the repair):

| | sweep off | shipping |
|---|---|---|
| ramps | 10,244 | 10,218 |
| leaning at rock (allowed) | 118 | **118** |
| leaning at open ground (the bug) | **27** | **0** |
| repairs (1 re-aimed, 26 flattened) | — | 27 |
| steps a crawler can take | 816,603 | **816,645** |
| steps lost | — | **0** |
| steps gained | — | 42 |

The rock-leaning count is the check that the narrowing is real rather than
described: it is 118 both ways because the sweep never touches one, and the
suite's test asserts exactly that (`atRockNew === atRockOld`, and `> 0`) as well
as requiring the OFF run to find wedges and the ON run to find none — a test
whose "nothing was repaired" arm can fail, which is the only kind worth having.

`__test.slopeGuard()` is gone with the guard it switched. `__test.slopeAudit()`
now runs the world **twice** (sweep off, sweep on, the same world) instead of
three times, and reports the wall/open split.

**The lesson, written down the same day it cost something:** a rule of tidiness is
not a defect. Every ramp that leans into a metre of rock *is* a map that refuses a
step, and a generator that reads that as broken will reshape a room to make it
tidy. The question to ask first is what it looks like at the size the player sees
it — and, when the answer is "like a cave", to ask before mending natural terrain.
See lesson 30 in `CLAUDE.md`.

---

## v0.33.0 — a ramp is a promise, and the promise is checked

A ramp is not a shallow slope. It is the only place two levels meet, and the
whole of what it means is *"the square I lean toward is one metre up and clear
ground"*. A crawler walks up it because `canStep()` says the height where the two
squares meet agrees.

Three rules were applied **after** the ramps were dug, and every one of them can
take that square away:

- `blockRoom()` runs after `rampRoom()`, so a pillar or a rubble pile could land
  on the top of a ramp — 29 of the 41 found, and the whole of the room family.
- `digHall()` assigns each square's slope as it digs, and the last hall dug is
  the one that stays, so a later hall can flatten or lower the square an earlier
  ramp climbs onto.
- `digDoorway()`'s corridor leaned "inward, at the square that really is higher"
  — and in the sideways stretch along a piece's rim that square is a wall seven
  metres taller than the ramp.

What that produced was not a steep hill. It was a **wedge drawn against the foot
of a wall**: the map says you can walk up and you cannot. It had been there since
the halls went in, and it survived every version because the only check on it was
a suite test that looks at one seed's 3,136 squares — the sample, not the range
(lesson 22). The roadmap had the family written down and never fixed, because
mending a ramp meant moving the height of a square, and that breaks the promises
the world generator makes about a seed.

**So the ramps are now checked at the very END of a piece, once nothing else can
move**, and a ramp that no longer climbs is given the two things that cannot come
undone:

- **re-aim** it at a FLAT square exactly one metre up, if it has one — flat
  ground cannot move, so a re-aimed ramp cannot come undone;
- **flatten** it to the floor it was cut from, if it has none.

**The repair may never take a step away**, and that is argued and then measured.
Argued: both halves can only remove an edge that was *already* impassable — if
the square a ramp leaned at were a metre up and clear, the edge would be walkable
and the ramp would not have been touched — and flattening leaves a square at its
own height, which can only *add* edges to the neighbours at that height. Nothing
about a square's height, tile or room is ever changed by the repair, so the two
promises the generator lives by — same seed, same labyrinth, and the doorway
heights two pieces agree on across a seam — are untouched. Measured:
`__test.slopeAudit()`, which counts **every step a crawler can really take** with
the repair off and then on in ONE build (lesson 21), over 30 seeds × 9 pieces:

| | old | shipping |
|---|---|---|
| ramps | 10,244 | 10,178 |
| ramps that climb into a wall | **145** | **0** |
| steps a crawler can take | 816,603 | **818,489** |
| steps lost | — | **0** |
| steps gained | — | 74 |
| repairs (20 re-aimed, 152 flattened) | — | 172 |
| ramps still broken when the sweep gave up | — | 0 |

**Two halves, switched apart on purpose.** `blockRoom()` no longer puts anything
on the square a ramp climbs into — that is the half that stops the repair being
needed — and the sweep mends whatever is left. They are switched separately
(`__test.slopeGuard()`, `__test.slopeRepair()`) because the prevention changes
*which blocks are placed* and so the dice for the rest of the piece, while the
sweep changes nothing but the squares it repairs. **The off/ON pair in the table
above is the sweep alone, against the same world with it off** — that is the pair
where "no step was taken away" can be stated exactly rather than approximately.
The shipped world is a different world from the old one in the same way that any
change to a room's shape is: the block that used to wall off a ramp is not there,
and the squares after it are rolled differently. A piece's *ramps* are still
generated by the same rules as before.

A ramp leaning at a square **outside** its own piece is left alone: the pass runs
in the piece's own local squares, before its address is added on (which is what
keeps the seam promise), and it cannot see next door — guessing about ground it
cannot read is how a step gets taken away.

The census that found the family agrees with the fix: 30 seeds × 9 pieces, about
10,000 ramps, **0 broken** (`files/probe-ramps.mjs`), from 145 in the same build
with the repair off. The suite's ramp test now runs over six seeds instead of
one, and a new test runs the whole audit and requires the old way to find the
bug, the new way to find none, and no step to be lost.

---

## v0.30.0 — the surfaces are the pictures somebody dropped in

`textures/` has eight folders, one per material, and until now they were empty
slots with a note in the middle saying nothing happened yet. Nine pictures of
dirt went into `textures/dirt/`, and this is the wiring that makes them the
ground.

**A picture that is there becomes the surface.** Not an overlay on it and not a
tint of it: what you see is the colour of the picture, and then the light is done
to it. That is why the pictures are multiplied by the *light alone*
(`lightShade()` — `litShade('#ffffff', …)`, the same function with white in it, so
the two cannot drift) rather than by the colour the tile would have had. The
generated path is the opposite arrangement — a transparent overlay drawn on top
of a lit colour — and the two may not share a cache entry, which is why the
pattern cache key spells out `pic|<the light>` where it used to spell out the
colour. A picture multiplied by a dark tile's colour as well would have come out
nearly black, which is the mistake this arrangement avoids.

**Several pictures in one folder are composed into ONE tile, a whole number of
squares across** — nine pictures of dirt become a three-metre-by-three-metre
tile laid on the floor, each picture filling exactly one square metre whatever
size it was drawn at. Two reasons: one canvas per material keeps the pattern
cache the size it was (44 patterns for a frame at the camp, against eight
materials — the same count as before), and a repeat of one picture every metre is
wallpaper rather than a surface. `texture.pattern_px` (32) is the metre, and the
composition is in `matPicture()`.

**Pictures are inlined into the built page by `build.py`**, as data URIs, exactly
the way the spreadsheet is — so the page still plays from a file on a phone with
no network and nothing to install. 24.9 KB of pictures for the nine of dirt. The
materials list the build accepts is now `MATERIALS` in `tools/sheet.py`, one list
shared by the sheet check and the texture folders, because "the eight materials"
written down twice is two lists that drift.

**An image decodes when it decodes**, which is after the first frame would like
to be drawn. `09-textures.js` waits for *all* of them — a surface made of some of
its pictures is a surface that changes under the player a moment after they look
at it — and then throws away every material baked so far (`Render.forgetMaterials`),
or the first frame of a match would wear the generated tiles for the whole
session. Before then, and if a picture will not decode at all, the material keeps
the tile the game generates for it: a missing picture is silence, never an error.

**Measured**, because "a texture appeared" would pass with the generated one
still underneath. Seed 1, camp in view, the same frozen moment painted both ways
inside one build: **48,500 of 229,632 pixels differ (21%)**, 39,704 of them by
more than eight levels, worst **110**. The census of the frame says 409 patterned
ground fills and 182 patterned wall fills, and `fillKinds` puts every one to the
door it came through.

The composition is asserted rather than admired: the composed dirt tile is
96×96 and holds **1,226 distinct colours**, and **every colour of each of the nine
source pictures appears in it** — so the tile is provably made of the pictures and
not of something that merely replaced them.

Two smaller things came with it. `fillKinds()`'s `drawn` field is renamed
`things`, because as of this version "drawn" means *a material made out of a
picture* and one word with two meanings in one file is how a later session
mis-reads a number. And the suite now waits for the pictures to decode before it
measures anything, because a test that asks about a picture early reads a game
with no pictures in it — and passes.

---

## v0.25.0 — natural stone that is stone, and the see-through floor in front of it

Two things, and they are unrelated except that both are about what a surface
looks like.

### `rock` was hatching, not stone

Asked for natural stone that looks like a photograph of mottled grey rock, the
first thing to do was measure the material that was there rather than restyle it.
`stone_block` — the tile every wall of bare rock wears, and the ground under the
camp — carries `rock`, and `rock` was **thirty wandering one-pixel cracks and
twenty-two specks**: 44 separate marks, the biggest of them 29 pixels, in runs a
mean 1.8 px long, covering 18% of the metre. That is a hatch. It reads as
scratching, and no amount of staring at it would have said why.

The replacement is built in three scales, all of them lumpy rather than linear:

- **grain** — fine, low-alpha speckle, the sand in the stone;
- **sixteen mottling patches**, dropped in clumps so they join into bigger
  shapes, which is the actual look of weathered rock;
- **six crevices**, and the crevices are the only dark thing in it.

Measured the same way, from 18% coverage to **54%**, from 44 marks whose biggest
was 29 px to 37 whose biggest is **319 px**, mean run 1.8 px → 3.4 px, and how
much neighbouring pixels agree **0.337 → 0.495** (1 is one flat patch, 0 is
noise). Few big soft shapes instead of many thin ones is the whole of the change.

**What is NOT claimed:** that it looks like the photograph. That judgement is not
made in this repository, and no amount of counting substitutes for it — the
counts above exist to prove the change is of the kind asked for, not to grade it.
The stone is drawn on both a block's top and its sides, at all four camera
turns; it is one branch of `matTile()` in `40-render.js`, which tile wears it is
the `pattern` column of the `tiles` tab of the sheet (`stone_block` says `rock`),
and the list of material names the build will accept is in `tools/sheet.py`. It
can be retuned or reverted without touching anything else.

### Selecting something made the floors in front of it transparent

Reported as a bug, and it was one. Selecting any item on the ground made **the
floors in front of it** go see-through — not the thing hiding it, the floors
themselves.

Reproduced and counted before anything was changed: **87 of 91 selections (96%)**
faded at least one walkable floor square standing in front of them, **431
walkable floor squares** in total, over six seeds and six distinct worlds.

**Why.** `Render.occludes(item, focus)` — the function that answers "is this
thing in front of what is selected" — was a **bounding-box overlap and nothing
more**. A square's box is deliberately extended downwards to the floor of the
world, because a block's box has to cover the wall it stands on. Two floor
squares a step apart are half a tile apart on screen (at yaw 0 a step in +x moves
a diamond by (+32, +16)), so their boxes overlap by **sixteen pixels** while the
diamonds themselves meet at a single corner. The test could not tell a diamond
shifted half a tile from a diamond genuinely covering it, so the neighbours were
faded too. Every floor square in one plane can never overlap any other; **all
genuine overlap comes from height.**

**The fix is to ask the question in two dimensions.** `painted(it)` returns the
quads an item really paints — the top, and the two side walls of a solid one,
with the clipped faces when the clip is on — and `quadsCross(a, b)` is a
separating-axis test over those quads' eight edge normals, with the epsilon
normalised to half a pixel so a hairline touch is not an overlap. The old box
overlap is kept as a **screen** in front of it, because a cheap superset that
rejects most pairs is the whole reason this is affordable. Measured in one build
with both rules alternating, 118 picks over seeds 1, 3, 5, 7, 23, 777:

| | selections that faded a floor | walkable floors faded |
|---|---|---|
| box overlap — what shipped | **117 of 118** | **592** |
| quads that really overlap | **6 of 118** | **10** |

The ten that remain are genuine covers: a raised floor's wall really does stand
in front of the floor behind it. The cost is **about 5 microseconds a frame**
(`alphas()` 0.035 → 0.040 ms) — free.

**A documented approximation, and which way it errs.** `painted()` has to assume
the neighbouring block paints solid, because whether it does is not known until
`alphas()` has run and the neighbour is always later in the list. That can only
under-report what a thing paints, so it can only ever fade **less** than the
exact answer — never open a hole.

### The test that was holding the bug in place

`a faded block does not open a hole in the wall behind it` went red, and stayed
red under three separate attempts to make it pass. It was **not** to be weakened:
measuring both arms inside one build showed it had been passing **only because of
the bug**.

The clip cuts a wall down where the block in front of it hides it. It is
correctly gated on that block painting solid (`hideL` needs `alphaOf[nbr] === 1`),
so with almost the whole picture see-through the clip **gave up nearly
everywhere** and clip-on drew the same picture as clip-off — which is exactly
what the old pixel assertions measured (`deep` 121/330/1088 px, worst 13/20 over
seeds 1/3/777). With the fade doing only what it should, the clip applies
properly and the two arms differ by 4,145–11,835 px with a worst of 171 — so
"the clip may change almost nothing" was an assertion **about the bug**.

What replaced it is the invariant the test was always about, counted rather than
pictured: two counters, `kept` and `lost`, incremented while drawing where a
wall's face is cut away and the block hiding it is see-through. `lost` must be
zero (no hole), and `kept` must be more than zero — the second assertion being
what makes it a test rather than a paragraph, because a guard that never comes up
is not proved by a count of zero. The faces that come back are real: 69 of 105,
29 of 71, 23 of 57 on seeds 1, 3, 777.

Both rules are still in the build, behind `Render.fadeBox` and `__test.fadeBox`,
and the new test shoots every floor pick both ways in one build — so the bug it
is about is one line away from it, and the test says so with its own numbers.
*(v0.34.0 removed the flag and the box rule both: nothing is drawn see-through at
all any more, so there is no rule left for a box to be the yardstick of.)*

**What changed for the person playing:** far less goes see-through. Selecting
something now clears what is genuinely in front of it and leaves the floor alone.

---

## v0.24.0 — the walls wear their material too, and what that costs

The sides of the walls were the one surface in the game with nothing on them.
Every tile in the sheet already carried a material — flagstone, dirt, moss,
rock, masonry — and the ground had been wearing theirs since v0.23.0, but a
**block's sides were painted flat colour** unless the block happened to be
`stone_wall`, which is the dressed stone of a room somebody built. That is a
small minority of the map: a live count of what one camera could see came back
`stone_block 271, packed_earth 88, stone_floor 41, rubble 16, stone_ramp 2` and
**no `stone_wall` at all**, so in practice every wall a crawler walks between was
a flat brown sheet.

**What it takes.** `wall()` is four lines: it hands the face's own top edge to
the same `faceFill()` a masonry wall was already using, so the material is
MAPPED onto the face — one metre of wall is one tile of stone — and the courses
run along the wall and turn with the camera instead of shearing across it. The
material comes from the tile's own `pattern` in the sheet, so no new dial was
needed and no number is hardcoded: `stone_block` shows rock, `packed_earth`
shows dirt, and a mine or a quarry keeps the rock it was hacked out of, which is
what that note always said.

**The mistake it fixed.** The sides were left flat on a decision written into
the code in v0.14.0 — *"a side is in shadow and edge-on, so a material there
reads as almost nothing and costs a third of the frame"* — and both halves of
that sentence were true when it was written. The conclusion was still wrong,
because it was never asked **how many** of them there are. There are hundreds,
and they are the thing you spend the whole game looking at. The same shape of
mistake as the ground last version, and the same lesson: a rule of thumb that
says a case can be skipped is a reason, not a check.

**What it costs, measured inside one build** (the flag A/B-ed with no rebuild,
seed 1, 624x368, best of three alternating passes of 30 frames, camp in view and
walked out to 28 pieces of world):

| | drawing a frame | whole frame | patterns |
|---|---|---|---|
| no materials at all | 3.7 ms | 5.0 ms | 0 |
| ground only — what v0.23.0 shipped | 7.7 | 11.1 | 24 |
| ground **and** walls — this version | **11.6** | **16.9** | **45** |

- The sides add **+3.9 ms of drawing a frame**. They put 182 faces on the screen;
  636 more are buried behind a neighbour and are never painted at all.
- Those 182 faces cover **987,000 pixels — 4.3 screenfuls — of which only 29,457
  are visible.** The other 97% is paint inside rock standing in front of it. A
  screenful of wall therefore costs about **two and a half times** a screenful of
  floor, and the overdraw is the whole of that difference.
- **It is the fill, not the transform.** 182 `setTransform` calls come to about
  half a millisecond. Two cheaper schemes were designed and both are now known to
  be nearly pointless — they could have recovered a tenth of the cost — and
  knowing that is worth the measurement having been taken.
- **It does not grow with the world**: +3.89 ms holding 2 pieces, +4.01 ms
  holding 28. It grows the **pattern cache** instead, 24 → 45 patterns at the
  camp, which is the other reason the lighting is stepped rather than smooth.
- **The picture is now about twice as expensive to paint as it was.** That is
  real and it is the honest price of the thing that was asked for; a match stood
  in a room looking at a lot of near wall is the most expensive picture in the
  game. `Render.mappedWalls false` puts it back, and `texture.strength` 0 turns
  every material off.

**A new dial-free test guards it:** the census test that fails when anything but
the ground is textured now counts the block sides as legitimate, and a second
test shoots one settled frame three ways — walls mapped, walls flat, and every
block tile's `pattern` blanked — and requires the pattern count to be exactly the
ground squares plus the walls, at least one block in shot, and the pixels to
actually move.

---

## v0.23.0 — the ground wears its material, instead of the screen wearing it

Every square of ground — floors, the tops of blocks, ramps — had its texture
**pasted flat across the screen** rather than laid on the ground. The same
square of stonework sat at the same place on the picture no matter which way the
world was turned, so it had no direction of its own: the moss and the joints
faced the camera while the corridors ran diagonally past them, and as the view
swung the material slid across the floor under it. Walls stopped doing this in
v0.16.0; the ground was left behind because it could not be fixed the same way.

**Why it could not be fixed the same way.** Laying a material onto one face
costs about 50 microseconds, and the ground is most of the picture — 350 squares
of it taken one at a time took drawing a frame from 8.7 ms to 43 ms. That is
what the code meant when it called a flat floor a saving: *a floor has no
direction to get wrong*. It has one. Turning the camera proves it.

**What it took.** Every flat square at the same height is the **same
parallelogram in the same plane**, so one placement serves all of them at once:
one transform, built from a whole grid corner, laid once per material per height
per frame instead of once per square. A floor a metre higher is that same
placement moved up the picture by exactly one rise. Because a repeating
material looks the same a whole tile along, which grid corner it is built from
does not matter; a square keeps the numbers small and exact.

- **The joints now run along the edges of the squares**, at every camera turn,
  on every square at once — one metre of ground is one tile of material.
- **A ramp is laid on the ramp itself**, built from its own corners, because a
  ramp is the one square of ground tilted in its own plane. Its material stays
  one tile to the metre, so its stones still line up with the grid.
- **The pattern cache is keyed by floor height as well as colour and material.**
  A pattern carries its placement around with it, so one shared between the
  floor at one height and the floor at the next would hand the second the
  first's placement — a metre out of place on screen. Heights are whole numbers,
  so this is a handful of extra tiles and it does not grow with the world.
- **Nothing about the picture's speed changed.** Measured inside one build with
  only this switched on and off, 1, 9 and 25 pieces of world held: 4.20 → 4.28,
  4.71 → 4.70, 4.89 → 4.68 ms. About what pasting it flat cost.
- It is **0 pixels out and not stretched**, on floors and on ramps, at all four
  camera turns and on five different worlds — where the old way is **318 pixels
  out** and points the material's own two directions straight across the
  screen. **64,937 of 138,012 pixels** of a frame differ between the two.

The old way of painting is still in the game behind a switch, because that is
how the tests paint one frame both ways and keep materials facing the camera
from creeping back.

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

**The game did not change when this was done, which is why no new version sits
above this note.** What changed is that there is now somewhere to put the game,
and a command that puts it there. At the time of writing the picture on the web
was still v0.22.0; it became v0.23.0 with the entry above. The tests were
untouched by the publishing change. The old artifact link still opens, holding
whatever was last published through it.

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
