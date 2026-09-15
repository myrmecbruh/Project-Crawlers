# Project Crawlers

Read this first, every session. It is the only memory that survives.

**The permanent playable link — publish here every time, forever:**
https://myrmecbruh.github.io/Project-Crawlers/

`python3 publish.py` builds the game and puts it there. The address never changes,
so the link they hold always works.

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
python3 publish.py     # build, then put that file on the link at the top of this file
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
publish.py            build, then push the built page to the permanent link
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
- **One measurement is not enough for that, and the difference is not a rounding
  error.** Filling a room back in takes its floor away, and that floor can be the
  only way through to somewhere else, so the fill can cut off a room that was
  fine a moment ago. The cull therefore measures, fills whatever it found, and
  **measures again, until a measurement turns up nothing new** -- it always ends,
  because every round that changes anything leaves one fewer room to measure.
  Measured over 2,250 pieces (250 seeds, each of them made at nine addresses
  across a 3 × 3 block), the one-shot version left 16 rooms in 8 pieces cut off
  from the rest of their own piece; the loop leaves none. That was a bug in the
  generator, not in the test.
- `16-camp.js`: the crawlers pick the largest room they can *all* reach, walk to
  it, clear the ground (Labouring against the floor's `clear` difficulty) and
  raise the camp (Building against each structure's difficulty). Nobody is told
  to; the player is a head coach.
- A structure grows to its real height as it is built, so how far the camp has
  got is something you can see rather than read.

### The world is a plain of pieces, and a piece has an address (`12-world.js`)

The labyrinth is no longer one 56 × 56 m patch. It is a plain of pieces that goes
on in every direction, and every piece has an **address**: which column and which
row it sits in.

- **A piece is worked out from the match seed and its address alone**
  (`pieceSeed`). Throw one away, ask for it again, and it comes back the same --
  which is what makes forgetting a piece possible at all.
- **The piece the match starts in keeps the plain seed.** So a seed still names
  the labyrinth it always named: seed 23 is the world it was before there was
  more than one piece, the camp lands where it landed, and every test that quotes
  a seed goes on meaning something. `files/compare-worlds.mjs` (session
  instrument) proves it: eight seeds, and the ground, the rooms, the camp and the
  crawlers come out identical to v0.19.0.
- **Generation still happens in LOCAL squares**, 0 .. n-1, exactly as it did when
  the whole world was one patch: every room rule, hall rule and repair rule is
  untouched. The piece is moved to where it belongs -- the address times the size
  is added to every square and every room -- as the very last step, after
  `lineRoomWalls`.
- **`world.at(x, y)` hands back the square that is there and makes nothing**, so
  a stray lookup can never quietly build an endless maze; `world.ensure(x, y)`
  makes the piece first and then hands the square over. That split is the safety
  of the whole arrangement.
- **Room numbers run across the whole live world.** `addPiece` renumbers each
  room and rewrites its squares' pointers, because a square's `room` is used as
  `world.rooms[cell.room]` all over the code.
- **Pieces are filed by column and then by row**, and the world remembers the
  last piece a lookup landed in (`world.hot`). Squares get asked for in bursts,
  so that memory is what stops the picture paying for addresses at all -- doing
  it the obvious way cost 3× (see the session's `measurements.md`).
- **A walk-to-somewhere collects the squares it actually reaches**: `reachableFrom`
  hands back a field keyed by the square (`field.at(square)`), instead of
  allocating an array as big as the patch. Light is kept the same way: **light
  lives on the square** (`cell.light`, cleared through `state.lit`), so a piece
  can be forgotten without leaving a light burning in a table nobody owns.

### Every piece has a way out into its neighbours (`12-world.js`)

A piece on its own is a sealed box -- the rim is rock on all four sides -- and a
labyrinth that stops at the edge of a piece is not one that goes on forever. So
the last thing generation does is give the piece a handful of **doorways**: a gap
in the rim at a height the two pieces agreed on, with a corridor dug inward to
ground this piece already had.

- **The two pieces either side of a seam work the join out from the same two
  addresses, and never have to talk to each other.** `joinSeed` mixes the match
  seed with the address of the piece that owns the join -- the smaller column for
  a join that runs up a column of pieces, the smaller row for one that runs along
  a row -- and `joinOpenings` reads that one number for how many doorways the
  join gets, where along the rim each lands, and how high it is. Two pieces that
  rolled their own doorways would put them in different places and the two sides
  would not meet. That is the whole trick, and it is why a piece never has to
  know anything about its neighbour.
- **A doorway is open on a side only if that side digs it.** `joinMouths` hands
  each piece its own four joins as anchors inside and outside the piece, paired
  one to one along the seam **at the same height**, so a crawler who walks out of
  one piece walks in next door at the same level. Each mouth remembers whether
  the corridor was actually dug (`m.open`), and `world.sealed` counts the ones
  that were not.
- **`digDoorway` only ever cuts rock, and it will not come out into a pocket
  nobody can reach.** It opens the rim square at the agreed height, runs along
  the rim until it finds a row with room to climb, then goes straight in until it
  meets ground the piece could already walk to -- the flood taken **before** any
  doorway was dug, or a corridor dug a moment ago. A doorway that cannot find a
  row like that is simply **not dug**: the rim goes on looking exactly as it
  would have, and nothing at all is written.
- **So joining two pieces can never take ground away from either.** Everything
  the piece already had was chosen before a single doorway was dug: a corridor
  turns rock into corridor and nothing else -- never corridor into rock, never
  one room into another. `files/compare-worlds.mjs` (session instrument) proves
  it against the same build with the doorways switched off: 120 seeds, 11,164
  squares of rock dug into corridor, and **0 squares of walkable ground moved or
  lost**.
- **How often the maze joins up is a feel decision, so it is dialled**: three
  `world.join_*` rows in `docs/crawlers.xlsx` -- how far in from the corners a
  doorway may land, the fewest and the most ways out of a piece.
- `files/probe-seams.mjs` (session instrument) checks the promise across 26 seeds
  and 234 pieces: **260 joins, 0 without a doorway open on both sides**, 1,889
  doorways dug and 3 refused, mouths paired at equal heights, and wherever both
  sides are open `canStep` works both ways.

The price, measured (the session's `measurements.md`): making a piece 1.3 → 1.4
ms, making the world around one 1.0 → 1.4 ms, a whole boot 4.2 → 4.6 ms, the wall
fading +26 µs and the walk flood +15 µs -- and **nothing at all to a frame**.

### The picture fetches the ground it can see, and pays only for that (`12-world.js`, `40-render.js`)

v0.20.0 made the world endless. It did not make the game behave as if it were.
The ground was endlessly *available* and finitely *held*: a match opened holding
the one piece the camp stood in, and the picture walked every piece it held.

- **`updateLiveWorld` runs on every frame of the PICTURE, not every step of the
  game.** Dragging the view by hand therefore fetches ground exactly as walking
  does, and there is one place that decides when ground is made instead of two
  that could disagree.
- **What it wants is `wantedPieces`: the pieces the view reaches, plus
  `CFG.liveRing` rings of pieces round every crawler and every camp site.**
  `screenReach` turns the size of the buffer into a distance in squares, asked in
  the two directions the picture is drawn in (`u - v` and `u + v`) and built on
  the taller camera angle and the full rock height -- so the answer cannot come up
  short and survives a quarter-turn. Ground seven metres up is drawn that much
  higher, which is why height has to be counted as well as width.
- **The asks are de-duplicated and the urgent mark is carried over.** The camera's
  box is the wider ask, so it can want a piece a crawler is standing in before
  that crawler asks; `urgent` is kept if EITHER asker marked it. A piece made
  twice would be a piece made once and remembered wrong.
- **Urgent pieces are made this frame whatever the budget says; the rest wait
  their turn, nearest the middle of the picture first, `CFG.chunksPerFrame` a
  frame.** Making one is real work, so they arrive a few at a time -- but
  whatever else is late, **the ground underfoot is not**, and a crawler or the
  camp or the middle of the view standing in a hole for one frame is the thing
  the rule exists to stop. Measured: 1,800 checks of the square a crawler stood
  on while walking, **0 holes**.
- **`Render.pieceOnScreen` skips a whole piece with eight points instead of
  3,136 squares**: the piece's four corners at ground level and at the tallest a
  square can stand fence it in, because a straight-edged change of coordinates
  keeps a shape inside its box. A piece that misses the screen is never walked.
  **This decides nothing about how anything looks** -- a piece that is walked
  goes through exactly the loop it always did, and a piece that is not walked had
  every one of its squares culled a moment later anyway. It is `this.project`
  that does the work, so it must be called as a method.
- **`world.liveRing` and `world.chunksPerFrame` are dials in `docs/crawlers.xlsx`
  (rows 90-91)**, not constants: how far ahead the ground is made is a feel
  decision, and rule 9 says the sheet owns it.
- **Nothing is forgotten yet.** The window fetches and never throws away, so what
  a match holds only grows with the walking. `forget-and-remake` is a separate
  promise: no piece may be thrown away that the picture or a crawler still needs,
  and no crawler may walk into ground that has to be made again before they can
  stand on it.
- **Square numbers are positions in a list that grows, so they have a lifetime.**
  `updateLiveWorld` slides `state.selected` and `state.hover` past the new ground
  so the panel and the outline go on naming the same crawler. A match that walks
  far enough runs those numbers past what one colour can carry; that limit is
  written down in `ROADMAP.md` (the pick table) and is the next thing this job
  needs.

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

### Nothing is painted twice

The answer to "what is under the pointer" used to be a **second picture**. The
whole scene was drawn again into a canvas nobody sees, flat and untextured, each
thing in a colour that spells out its own number, and then the single pixel under
the pointer was read back with `getImageData`. That is what `drawPick` is for, and
it is why the pointer was the most expensive thing in a frame: **4.8 ms**, paid
whenever a question was asked -- and with the view riding a crawler, a question is
asked on every frame of the ride.

**As of v0.22.0 the answer is worked out from the list the picture was already
built from.** `Render.batch` holds every shape in the order it is painted --
furthest back first, so the last one painted is the one in front -- which means
**walking it backwards and stopping at the first shape that contains the point**
is the same thing as asking what the last brush stroke left on that pixel. No
canvas, no colour, no reading back. Nothing is drawn.

- `inShape` tests the **middle** of the pixel (`floor(bx) + 0.5`), because that is
  the point canvas itself fills; the point-in-polygon test is even-odd, which is
  the same as nonzero for the shapes here.
- Items carry a tight box (`minX..maxX`, `minY..maxY`, widened by a pixel in
  `pickAt`). A box can only ever add tests, never remove an answer, and the
  suite compares against a box-free walk to keep that honest.
- `pickStale` is gone with the picture it was about; `drawPick` stays in
  `40-render.js` as the **yardstick** the comparison is made against, and nothing
  in the game reads it any more.

Measured in ONE build with both ways alternating, best of three, seed 1,
900x700, the view riding a walking crawler with the pointer on the picture:

| | painted answer (v0.21.0) | worked-out answer (v0.22.0) |
|---|---|---|
| one frame, 12 pieces / 37,632 squares | 6.93 ms | **5.53 ms** |
| one frame, 56 pieces / 175,616 squares | 6.91 ms | **5.48 ms** |
| one answer on its own, 12-piece world | 1,494 µs | **1.8 µs** |
| one answer on its own, 56-piece world | 1,418 µs | **0.5 µs** |
| a whole second of hovering (60 answers) | 89.6 ms | **0.1 ms** |

**1.4 ms a frame**, flat, whatever the world holds -- because the second picture
never grew with the world either. An answer goes from about a millisecond and a
half to about a microsecond, which is what lets it be asked every frame.

- **A partly covered pixel is exactly where a colour answer goes wrong.** Canvas
  blends a pixel a shape only partly covers -- and it does so **even when the
  covering shape is the same colour**, losing the bottom bit of a channel when it
  does. Measured on a bare canvas with no game in it: a pixel filled
  `rgb(68,110,0)` and then partly covered with that same colour reads back
  `67,110,0` at 10% coverage, `68,109,0` at 25%, `68,109,0` at 75%, and
  `68,110,0` only at 100% -- six of eight partial coverages lost a bit, the same
  with and without an alpha channel, and the fit is truncation rather than
  rounding. One lost bit is enough to name the wrong thing: `67 + 109 * 256` is
  **27,971** and the square next door is **27,970**. So the old picker was wrong
  along the **outline of everything**, which is where a person is most likely to
  be pointing at a thing. The arithmetic answer names the shape covering the
  middle of the pixel and cannot lose a bit, because nothing is ever written
  down. Generalised: **never encode who something is in a colour**, and if you
  ever must, the failure is on the edges, where you will be least inclined to
  look.
- **The proof is pixels, not argument.** Both ways run in one build on the same
  frozen moment, pixel for pixel: **52 cases, four of them at every single pixel
  of the picture, 610,496 pixels asked both ways, 569,234 identical (93.24%)**.
  The other **41,262 differ only on a shape's own edge**, where the painted
  number is a blend of the two colours meeting; **in the middle of a shape, 0
  differ**, and on the edges **not once did one way say something while the other
  said nothing**. The battery prints how many different worlds its cases reached
  (**46 of 52**) because that is the check that its seeds, turns, zooms and raised
  angles are doing anything at all.
- **The 24-bit ceiling this was heading for is gone.** A colour holds 24 bits, so
  the old scheme capped the labyrinth at about 5,350 pieces and `ROADMAP.md` had
  that down as the next thing to break. A number never goes near a colour now.
  What is still waiting is the **memory** -- nothing is thrown away yet -- and
  that is `forget-and-remake`.

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
| the hidden picture the pointer is found in | **4.8** | painted whenever a pointer asked for an answer (`pickAt`) — **removed in v0.22.0**, see "Nothing is painted twice" |
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

**As of v0.21.0 what a frame costs has stopped being a question about how much
ground exists.** The picture skips a piece that is not on the screen (eight
points instead of 3,136 squares), so the ground nowhere near the view is never
walked. Measured in ONE build with the skip switched off and on -- lesson 21
applies to a change that only SAVES as much as to one that only adds -- seed 1,
900x700, best of three alternating passes of 30 frames each:

| the world holds | every piece walked | off-screen pieces skipped |
|---|---|---|
| 1 piece, 3,136 squares | 4.20 ms | **4.19** |
| 9 pieces, 28,224 squares | 7.53 ms | **4.39** |
| 25 pieces, 78,400 squares | 13.95 ms | **4.37** |

That is about **0.41 ms for every extra piece the match holds**, and now no trend
at all. The first row is the same either way because there is nothing to skip
when the world holds one piece -- which is the check that the instrument is not
just measuring itself. These numbers are their own protocol and do not belong in
the v0.17.0 table above.

**Skipping a piece is only allowed to be a SUBSET of what the per-square test
did, and that is proved, not argued.** 240 cases (3 rings x 5 seeds x 2 zooms x
4 turns x 2 raised angles), both ways in one build: **the identical picture every
time** -- 38,757 squares kept and 41,028 things drawn either way, **0 missing and
0 extra in any case** -- with **89.9% of the square measurements no longer
happening** (88,384,435 -> 8,917,751; the best case skips 95.6% of them). The 240
cases reached **237 different worlds**, which is the check that the seeds, turns,
zooms and raised angles are doing anything. (Those four figures were re-measured
in v0.22.0. The ones that stood here before -- 50,520 / 53,040 / 75.9% -- came
from the probe reading the world out of the game BEFORE asking for a new one, so
all 240 cases measured one frozen picture; see lesson 27.)

One more number belongs here because forgetting is the next job: **nothing is
thrown away yet**, so the ground held only grows with the walking. The window
fetched its way from the camp to (169, 46) in twelve drags and went 9 pieces /
28,224 squares -> 22 / 68,992. Bounding that is `forget-and-remake`.

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
  used to answer that by painting the whole scene a second time, kept on demand
  inside `pickAt()` so it was only paid while a pointer was asking -- which, with
  the view riding a crawler, was every frame of the ride: the most expensive thing
  in a frame (2.74ms of 16ms). **As of v0.22.0 there is no second painting at
  all** -- `pickAt()` works the answer out from the shapes the picture already
  built, so it costs about a microsecond and can be asked every frame. See
  "Nothing is painted twice" above. On a phone there is no hover, so a tap asks.

---

## The machinery, and why each piece exists

### One file, one command

`python3 build.py` inlines everything — code, styling, and eventually geometry,
audio and the balance data — into a single self-contained HTML file. No engine,
no framework, no package manager at runtime. This is why it can be published as
one artifact and played on a phone with no install.

It writes two files from the same source: `dist/crawlers-v<VERSION>.html` (the
standalone playable file) and `dist/artifact.html` (the same page as a fragment,
for a viewer that wraps it — the shape the Claude artifact address wanted, when
that was where the link lived). **The published page is the standalone one**,
because an address of our own needs a whole page: `publish.py` pushes it to the
`gh-pages` branch, and GitHub serves that branch as a web page.

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
- **Publish with `python3 publish.py`**, and only that. It builds first, then
  pushes the built page to the `gh-pages` branch as `index.html` (and under its
  version number, so an older build can still be opened by name). GitHub serves
  that branch at the address recorded at the top of this file and of
  `CHANGELOG.md`, and **that address must not change** — they hold it, and a
  second one would silently strand them on an old build. Until v0.22.0 the address
  was a Claude artifact link; a session working in VS Code with Copilot has no way
  to publish to one, so the link moved to the project's own GitHub address. See
  the note under the banner in `CHANGELOG.md`.

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

20. **Two things that must agree should work it out from the same words, not by
    talking to each other.** The joins between pieces, v0.20.0. Two pieces either
    side of a seam must open their doorways in the same places at the same
    heights, and they are made independently, one after the other, with no
    knowledge of each other and possibly a long walk apart. The trick is to give
    the join a name both sides compute identically: a join belongs to the piece
    with the smaller column when the two pieces are side by side (the seam runs
    north to south between them) or to the piece with the smaller row when they are
    stacked (the seam runs east to west), so `joinSeed(seed, ownerCx,
    ownerCy, axis)` is the same two inputs from both sides, and the one stream it
    makes settles everything that must match -- how many doorways, where along the
    rim, and how high. Measured: 26 seeds, 234 pieces, **260 joins and 0 with no
    doorway open on both sides**. Generalised: when two things that never meet
    must line up, they must each be able to DERIVE the shared answer from
    something they both already have. Anything one of them knows and the other
    cannot see (a roll of its own dice, a list of what it dug last time) is a
    doorway on one side and a wall on the other.

21. **A change that may only ADD is proved against the same build with the
    addition switched off.** v0.20.0, the doorways. The old promise -- "same seed,
    same labyrinth" -- cannot survive a change that digs the rim, so it is
    replaced by the promise underneath it: no square a crawler could stand on ever
    changes height, tile, room or walkability. The proof loads two builds, walks
    the same seeds through both, and compares square by square; there is exactly
    one allowed difference, and it is **measured rather than argued**: a square may
    differ only if the OLD build's own flood -- `reachableFrom` from that piece's
    first room, taken before any doorway existed -- could not reach it, because
    such a square was bare rock or the floor of a room the old build had written
    down and could not walk to. The count of those is printed and may not exceed
    the ground that sat in rooms the old build could not reach. It came out 305 to
    305 over 41 seeds and 369 pieces, with 32,873 squares of rock dug, **0 squares
    moved and 0 lost**, and 11,164 dug with 0 and 0 over 120 seeds of the single
    piece the camp is in. Generalised: never say "this only adds" -- say what the
    old build could not do, make the difference fit inside it, and let the numbers
    match exactly.

22. **A test that only ever looks at one sample is a claim about that sample.** The
    suite's ramp test checks one seed -- thirty-odd ramps out of the 3,136 squares
    of the one piece it looks at -- and it is what caught the crooked doorway
    ramp in v0.20.0 ("1 of 30 ramps climb to nowhere", a rim ramp leaning inward
    at a wall 7 m
    taller than itself). The same check run over twelve seeds by a session
    instrument then turned up **seven more ramps leaning at a wall two metres
    taller than themselves, on five different seeds** -- all of them older than the
    doorways, all invisible to the suite because it never looks anywhere else, and
    none of them fixable without moving room shapes and breaking promise 21 above.
    Generalised: run the range, not the sample; when the range cannot be run yet,
    write the failing seeds down (they are in `ROADMAP.md`) so the next session
    starts from a list instead of a guess. A passing test is evidence only about
    the seeds it names.

23. **A cull must be PROVED a superset, not argued to be one.** v0.21.0, the
    picture skipping whole pieces. "A piece that is off the screen had all its
    squares thrown away a moment later anyway" is a good argument, and good
    arguments are how pictures end up with holes in them. So the proof runs both
    ways inside ONE build -- `Render.pieceOnScreen` told to say yes to everything
    is exactly what v0.20.0 did -- over 3 rings x 5 seeds x 2 zooms x 4 turns x 2
    raised angles, and compares what was kept and what was painted: **240 cases,
    the identical picture every time, 0 squares missing and 0 extra things
    painted**. Generalised: when you take work away, say exactly what the work
    you removed was doing, then show the answer is the same with it removed --
    because "it could not have mattered" is the sentence that precedes every
    missing polygon. (And measure the right thing: the first version of that
    proof counted KEPT SQUARES, which are identical either way, and so reported
    that the cull saved nothing. What a removed piece actually saves is the
    measuring of its squares -- **89.9% of them**, once counted. The first
    counting of that said 75.9%, and it was measuring one frozen picture 240
    times; see lesson 27.)

24. **A test written for a fixed world is not a test of the endless one.** Four
    of the suite's tests went on passing when v0.21.0 landed, and three of them
    had stopped meaning anything: one expected a far side to the batch that no
    longer exists; one took its "before" picture one frame after the seed, when
    the world held one piece instead of nine, and so measured the view OPENING
    and blamed it on the view turning; one walked one piece and claimed to be
    walking twenty. None was a bug in the game. Generalised: when the thing a
    test measures acquires a history, the test's setup becomes a claim about that
    history -- so **settle the world before looking at it**, and if a test's
    subject is "nothing changed", be exact about changed since WHEN.

25. **A number that indexes a list is a value with a lifetime.** Pick numbers run
    the live squares, then the crawlers, then the camp sites, so making one piece
    of ground slides every crawler's number and every site's number up by 3,136.
    Two tests hunted a crawler by a number worked out BEFORE the frame that
    painted it, and looked for a value that had already moved; whatever is picked
    or hovered has to be slid forward by the same amount (`updateLiveWorld`), and
    a test has to work the number out in the same breath as the list it counts.
    Generalised: any position in a collection that grows is true only until the
    next thing is added. Either re-derive it, or move it when the collection
    moves -- and if the number can run past what the thing reading it can hold (a
    colour channel, a fixed-width id), write that down before it is reached, not
    after.

26. **Never encode WHO something is in a COLOUR.** v0.22.0, the pointer's answer.
    The old picker painted each shape in a colour spelling out its number and read
    the pixel back, and it was wrong along the outline of *everything* -- because
    canvas BLENDS a pixel a shape only partly covers, and it does so even when the
    covering shape is the very same colour: fill a pixel `rgb(68,110,0)`, cover
    part of it with `rgb(68,110,0)`, read it back, and it is `67,110,0`. Measured
    at eight coverages, six lost the bottom bit of a channel, with and without an
    alpha channel, and the fit is truncation rather than rounding. One lost bit is
    a different valid number (`67 + 109*256 = 27,971`, and the square next door is
    `27,970`), so the answer was silently somebody else. Generalised: a value
    written into a picture is a value that can be damaged by the act of drawing,
    and the damage lands exactly where a person is most likely to be pointing --
    on the edges. Work the answer out from the shapes instead, and let the picture
    be only a picture. (See "Nothing is painted twice".)

27. **A probe must read the world it MEANS to measure, and say how much work it
    did.** Two batteries were reporting numbers that looked like findings while
    measuring one frozen moment: `window.__test.seed(n)` REPLACES the game state,
    so a probe that captured `const s = t.state` before seeding was holding a dead
    object and re-measuring the same frame for all 52 (and 240) of its cases. The
    symptoms read as results -- dials that did nothing, "before" and "after"
    identical, an answer costing 0.0 µs, 240 cases reaching one world. Fix: read
    the state AFTER seeding, and **print the count** of whatever the battery claims
    to have done (asks made, repaints done, DISTINCT WORLDS reached). A case count
    of 1 in a self-check is a failing probe, not a tidy result. The v0.21.0 cull
    proof was the worst case of this: it shipped with 240 cases that had all
    measured one frozen picture, and three of its published figures (50,520 squares
    kept, 53,040 things drawn, 75.9% of measurements saved) were re-measured in
    v0.22.0 as 38,757 / 41,028 / 89.9%, with 237 of the 240 cases reaching a world
    of their own. The conclusion never changed -- the cull really does keep the
    same picture -- but the numbers around it were nonsense, and a wrong number in
    the notes is worse than no number, because the next session measures against
    it. Generalised: an instrument that cannot tell you it did nothing will tell
    you nothing, loudly.

28. **A test may only assert on what the test controls.** v0.22.0's guard on the
    new picker went red in the full suite and green on its own, and the reason was
    not a flake: it half-asserted `s.pointer.over`, which follows the REAL mouse --
    the test before it clicks a close button, leaving the mouse parked at
    (1244,34), and when the panel reappears over the canvas at that spot Chromium
    fires a genuine `pointerleave` and the flag drops. The count it was actually
    about (1,102 asks) was healthy the whole time. Fix: drive the pointer through
    the harness's own door (`window.__test.point`), as the rest of the file does,
    and assert only on numbers the test caused. Generalised: a real mouse, a real
    clock and a real frame rate are inputs, not evidence -- and a test that reads
    one will fail on a different machine or a different day, for a reason that
    lives nowhere in the game.

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
