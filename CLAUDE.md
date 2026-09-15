# Project Crawlers

Read this first, every session. It is the only memory that survives.

**The permanent playable link — publish here every time, forever:**
https://claude.ai/code/artifact/4938012a-682f-46b7-8ca3-41ecef8219b6

**`ROADMAP.md` is the queue** — what has been offered, measured or asked and is
waiting, including the questions they have not answered yet. Read it before
proposing what to do next, so the same thing is not offered twice. Nothing in it
is agreed; this file is the law, that one is the list.

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

*Ten rules about what this game **is**, WRITTEN BY THEM. Each is one sentence
of rule and a paragraph of what it protects. Do not re-litigate these; do not
quietly drift away from them.*

**Do not add to this list yourself.** An instruction is not a rule. Four were
promoted here out of passing requests -- including one that was a BUG REPORT
read as a feature -- and the result was a list that said "yours" over things
they had never made law, and a real bug built on purpose and defended for two
releases. Ask before anything is numbered here. Everything else goes under
**Decisions so far** below, where it can be changed without ceremony.

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

**10. Boardgame aesthetics, low numbers, and tactility.** Carried over from the
previous project and confirmed here. **Attributes run 1 to 6**, skills 0 to 6,
and an attempt is `attribute + skill + 2d6` against a difficulty of about a
dozen. Every number in the game should be one a person can hold in their head
and a hand could move: 4 and 2 and a throw of 7, not 31 against 55. The build
refuses an attribute range, skill cap, die or dice count that climbs out of that
scale. This was missed for nine releases -- the numbers were built on a
hundred-point scale first -- and the cost of finding out late is exactly why it
is written here now.

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
  13-rooms.js         the room vocabulary: naming a place and shaping its ground
  14-actors.js        the six attributes, skills, rolls, learning, crawlers
  16-camp.js          choosing a room, laying out a camp, and working at it
  18-figure.js        the skeleton, the poses, and one crawler's geometry
  20-input.js         key / mouse / touch, all writing the same state
  30-sim.js           one fixed simulation step
  40-render.js        isometric blocks, figures, the pick pass, `consumed`
  45-ui.js            the inspector: a hover tooltip and a pinned foldable panel
  90-boot.js          the pixel-perfect buffer, whole-number zoom, the loop
  99-test.js          window.__test - the only way a test touches the game
tests/run.mjs         headless tests, driven through window.__test
ROADMAP.md            the queue: what is parked, and what they have not answered
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
- `ability = average of the pair + practice`, and then **2d6 is thrown on top**
  and the sum is compared with a difficulty. Both weights are 1, so the number
  on the sheet is the number in the roll (rule 10). A crawler with Might 4,
  Intellect 4 and Building 2 brings 6, throws 2d6, and needs 15 for a campfire.
- `attempt()` in `14-actors.js` is the ONLY place anything is ever resolved.
  A new thing a crawler can do is a call to `attempt()` naming one of the
  fifteen -- never a second way of deciding whether something worked.
- **Whole pips only.** `skillPips()` floors a skill before it enters a roll, so
  every roll is whole numbers a person could read off a table (rule 10).
  Practice accumulates in fractions between pips and buys the next one; it never
  dribbles into the result. The panel shows pips, not a decimal.
- Gear reaches the roll through the same funnel: `effAttr()` applies its
  attribute shifts, `gearBonus()` its skill bonuses, and `toolPenalty()` the
  cost of working without the tool a skill names in `needs_tag`.

**Rule 1 is not a curve.** There is no code anywhere that slows progress down.
Failing teaches 0.10, only just failing teaches 0.16, and **succeeding teaches 0**
-- on a skill scale that runs to 6, so mastery is about sixty failures.
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

### Rooms are places, and places are built out of words (`13-rooms.js`)

A room used to be one flat sheet of floor -- 90 of 90 dead flat, with 69% of all
walkable ground inside a room and 1% of the floor a ramp. All the height was in
the corridors. That is what they meant by "elevation disappeared when we switched
to rooms and halls".

- A room's name is composed, not chosen from a list: one `function` word (what it
  was built to be), up to two `condition` words (what has happened since), and an
  optional `people` word (whose it was). "Haunted Silent Miners' Bathhouse".
  84 words in the `words` tab make about a quarter of a million names.
- **A word carries both halves of itself on one row**: what it MEANS (its tags)
  and what it DOES to the ground (its shape moves, the floor it lays). "Flooded"
  is not a label applied after the water; putting water in the low ground IS the
  word. Same principle as a gear row carrying its look and its effect together.
- Seven shape moves exist -- `pit`, `platform`, `terrace`, `ring`, `pillars`,
  `rubble`, `water` -- and **the build refuses a word asking for anything else**.
- **A place is discovered, not given.** Rooms start unnamed; a crawler standing in
  one stops and reads it, which is a Studying roll like any other, so failing
  teaches them (rule 1). Three tries each, then they let it lie. Until it is read,
  a square there is just floor.

**Three things keep a shaped room walkable, and each was earned:**
1. **The border ring is never touched.** That is where halls arrive, so nothing
   about hall digging had to learn that rooms have shape now.
2. **Heights step by one metre only.** `smoothRoom()` pulls down anything higher:
   a pit inside a ring made a two-metre drop and stranded 21 squares of a flooded
   orcish arena, because a ramp climbs exactly one metre.
3. **Ramps are placed per PAIR of touching shelves**, found by flood-filling
   equal-height regions. Grouping them by row put a ramp in every row and turned
   every ledge into an open slope.
Blocks are separate: **a pillar goes in only if the room is still whole with it
there**, checked one block at a time.

**NEVER put anything solid on a room's centre square.** The generator uses that
square AS the room -- it is what a hall is aimed at, and what the final
reachability sweep tests -- so a pillar standing there does not block one square,
it deletes the whole room. Every room in the world vanished and 25 tests failed
at once with `undefined`.

**A crawler walks; they do not appear in the next square.** The roll still
resolves in one instant -- that is the mechanic -- but the arrival is spread over
`anim.step_ticks`, eased in and out through position AND ground height so a ramp
is climbed rather than stepped up. `actorPos()` in `14-actors.js` is the ONLY
answer to "where is this crawler right now"; the renderer asks it both for where
to draw the figure and for its depth, so someone mid-stride sorts against the
world where they actually are, not where they are filed.

**A crawler mid-step paints after every square that step covers.** Their own
nearness number alone is not enough, and v0.19.0 was that bug (lesson 18): a
ground square's nearness is its **centre**, and mid-step the feet are inside the
square being entered, so that square used to paint over their legs. While
`actor.moveT < 1`, the actor's depth is the largest of their own square, the one
they left and the one they are entering, so no flat ground the step touches can
paint over them. Rock in front still can and should -- rock has height. The three
depths collapse to one the moment the step ends, which is why this is a no-op for
a crawler standing still. `render.stepGround` (default `true`) flips the rule off
for the one test that paints the same stride both ways and counts.

---

## The inspector (what the popups are called)

Two surfaces, and the difference is the point:

- **the tooltip** follows the pointer, says the thing's name and ONE line, and
  is not clickable (`pointer-events: none`). Rule 8 is satisfied here.
- **the panel** is pinned by clicking or tapping, stays put, and CAN be clicked
  -- which is what lets the long lists fold. It opens with the six attributes
  showing and **skills and gear folded**, because twelve gear slots unfolded is
  what made the old popup bury the game.

`describe()` returns plain data; `renderTip()` and `renderPanel()` put it on the
page. Split so a test can prove both that the description is right and that it
reached the screen.

**A selection outranks the pointer.** The ring is drawn on `state.selected` and
falls back to `state.hover`, so the crawler you pinned keeps their outline while
they walk away from where you were pointing. It was the other way round once, and
the ring came off them the moment the pointer moved.

**Both surfaces write to the DOM only when their words changed.** They are
rendered every dirty frame, and riding a crawler makes every frame dirty. Writing
`innerHTML` unconditionally destroyed and rebuilt the close button and the fold
headers sixty times a second, so no click ever completed -- a click needs the same
element under the press and the release. The listener is delegated and survived;
the button did not. Anything that rewrites a container a user can press must
compare first.

**A selection is taken at the PRESS, not the release.** Crawlers walk, a click
lasts about a tenth of a second, and a crawler crosses a square in 0.37s -- so
reading `state.hover` on pointerup selected whatever they had walked off. 1 press
in 6 kept its crawler; now 6 in 6.

**The tooltip holds its tongue until the pointer moves** (`pointer.quiet`, set on
click, cleared on the next real move), and never describes what the panel has
already pinned. Picking a crawler locks the view onto them, the world slides, and
whatever drifts under a stationary cursor was not pointed at.

**A selected thing is ringed by its own silhouette**, not boxed: its polygons
are painted in the highlight colour underneath it, fattened by a stroke, and the
thing is then drawn on top and covers everything but the ring that stuck out.
Internal edges never show because they are covered. One pass, any shape, and it
works the same for a posed figure, a block and a half-built store.

The panel's click handler reads `Game.state` at click time rather than closing
over the match that existed when the page loaded -- otherwise a new match leaves
it wired to a game nobody is playing.

---

## Decisions so far (not rules)

These are settled and built, and they can be changed by asking. They are NOT
non-negotiables; do not treat them as law, and do not announce a change to one
as breaking a rule.

### The picture: pixel perfect, 32 pixels to the metre

Their words were "lock our artificial pixelized resolution to 32px per meter
tall", so a crawler is 52 px and stays 52 px. Zoom changes how many REAL screen
pixels one game pixel covers -- by a whole number -- and the picture is drawn
smaller to match; it never scales the world. The camera only ever sits on whole
pixels. This one is load-bearing: every measurement in the game is built against
it, so moving it moves everything.

### The camera turns, and it can be raised

Four quarter turns and two angles, Final Fantasy Tactics style, with the swing
animated and the focus held still so the world turns around what you were
looking at. The swing runs on real milliseconds rather than game ticks. Raising
the angle opens the ground out (`tile_h`) and leaves wall heights alone, so the
32-pixels-to-the-metre scale holds at both angles.

### Gear does three things at once

A piece of gear SHIFTS an attribute (a pack is +1 Might, -1 Agility), BONUSES a
skill (boots are +2 Clambering), and some work REQUIRES it (Building bare-handed
is 6 points harder, which on a scale of about a dozen is close to impossible). All three go through
`ability()`, so there is still exactly one place anything is resolved. A gear row
carries its look and its effect on the same line of the sheet, so the two cannot
drift apart.

### The clock: time runs on its own, and the player owns it

Time runs by itself, like any game. There was a version that only advanced the
world while the view was moving; that was built by mistake, out of a bug report
read as a feature request, and it is gone. Do not reintroduce it without being
asked for it in as many words.

The player pauses and sets the speed. Speeds are rows in the `speeds` tab -- add
one, delete one, change a multiplier -- and the build refuses a list whose first
row is not 1x, since the first row is what "normal" means. `time.max_steps_per_frame`
caps how far the world may lurch in a single drawn frame.

**Pause and speed never touch the camera.** The swing and the tilt run on real
milliseconds, so the view still turns smoothly while the world is frozen, and a
test asserts exactly that. Two clocks, kept apart on purpose:
`Game.paused` is the TEST freeze; `state.paused` is the player's.

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
- `figure` rows are **lathed shapes** hung off a bone: `from_m`/`to_m` along the
  bone, `w_top`/`w_bot` and `d_top`/`d_bot` across it, `ox`/`oy` to sit a pack
  behind a chest, and then `sides` round the part, `rings` along it, `bulge` to
  swell the middle and `cap_top`/`cap_bot` to round an end off along a circle.
  Four sides and two rings is exactly the tapered box this replaced.
  **A rounded end needs at least 3 rings** -- with 2, both rings sit inside the
  cap, both collapse to a point, and the whole part disappears. The build
  refuses that combination, because it took a missing pelvis to notice.
- **A cap belongs only on an end you can SEE.** `cap_top`/`cap_bot` round an end
  down to a point -- right for a skull, a sole, a fingertip. On the end of a limb
  that is BURIED in the next limb it is not a nicety, it is a pinch: both sides of
  the joint taper to nothing and meet as two points. Every joint on the crawler
  had them, the knee necked to one pixel and then to none, and the figure read as
  a head, a blob and two floating feet.
- **Joints OVERLAP; they never meet.** Two centimetres is the floor, and the
  buried end is flat and full width. A part authored to meet the next one comes
  apart the moment the pose bends it (lesson 7, which this project had already
  written down once).
- Rule 4 has a floor: if every face of a worn part comes out smaller than
  `render.min_face_px`, the largest is drawn anyway rather than letting a piece
  of gear silently vanish. Small gear (a charm, a rope coil) is also drawn
  **larger than life** -- at 32 pixels to the metre a true-scale charm is under
  one pixel wide.
- A row is drawn if its slot is `body`, or if the item it names is the one worn
  in its slot. **There is no other path to the screen**, and the build refuses
  any piece of gear that no row draws (rule 4) or any slot nothing can fill.
- Back faces are dropped, faces too small to see are dropped, and each face is
  lit by its own normal against a light fixed in the WORLD, so the sun does not
  spin when the view does. Lighting is **stepped, not continuous** -- which
  keeps the texture cache small and reads as paint rather than gradient.
- Parts are depth-sorted within a figure along the camera axis, which swings
  with the view.

**The figure is measured, not admired.** `__test.figureRows()` draws one crawler
alone and counts how many of their pixels land on each row of the picture;
`__test.figureSpans()` gives every part's extent in metres. Two tests use them:
one fails on an empty row or a one-pixel row across 40 renders (five poses, four
camera turns, dressed and bare), the other fails if any joint in the skeleton
does not overlap, or if the result stops being shaped like a person -- height
within 6% of `actor.height_m`, head 11-17% of it, shoulders 17-27%. **Trim two
rows at the crown and three at the sole before judging**: a head and a toe are
supposed to taper, and counting them as defects failed 26 poses for the wrong
reason.

**The camp is real geometry too** (`structure_parts` tab): the same lathe as a
crawler's parts, hung at an offset from the SQUARE instead of off a bone, with
its own `lean` and `spin` so a log can lie across a fire. A part marked `grows`
rises out of the floor as the work goes on -- that is how a half-built camp still
reads as half-built -- and a part that does not grow (a flame, a lid, a blanket)
is absent until the job is done. The build refuses a structure with no parts.
**Keep the budget in mind: these are 15-25 pixels across**, so four or five sides
and three rings, not nine and five.

**Animation is procedural, and split on purpose:** the SHAPE of each clip (walk,
work, idle) is code in `18-figure.js` because it is logic; every AMOUNT is a
knob, so the stride can be widened or the work slowed without touching it.
Crawlers turn the short way round to face where they are going.

Animation runs off `state.tick`, so it follows the player's clock: it stops
when they pause and runs fast when they speed up.

---

## The surfaces (materials)

**There is no grit overlay.** There was one for fifteen versions -- a generated
speckle laid over every single face in the game, crawlers and camp included --
and it was removed in v0.17.0 because it read as dirt sprayed across the lens
rather than as anything belonging to a surface. What is left is the thing that
IS the surface.

A tile may name a `pattern` in the `tiles` tab; blank means plain, and the build
refuses any pattern the renderer does not know. **Materials are generated, not
painted** -- flagstone, dirt, moss, water, rubble, bones, rock, masonry -- all a
metre square, all transparent overlays over the tile's own colour, and **one
locked palette** across every tile is what makes them belong together.

- **A material goes on the GROUND and on a laid wall. Nothing else is textured.**
  A crawler and a piece of the camp are flat-coloured lit faces, and the figure
  is what you read them by. A test counts pattern fills against plain ones and
  fails if anything but the ground is carrying a texture -- which is how "the
  grit is gone" stays true rather than drifting back.
- **The material is baked into a cached per-colour pattern**, not painted as a
  second fill. Filling every face twice cost 8 ms a frame -- half the budget.
  Baking costs one fill again, at the price of stepping the lighting so the
  cache stays bounded (20 patterns now the grit is gone; it was about 700).
- **Shaded faces go COLD, not just dark** (`texture.hue_shift`). A flat multiply
  takes every material to the same sludge.
- **Side walls of blocks are left flat.** The ground is what you look at; the
  sides are in shadow and edge-on. Texturing them too cost 7.6 -> 10.7 ms of
  drawing when it was measured on v0.14.0.
- `texture.strength` 0 turns every material off and leaves plain colours, and a
  test compares a textured picture against a flat one of the same moment to
  prove the materials reached the screen.

### Masonry, and mapping a texture onto the model

`masonry` is worn by **Stone Block Wall** (`stone`, `constructed`, `solid`,
`blocks-sight`).

- **A directional texture must be MAPPED ONTO THE FACE, never pinned to the
  screen.** Isotropic noise gets away with screen-space pinning; masonry does
  not -- pasted flat it sheared with the projection and slid across the wall as
  the camera moved. `faceFill()` gives each face its own affine map -- one tile
  of texture to one metre of wall -- built from that face's own corners. A planar
  quad under an isometric projection maps exactly affinely, so there is no
  perspective term to miss.
- **Generate from a model, then draw it.** The first masonry walked its
  randomness twice, once for the stone shades and once for the joints, and the
  two walks drifted apart so the joints missed the stones.
- It tiles by construction: courses sum to the tile height, stones to its width.
  About one stone in five spans two courses and SWALLOWS what is under it --
  stones, head joints and bed joint -- or the course below paints back over it.
- Only rock facing a room somebody MADE is faced (`worked` in the room's tags);
  a mine or a quarry keeps the rock it was hacked out of. Done after the halls
  are cut, so doorways stay doorways.
- **Only a DIRECTIONAL material is mapped onto a face; everything else is
  pinned.** Fracture, dirt and moss have no direction to get wrong. A mapped fill
  costs about **50 microseconds**, so giving raw rock a mapped material meant 686
  of them a frame and took drawing from 7.96 ms to 43 ms. Mapped: laid masonry,
  ~100 cells a world. Pinned: every floor, one transform per pattern per frame.

### What a frame costs, and where it goes

Measured on v0.17.0, seed 1, camp in view, 1100x760, 80 draws of one frame:

| what | ms | note |
|---|---|---|
| drawing the picture | **7.0** | 1,695 faces; 343 patterned (the ground), 1,352 flat |
| the hidden picture the pointer is found in | **4.8** | only painted when a pointer asks (`pickAt`), not every frame |
| working out the shapes | **1.4** | grows with the size of the labyrinth; everything else does not |
| the cutaway, the light map, the simulation | **<0.3** | together. Not worth looking at. |

Inside the drawing, **the rock side walls were two thirds of it**: 686 faces,
2.9 ms, covering ten screenfuls of pixels. They are drawn from each column's top
**all the way down to the floor of the world**, so 90-96% of what is painted is
inside the rock standing next to it (measured on seeds 1, 2, 3, 7, 777). Dealt
with in v0.18.0, below.

Crawlers and camp pieces together are 666 faces but under 10,000 pixels -- about
5% of one screenful. They are not the problem and never were.

**As of v0.18.0 the rock walls are clipped against the rock next door**, so a
side wall only drops as far as the neighbour it faces. Measured on the built
file with the flag A/B-ed inside one build (paused repaint, seed 1..777, 624x368
-- `probe` protocol, not the table above): the wall faces painted fall 786 -> 164,
762 -> 170, 474 -> 105, 814 -> 183, 378 -> 92, the pixels they cover fall by
71-81%, and drawing the picture goes 5.92 -> 4.38 ms (seed 1), 6.87 -> 4.92 (2),
5.00 -> 3.56 (3), 5.35 -> 3.81 (7), 4.06 -> 3.35 (777) -- 17% to 29%. The wall's
own visible sliver is still painted; what went away was paint inside other rock.
See the v0.18.0 entry in `CHANGELOG.md` for the seam it leaves, and `tests/run.mjs`
for the bounds that keep it honest -- **the picture is not byte-identical and
cannot be**: 2.6-4.8% of the picture moves by a shade or two at overlapping soft
edges (worst 20/255), while nothing that was visible moves at all.

---

## Light, and the dark

The labyrinth is dark. `light.ambient` is 0.14 — you can just make out shapes.
Light is something you carry into it or build.

- Worked out **per square**, not as a glow on the screen: each source floods
  outwards through whatever does not block sight, so a fire lights its room and
  the hall out of it and **not the room through the wall**. Rock catches the
  light on its near face and does not pass it on. A test walks outward from every
  source and fails if a single square behind rock is lit.
- Sources are a `light` column on **gear** and on **structures**, in metres:
  candle 3, lantern 6, torch 8, campfire 9. A crawler uses the brightest thing
  they carry. Add a row with a `light` value and it lights the way.
- Light is **stepped** (`light.steps`), so the picture reads as painted pools
  rather than a smooth gradient -- and so the pattern cache underneath stays
  small.
- Lit things go **warm** (`light.warmth`), because what is doing the lighting is
  a flame.
- A figure part with `glow` 1 (a torch flame, a candle flame) is never darkened
  by the room, because it IS the light.
- `state.lightDirty` is set when a light-carrier moves or a fire is finished;
  the map is rebuilt then, not every frame.

**Do not confuse the two ambients.** `render.light_ambient` is how lit the
darkest FACE of a thing is -- that is shape. `light.ambient` is how dark the room
is.

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
- The swing and the tilt advance on **real milliseconds**, not game ticks, so
  the view keeps moving smoothly even when the player has the world paused.
- **The view can ride a crawler.** Clicking one sets `cam.follow`; the focus is
  then moved to their drawn position, so turning and tilting still pivot around
  them. Panning by hand releases them, as does clicking anything else.
  `followCamera()` is called from `Game.render()`, NOT from `Game.loop()` --
  `render()` is the one place every path draws through, including the test
  harness's `Game.frame()`, which never enters the loop.
- **Riding a crawler makes every frame a moving frame**, so anything that used to
  happen "when the view changes" now happens sixty times a second. The pick pass
  is therefore painted **on demand inside `pickAt()`**, not after every rebuild:
  it is the most expensive thing in a frame (2.74ms of 16ms) and nothing reads it
  unless a pointer is asking. On a phone there is no hover, so it runs on a tap.

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

`docs/crawlers.xlsx` holds every number and every piece of wording, across fifteen
tabs: `knobs`, `geometry` (read only), `names`, `tags`, `tiles`, `attributes`,
`skills`, `figure`, `structures`, `structure_parts`, `bones`, `slots`, `gear`,
`speeds`, `words`.
The `tiles` tab carries a `pattern` column: blank for plain, `masonry` for laid
stone. `src/defaults.json` carries the same values so a fresh
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
10. **A line in a list of requests can be a BUG REPORT.** "game only runs time
    when scrolling" sat among five feature requests and was read as a sixth.
    It was a complaint. The behaviour was then built deliberately, written into
    the non-negotiables as though they had asked for it, defended across two
    releases, and even *measured on a phone* -- the measurement confirmed the
    bug was faithfully reproduced and was reported back as the rule working
    correctly. Nothing caught it but them asking "I never made a time rule, did
    I?". Generalised: a statement of what the game currently DOES is not a
    request for it to do that. When an instruction describes present behaviour
    rather than wanted behaviour, ask which it is before building it.

11. **Making something move continuously breaks every piece of code that was
    sampling "the current state" and getting away with it.** v0.12.0 made
    crawlers walk between squares instead of appearing in the next one. Four
    things broke at once, and none of them looked related: the close button and
    the folds stopped working (the panel rewrote its own buttons 60 times a
    second, so no press and release ever landed on the same element); clicking a
    crawler selected the rock behind them (the selection was read on pointerUP,
    by which time they had walked off); a second popup appeared contradicting the
    first (locking the view slid the world under a stationary cursor); and
    everything felt sluggish (the pick buffer was being repainted every frame for
    nobody). Generalised: when something starts moving every frame, go and look at
    everything that reads a position, everything that rewrites a container a user
    can press, and everything that was being recomputed "when the view changes" --
    because "when the view changes" has just become "always".

12. **A test that passes by one lucky roll is measuring luck, and it will look
    like a broken mechanic later.** "The crawlers gather in one room and build a
    camp" asserted that somebody learned Labouring. On the baseline it passed
    with a SINGLE failed clearing roll in the whole match -- 0.1 of a pip, twice
    -- and one luckier roll would have failed it. When the room generator changed
    the world, the same run rolled slightly better, the test went red, and it
    looked exactly like learning had broken. It had not: rule 1 says succeeding
    teaches nothing, and the crawler doing the clearing was good at it. Twenty
    minutes went on a false regression. Generalised: before believing a red test,
    check the margin it was passing by -- and when a claim needs luck to hold,
    make it over several seeds or make it somewhere it can be made honestly.
    (Rule 1 is proved on the bench, where the success rate is pinned at zero.)

13. **"Better X" is a request to go and MEASURE X, not to restyle it.** Asked for
    better human models, the honest first move was to render one crawler alone,
    large, with each part in its own colour, and count the pixels. That found
    holes -- three or four completely empty rows at the knee and ankle in 37 of
    64 poses -- rather than anything a taste argument would have produced. Three
    rulers were wrong before one was right: cropping by a guessed offset from the
    figure's centre cut the feet off; matching exact colours found nothing
    because the grit overlay of the day shifted every pixel; and counting each
    part's VISIBLE colour
    measured which part won the depth sort, not whether there was a hole. The
    question that finally worked was the simplest one -- "is any row of this
    figure empty?"

14. **When a change costs five times the frame, COUNT the calls before guessing
    at the cause.** Materials took drawing from 7.96 ms to 43 ms. Five guesses
    were wrong in a row -- reallocating the pattern matrix, the texture tile
    size, the camp's new geometry, the crawlers, the number of fills -- and two
    of the probes were so noisy they reported removing work as making it slower.
    Counting the actual transform calls found it in one go: 686 mapped fills a
    frame at ~50 microseconds each, because raw rock had been given a mapped
    material. Generalised: a cost has a UNIT. Find how many of the expensive
    thing happen and what one costs, and the answer falls out; A/B-ing whole
    features against each other just moves noise around.

15. **A test that proves a thing is THERE cannot prove it is only where it
    should be.** For fifteen versions the grit test asserted "more colours along
    three lines with texture than without". That was true, and it would have
    stayed true with grit sprayed over every crawler in the game -- which is
    exactly what was wrong and what nobody's test could see. The replacement
    counts what KIND of fill each face got and fails if patterned fills ever
    outnumber the ground squares. Generalised: when the requirement is "X is
    only on Y", the assertion has to be a census of everything, not a sample of
    somewhere X is expected. Presence and confinement are different claims.

16. **The thing you are looking at is rarely the thing you are paying for.**
    Asked what was costing the frame, two sessions went at the crawlers and the
    camp -- the detailed, obviously-expensive-looking things. Counted: together
    they are 666 faces and under 10,000 pixels, about 5% of one screenful. The
    bill was with the rock side walls, which nobody looks at: 686 faces and ten
    screenfuls of pixels, 90-96% of it painted inside other rock. Detail is not
    area, and area is what a fill costs.

17. **"The picture is unchanged" is not a claim a renderer can make, so the test
    has to say what IS true instead.** The parked version of the wall clip asked
    for "the picture provably unchanged". That cannot be had. Where a wall is
    removed from underneath a shape that shares its edge, the coverer has a
    one-pixel antialiased edge, and through that edge the pixel now blends with
    whatever is behind it instead. Painting the same frame twice IS identical,
    pixel for pixel; painting it with the clip and without is not, and never
    will be. What settled it was not a percentage but a census of WHERE the
    difference is: for every differing pixel, the topmost fill covering it in the
    old picture was a shape that is still there, never a removed wall -- so
    nothing that was visible moved, and everything left is a hairline seam. What
    went into the tests are the two bounds that are load-bearing (how many pixels
    may differ, and by how much) instead of the byte-identity the roadmap had
    asked for. Generalised: when a change deletes work that something else was
    covering, expect a seam; measure the seam's EXTENT rather than arguing about
    its existence, and write the bound down where a later session can fail
    against it.

18. **A paint order worked out per object is only correct while the object is
    standing still.** Reported as "units moving clip behind the ground they are
    walking on", v0.19.0. Every shape's nearness is a single number, and a ground
    square's is worked out from its **centre**; a crawler part way through a step
    is drawn at the point their feet are at, which is strictly inside the square
    they are heading into -- or outside the one they left. Whichever of those two
    is the nearer therefore painted after the figure and covered their legs:
    **180-208 px of a ~700 px crawler, the bottom 14-16 rows, only in the middle
    of a step**, worst at 0.7-0.85 through and zero at both ends. It had been
    there since v0.12.0 invented the stride, and it survived a whole version that
    re-measured the renderer in still frames. Generalised: when something moves
    continuously, no single band of depth can be right for it for the whole of
    the movement -- order it after **every** band it overlaps (here: their square,
    the one they left, and the one they are entering), and gate that on the
    movement being in progress so a settled object is provably untouched. The
    tell for this family of bug is that it is invisible when nothing moves and
    worst exactly halfway.

19. **When a measurement cannot be exact, select the cases where it can, and
    always measure the broken build too.** Counting "how many of a crawler's own
    pixels the world covers" is trivially wrong at the ends: a rock in front of
    them is *supposed* to cover them, and on the worst case measured -- one
    crawler 750 of whose 776 pixels were behind rock -- the figure shifting one or
    two pixels between two frames moved the count by **+-14 px** with nothing
    having changed. So a step only counts as evidence when **both of its ends are
    clean**, which is what makes the middle attributable to the floor; on seeds
    1-8 that leaves 41 steps out of 161, and four of eight seeds contribute
    nothing, which is the correct answer for a seed whose crawlers always stand
    beside rock rather than a failure to measure. What makes those 41 steps mean
    anything is that the **same 41** are then painted with the old rule, inside
    one build, through a Render flag: 40 of them hide more than 20 px the old way
    and none more than 3 px the new way. Without that negative control the test
    would pass on a picture with no crawler in it. Generalised: a count that can
    be moved by something you are not measuring is not a measurement until you
    say which cases you refused to judge -- and a ruler that cannot fail is worth
    less than no ruler.

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
