# Project Crawlers — changelog

**The permanent playable link: https://claude.ai/code/artifact/4938012a-682f-46b7-8ca3-41ecef8219b6**

Publish to that address every time. It never changes, so the link the person
holds always works. A new address would silently strand them on an old build.

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
