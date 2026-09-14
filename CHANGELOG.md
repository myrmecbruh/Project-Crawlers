# Project Crawlers — changelog

**The permanent playable link: https://claude.ai/code/artifact/4938012a-682f-46b7-8ca3-41ecef8219b6**

Publish to that address every time. It never changes, so the link the person
holds always works. A new address would silently strand them on an old build.

---

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
