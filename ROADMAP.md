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
- **Seven ramps in a piece lean at a wall instead of at ground a metre higher.**
  Found in v0.20.0 while checking the doorways' ramps: seed 2 at (18,28) and
  (18,30), seed 3 at (42,9), seed 7 at (47,4), seed 8 at (30,29) and (31,29), seed
  777 at (37,25). They are older than the doorways — identical squares appear with
  the doorways switched off, in both the old and the new build — so the room and
  hall shaping is the source. Cosmetic, and left alone because fixing them moves
  room shapes, which would break the "same seed, same labyrinth" promise v0.20.0
  proves. The suite cannot see them: its ramp test only ever checks seed 1. Fixing
  them and widening that test belong together, in their own job.
- **Nobody arrives or leaves.** Six crawlers spawn and that is the population.
- **Crawlers need nothing.** No hunger, no sleep, no warmth, no mood. The fire is
  decoration; the bedrolls are scenery.

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

---

## Parked: smaller things, offered and measured

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
