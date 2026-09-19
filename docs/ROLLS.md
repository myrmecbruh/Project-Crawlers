# Project Crawlers — The Roll System

**Status: designed, not yet built.** Every rule below was decided by the author in a design session. Anything marked **Open**, **Deferred** or **Flagged** is *not* settled — it is listed so it does not get assumed. Nothing here is implemented in the code yet.

This document is the specification for how a crawler does anything. It supersedes the roll formula currently in law 10 of `CLAUDE.md` and the dead near-miss machinery in `src/defaults.json`.

---

## 1. The Ground

Six attributes, each running **1–6**. This is a boardgame scale, not a simulation.

| MGT | AGI | END | PRE | INT | WIL |
|-----|-----|-----|-----|-----|-----|
| Might | Agility | Endurance | Presence | Intellect | Willpower |

Fifteen skills, one for every distinct pair of attributes. `C(6,2) = 15` — the two lists are the same size by construction. There is no sixteenth skill and no unpaired attribute.

| Skill | Pair | What it covers |
|-------|------|----------------|
| Focusing | MGT + AGI | Climbing, scrambling, keeping your feet |
| Labouring | MGT + END | Hauling and digging; the work of a strong back |
| Grappling | MGT + PRE | Handling animals; hauling a person out of trouble |
| Building | MGT + INT | Raising structures and machines |
| Brawling | MGT + WIL | The one fifth of the game that is violence |
| Maneuvering | AGI + END | Covering ground: travelling far, keeping pace |
| Entertaining | AGI + PRE | Singing, playing, dancing, holding a room |
| Sneaking | AGI + INT | Moving quietly, hiding, going unseen in the dark |
| Tinkering | AGI + WIL | Making and mending, and the fiddly work: locks, traps |
| Tending | END + PRE | Keeping others alive and in good order |
| Foraging | END + INT | Finding food, water and useful things |
| Persisting | END + WIL | Cold, hunger, pain, boredom and the dark |
| Bargaining | PRE + INT | Buying, selling, trading, arguing |
| Leading | PRE + WIL | Getting people to do things, together |
| Studying | INT + WIL | Reading, learning, working something out |

**Names.** This table uses the game's names. The key each skill is stored under is a
separate, frozen slug — the `id` column in the sheet's `skills` tab and the key in
`src/defaults.json` — because gear rows, structures and saved skills all point at the
key. Only the *names* changed, and with them the coverage of the two skills that
swapped work. The sheet (`docs/crawlers.xlsx`) is the authority on both.

---

## 2. What You Roll

**Skill rating = the pair's two attributes as they currently stand, added together, plus earned pips.**

Roll that many **d6**. Every **5 or 6** is one success.

A crawler with Might 3 and Agility 4 rolls 7 dice in Focusing before he has earned anything. Wearing boots that raise Agility by 1 makes it 8 dice the moment they are on his feet. Take an arrow to the shoulder and it is 6.

The attributes are the soil the skill grows in — they are *not* a separate bonus stacked on top of the skill. A roll reads the skill alone; the skill is made of the pair. There is no second helping.

**No cap.** Skills do not top out at 6 or anything else.

**The player never throws dice.** Throws are made by the game and shown on the ledger (§11).

---

## 3. The Wall

A unit of work needing **N successes** needs **at least N dice**. With N−1 dice the chance is not small — it is **exactly zero**. You cannot get three successes out of two dice.

This produces three regimes:

| Regime | Dice vs difficulty | What it means |
|--------|--------------------|---------------|
| **Below the wall** | dice < N | Impossible. No roll, no progress, no Lessons. |
| **The band** | N to about 3N | The only band where a throw means anything. Failure is common, so this is where learning happens. |
| **Past the band** | beyond 3–4N | Near-certain. Masters stop failing here — which, per law 1, is exactly why they stop growing. |

Rough landmarks: **50%** odds land near **3N** dice; **90%** near **4N**. One point of difficulty is worth about **three dice**.

The old named ladder (1 = easy … 6 = extraordinarily difficult, climbing 7/8/10/12 with depth) still stands, but it now describes a **single unit**, not a whole job — and the top of it is steep for one throw. See §4 and §14.

---

## 4. Difficulty

Difficulty is always **the number of successes required**, and it always belongs to a **unit of work**.

- **Every task carries two authored numbers:** its difficulty worked **with the right tool**, and its difficulty **by hand**. No global multiplier, no halving, no scaling by tool quality. The gap between the two numbers is authored per task.
- **A tool is access; skill is speed.** A tool does not make you roll better — it lowers what the work demands. The right tool can pull a unit from under the wall into the band, and that is the whole point of tools.
- **There is no per-skill tool row.** The old `needs_tag` / `without` penalties on individual skills are deleted. The task holds the only two numbers.

**Animals are the inverse of tools.** An animal takes a *higher* difficulty — more successes required — on every Intellect skill (§10). A tool pulls work into reach; a beast's lack of wits pushes it out.

---

## 5. Jobs Are Chains

**Every job is a chain of units of work.** Each unit is resolved by its own throw. A chain may be a single unit long — a leap, a climb, a held door — and big jobs are simply long chains of small units.

Units are small, usually difficulty 1–4. Keeping units small keeps difficulty inside the range where dice actually exist. A twelve-success "job" is never authored; it is a job made of four three-success units.

**Time.** One fixed amount of time per unit, the same for every kind of work in the game. A job is slow because it has many units, not because a particular sort of work is slow. There is no per-skill and no per-job duration.

**Surplus successes** — successes beyond what the unit demanded — are neither discarded nor converted by a fixed rule. They are **spent on rewards the author attaches to that task**: less time, extra information, better craft quality, narrative flair. Which rewards apply is authored per task.

---

## 6. Lessons

Crawlers improve by failing. Succeeding teaches them nothing.

- **A failed unit pays exactly 1 Lesson.** No grading — a close failure and a hopeless one pay the same. (Grading failures is expressly forbidden by law 1.)
- **12 Lessons buy 1 pip** in that skill. The 12 is a sheet knob.
- **A blank attempt** (zero successes) pays nothing **only if the task was impossible for you**. If the unit was possible, a blank attempt still pays its Lesson. A unit above the wall is dead in every sense: no progress and no learning.
- **A job caps its own Lessons.** One job can only pay out so many, so a long easy job cannot be farmed for training. The cap is a sheet knob.
- **Losing a contest pays 1 Lesson** in the skill that was tested (§9).

**Training bargain, accepted.** A unit sitting exactly at your dice count is possible but nearly hopeless — best possible Lessons per unit of time, zero output. That is judged self-balancing, and the "farm an impossible job" hole is closed by the refusal rule below.

**Refusal.** A job containing a unit above the wall is **refused up front**, with the reason shown. The game does not let the crawler walk into a dead task and burn the day.

---

## 7. Rust

**Rust eats Lessons.** It takes back pips that were earned, working slowly.

- **Rust attaches per skill.** A skill you stop using rots even while you are busy training others.
- **Rust only eats earned pips**, down to zero. The six attributes never rust.
- The rate, and what counts as disuse, are sheet knobs.

Consequence: pips are not permanent. A crawler who stops working loses what he learned and decays back toward his bare body.

---

## 8. Attributes, Gear and Wounds

**Attributes are never raised by grinding.** There is no Lessons path for the six. A permanent change to an attribute happens only at an **authored moment** — a near-death, a long hard season, a rite.

Gear and wounds shift attributes **while they are worn or carried**, and every skill built on those attributes shifts with them, live.

- **Broad gear works on attributes.** A +1 to Agility raises all five skills of that column by a die at once.
- **Narrow gear works on a named skill**, as a bonus to that skill alone.
- Everything a crawler earns by practice goes into skills, and rust can take it back.

---

## 9. Contests

When two parties want the same thing, that is a **contest**, not a task.

- **A contest is one exchange.** Each side throws once and the moment is settled. Contests are not chains.
- **A contest has no difficulty number.** Both sides roll their skill; more successes wins.
- **Ties go to the defender** — the side already holding the ground, the door, the rope. Defending is positional: whoever holds the thing keeps the thing.
- **The loser takes 1 Lesson** in the skill tested. The winner gains nothing, because succeeding teaches nothing.

---

## 10. Creatures

Creatures use the **same six attributes** and derive the **same fifteen skills** from the same pairs. There is no separate stat block and no separate framework.

**Tags** are how a creature differs. A tag adds or removes dice on named skills. A tag that adds dice to a named skill **also applies in contests of that skill**, since contests are skill rolls.

**The ANIMAL tag** raises the **difficulty** of *all* Intellect skill use — Building, Sneaking, Foraging, Bargaining, Studying. One tag, uniform across beasts, no per-species numbers. The size of the raise is a sheet knob. Because it is difficulty-side, an animal's intellect tasks slide **under the wall**: not merely unlikely, but impossible and unteachable. No contest clause is needed for it — intellect contests with animals do not arise.

**Creature power at depth comes from tags adding dice**, never from attributes above 6 and never from inventing new creature kinds.

---

## 11. The Ledger

**All rolls and all events of significance scroll on a ledger.** It is the game's record, and it has two layouts — one for mobile, one for desktop. The player does not throw dice; the ledger shows what was thrown.

**Fog.** Your own crawlers' rolls are shown plainly. Enemy rolls are handled in two stages:

- **Sensed** — a crawler who can *see* the creature (in view, lit, not behind a wall) has that roll **noted on the ledger as an event**. The *number* stays concealed while the creature's type is unknown.
- **Noise** — an unseen commotion still registers: an on-screen icon marks the **general location** of the noise, out of sight. No roll is noted, only that something is happening there.

---

## 12. Studying and the Bestiary

**Studying a creature type is a chain**, like any other job: units of observation, each resolved by a Studying throw. Each **completed** chain yields one further tier of understanding.

- **The first completed chain logs the type in the bestiary.** From then on, that type's rolls are revealed on the ledger instead of concealed.
- **Later chains add depth** — behaviour, tells, timing, weakness — without gating the reveal.
- **Each chain is twice the length of the last**: 3, 6, 12, 24, 48 … A naturalist learns the outlines of a species at once and spends years on the rest. Tier 8 costs 384 sightings, so true mastery is a lifetime's work. The first chain's length and the multiplier are sheet knobs.

Because study chains are long, they are also the deepest training available in Studying — and the most exposed to rust.

---

## 13. Knobs the Sheet Owns

Numbers live in `docs/crawlers.xlsx` (law 9), never in code.

| Knob | What it does | Current |
|------|--------------|---------|
| Lessons per pip | Failures needed to buy 1 pip | 12 |
| Lessons cap per job | Most Lessons one job can pay | not set |
| Rust rate | How fast pips decay when a skill is unused | not set |
| Disuse threshold | What counts as not using a skill | not set |
| Animal Intellect penalty | Difficulty added to all Intellect skills | not set |
| Study chain 1 length | Units in the first study chain | 3 |
| Study chain multiplier | Growth of each later chain | ×2 |
| Unit time | One fixed duration per unit of work | not set |

---

## 14. Open Questions

1. **Unit difficulty ladder.** The named scale (1 = easy … 6 = extraordinarily difficult) now describes a single unit of one throw. Is 6 still the right top end, or does the ladder need rescaling downward?
2. **Depth ladder.** The old `7 / 8 / 10 / 12` escalation was sized for whole jobs. Against per-unit difficulty and twenty-odd dice it may be far too weak or far too strong.
3. **Where unit counts live.** Who authors a chain's unit count — the sheet, the structure definition, the job type?
4. **Does drawing an unknown creature cost the player anything mechanically**, or is concealment purely what the ledger shows?
5. **Is a `tool` tag concept needed at all** now that tasks carry both difficulty numbers?
6. **Housekeeping:** law 10 in `CLAUDE.md` still carries the superseded formula "attribute + skill + 2d6 vs about a dozen", and the near-miss knobs (`learn.near_miss_bonus`, `learn.near_miss_margin`) plus the near-miss branch in `learn()` are dead but still present. Both must be removed through the sheet, since `defaults.json` is generated and `build.py` refuses to build when it and the sheet disagree.

---

## 15. Deferred

*Creature tag sizing and depth difficulty scaling.* A tag may be a fixed chip or may scale with depth. Advanced work — settled after basic gameplay runs.

---

## 16. Retired — Do Not Revive

- **Graded failures.** Paying more for a near miss and less for a bad one. Wrong on principle (law 1) and removed from the law text. The "near miss" language came from assistant-written prose, not author law.
- **Per-skill tool penalties.** Difficulty lives on the task, never on the skill.
- **Attribute-based learning.** The six cannot be ground up with Lessons.

---

## Appendix A — The Odds

Chance of getting at least the needed successes, rolling 5+ on d6.

**Bands:** ⚫ impossible · 🔴 under 5% · 🟠 5–33% · 🟡 33–67% · 🟢 67–95% · 💚 95%+

| dice | needs 1 | needs 2 | needs 3 | needs 4 | needs 6 | needs 8 | needs 12 |
|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:----:|
| **2** | 🟡 55.6% | 🟠 11.1% | ⚫ 0% | ⚫ 0% | ⚫ 0% | ⚫ 0% | ⚫ 0% |
| **3** | 🟢 70.4% | 🟠 25.9% | 🔴 3.7% | ⚫ 0% | ⚫ 0% | ⚫ 0% | ⚫ 0% |
| **4** | 🟢 80.2% | 🟡 40.7% | 🟠 11.1% | 🔴 1.2% | ⚫ 0% | ⚫ 0% | ⚫ 0% |
| **5** | 🟢 86.8% | 🟡 53.9% | 🟠 21.0% | 🔴 4.5% | ⚫ 0% | ⚫ 0% | ⚫ 0% |
| **6** | 🟢 91.2% | 🟡 64.9% | 🟠 32.0% | 🟠 10.0% | 🔴 0.1% | ⚫ 0% | ⚫ 0% |
| **8** | 💚 96.1% | 🟢 80.5% | 🟡 53.2% | 🟠 25.9% | 🔴 2.0% | 🔴 0.0% | ⚫ 0% |
| **10** | 💚 98.3% | 🟢 89.6% | 🟢 70.1% | 🟡 44.1% | 🟠 7.7% | 🔴 0.3% | ⚫ 0% |
| **12** | 💚 99.2% | 🟢 94.6% | 🟢 81.9% | 🟡 60.7% | 🟠 17.8% | 🔴 1.9% | 🔴 0.0% |
| **14** | 💚 99.7% | 💚 97.3% | 🟢 89.5% | 🟢 73.9% | 🟠 31.0% | 🟠 5.8% | 🔴 0.0% |
| **18** | 💚 99.9% | 💚 99.3% | 💚 96.7% | 🟢 89.8% | 🟡 58.8% | 🟠 22.3% | 🔴 0.4% |
| **24** | 💚 100.0% | 💚 99.9% | 💚 99.5% | 💚 98.0% | 🟢 86.2% | 🟡 57.6% | 🟠 6.8% |
| **36** | 💚 100.0% | 💚 100.0% | 💚 100.0% | 💚 100.0% | 💚 99.2% | 🟢 94.9% | 🟡 56.2% |

Reading the table:

- **The wall is abrupt.** Twelve dice is 94.6% against 2 successes and 1.9% against 8. There is no gentle slope downward past the wall; the row simply runs out.
- **A starting crawler rolls 2–12 dice** (attributes 1–6, pairs summed). That is the whole working range of a beginner: comfortable at 1–3 successes, prayerful at 4, dead at 5.
- **One pip is one die.** Twelve failures move a row up by one step. Against a 6-die spread that is small; against the band, it is the whole game.
- **Twelve dice against twelve successes is 0.0%.** Long jobs must be chains, or nothing anyone does will ever matter.

### Worked example — the 30-unit wall

A thirty-unit job, each unit needing 2 successes, worked by three different crawlers:

| Crawler | Fails | Lessons earned | Pips |
|---------|-------|----------------|------|
| 4 dice (a learner) | ~18 units | 1.5 pip's worth | +1 |
| 6 dice (competent) | ~10 units | 0.9 pip's worth | +1 |
| 12 dice (a master) | ~5 units | 0.4 pip's worth | 0 |

The master barely learns, because he barely fails — which is law 1 working as intended, and the reason the per-job Lessons cap exists.
