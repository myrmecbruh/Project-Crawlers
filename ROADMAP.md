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

- ~~**One tile of wall, and black behind it.**~~ **Done — v0.47.0.** Asked for in
  as many words — *"walls should only be one tile thick. simply show black
  nothingness behind them"* — and settled by effect first: **only the rock that
  touches open space is drawn, everything behind it is black even where ground
  stands higher, and every wall is exactly one tile**. `Render.wallSkin` (a code
  flag) drops a square of rock with rock on all four sides of it **whole**,
  whichever way the camera is turned and however tall the rock beside it stands;
  the neighbour question is asked off the square's own edges with the same
  `EDGE_STEP` the cut uses, and **a neighbour past the rim of the piece counts as
  open**, so the same wall is drawn the same way while the player walks toward it.
  This closes the correction of v0.46.0's own claim: the cut hides a square only
  where a block stands **in front** of it along the line of sight, and of the
  **70,863** squares boxed in on all four sides in the 16 views the suite looks at,
  **1,151 were still painted** — a hill's interior is invisible to the cut when the
  camera looks along the hill rather than into it. Measured A/B inside one build
  (16 cases, 624x368): wall faces 4,493 -> **2,200** (51.0% fewer), pixels of wall
  1,534,395 -> **1,404,572** (8.5%), black 0 -> **124,768** (96.1% of what went),
  floor **1,872,551 both ways, identical to the pixel**, nothing added and nothing
  kept built differently, crawlers and camp sites the same list, and **0 of 31,247**
  answers naming a square the cull took out. The floor coming out identical is
  lesson 21's promise said in pixels: nothing a crawler can stand on moves. Two
  suite tests pin the flag off for their own run — `cutting the buried walls opens
  no hole and moves a hairline only` and `the rock along a wall's far edges is
  painted only where the cut opens a gap (v0.45.0)` — because both measure bare
  backdrop as a FAULT and this release makes it a feature; their subject is another
  knob and their numbers were taken on the fully-rocked picture. `files/probe-skin*.mjs`
  and `CHANGELOG.md` v0.47.0 carry the reasoning. **Open question:** a lump of rock
  standing up out of the middle of a hill with rock on every side is gone too, so
  it reads as a black gap where it used to read as a lump. Keeping such lumps is
  one line and **has not been asked for**.

- ~~**A wall shows only the side with open ground in front of it.**~~ **Done —
  v0.48.0.** Asked for in as many words — *"only show the side(s) of a wall block
  that face the walkable area"* — and settled by effect first. The choice they took
  is the **strict** one: *"Only sides facing open ground, always — turn the view
  onto a wall's rock side and the wall vanishes, letting you see straight through
  into the room behind it."* So a side whose neighbour in front of it is rock is
  **not painted at all**, and the picture is see-through from that angle on purpose:
  the floor, the camp and the crawlers behind a wall are visible, and where no
  ground stands behind it there is the black. `Render.rockSides` is the rule (a
  code flag, not a sheet dial — it says what a wall IS, not how much to show):
  **2 ships**, **1 is the look not taken** (the same side cut down to the strip
  standing above the rock in front of it, opaque from every angle, **one number
  away if the see-through is too much**), and **0 is v0.47.0** (the whole stored
  side painted), which is the arm the change is proved against inside ONE build.
  It also fixed **two** flaps that v0.47.0 had left hanging, and they were the same
  eight-metre quad (a block's cap down to height 0, 8 m, 256 px) painted were the
  black should have been:
  1. `clipFaces()` built its neighbour map out of the batch, so a wall's neighbour —
     now culled before it becomes a polygon — read as "nothing in front", and the
     whole stored side was painted. The missing-neighbour branch now asks the world
     (`rockAt`), so the cut cannot depend on who is in the picture.
  2. The clip walk ran one short of the end of the list (`k < b.length - 1`), on the
     true-but-insufficient reasoning that nothing is painted after the last shape so
     it needs no cutting. The last shape was therefore never asked, kept the defaults
     that mean "nothing in front of me", and `wallsPainted()` handed back its whole
     stored side — and the skin is what made it bite, because culling the buried
     blocks **promotes a one-tile wall to the front of the list**. Seed 3, no turn:
     **1,580 px of wall laid over open floor**, floor 110,747 -> 109,167. It was found
     by a TEST — v0.47.0's own skin battery, whose subject is the floor — not by an
     eye, because a flap hanging over black is invisible against black and this one
     hung over floor. The walk now runs to the end; the extra question can only ever
     answer "nothing in front of me".
  Measured A/B inside one build, 64 cases (4 seeds x 2 angles x 4 turns x 2 zooms,
  each world settled, 64 distinct frames printed as the probe's own self-check):
  sides standing against rock 9,591, painted **8,288 -> 0** (22,909 m, 23,458,816
  px), wall faces **12,684 -> 4,396** (65.3% fewer), pixels moved 7,623,499 — of them
  **3,636,011 newly black and 2,117,117 newly floor** — black **2,991,701 ->
  6,627,712** (2.22x), floor **9,513,787 -> 11,630,904**, and of 196,608 picked
  answers **49,112 changed, every one of them rock** (29,844 became nothing; 24
  points that a wall used to cover turned out to be crawlers, which is why the people
  count rises 3,452 -> 3,476; rock 83,124 -> 34,012). **63.2% of the newly opened
  ground is the black itself**, which is the honest statement of the look: opening the
  wall with no black behind it would have been a different and worse picture.
  **The pick and the ring follow the picture for free and needed no work** — `pickAt()`
  (`faced.bl`/`faced.br`), `drawPick()` and the halo all ask `wallsPainted()`, and
  `sideShown()` asks the same `cutMeet()` the clip asks, so all three read
  `rockSides`. This is written down because a note here once said the opposite and sent
  a session looking for a gap that is not there. **One real seam, written down because
  it is invisible until it is not:** the pick names a block through its back strips
  (`faced.br`/`faced.bl`) while `shapeOf()` builds the ring from the cap and the two
  sides only — so a block that showed *nothing but* a back strip would be pickable and
  ringless. At `cut_solid` 1 `backBand()` returns null for every block, so nothing
  ships in that state; if the fade is ever switched on, that pairing is the first
  thing to check. **Five older tests pin the look for their own run** — all five
  measure a face standing against rock, two take `wallSkin(false)` as well as
  `rockSides(0)` because their recorded counts were taken on the skin-off picture,
  and the fifth is the skin battery itself, whose counts stop moving at the shipped
  look (once the sides rule has taken the face out, removing the block on top of it
  saves **0 pixels**, though it still leaves 4,429 squares a frame unbuilt — so the
  skin has become a saving rather than a look). See `CHANGELOG.md` v0.48.0.

- **The picture draws the whole world it holds, whether or not anyone has been there.** Asked for "voxels, and do not display ones that are unrevealed", the
  buried half turned out to be **mostly built already** — a block inside solid rock
  is not painted and cannot be pointed at, since v0.34.0's cut — and **v0.47.0
  finished that half off** for the 1,151 squares the cut was still painting (see
  the bullet above; the v0.46.0 note that followed from it is corrected in
  `CHANGELOG.md` v0.47.0). **The unexplored half is not built at all**. There is no memory of what has been seen anywhere in
  `src/js`: nothing remembers a square, so there is no remembered copy to draw and
  nothing to hide. `light` is worked out per square and floods only through what
  does not block sight, which is the closest thing that exists, but it is rebuilt
  from the sources each time and then thrown away — it is not knowledge. This is a
  world-model job, not a renderer job, and it is the ground-nobody-has-explored
  question below (question 3), which is now answered.

---

## Parked: what to build next

Offered as four options in September 2026. **They chose "the labyrinth goes on
forever"**: the endless ground was built in v0.20.0 and the fetching of it as the
crawlers walk in v0.21.0 (see `CHANGELOG.md` for the reasoning and `CLAUDE.md`
for how it now works). The three below are what is left of that offer; a fourth
has been added since. The one piece of the endless world still outstanding is
**throwing ground away again**, which is what keeps a long match from growing
forever — it is noted against the labyrinth line above and is not one of these.

### 1. The six needs — **decided, planned, not built**
Crawlers start needing things, and **six** of them: **Hunger, Comfort, Fatigue,
Sanity, Filth and Camaraderie**, six rungs each, each readable off the figure at
a glance. The fire stops being decoration and becomes the reason they survive the
night, because it burns fuel and needs keeping fed; someone has to gather food,
cook, keep warm and look after the ones who go down. It is the job that turns the
camp from a diorama into somewhere things go wrong.

**Their words for how it hangs together:** *"systems feed into each other.
activity uses up calories, food and rest restore fatigue, deep cold or heat slows
you down, etc."* — and the line that frames all of it: *"they are survivors -
they work a lot at maintaining health and preventing catastrophic needs."* So
this is upkeep that **mostly works**, and hardship is an *event* (a fire gone out,
someone down far from camp), not a slow slide nobody can keep up with.

**Which skills it brings in has to be counted, not guessed.** It definitely calls
**Foraging** (gathering food), **Tinkering** (cooking and making), **Tending**
(nursing whoever goes down) and **Grappling** (dragging a downed crawler home —
that skill's own line is *"dragging people out of trouble whether they like it or
not"*). **No skill carries the cold or the hunger**: the six needs deliberately do
not use skills for that at all.

**The shape:** six needs of six rungs on every crawler. Rung **3** is the one that
matters — **they know it**, and a crawler at 3 drops what they are doing and heads
for the larder, the bedroll or the fire on their own. Rung **0** is where someone
can die, and at 0 it is **one real roll**, not a slide.

**Each need is resisted by exactly one attribute** — chosen by them, one at a
time, not accepted as a table:

| Need | Resisted by | Read the link as |
|---|---|---|
| **Hunger** | **Might** | sheer body keeps them up once the food is gone |
| **Comfort** | **Agility** | the cold takes fine control first |
| **Fatigue** | **Endurance** | the body keeps going after the person stops |
| **Sanity** | **Willpower** | fear and boredom, and holding on anyway |
| **Filth** | **Intellect** | avoiding it by knowing better |
| **Camaraderie** | **Presence** | others gather round them, so alone bites less |

Every attribute is used exactly once: nothing doubled, nothing spare. **What moves
a need is what the crawler is DOING** — *"performing actions make you hungry"* —
not a clock. **What the attribute does is only resist the collapse:** it is the
number thrown at the one roll below, and it does nothing else at all.

**Four decisions shape everything else in it:**
- **They are survivors.** Self-care happens on its own at rung 3; the player is
  being warned, not managing meters.
- **A need costs speed, capacity and time — never a die, and never skill.** Rule 1
  means a starving crawler who rolled worse would fail more often, and therefore
  **learn faster**. So being in need must never make anyone better. "Slower"
  always means *more ticks or longer between attempts*, never a minus.
- **Everything in it is decided, not invented.** No new skills, no new attributes,
  no second set of rules.
- **One named exception**, below, and it is written down as an exception.

**The one roll — and rule 2's single exception.** The slow grind is plain
arithmetic with **no dice in it at all**. When a need bottoms out and they are
about to go down there is exactly **one** roll: **their attribute + 2d6 against
about a dozen** — the game's own roll shape with the skill left out. Rule 2 says
every roll comes from a skill, so this is the **one named exception**, and the
reason is that **a need is a property of the body, not a thing anyone has
practised.** It is safe because attributes carry no practice: the roll has nowhere
to put a lesson, so it cannot teach anything, cannot be farmed, and cannot spread.

**At 0 it does not stop there.** They go down where they stand, and someone has to
carry them back — **if nobody comes, they die.** Brought back alive they are **laid
up and need tending**, which costs the camp their work and costs whoever went out
for them. And depending on how bad it was, a **permanent injury**: a wound or a
scar that stays visible on the figure and comes with a dent in an attribute.
**Death is the floor and a scar is the ceiling.** That was their call, and it makes
an injury the only thing in the whole system that reaches the dice — a cost the
player pays for a crawler they did not look after, which nobody can choose and so
nobody can farm.

**Watching is built in here.** The watch falls to whoever is **least tired**,
decided among themselves — *"they will get tired at differing rates ... so they
will decide to keep watch based on who is most tired"* — and it rotates by itself,
because standing watch is not resting, so the watcher stops being the least tired
one and hands over on their own. **No roster, no timetable, no shift screen.** A
pinned "you keep the fire fed" beats tiredness rather than doubling it: one
watcher, never two. Before creatures exist, watching is the fire staying lit and
someone awake to notice a crawler going bad; it gets its teeth when creatures
arrive, and nothing about it is rebuilt for that. **This is also the reason needs
have to fall from activity rather than from a clock** — take that away and the
watch stops rotating on its own.

**Comfort is not only the fire**, and the first thing in the game that makes
exploring *pay* is in here: **hot vents and magma found in certain rooms.** Built
shelters stocked with fuel are the same idea done with hands, and come later with
the materials work. Clothing insulates and can overheat you; torches are carried
light and warmth at once; a hot meal pays Hunger and Comfort together.

**Cut from the first version, or deliberately later.** Cut: waystations you build
and stock (they need the materials work above); meat and anything else waiting on
creatures; farming; and any permanent illness model — a lasting hurt is a
consequence and a Tending job, not a disease system. **Deliberately later**: what
pays back **Filth, Sanity and Camaraderie**. They are in the design and on the
figure, and what clears them waits until the action-cost table exists and there is
something real to look at.

### 2. Things that live down there
Creatures, generated from tags rather than hand-authored (rule 6). Brings danger,
makes carrying a light a real decision, gives Brawling and Grappling a job. But
it is the combat fifth of the game, and rule 3 caps that at 20%.

*Amended 16 Sept, after the skills review: this used to name **Fighting** and
**Wrangling**, which are now **Brawling** and **Grappling**.*

### 3. Hands and work — crafting, cooking, repair
Gather materials, cook a meal, sew a coat, mend a broken spade. Puts Tinkering,
Foraging and Labouring to work and makes gear something you maintain.

*Amended 16 Sept, after the skills review: this used to name **Crafting**, which
has been folded into **Tinkering**, so the row now names the three skills that
actually do the work. Whether **Labouring** is the right third name for "gather
materials" — or whether that should be **Building** — is worth a decision rather
than an assumption.*

**Decided on 15 September 2026** — the gear-wear questions this was waiting on are
all answered:

- **Kit wears out, and it shows.** Their choice out of three was **both** "yes, and
  it shows — kit gets worn with use, you can see it on the figure, and mending it
  is a job" **and** "yes, and harder — kit wears, can snap or be lost down a hole,
  and crawlers can hand kit to each other". "Kit lasts forever" was explicitly
  turned down.
- **Worn-out-ness is a short ladder of states** — clean, worn, chipped, cracked —
  and each mend knocks it down one rung, so a thing lasts a few mends before it is
  scrap. Chosen over a number out of ten, and over nothing visible.
- **Worn kit is not dropped on the ground.** In their words: *"they can keep it in
  inventory, store at camp for later repair during downtime. perhaps repairs offer
  diminishing returns - max durability permanently decreases? Eventually they will
  have to decide whether to repair or to salvage for parts and build anew."*
- **Salvage returns real materials.** *"The actual stuff it was made of — leather,
  iron, cloth — counted separately, so what you salvage decides what you can
  build."* This is the hook that ties repair to making new things.
- **Kit changes hands on its own, unless pinned.** They help themselves from the
  camp store, and a particular thing can be pinned to a particular crawler *"so it
  doesn't wander off"*. This is the same pin idea the needs job uses for jobs, and
  it was decided here first.

### 4. The job system — who does what, and in what order
Their words: *"we will need to build a job priority system like Dwarf Fortress."*
Shape decided: **both, layered.** First a **short camp-wide priority order** that
everyone follows, with skills deciding *who* does each thing rather than *whether*
it is allowed; per-crawler permits only later, and only if the camp turns out to
feel too hands-off.

**No priority numbers.** The order is the order: a new sheet tab where the row
order *is* the priority, top row first — the same pattern the attributes and the
figure already use, and the same "row order is meaningful, and the build asserts
it" law that is already in `CLAUDE.md`.

**What it must not become:** a grid of tick-boxes per crawler. The law says the
player is a head coach, not a hand; Dwarf Fortress earns its spreadsheets because
its pleasure *is* the bookkeeping, and this game's pleasure is watching crawlers
make sensible choices.

**Comes after the needs job**, because the needs job proves self-care works with no
job system at all (rung 3 does it on its own), and the job system then gives the
player levers once there is enough going on to need them. It is a foundation that
creatures, materials, mending and foraging all plug into.

### The order they picked

Not a schedule — the roadmap says nothing in it is agreed or scheduled — but
recorded so nobody has to ask again:

**the last piece of the labyrinth (`forget-and-remake`) → the six needs → the job
system → mending and materials → the hands-on interface → creatures.**

---

## Parked: decided, waiting on the build

Nothing here is waiting on an answer; it is waiting on the work that will use it.
Recorded so that no session re-asks a question that already has one. Like
everything else in this file, **none of it is agreed or scheduled** — it is what
the answers were.

- **Gear may push an attribute past 6, on purpose.** Ruled: *"Let kit break the
  scale — 7 or 8 is fine, and we rewrite the rule to say so."* A bare crawler still
  runs 1 to 6 and the generator only ever rolls 1–6; **only kit breaks the scale**,
  and the rule is rewritten rather than left to drift. Two things change together:
  the sentence in rule 10, and the build's range check, which currently refuses a
  range that climbs out of that scale.
- **Rule 10 is two commitments, not one.** Ruled: *"#1, plus keep 'tactility' (i
  want to be able to drag and drop stuff eventually, see chits and pips stack up,
  move sliders etc)."* So low numbers *and* things you can handle. The second half
  is a live aim for the interface, recorded now so a later job does not quietly
  design it out, and it is worth stating in rule 10 itself.
- **"Boardgame aesthetics" was a wording mix-up, and it never meant the look.**
  Ruled: *"I meant small numbers and easily understood rules. not visuals, sorry I
  used the wrong word."* It is rule 10, which is already settled — so the gloom, the
  painted-miniature question and the grit overlay removed in v0.17.0 have nothing to
  do with it. The live half of it is the tactility above.
- **The bottom of the attribute scale is real, and enforced everywhere.** The sheet
  has `attribute_min` and `attribute_max` and **nothing read them**, so gear could
  already push an attribute to 0 today, and permanent injuries make that easier and
  stackable. Rule 10 says the scale is 1 to 6, so the sheet was right and the code
  was simply not listening. **Ruling: nothing reaches below 1** — no combination of
  gear, load or injury. It is a clamp rather than a rule: nothing is refused and
  nothing becomes invalid, exactly as carrying already works. The carrying ruling
  below is what turns this from tidy into load-bearing: an overloaded crawler's
  Agility is a number a load can push down, and the walking-speed curve has no row
  for zero, so without the floor the crawler carrying the most would be the one the
  game had no answer for. **The top of the scale is the opposite case** — 6 is a bare
  crawler's ceiling, not kit's (see the first entry here).
- **Pace reads Agility, and the drag it fights has a name: Encumbrance.** Pace comes
  from Agility on a **nonlinear, diminishing-returns** curve — each point buys a
  little less speed than the point before it, so a 6 is the quickest thing in the
  labyrinth without being absurd. A load is a separate, named quantity:
  **Encumbrance**, meaning the things carried past the free allowance that Might
  sets. It is **resisted by Labouring** — the skill whose own sheet line already
  begins *"Hauling, digging, clearing ground"*, and the skill the camp already rolls
  when it clears ground. Labouring **shaves a share** of the drag rather than
  cancelling a count of things, and it **never cancels it**: over the allowance there
  is always a floor of slowdown, so the load stays visible even for a master. This
  makes carrying the first pressure in the game answered by technique rather than by
  the body, and the only resistance that can **grow**. **What is left is numbers, not
  decisions** — the tick values in the curve, the share shaved at each level of
  Labouring, and how big that floor is.
- **The Pack already grants a Labouring bonus.** `bonus: "labouring:1"`, read by
  `gearBonus()` today, so a Pack-wearer counts as Labouring 1 before they have hauled
  anything. The item carries all three sides of its own trade-off: carries more,
  slows you down, and teaches you the carrying skill. Two other items carry Labouring
  too, at 2 and at 3 — there is a short ladder of carrying gear already in the sheet.
- **A crawler carries up to Might things, and going over is allowed.** It costs, it
  is not refused — the same principle `toolPenalty()` already states (*"Going without
  is not forbidden -- it is just very hard, which keeps one rule instead of two"*).
  Three things already written down become true at once: Might's note claims
  *"Lifting, hauling"*; the gear header says *"a pack makes you stronger-backed and
  slower"*; and the Pack's own data is `might:1, agility:-1`, which with capacity read
  as Might **is** "carries more and slows you down", the trade-off its note has
  claimed since it was written. The Pack is the only item in the game that shifts
  Might, and `agility:-1` is already the sheet's word for burden — only the Pack and
  the Jerkin use it, and the Charm's `presence:-1` is social. **Worn gear does not
  count**, and **a purse counts as one thing however many coins are in it**, which is
  why money went into a container. So the new machinery is one *source* of attribute
  shift and one count of carried things on the actor — most of the work is reading
  two numbers that were already there.
- **The overload cost is all three levers.** An overloaded crawler is clumsier (an
  Agility shift), walks slower (more ticks per step) and tires faster. One principle
  reaching three visible places, not three mechanics.
- **The Pack's note is now load-bearing.** *"Everything they own, on their back.
  Carries more and slows you down: the trade-off is the point"* — nothing in the game
  carries anything, so this note has been a promise since it was written, and it is
  now the sentence that defines what carrying must do. Worth reading as a free design
  spec rather than a new invention.
- **The purse is carried, not worn.** No thirteenth slot, no surrendered trinket and
  no wear-changing code: the purse waits on **carrying**, which is the stores work,
  not on creatures. Two follow-ups ride with it — **how a carried thing is drawn**
  (the figure draws by slot, and a carried thing has none), and **whether money can
  be held with no pack and no belt at all**.
- **`price` is a number, and prices may reach the tens.** The vast majority of items
  sit under twelve coins, so a price above a dozen is not expensive, it is *notable*
  — a free and useful property. The expected clash with rule 10 does not exist: its
  refusal names four things only (*"an attribute range, skill cap, die or dice
  count"*, `CLAUDE.md:150-156`), and the sheet already runs 9, 13, 13 and 45 without
  objection. The chosen ceiling is the sheet's own *"difficulty of about a dozen"* —
  `room.study_difficulty` is 13 — so prices land on the **target** scale rather than
  the roll scale. **The lesson generalises: rule 10 is a law about rolls, not about
  numbers.** Any future value that is not an attribute, skill, die or dice count — a
  capacity, a weight, a light reach, the fire's sight cap — is free to be whatever the
  fiction needs.
- **Does the camp you built count as seen? Yes.** It obeys the memory rule like the
  ground: what the crawlers built is drawn dimmed from memory, bright only where it is
  lit now. And a light **is seen from far beyond the ground it lights** — unbroken
  line of sight, up to a long cap. The sheet already states that half twice in its own
  words (*"glow 1 means it is never darkened by the room, because it IS the light"*),
  so this is that law asked a new question rather than a new law. One build note: **no
  `light.*` knob is a reach today**, so the cap is a fifth one to add.
- **The Slave Market is a ruin, not a shop.** Ruled: the word stays, the trade stops,
  nothing in the room is for sale, and no living stock exists anywhere. That makes it
  the **only** trade word that needs no creatures at all — stock, no staff, no second
  body, no lit-room problem — because the salvage-dealer half of a shop is exactly the
  `store_barrel` / `store_hoop` / `store_lid` parts the sheet already draws. So of all
  the rooms that could be shops, the darkest one is the cheapest to build, and a first
  coin sink already exists if one is ever wanted ahead of creatures. **A shop *with a
  shopkeeper* is not a system beside creatures — it is the reason creatures exist**,
  because a haggle needs an opponent with attributes of their own.
- **The people word does not change tense.** A living trader in a named room arrived
  **after the name was earned** — an occupant, not an owner — and the crawlers are the
  same kind of newcomer. So the labyrinth is a ruin *with things currently living in
  it*, not a frontier, and nothing about room generation changes: the 45% people roll
  (`world.room_people_chance`) was always a history roll, and `nameRoom(rand)` takes
  nothing but a random function, so the naming code has no access to the world and
  never needs any. The line worth keeping: **history is what you read, occupants are
  what you meet.** (It also means *"Abandoned Goblin Counting House"* with a goblin
  trading in it is correct rather than contradictory.)
- **Tags describe the place; an occupant carries its own.** Three tag surfaces already
  exist and this ruling only says which is which: a room's tags go on the **floor**,
  empty squares included (`45-ui.js:76-95`); the `worked` tag is already consumed to
  face a room's rock with dressed blocks, under a comment about a place *"somebody
  made"* (`13-rooms.js:485-510`); a crawler carries its own (`CRAWLER_TAGS`); and rule
  6's creatures are meant to *"describe themselves the same way"*. **Occupancy never
  renames a room** — a name is a record of what a place was, not a status. **One
  obligation falls out of it:** an occupant's behavioural tags have to be *agreed*
  rather than invented, because rule 2 says so and the build throws on an unknown tag
  (`08-knobs.js:22-29`) — and today the occupant's list is only `person, crawler`,
  which says what a thing **is** rather than how it **behaves**. That is a rule-6
  question, not an economy one.
- **The fifteen skill pairs were not actually theirs.** Answered 16 September: they
  only ever picked the **six attribute names**; the fifteen pairs grew out of the grid
  on their own. So the clause in rule 2 states a decision made *for* them and enforces
  it with a self-check labelled `(rule 2)` — the same shape as the four promoted items
  rule 2 warns about. The skills review left the grid intact anyway (all fifteen kept
  their pairs), so this is about the law's wording rather than about the game.
- **The skills have been reviewed — eight renames, three changed lines, and a trap
  that makes it more than a text edit.** Every key and every pair is preserved. New
  names: Clambering → **Focusing**, Wrangling → **Grappling**, Fighting → **Brawling**,
  Performing → **Entertaining**, Enduring → **Persisting**, and the key `ranging` on
  Agility+Endurance → **Maneuvering**; **Ranging** and **Crafting** retire (Crafting
  folds into **Tinkering**), and **Sneaking** takes the Agility+Intellect pair Crafting
  vacated. The trap: the movement skill has moved from Might+Agility to Agility+Endurance,
  but **the code does not know that yet** — `MOVE_SKILL` is `'clambering'`, so every
  difficult step is rolled as the throwing skill. Four things have to move together:
  `MOVE_SKILL` (`14-actors.js:249`) to `'ranging'`; the **Rope Coil** (`clambering:1` →
  `ranging:1`); the **Boots** (`clambering:2,ranging:2` — almost certainly `ranging:2`,
  as there is now only one movement skill); and the **Tool Belt**
  (`crafting:2,building:1` → recommended `tinkering:2`, since a work belt that helps you
  sneak is not what its note says). Those four are the complete set — every skill key was
  searched across `src`, so the rest of the rename is text.
- **One line of the sheet was changed by a later ruling, and the loss is worth
  knowing.** **Studying**'s note now reads *"Lore, mapmaking, deciphering, listening for
  what is out there, and sitting with a problem until it gives."* — because noticing a
  sound became a Studying roll. The words that went were *"a script, a mark, or a room"*,
  and a room was Studying's only job in the game today.

- **The fog remembers, and the player sees only what the crawlers know.** Answered in
  the side chat, 16 September, and between them these two rulings settle the unexplored
  half. **The shape:** ground the crawlers have seen **stays drawn, dimmed**, and only
  what is lit *right now* is drawn brightly — Dwarf Fortress' answer, chosen over "the
  world is simply not there" and over "the ground is there and unlit". **And the player
  knows only what the crawlers know**, which is a ruling about the whole interface rather
  than about rooms: today the entire labyrinth is drawn the moment the level loads, so the
  only thing discovery gates is a room's name. Of the three sizes that could take, they
  chose the **strictest** — the ground itself withheld, not only its labels.
  What makes it cheap is that most of it is already written. `light.ambient` (**0.14**) is
  *exactly* the brightness a remembered square wants, and its own note already describes it
  that way — *"how much you can see where nothing is lighting the way"*
  (`defaults.json:329-332`) — so the dim state is a surface drawn at zero light with the
  dial already exposed; `light.steps` 6 gives six brightness levels to draw between dark and
  fully lit; and the light flood already refuses to pass a blocking square
  (`12-world.js:1088-1092`), which is the shape of a visibility routine, already running,
  already used every frame. **What is genuinely new is only the memory** — a per-square "a
  crawler has seen this" flag that outlives the light, plus the renderer drawing remembered
  squares instead of skipping them. Two more pieces fall out for nothing: **rule 8 needs no
  second rule**, because the pointer already answers from the shapes the painter actually
  painted (`40-render.js:1935`, `:1976-2011`), so a square the fog keeps out cannot be named
  by the pointer; and **there is no save system anywhere in `src/js`**, so a per-square flag
  needs no file format and no migration. The one honest caveat is written up as question 11
  below.
- **Sight *is* the light.** Ruled strictly: **a crawler sees exactly where light reaches
  them, and a crawler in the dark contributes nothing to the map.** The sheet already said
  so — the campfire's own note calls it *"the only thing that lights a room"*
  (`defaults.json:1952-1963`) — so this is a law the sheet was carrying all along, asked a
  new question rather than a new law. Five consequences, and the last two change other
  people's work: **the dark stops being free** (it is blindness, not a penalty); **carrying
  the light becomes a job**, and it competes with the watch, because both need the same small
  pool of tired people; **reading a room in the dark is impossible rather than harder**, which
  is what the Lantern's `studying:2` is actually for; **the campfire's 9 squares are the whole
  known world at the start**; and **a fire going out becomes a blindness event, not a comfort
  event** — nothing in the game consumes fuel today, so under this ruling the missing fuel
  rule stops being a nicety.
  One line of the sheet now says something untrue, and it is the wording rather than the
  number: `light.ambient` is described as *"how much you can see where nothing is lighting the
  way"*, and under this ruling that is nobody. **The value stays 0.14** — it becomes *how
  brightly remembered ground is drawn*, which is exactly the job the ruling above gave it.
  A `note` change, not a number change, and the sort of edit this review exists to catch.
- **Carrying a light costs one hand and nothing else — and the seed can rarely start you
  blind.** Checked against the gear sheet rather than assumed: all three light sources —
  **Candle** (3), **Lantern** (6), **Torch** (8) — are `offhand`, and the offhand list holds
  *nothing else*, so a lamp never competes with the Spade, which is `mainhand`. **A tool and a
  lamp are not in competition.** The two lights that help you read a room are the two that give
  bonuses (Candle `studying:1`; Lantern `studying:2,foraging:1`), so the sheet already ties
  light to reading. And the seed can rarely start a group blind: six crawlers at a 55% gear
  chance (`actor.gear_chance`) against exactly three offhand items means roughly **one start in
  120 has nobody carrying a light at all**.
- **The game opens in the dark, and the first fire is the crawlers' own work.** The campfire is
  already the first thing in `campPlan()` (`16-camp.js:18-60`) and the **only** camp structure
  that lights anything — light **9**, against bedroll, store and windbreak at 0 — so the camp is
  invisible until the fire exists, and **the fire's light is what reveals the camp that was
  already planned**. The world appears in a nine-square circle, and it is the camp. The ruling
  changes nothing about what happens; it changes only that the player can now *see* it happen,
  so the first thing that happens becomes the first thing that matters. It is also the first
  lesson: Building is a difficulty 15 roll that suffers without a tool, so a first fire built
  badly teaches rule 1 before the player has learned anything else. Three small rules it forces,
  all answered here: **you can work on what you are touching** — otherwise a crawler with no
  lamp could not build the fire that would give them one, which is a deadlock in the opening
  minute; **fog covers ground, not your own people**, because you are the coach and you know
  where your crawlers are; and **the camp's unlit sites are not outlined either**, so nothing
  is drawn in advance of the light.
- **Reading a room has to have a consequence — that is how the "nothing finds anything" hole
  closes.** Chosen over the three alternatives, all of them recorded: contents riding on a
  different skill by room type (which would mean assigning all 42 function words to a skill);
  a second named exception to rule 2, attribute-only, for noticing (which would put two
  exceptions in a file that used to have none); and "nothing is ever secretly hidden" — which
  was replaced, more strictly, by *the player knows only what the crawlers know*. Nothing needs
  building *to find out*, because the roll, the title, the tags and the panel display **all work
  today**; what was missing is that knowing changed nothing. So the tags get a consequence: an
  `infested` room ought to make a crawler cautious, a `store`-tagged room ought to be worth
  entering, a `collapsed` room ought to be slower to cross, and an unread room ought to feel
  like a risk. That is a question about what the crawler *does with* the tags, not about whether
  the tags reach the player — no new skill, no new exception, no new vocabulary. Two things are
  left open by it: whether a failure has any *bite* (does an unread room hide anything
  dangerous?), and what the dark now costs, which the ruling below answers.
- **A creature nobody has lit up is heard, not seen — and once met, the map keeps where it was
  last known to be.** Both halves together, because they are the present and past tense of one
  thing: a sound mark is *something is out there now*, carries no picture, and you know roughly
  where but not what; the remembered mark is *last seen here*, and it may be stale, which is the
  most honest warning a dark labyrinth can give. **The mark has to read as old, not as a
  tracker** — drawn the same way as a seen creature it would quietly undo the ruling above by
  handing the player a live position for something no crawler can currently see. The honest
  cost: **there is no audio, sound, noise or hearing anywhere in `src/js`**, so of everything the
  fog forced, this is the one piece that is new machinery rather than a re-use of something
  already written. **Noticing a noise is a Studying roll**, and **what the crawler is doing
  changes what they can hear**, which turns the game's own flavour into a mechanic: *the crawler
  reading a room is the one who can hear; the crawler hammering at a wall is the one who cannot.*
  Job noise wants a column, and the job table is still a plan rather than code, so this is the
  cheapest possible moment to add one. Three things it lays on other work: **all the noticing in
  the game would sit on one skill**, so a group with nobody strong in Intellect and Willpower is
  deaf as well as blind; `STUDY_TRIES` 3 needs a counterpart for hearing, or a crawler stands in
  the dark rolling forever; and hearing must be **easier** than reading a room, which is
  currently 13 — the number itself is question 10 below.

---

## Parked: questions waiting on them

Rule 2 says ask and wait. These have been asked and are still open. Questions that
**have** been answered since are not repeated here — they are in **Parked: decided,
waiting on the build**, just above.

1. **Natural stone was reworked in v0.25.0 to look like a photograph they sent;
   nobody has said whether it does.** The stone every wall of bare rock and the
   camp floor wears is now broad soft mottling rather than the fine hatching it
   was. **The other materials were not touched** — flagstone, dirt, moss, rubble
   and bones are all still as generated, and the same offer stands for each: send
   a picture of what it should be and it is one branch of `matTile()`.
2. **The rock is too tall and you can see the top of it — the heights are done,
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
3. **Ground nobody has explored or lit is still drawn as if it were known. — ANSWERED:
   the fog remembers, and the player sees only what the crawlers know.** The ruling is
   in *Parked: decided, waiting on the build* above. The three shapes below are kept as
   the record. Theirs,
   offered the two readings of "unrevealed": *"both — but buried blocks don't
   really need to exist, right?"* The buried half is already the case (a block
   inside solid rock has not been painted since v0.34.0); the explored half has
   nothing behind it and is the genuinely unbuilt part of this request. It needed
   answered before it could be built, because the three shapes it could take were
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
   Whatever is chosen, **what counts as seen** is answered: it obeys the memory
   rule like the ground, so what the crawlers built is drawn dimmed from memory and
   bright only where it is lit now, and a light **is seen from far beyond the
   ground it lights** — unbroken line of sight, up to a long cap. The sheet already
   states that half twice in its own words (*"glow 1 means it is never darkened by
   the room, because it IS the light"*), so this is that law asked a new question
   rather than a new law. One build note: **no `light.*` knob is a reach today**,
   so the cap is a fifth one to add, and its value is theirs to pick.

4. **Six things about the job system**, which have to be asked rather than
   invented: how many things sit on the short camp-wide list; what an idle crawler
   does when the list is empty; whether a claimed job can be dropped and go back on
   the list; how a standing order says "keep the fire fed" (it is conditional); how
   far the player's urgent order reaches; and whether the camp-wide order has a
   **"never"** position before per-crawler permits exist.
5. **`forget-and-remake`** — the one piece of the endless labyrinth still
   outstanding, noted against the labyrinth line above. It comes first in the order
   they picked.
6. **The action-cost table** — the engine under all six needs, and the thing the
   whole job sits on: what each action costs, in what units, and whether the cost
   lands **every tick it is happening or once when the work finishes**. *The watch
   only rotates by itself if it lands per tick*, so this one is load-bearing.
7. **What pays back Filth, Sanity and Camaraderie.** They are designed and on the
   figure; what clears them is deliberately held until the action-cost table exists
   and there is something real to look at.
8. **Does 6 mean fine, or does 6 mean desperate?** *Hunger* and *Filth* name the
   problem and read one way round; *Comfort* and *Sanity* name the state and read
   the other. One scale has to win, and it should be chosen rather than inherited.
9. **Six needs on one small figure at a glance** — carry only what is going wrong
   and keep the good news in the panel, or group the body needs apart from the mind
   and social ones.
10. **How hard is it to hear something?** Direction is settled — hearing is a
    Studying roll, and what the crawler is doing changes what they can hear — but
    the number is not. It should be easier than reading a room (13), because a noise
    announces itself and a room's history does not.
11. **Plan-view sight versus a view with height.** The light flood runs over the
    flat map while the picture is a tilted view down into a place with pits,
    terraces and ramps, so the two can disagree — you may see the near face of a rock
    the flood never reached. Accept the disagreement and let the flood define sight,
    or build a true three-dimensional sight test. Cheap and consistent, or a research
    project.
12. **Four peoples with no tag, and the question is now smaller.** Goblin, Kobold,
    Troll and Human are the only peoples carrying no tag. It used to matter twice —
    no attitude for a shop, no flavour for a room — and the tag ruling above removed
    the first, so what is left is **purely a room-flavour gap**. Under rule 2 a tag
    is asked for, not invented.
13. **The carrying leftovers that are not decisions.** Whether a crawler with Might
    1 carrying one thing is what was intended; and the numbers themselves — the tick
    values in the pace curve, the share Labouring shaves at each level, and how big
    the floor under it is. Also worth a second look before it is written down:
    whether **Encumbrance** is the word, and whether it becomes a new *scale* or
    stays a quantity with no range of its own.

14. **Where does a shop's stock come from, if `Market` carries no `storage` tag?**
    Market's only tag is `worked`, while Counting House, Warehouse, Granary, Larder,
    Armoury and Cistern all carry `storage`. So the sheet already separates *where a
    thing is sold* from *where a thing is kept*, and a Market's tags say nothing about
    what it has. Either stock belongs to the function word, or `storage` should be the
    sign of it, or it is separate from both.
15. **Is a shopkeeper drawn, or only the stock?** These are the two halves of a shop,
    and **only the first needs rule 6 and a second body** — the salvage-dealer half is
    exactly the `store_barrel` / `store_hoop` / `store_lid` parts the sheet already
    draws.
16. **Must a shop be lit to open? — parked by decision, not open.** *A shop is a
    creature, and light is the mechanism*: the ruling above is that a creature nobody has
    lit up is **heard, not seen**, so if a shopkeeper's fire is what makes a trader
    dealable, then the economy and the fog are one system and the act of trading becomes
    a beacon. **Deliberately parked** — nothing about a shop can be built until rule 6
    exists, and settling the lighting rule now would mean deciding the details of an
    unscheduled milestone, which the order they picked warns against. For whoever
    answers it later: campfire **9**, torch **8**, lantern **6**, and the offhand slot
    holds exactly one of the three.
17. **Are there captives anywhere else?** The Slave Market ruling is about that room's
    *stock*, not about captivity as a system. **Gaol, Oubliette, Menagerie and Kennels
    carry the same `captivity` tag**, and if rule 6's creatures ever exist then a Gaol
    with something in it is exactly what the rule was written for. So the answer is not
    a general "no captives anywhere" — it is **"nothing is for sale"**.

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
