/* Seeded RNG. Every number quoted anywhere carries the seed it was measured on,
   so the simulation never touches Math.random. */
function makeRand(seed) {
  let a = (seed >>> 0) || 1;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
