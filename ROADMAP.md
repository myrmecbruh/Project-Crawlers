# Project Crawlers — the roadmap

What is parked, and why. **Nothing in here is agreed or scheduled** — it is the
list of things that have been raised, measured or offered, so that neither of us
has to remember them. `CLAUDE.md` is the law; this is the queue.

When something here gets built, it moves out of this file and into `CLAUDE.md`
(if it is how the game now works) or `CHANGELOG.md` (for the reasoning).

---

## Where the game actually is, measured

Taken from a real match on v0.14.0, not from memory:

- **Four of the fifteen skills are used by anything.** Clambering (walking),
  Labouring (clearing ground), Building (raising a camp), Studying (reading a
  room). The other **eleven are rows in the sheet that nothing ever calls**:
  Wrangling, Fighting, Ranging, Performing, Crafting, Tinkering, Tending,
  Foraging, Enduring, Bargaining, Leading.
- **There are no creatures at all.** Rule 6 is entirely unbuilt.
- **The labyrinth is one fixed patch**, 56×56 metres, nine rooms. You can walk to
  the edge of the world.
- **Nobody arrives or leaves.** Six crawlers spawn and that is the population.
- **Crawlers need nothing.** No hunger, no sleep, no warmth, no mood. The fire is
  decoration; the bedrolls are scenery.

---

## Parked: what to build next

Offered as four options in September 2026. **They chose "the labyrinth goes on
forever", then asked for it to be saved for later in the roadmap rather than
built now.** So it is the front-runner, not the current job.

### 1. The labyrinth goes on forever  ← their pick, deferred
It branches and extends as the crawlers explore, so there is always somewhere
further in. Gives Ranging and Mapmaking a job and turns the game into an
expedition. Caveat raised at the time: without needs or creatures, walking
further is not yet dangerous, so this may want one of the others underneath it.

### 2. Hunger, tiredness, warmth
Crawlers start needing things. The fire stops being decoration and becomes the
reason they survive the night; someone has to forage, cook and tend the sick.
Puts five or six dead skills to work at once and makes failure cost something
other than time.

### 3. Things that live down there
Creatures, generated from tags rather than hand-authored (rule 6). Brings danger,
makes carrying a light a real decision, gives Fighting and Wrangling a job. But
it is the combat fifth of the game, and rule 3 caps that at 20%.

### 4. Hands and work — crafting, cooking, repair
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

---

## Parked: smaller things, offered and measured

- **Rock walls are painted from the top of each column down to the floor of the
  world, even where they are buried.** Measured on v0.17.0: 686 side faces a
  frame, **2.9 ms of the 7.0 ms of drawing**, covering **ten screenfuls** of
  pixels into a picture 534×348 across. Across seeds 1, 2, 3, 7 and 777,
  **90–96% of every metre of wall painted is inside the rock standing next to
  it** — invisible by construction. A wall only ever needs to drop as far as the
  neighbour it faces. The one catch is the see-through fourth wall: where a
  near column is faded you CAN see through it, so those neighbours must not
  clip. Expected saving: most of 2.9 ms, and the picture provably unchanged.
  **This is the biggest remaining cost in the frame and should be done before
  any other performance work.** Offered, not yet taken up.
- **The hidden picture used to find what is under the pointer costs 4.8 ms**, and
  it draws every face in the scene a second time to do it. It only runs when a
  pointer actually asks, so it is free when the mouse is still — but it is the
  single most expensive thing that happens while the mouse is moving. Could be
  answered arithmetically (point-in-polygon, back to front) with no second
  picture at all.
- **The camera snaps when you pick a crawler.** Clicking one locks the view onto
  them instantly rather than easing across. It was left as a snap because they
  asked for a lock; if the jump annoys, it is a few lines to glide instead.
