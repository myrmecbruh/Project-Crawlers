# Project Crawlers — changelog

**The permanent playable link: https://claude.ai/code/artifact/4938012a-682f-46b7-8ca3-41ecef8219b6**

Publish to that address every time. It never changes, so the link the person
holds always works. A new address would silently strand them on an old build.

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
