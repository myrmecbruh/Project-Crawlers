# Project Crawlers — the roadmap

What is parked, and why. **Nothing in here is agreed or scheduled** — it is the
list of things that have been raised, measured or offered, so that neither of us
has to remember them. `CLAUDE.md` is the law; this is the queue.

When something here gets built, it moves out of this file and into `CLAUDE.md`
(if it is how the game now works) or `CHANGELOG.md` (for the reasoning).

---

## Where the game actually is, measured

Taken from a real match on v0.14.0, not from memory, with what has changed since
noted against each line:

- **Four of the fifteen skills are used by anything.** Clambering (walking),
  Labouring (clearing ground), Building (raising a camp), Studying (reading a
  room). The other **eleven are rows in the sheet that nothing ever calls**:
  Wrangling, Fighting, Ranging, Performing, Crafting, Tinkering, Tending,
  Foraging, Enduring, Bargaining, Leading.
- **There are no creatures at all.** Rule 6 is entirely unbuilt.
- **The labyrinth used to be one fixed patch**, 56×56 metres, nine rooms, with a
  rock wall at the edge of the world. **As of v0.20.0 the world underneath goes
  on in every direction**: it is built from pieces, a piece is worked out from the
  match seed and its address alone, and neighbours are joined by doorways, so
  there is no edge to find. **As of v0.21.0 the ground is fetched as it is walked
  to**: the picture makes the pieces it can see, the pieces the crawlers stand in
  and the pieces the camp occupies, two a frame, nearest the middle of the view
  first, and the square underfoot is always made the very frame it is wanted. What
  it does NOT do is throw anything away — **a match still holds every piece it has
  ever fetched**, so the ground held grows with the walking. Bounding that
  (`forget-and-remake`) is what is left of this job. The pick table below was
  built in v0.22.0 — the pointer's answer is worked out from the shapes now
  instead of being painted a second time, and the numbers it hands out no longer
  have to fit in a pixel colour. The two dials are rows 90 and 91 of
  `docs/crawlers.xlsx`.
- ~~**Seven ramps in a piece lean at a wall instead of at ground a metre higher.**~~
  **Done, and half of it declined — v0.33.0 then v0.33.2.** Found in v0.20.0 while
  checking the doorways' ramps: seed 2 at (18,28) and (18,30), seed 3 at (42,9),
  seed 7 at (47,4), seed 8 at (30,29) and (31,29), seed 777 at (37,25), older than
  the doorways and sourced in the room and hall shaping. v0.33.0 checked every
  ramp of every piece and mended all 145 it found in 270 pieces; they then said
  they **do not mind slopes leading up to walls** — "happens in caves and rubble
  all the time" — and the census agreed: 118 of the 145 lean into solid rock, 26
  at open ground below a metre and 1 at a ledge. v0.33.2 leaves the rock alone,
  repairs the 27, and **gave the rooms their own shape back** (the v0.33.0
  prevention changed which blocks were placed and so which rooms came out).
  Seed 8's pair at (30,29) and (31,29) is one of the 27 and is repaired; the
  others are slopes against rock and are now the labyrinth on purpose.
  Measurements and the proof that nothing else moved: `CHANGELOG.md` v0.33.2.
- **Nobody arrives or leaves.** Six crawlers spawn and that is the population.
- **Crawlers need nothing.** No hunger, no sleep, no warmth, no mood. The fire is
  decoration; the bedrolls are scenery.
- ~~**Nothing is ever drawn see-through, and the tiles beside a campfire no longer
  open.**~~ **Done — v0.34.0.** Reported from play ("when mousing over the
  campfire, the tiles to the lower left and lower right of it go transparent"),
  then "these partially transparent walls everywhere look terrible". Six looks
  were built as real code paths behind one switch, photographed side by side into
  `files/look-sheet.png`, and **they picked the plainest one: "the front rock cut
  away completely, nothing there"**. The six offered were: **(B) cut away —
  the near wall is simply not there**; **(C) low wall** — a solid low wall is kept
  where the rock was, so the room still has a near edge; **(D) outline** — the wall
  is drawn as a line and not filled; **(E) ghost dots** — the rock is painted as a
  checkerboard, half solid and half a hole; **(F) slats** — the rock keeps its
  shape and you see through the gaps; **(G) only when asked** — nothing opens on
  its own, and only the rock in front of whatever you point at. B is what shipped
  and the machinery for the other five is gone from the build — see
  `CHANGELOG.md` v0.34.0.
- ~~**The rock has a flat top, and every square of it draws that top.**~~ **Half
  done — v0.35.0, the heights.** *"we should not see the top of wall blocks,
  right? also make most walls 2m tall instead of the current 3m... perhaps only
  taller walls in big dramatic set piece areas"*. v0.35.0 took the heights: rock
  is no longer one global plateau (`max_elevation` 5 + `rock_height` 2 = 7 m
  everywhere) but **each column stands `rock_height` above the nearest floor to
  it**, so **91.2% of the rock that touches a floor is exactly two metres above it**
  (16.5% before) and the rock up at the old plateau falls from 77,804 of 78,063
  columns to 13,851. The mass of rock between rooms still rises away from the
  floors, which is deliberate — see `CHANGELOG.md` v0.35.0 and `CLAUDE.md`. **The
  other half is settled too, in v0.36.0 – v0.41.0: the top face is not painted at
  all**, at their instruction — *"make the TOPS of ALL walls invisible (or just
  delete their tops). do not render sides of wall blocks that can never be seen
  (within solid areas of wall). do not render the inside of wall blocks. make the
  top meter of all visible walls gradient fade to complete transparency"*. What is
  left of their question is only **set pieces** — whether some places should be
  allowed taller walls (question 5 below).
- ~~**The front rock is cut away so you can see into the room.**~~ **Changed —
  v0.44.0.** Cutting the near wall away was option B above and it stayed for ten
  versions. It is a **knob**, `render.cut_solid` (`knobs` tab): nought cuts the
  rock in the way away, **one draws it like any other rock**, and a value between
  the two hazes it. It was flipped to one at their instruction, and what is on
  the other side of the coin is measured rather than argued: with the rock drawn
  solid **the crawlers' own pixels hidden by the world go from 2.9% to 18.7%**
  over four seeds, with two of the four hiding a crawler 86% and 96% — a crawler
  behind a tall wall is now completely out of sight — and the floor on screen in
  the camp's own view falls from 38.3% to 26.5% (seed 1). See `CHANGELOG.md`
  v0.44.0 for the numbers and `files/probe-cutsolid.mjs`, `files/probe-cutshare.mjs`,
  `files/probe-cutlook.mjs` for how they were taken. **Nothing else changed**: the
  squares are still marked as standing in the way (`cell.cutaway`), so the wall
  clip, the hole census and the pointer's own rule are all still asked the same
  questions and still answer them.
- ~~**`do not render the inside of wall blocks`** (their line, in the list above).~~
  **Done — v0.45.0.** A rock block's own far faces were never culled: they were
  painted, as the strips of rock along a block's far edges
  (`Render.backBands`), because at the cut-away look those strips are the only
  thing that can fill the far half of a block's top diamond where the block behind
  is drawn SHORT or taken away altogether. **At the look the game now ships
  (`render.cut_solid` 1) nothing is drawn short, so the block behind covers that
  strip by itself and the strip fills nothing** — measured, not argued, over 120
  views with the strips refused: **0 pixels of bare backdrop added, the census
  identical to the last pixel (bare 18, of it 15 enclosed, 6 views, worst hole 3),
  while a sixth of the frame stopped being repainted.** In the cut-away the same
  removal adds 969 pixels of bare backdrop in 494 places, 944 of them enclosed, and
  takes the worst view from 82 pixels of hole to 161 — so they are **kept for that
  look** and refused at the shipped one, by a new code flag `Render.backBandsSolid`
  (false). It is a code flag and not a sheet dial on purpose: it is the consequence
  of whether the cut is in use, not a feel decision, and `backBands` has sat beside
  it as one all along. See `CHANGELOG.md` v0.45.0 and `files/probe-backcull.mjs`;
  the suite test that holds it is `the rock along a wall's far edges is painted only
  where the cut opens a gap (v0.45.0)`, 24 views and four arms inside one build.

- **The picture draws the whole world it holds, whether or not anyone has been
  there.** Asked for "voxels, and do not display ones that are unrevealed", the
  buried half turned out to be **already built** — a block inside solid rock is
  not painted and cannot be pointed at, since v0.34.0's cut — and **the unexplored
  half is not built at all**. There is no memory of what has been seen anywhere in
  `src/js`: nothing remembers a square, so there is no remembered copy to draw and
  nothing to hide. `light` is worked out per square and floods only through what
  does not block sight, which is the closest thing that exists, but it is rebuilt
  from the sources each time and then thrown away — it is not knowledge. This is a
  world-model job, not a renderer job, and it is question 6 below.

---

## Parked: what to build next

Offered as four options in September 2026. **They chose "the labyrinth goes on
forever"**: the endless ground was built in v0.20.0 and the fetching of it as the
crawlers walk in v0.21.0 (see `CHANGELOG.md` for the reasoning and `CLAUDE.md`
for how it now works). The three below are what is left of that offer. The one
piece of the endless world still outstanding is **throwing ground away again**,
which is what keeps a long match from growing forever — it is noted against the
labyrinth line above and is not one of these three.

### 1. Hunger, tiredness, warmth
Crawlers start needing things. The fire stops being decoration and becomes the
reason they survive the night; someone has to forage, cook and tend the sick.
Puts five or six dead skills to work at once and makes failure cost something
other than time.

### 2. Things that live down there
Creatures, generated from tags rather than hand-authored (rule 6). Brings danger,
makes carrying a light a real decision, gives Fighting and Wrangling a job. But
it is the combat fifth of the game, and rule 3 caps that at 20%.

### 3. Hands and work — crafting, cooking, repair
Gather materials, cook a meal, sew a coat, mend a broken spade. Puts Crafting,
Foraging and Tinkering to work and makes gear something you maintain. Depends on
the gear-wears-out question below.

---

## Parked: questions waiting on them

Rule 2 says ask and wait. These have been asked and are still open.

1. **Gear can push an attribute past 6.** A crawler wearing the right kit shows
   Endurance 7, and rule 10 says attributes run 1 to 6. Clamp it at 6, or let
   gear break the scale on purpose?
2. **Gear never wears out, breaks, gets lost or gets swapped.** A spade is as good
   on day two hundred as on day one. Adding wear is a new mechanic, so it needs
   asking for before it is built.
3. **"Boardgame aesthetics" — what it means for the LOOK.** Rule 10 is settled for
   the numbers (1–6, 2d6). Asked twice about the picture — painted miniatures on a
   board, versus the gloom currently laid down — and never answered. The grit
   overlay that was part of that answer is **gone** as of v0.17.0, at their
   request; the generated materials on the ground stay.
4. **Natural stone was reworked in v0.25.0 to look like a photograph they sent;
   nobody has said whether it does.** The stone every wall of bare rock and the
   camp floor wears is now broad soft mottling rather than the fine hatching it
   was. **The other materials were not touched** — flagstone, dirt, moss, rubble
   and bones are all still as generated, and the same offer stands for each: send
   a picture of what it should be and it is one branch of `matTile()`.
5. **The rock is too tall and you can see the top of it — the heights are done,
   the LOOK is not.** Theirs: *"we should not see the top of wall blocks, right?
   also make most walls 2m tall instead of the current 3m to cut down on this
   issue. perhaps only taller walls in big dramatic set piece areas."*
   **v0.35.0 built the heights**: rock is now as tall as the ground it stands in,
   so most walls are two metres and the plateau is only left where rock is a long
   way from any floor. **v0.36.0 – v0.41.0 answered the top face** — it is not
   painted, the last metre of every visible wall dissolves, a wall buried in the
   rock next door is not painted, and a block that is cut away keeps a **one-metre
   foot of rock** so hiding it cannot open a hole. All of that is measured in
   `CHANGELOG.md` v0.36.0 – v0.41.0. One half is still open, and it cannot be
   settled by a session:
   - **Set pieces.** *"Perhaps only taller walls in big dramatic set piece areas"*
     has nothing behind it yet: there is no set-piece concept in the build, and
     adding one means a new tag on rooms, which rule 2 says is asked for rather
     than invented. Worth offering with suggestions — a `grand` tag keeping the
     rock at the old plateau height, on a share of rooms a person could name (1 in
     20? 1 in 5?), so the tall walls are somewhere you arrive at rather than
     everywhere.
   - **The exact look of the wall foot.** A cut-away block now keeps its bottom
     metre, and the honest cost is that **the bottom metre of anything standing
     directly behind a hidden block is covered.** Nobody has said whether that
     reads well. It is one number — `render.cut_stump_m`, `knobs` row 41 — so
     zero makes it a clean hole again and two makes a low parapet.
     **MOOT SINCE v0.44.0, and left here as the record:** the question only
     existed while the rock in the way was cut away, and the rock is now drawn
     solid (`render.cut_solid` 1), so nothing is hidden and nothing is left
     behind. `cut_stump_m` is still the number that would matter if the cutting
     look ever came back.
   - **Slopes leading up to walls are deliberate and will stop being questioned.**
     Theirs: *"I don't mind slopes leading up to walls. happens in caves and
     rubble all the time."* A session re-reported this as a defect more than once;
     it is not one.
6. **Ground nobody has explored or lit is still drawn as if it were known.** Theirs,
   offered the two readings of "unrevealed": *"both — but buried blocks don't
   really need to exist, right?"* The buried half is already the case (a block
   inside solid rock has not been painted since v0.34.0); the explored half has
   nothing behind it and is the genuinely unbuilt part of this request. It needs
   answered before it can be built, because the three shapes it could take are
   three different games and they are not a matter of taste a session can settle:
   - **Absent** — the world simply is not there beyond what has been seen, so the
     picture ends and the crawlers walk into nothing. Cheapest and the most like a
     voxel game; also the emptiest, and it makes the whole plain of pieces look
     like a curtain being pulled back.
   - **Dark** — the ground is there and unlit, so it reads as shapes in the gloom
     at `light.ambient`, the way the labyrinth already reads past the edge of a
     carried light. Closest to what the game already does and to "sight *is* the
     light"; the risk is that it looks like the darkness is merely unlit rather
     than unknown.
   - **Remembered** — what has been seen is kept, dimmed, and the map fills in
     behind you; what has never been seen is absent. The most information and the
     most machinery, and it makes the ground *held* into the ground *known*, which
     is the same book-keeping `forget-and-remake` is about.
   Whatever is chosen, the first question underneath it is **what counts as
   seen** — the square a crawler stands in and the squares a carried light reaches
   are the two candidates the build can already answer, and they are not the same
   set.

---

## Parked: smaller things, offered and measured

- **The eight surfaces are the player's to fill, and one of them now is.** As of
  v0.30.0 a folder in `textures/` with any pictures in it wears them: the ground
  under the camp is nine pictures of dirt they sent. The other seven folders
  (masonry, flagstone, moss, water, rubble, bones, rock) are empty and keep the
  surfaces the game generates for itself. Nothing else is needed from a session —
  the pictures are read at build time and the page carries them — but a material
  with no pictures in it is a surface nobody has chosen yet, and that list is
  worth re-offering whenever surfaces come up.
- **The numbers the pointer reads used to be running out of room, and the reason

  is gone.** Until v0.22.0 every square, crawler and camp site on screen was named
  by its position in the list of live things, and the pointer read that number
  back off a pixel colour — `rgb` gives 16,777,215 of them, so the list could
  never be longer than that. Since v0.21.0 **nothing is ever forgotten**, so a
  match that keeps walking grows the list for as long as it lasts: 25 pieces is
  78,400 squares, and 16,777,215 is about **5,350 pieces**, past which two
  different things would have answered to the same colour, silently. As of
  v0.22.0 the number never goes near a colour — the answer is worked out from the
  shapes — so there is no ceiling but the size of a JavaScript number. What is
  still true is that the list itself grows without limit, which is
  `forget-and-remake`'s job.
- **The camera snaps when you pick a crawler.** Clicking one locks the view onto
  them instantly rather than easing across. It was left as a snap because they
  asked for a lock; if the jump annoys, it is a few lines to glide instead.
