/* The isometric view, drawn pixel for pixel.
 *
 * THE SCALE IS LOCKED: one metre of height is render.rise game pixels, always.
 * Zooming does not make the world bigger -- it makes each game pixel cover more
 * real screen pixels, by a whole number, and the picture is drawn smaller to
 * match. So every edge lands on a whole pixel at every zoom, and a crawler is
 * the same 52 pixels tall whether you are close in or far out.
 *
 * A builder with no consumer looks exactly like working code. So build() fills
 * `batch`, draw() paints it AND records `consumed` -- what actually reached the
 * buffer -- and every test asserts against `consumed`, never against `batch`.
 */
/* Which of a material's pictures a surface wears is folded down from the
 * square's coordinates and one of these, so the same square always picks the
 * same picture and two surfaces standing on it need not agree: a block's left
 * side, its right side, and the ground it stands on are three different surfaces
 * and are salted apart. See Render.pickFor(). */
const PICK_GROUND = 1, PICK_LEFT = 2, PICK_RIGHT = 3;

/* What is behind everything the picture does not paint: the dark the labyrinth
 * is cut out of. One name for it because it is what the whole picture is laid
 * onto, and every wall that fades away at the top fades into it wherever there
 * is nothing else behind. */
const BACKDROP = '#06080b';

const Render = {
  w: 0, h: 0,                  /* the picture, in game pixels              */
  buf: null, bctx: null,
  /* The pick buffer: the scene painted flat in identity colours. The game no
     longer reads it -- pickAt() works the answer out arithmetically -- but the
     battery still paints it as the yardstick the arithmetic answer is proved
     against, so it is built and sized like any other buffer. */
  pick: null, pctx: null,
  batch: [],
  consumed: null,
  /* What the rock skin did to the last batch it built: how many squares of rock
     were left out of the picture because rock stood on every side of them, and
     how many were kept because open air did. Kept on the renderer rather than
     counted in draw(), because they are properties of the list `build()` made, and
     the list outlives the frame it was made in. See Render.wallSkin. */
  skinDropped: 0, skinKept: 0,
  recordItems: false,
  /* EVERY SOLID THING THROWS A SHADOW AWAY FROM THE LIGHT.
   *
   * Aesthetic only, and deliberately so: the game's own light is a level per
   * square, and a shadow is not part of it. Nothing reads a shadow, nothing is
   * hidden by one, and a crawler standing in one is as lit as the square they
   * are standing on says they are. What a shadow buys is that a fire on the
   * floor looks like a fire on the floor -- a crawler walking past one drags a
   * shape along the ground with them.
   *
   * Flipped off, the picture is exactly what it was before there were shadows,
   * which is the arm every shadow test is measured against. */
  lightShadows: true,
  /* Paint only the part of a side wall that stands above the block standing in
     front of it. Flipped off only by the test that paints one frame both ways
     and compares the two pictures pixel for pixel. */
  clipWalls: true,
  /* THE TOP OF A WALL IS NOT PAINTED. A block stone_block or stone_wall carries
     a cap exactly as a floor does, and that cap was how every wall in the
     labyrinth got a stone lid: rows and rows of them laid out across the top of
     the rock, reading as tiling and hiding the shape of the thing underneath.
     A wall's top is a surface nobody in the game ever stands on, so it comes out
     of the picture -- cap, material and all it cost.

     Gated on the tile's FOOTING, not on `solid`. A ramp is solid too (its square
     has height), and its top face is the slope a crawler climbs: deleting that
     would delete the route.

     A square the cut has cut down to a foot of rock is the exception, and the
     only one: its top is a surface the cut made and the only thing covering that
     part of the square, so it is painted like any floor's -- flat rock, not a
     lid. See capShown().

     This is the A/B control for the new look. True paints the old picture -- the
     yardstick the change is proved against, in one build, exactly as `clipWalls`
     and `stepGround` are. */
  wallCaps: false,
  /* WHAT IS PAINTED WHERE THE LID WAS: the rock itself, flat, with no material
     on it, lit by the same light the block's own faces are lit by.

     IT IS OFF. This is the picture v0.41.0 shipped, and it is the wrong answer:
     a slab of rock laid across the top of every wall is a lid again to anybody
     looking at it, which is what "you put the tops back on the wall blocks" was.
     A wall's top is not a surface, so nothing is painted on it.

     What fills that space now is the wall's own SIDES. A face is cut only down
     to where the block in front really reaches -- and one depth step plus the
     front block's own fade band above that -- so the deeper block's stonework is
     painted where the lid used to be, and the front block's fade dissolves into
     ROCK rather than into the backdrop. See cutMeet(). The bare strip along the
     backs of the walls that the flat top was closing to begin with is what that
     cut is for.

     True paints the flat top; `wallCaps` true paints the old lit lid. Both are
     controls, and both are proved against the shipped look inside one build. */
  wallBody: false,
  /* ONLY THE ROCK THAT FACES OPEN AIR IS PAINTED, AND EVERYTHING BEHIND IT IS
     NOTHING AT ALL -- not shaded rock, not a hidden face, just the backdrop the
     whole picture is laid on.

     The labyrinth is cut out of solid rock, so most of the rock the picture used
     to walk past has rock on every one of its four sides: the inside of a wall
     two, four, ten squares thick. Every one of those squares was drawn -- its own
     two near faces, cut down to where the block in front reached -- and none of it
     could ever be seen except the few pixels that escaped over the top of a lower
     neighbour. A wall margin was a staircase of stone going back into the dark
     because all of it was painted, and the ask was one tile of wall with black
     behind it.

     So a square of rock whose four neighbours are all rock is left out of the
     batch. It is not drawn, not clipped against and not picked, because all three
     read the same list, and what shows behind the one tile of wall that remains is
     the backdrop.

     IT IS THE SAME ROCK, DRAWN LESS OFTEN. No face moves, no height changes, no
     tile is retinted, and no rule about where ground is or how a crawler walks
     has anything to do with it. What leaves is the rock that had rock on every
     side of it, which is the rock nothing has ever been able to see.

     THE ONE PICTURE CONSEQUENCE WORTH KNOWING: a terrace standing behind a nearer
     wall is BLACK above it rather than grey, however high it stands -- rock that is
     only reachable by looking THROUGH other rock is not drawn. That is the ask,
     and it is why the test is the four squares AROUND a square rather than
     anything about the camera: a square at the rim of a piece, with no piece next
     door, is beside nothing and is therefore rock you can walk round and see.

     THE CUTAWAY STILL WORKS, which is worth saying because it looks as though it
     should not. The column of rock the cut opens is opened at the room's own wall,
     and that wall is the first square of the column with open air beside it, so it
     is still painted -- and rock between the camera and a room is exactly what
     `cut_solid` is about. What is no longer behind that wall is the stack of
     buried rock the cut's own padding had been keeping.

     False is the A/B control: the picture as it was, every square of rock drawn.
     See `skinDropped` / `skinKept` in `consumed` -- a cull whose control dropped
     nothing would pass on a picture that never had buried rock in it at all. */
  wallSkin: true,
  /* ONLY THE SIDES OF A WALL THAT FACE WALKABLE GROUND. A square of rock shows
     two sides; each of them stands on the edge it shares with the square in
     front of it, and that square is either ground a crawler can walk on or more
     rock. Where it is more rock, the side is rock facing rock -- and it is not
     there to be looked at.

     WHAT IT WAS DOING THERE INSTEAD. The skin (`wallSkin` above) leaves buried
     rock out of the picture, and the cut that shortens a side against the block
     in front it only knew about blocks IN the picture: `clipFaces()` asks the
     list what is in front of a face, and a square the skin threw away is not in
     the list, so the answer came back "nothing" and the whole stored side -- from
     the block's cap all the way down to the floor of the world, 8 m of it -- was
     painted. Those faces are the flaps hanging over the black where the buried
     rock used to be, the ones standing over the room behind a wall you are
     looking at.

     THREE ARMS, and the A/B is inside one build:

       0  as v0.47.0 shipped it: a square the skin dropped counts as nothing in
          front of a face, and the whole side is painted. The control.
       1  a side with rock in front is cut to where that rock reaches -- a depth
          step short of it and no further -- instead of keeping the extra metre
          the fade would dissolve into. The flap is gone; what is left of the
          side is the strip standing above the rock in front, which is still rock
          facing rock.
       2  a side with rock in front is NOT DRAWN AT ALL, and neither of them is
          if both face rock. The rule as asked for, and it is the one the game
          ships: **only a side with walkable ground in front of it is shown.** It
          costs the picture something, and that is the price of the rule: where
          the rock in front is LOWER than we are, the part of our side standing
          above it was rock anybody could see, and that goes with the rest. Arm 1
          is the setting that keeps those strips, and it is what to reach for if
          the look ever wants them back.

     THE ONE FACE THAT IS STILL HANDED BACK WHOLE is a side whose rock in front
     is NOT PAINTED AT ALL -- the square the cutaway cut out of the picture. A
     side cut short against a square that is not on the screen opens a hole in
     the wall, which is what v0.34.0's `kept`/`lost` guard exists to stop, and
     the cutaway counts for more than the rule does. It cannot happen in the look
     the game ships: the cutaway only takes a square out whole at `render.cut_solid`
     0, and the sheet ships that at 1 (see `Render.cutOut`), so the fade is not
     switched on and every arm-2 side with rock in front is gone.

     Armed from the tests with `__test.rockSides(n)`, and proved against arm 0 in
     the same build. */
  rockSides: 2,
  /* WHERE THE FAR HALF OF A LID TOO SMALL TO BE SEEN IS STILL WANTED: the two
     faces of a block's BACK, cut down to where the square behind it reaches --
     and painted only where the rock in the way is drawn SHORT.

     A square's top is a diamond, and the diagonal of it from the far corner to
     the near one splits it in two. The NEAR half is above the block's own two
     near faces, which are painted, so it is covered. The FAR half is above the
     block's own back faces, which face the camera's own quarter and are therefore
     never painted -- what covers that half is the block standing BEHIND the
     square, whose own near wall rises out of the edge the two share and needs no
     help at all while it reaches as high. It stops reaching where the cut has
     taken it down (`drawnM`) or taken it away altogether (`cutOut`), and there
     the far half is bare backdrop: the black wedge at the back of a wall and
     along the top of a step.

     AND THE CUT IS THE ONLY THING THAT DRAWS ANYTHING SHORT. While `cut_solid`
     is 1, `drawnM` is every square's own height and `cutOut` refuses everything,
     so the block behind always covers the strip by itself and these faces fill
     nothing. Painting them there is pure overpaint, and it is measured rather
     than argued, both ways inside one build (`files/probe-backcull.mjs`: 120
     views over three seeds, five dragged camera positions, both angles, all four
     quarters, the world given its 2,000 frames first). Turning the strips OFF at
     the shipped setting adds 0 pixels of bare backdrop, in 0 patches, and leaves
     the census identical to the last pixel -- bare 18, of it 15 enclosed, biggest
     patch 3 -- and over the same 120 views the two pictures are not merely alike:
     re-run against THIS build, the arm with them asked for and the arm without
     come out **0 pixels apart, 0 of 22,299,840 changed**, because the gate has
     already refused them. The 8,276,992 pixels the strips used to paint there --
     more than a third of the frame, drawn over by other rock -- are simply not
     drawn. At
     `cut_solid` 0 the same removal adds 969 pixels of bare backdrop in 494
     separate places, 944 of them enclosed by rock, and takes the worst view from
     82 pixels of hole to 161: those strips are load-bearing, and they are kept
     for that setting.

     THE FIGURE THIS BLOCK USED TO QUOTE -- 48,197 pixels of bare far half over
     the census's 240 views, against 16,952 for the picture that still had lids on
     everything -- was measured with the cut in use, which is the look that
     shipped when the strips were added. At the setting the game now uses it is 0,
     and a strip painted there shuts no hole at all.

     So each block paints its own two back faces, and only as far up them as the
     square behind really reaches: `cutWall()` down to `drawnM()` of the neighbour,
     which leaves exactly the strip the neighbour's top edge cannot cover and not
     a pixel more -- the rest is underneath this block's own near faces, which are
     painted after it. Rock, flat and untextured, lit by the shading of the face it
     lies PARALLEL to, so it reads as the same stone as the wall it belongs to.

     A BLOCK'S TOP, not a floor's: the far half of a floor's diamond is covered by
     the floor itself, which is painted, so those squares are skipped.

     False is the A/B control for the strips themselves, and `backBandsSolid` is
     the control for the change that stopped painting them where nothing is drawn
     short: with that on they come back exactly as v0.44.0 painted them, and the
     two censuses come out equal -- the proof rather than the argument. */
  backBands: true,
  /* PAINT THE STRIPS OF ROCK ALONG A BLOCK'S FAR EDGES EVEN WHERE NOTHING IS
     DRAWN SHORT -- that is, even where the block behind covers them itself. This
     is the picture v0.44.0 shipped, a sixth of the frame repainted for nothing,
     and it is kept as the arm the cull is proved against inside one build.
     `backBand()` refuses the strip unless `cut_solid` is 0 or this is on. False
     is what ships. */
  backBandsSolid: false,
  /* THE TOP METRE OF A WALL FADES AWAY TO NOTHING, which is what turns the edges
     the caps used to draw into soft steps instead of a staircase of hard lines.
     The band WEARS THE WALL'S OWN MATERIAL and dissolves it -- the stonework runs
     on up the wall and goes see-through, rather than the material stopping dead
     at the bottom of the band. See wallBand() and paintSide(). `fadeBand()` is
     the flat fallback, for a wall whose material is switched off or is not mapped
     onto faces at all.

     IT COSTS THE CUT A METRE. A block is cut down to where the block in front
     reaches, and a fading face needs the rock it fades INTO to be there, so the
     cut stops one fade band short of it. See cutMeet(). */
  wallFade: true,
  /* EVERY METRE OF ROCK IS A BLOCK, AND THE BLOCKS LINE UP.

     The solid ground of the labyrinth is a grid of one-metre cubes: a square
     stands `h` whole metres of rock over its floor, so a wall face is a STACK OF
     BLOCKS rather than a sheet cut off wherever the arithmetic happened to land.
     With this on, `cutMeet()` snaps the cut DOWN to a whole metre, and because
     the cut is measured from the block's own base, every wall in the picture
     starts on a block boundary. Two walls of different heights step in whole
     blocks instead of in slivers, and a face that is one block tall reads as one
     block.

     SNAPPING DOWN CAN ONLY PAINT MORE, AND PAINTING MORE IS ALWAYS SAFE -- the
     argument `drawnM()` already makes: the block in front is painted after this
     one and covers what it covers, so what the extra block-length reaches into
     is exactly what was going to be painted over it anyway.

     IT ALSO PUTS EVERY WALL'S FOOT ON A MATERIAL COURSE. One tile of the
     material is one metre of wall, so a cut at a fraction of a metre cut the
     stonework mid-course and left every wall in the picture with a part-height
     row of stones along its foot.

     False is the A/B arm: the picture as it was, cut at the exact height the
     arithmetic gives, slivers and half-courses and all. */
  voxelBlocks: true,
  /* The fourth wall, and what became of it.

     Rock standing between the camera and a floor behind it is what stops a
     dungeon crawler from being a wall of rock with a room hidden behind it, and
     this game has opened that rock since it had rooms. It opened it by FADING
     it: the near wall was painted at `cutaway_fade` alpha so the room could be
     seen through a haze.

     The haze was the bug. Rock is not the only thing standing on a square -- a
     crawler, a bedroll, a store are things the ground is drawn around -- so a
     look that asked "what is in front of this" by comparing the BOX each thing
     is stored with made the tiles either side of the campfire go see-through the
     moment the pointer touched the fire.

     The rule now is that NOTHING is ever drawn see-through. Rock in the way is
     simply not painted: the room is seen through the gap it leaves, and every
     thing that IS painted is painted solid. `cut_solid` is how solid that rock
     stays -- 1 draws it like any other rock, so the room hides behind it; 0 is
     the gap; anything in between is the haze this replaced. A gap is not the
     whole story, though: what is seen through it is a room and not the ground at
     the foot of the column, so a hidden block keeps `cut_stump_m` of itself
     standing. See stumpOf() for why one metre is the number.

     Five other looks were built as real code, photographed, and put in front of
     somebody to choose from: a low wall left standing where the rock was (kerb),
     an outline with the middle left out (edge), a checkerboard (dither), slats
     (lattice), and rock that opens only where you point at it (ask). The gap was
     chosen. They are gone, with the machinery that could draw them -- and the
     lesson worth keeping is the one above: reading a stored BOX as "what covers
     this" is what made the ground beside the fire see-through, and no amount of
     alpha can be right for a thing the ground is drawn around. */
  /* Paint a crawler part way through a step after the whole of the ground that
     step covers, so the ground can never paint over their legs. Flipped off
     only by the test that walks one stride both ways and counts how many of the
     crawler's own pixels the ground covers. */
  stepGround: true,
  /* Lay each material ON the ground it lies on, in the ground's own plane,
     instead of pasting it flat across the screen. Flipped off only by the tests
     that paint one frame both ways: pasting it flat is how the picture used to
     be made, and the old way is kept as the yardstick the mapped way is proved
     against. See ground().

     Named for what is ON, not for what goes away, so that reading the flag and
     reading the code below it cannot disagree: on means mapped. */
  mappedGround: true,
  /* Lay each material on the SIDES of a block too, in the face's own plane,
     instead of leaving them flat colour. Flipped off only by the tests that
     paint one frame both ways: flat sides are how the picture used to be made,
     and the old way is kept as the yardstick the mapped way is proved against.
     See wall().

     Named for what is ON, like mappedGround. */
  mappedWalls: true,
  /* Compose each material out of the pictures somebody dropped into
     textures/<material>/ instead of generating it. On means a dropped-in
     picture IS the surface; off means the generated tile, which is the way the
     game looked before anybody dropped one in.
     
     Flipped off only by the test that paints one frame both ways and compares
     the two pictures -- a builder with no consumer looks exactly like working
     code, and so does a folder somebody has put pictures in. Named for what is
     ON, like mappedGround. */
  pictures: true,
  /* A square of ground may only skip its own placement while the pattern still
     carries THAT floor's plane. A ramp at the same height is mapped from its own
     sloped corners and shares the pattern, so it takes the plane away from every
     square laid after it -- which is what put a floor square's picture down
     3x taller along one edge, in a run, wherever a ramp was drawn first.
     Flipped off only by the test that paints one frame each way and counts:
     skipping on the stamp alone is how it was, and the skew it leaves is the
     yardstick this is proved against.

     Named for what is ON, like mappedGround. */
  ownPlane: true,
  /* Put the light laid OVER a surface onto whole pixels. `lightOver()` is the
     only fill in the game that multiplies what is already there, and `multiply`
     is exact only while the polygon covers a pixel WHOLE: canvas blends a pixel
     a shape only partly covers, and the blend of a multiply is applied part of
     the way, so two neighbouring squares that share their edge leave a brighter
     hairline between them -- at the worst split, a quarter of the square's own
     brightness coming back, which on a floor lit to 0.3 is a dozen levels.
     Rounding each corner up or down to a whole pixel cannot open a gap or an
     overlap, because both neighbours' shared corners are THE SAME POINT and so
     round the same way. Off, the polygon is painted at the fraction it was
     projected at, which is how it was before and is the yardstick the test that
     paints one frame both ways measures against. See lightOver().

     Named for what is ON, like mappedGround. */
  snapOver: true,
  /* Let the light laid over a wall reach the metre of it that is dissolving,
     instead of stopping at the solid part below.

     A wall wearing a dropped-in picture takes its light as a multiply over the
     picture, and the top metre of it is painted as a SECOND picture -- the same
     material with its own dissolve baked into its alpha. Where the multiply
     lands decides whether that metre is lit at all: over the solid part only, it
     stands at the raw brightness of its picture while the metre below it ramps
     with the light, so the brightest stripe of every wall beside a fire is the
     part being dissolved. It costs no fill either way -- the multiply is painted
     once, and this only says where. See paintSide(). Flipped off only by the test
     that paints one frame each way and reports WHERE the two differ, which is how
     "the difference is the band and nothing else" is proved rather than argued.

     Named for what is ON, like mappedGround: on means the ramp reaches the band. */
  bandLight: true,
  /* Sample the ground's light ramp along the direction a line ACROSS THE
     PICTURE actually means in the world, instead of along the world direction
     to the fire.

     A canvas gradient measures along the line it is handed IN THE PICTURE, and
     the projection is not a similarity: one metre of world offset at 45 degrees
     to the grid arrives at a few tenths of a pixel of picture where a metre
     straight along an axis arrives at a whole one. So a ramp built from the two
     points either side of a square along the world direction to the fire asks
     the light along a line that is up to 4.5x the wrong length in one
     direction -- and the mistake is per square and turns with the direction to
     the fire, so two squares sharing an edge sample the light at that edge
     slightly differently. Measured on a lit row of floor at seed 1, six level
     out of a hundred: a hair's breadth of a seam where the light should meet.

     On, the two ends are taken along the direction conjugate to the world
     perpendicular under the projection (`groundBase` works it out from the same
     two numbers the projection is built from), which makes the ramp's equal-
     light lines the world's equal-light lines. Off is how it was before, and is
     the yardstick the test that paints one row both ways measures against.

     Named for what is ON, like mappedGround. */
  gradExact: true,
  /* Take the ground's light ramp from the FIELD of square levels -- one number
     a square, neighbouring squares setting the slope between them -- instead of
     from the source's own falloff sampled at two points inside the one square.

     The light the world keeps is a WALK: how far it had to come to a square is
     a whole number of steps, and that number changes at every square's edge, so
     the source's falloff sampled inside one square does not join up with the
     same falloff sampled inside the square next door. Measured at seed 1 across
     all 321 edges between two flat lit neighbours, the raw light disagrees by a
     median of 14.5 levels and by up to 60 -- and a ramp built from it inherits
     every one of those cliffs, which is what made the floor read as a mosaic.
     The field cannot: a shared edge is set by the same two squares from both
     sides, so the two sides agree to within the field's own curve over a metre.

     Off is how it was before -- per square, from the source, cliffs and all --
     and is the yardstick the test that reads one row both ways measures against.

     Named for what is ON, like mappedGround. */
  rampField: true,
  /* Lay a cast shadow with `multiply` instead of painting black over the top.

     A SHADE IS A LIGHT LAYER, NOT A SURFACE: it takes brightness away from what
     is underneath rather than covering it, which is the same thing the light a
     picture puts on a surface does -- see lightOver(). The arithmetic does not
     change the picture at all, because the shade's own colour is black: multiply
     gives Cr = (1 - a) * Cd + a * 0 * Cd and source-over gives the same
     Cr = (1 - a) * Cd. What changes is that the shade is then laid in the same
     composite as the light, and a census of the frame can tell a light layer from
     a surface instead of counting the shade as a surface of its own — which is
     what a pixel census of the frame has to be able to do (see fillMap()).

     Off is the yardstick the test that paints one frame both ways measures
     against. Named for what is ON, like mappedGround. */
  shadeMultiply: true,
  /* Take a face's light stops from the WHOLE METRES of the world instead of
     from equal fractions of how tall the face happens to be.

     The stops used to be at zFoot + (i/n)*dz, which is a different altitude for
     the same face the moment its foot or its top moves -- and a foot moves
     whenever a crawler shifts the ground under themselves or the camera turns
     under them. The light was therefore sampled somewhere new on every frame,
     and the picture changed by a shade or two wherever it did: 15,573 pixels of
     one frame, 1,605 of them by more than 6 levels, on the clip test's own
     moment; 5,177 pixels on the foot-snap test where the foot moves a whole
     metre. Two of the suite's older tests count exactly those pixels, and both
     were right to.

     On, the stops are the whole metres the face spans, and the light at each of
     them is read off a ONE-METRE LINE of the world: the value at any altitude is
     the straight line between the light at the whole metre below it and the
     whole metre above. So the same altitude is the same quantity however the
     face is cut, a face that grows by a metre gains a stop and changes nothing
     about the stops it had, and the topmost part-metre above a foot that has
     moved samples the same line the whole way up rather than a fresh segment.

     Off is how it was -- equal fractions, the true falloff at each -- and is the
     yardstick the tests that paint one frame both ways measure against. Named
     for what is ON, like mappedGround. */
  altGrid: true,
  /* Smooth the light ACROSS a wall face's own one-metre run, so the join
     between two blocks in a row stops showing.

     Every face is painted at the light of ITS OWN square, and the block beside
     it at the light of its own, and on a lit wall those two need not agree --
     "the light isn't smooth BETWEEN wall blocks ... I see the vertical edges of
     each wall unit because the light stops and starts". Measured a fifth of a
     metre above the rock's own top: forty to seventy pairs of neighbours per
     seed disagree, by a median of 0.07 to 0.10 of a light level and by up to
     0.25, where one light STEP is a sixth of the range. So every block came out
     a stripe with a hard edge down each side of it.

     On, both ends of a face are taken from the SHARED edges -- half this square
     and half the one across it -- so the two faces at a join ask the same two
     squares and land on the same number, and the difference between the ends is
     MULTIPLIED over the face as a horizontal gradient (see shadeRatio() and
     acrossFace()). The fill is SCALED up to the brighter end of the run first,
     because a multiply can only ever darken -- and scaled rather than raised, so
     the level divides back out and the two faces of a join agree whatever levels
     their own squares rounded onto (see faceBase()).

     Off is how it was, and is the yardstick the tests that paint one frame both
     ways measure against. Named for what is ON, like mappedGround. */
  acrossLight: true,
  /* Build a wall face's light ramp on the face's OWN axis -- the one that holds
     a height still, perpendicular in the picture to the face's horizontal edge
     -- instead of straight up the screen.

     On means the two faces at a join read the same altitude at the same place,
     because both are read off the same is-altitude lines. Off is how it was, and
     it is not a shade: a screen row is a height PLUS however far along the wall
     the pixel is, so a one-metre face's far column read up to a whole metre out
     at the foot, and each face read its own leading side -- which is a vertical
     edge at every block, exactly the seam `acrossLight` is asked to hide.

     Off is the yardstick the tests that paint one frame both ways measure
     against. Named for what is ON, like mappedGround. */
  faceAxis: true,
  /* THE CONTROL THAT SPLITS THE SEAM IN TWO, and it is a door and not a
     feature: with it on, every wall face reads the SAME light (0.5) whatever is
     burning and wherever on the face you look, so the light cannot make a seam
     at all and whatever the probe still finds is the stonework's own doing.
     Off is the game.

     Named for what is ON, like mappedGround: on means flat light, which is the
     opposite of what the game wants and exactly what a measurement needs. */
  flatLight: false,
  /* ASK A SQUARE'S OWN NUMBER WHETHER IT IS LIT, never the stepped one.

     `lightAt` rounds onto the six-step ladder, so a square at the rim of a pool
     -- light 0.06, a real number the light map really holds -- has a stepped
     value of exactly 0. Every guard in the light path used that 0 as its test
     for "no light here", which made the ladder a statement about whether a
     square is lit rather than a scale for the panel to read; and because the
     level a face is painted at was then lifted a whole RUNGS up (see
     acrossFace), the picture a wall at the rim got was not a dim wall but a
     wall 2.87x its neighbour at the seam. It is the cliff every wall in the
     camp's own pools was standing on.

     Off is how it was, and it is the yardstick the probe measures against.
     Named for what is ON, like mappedGround.

     SHIPPED OFF. On, it did what it says for the rim squares it was written
     for, but its wall path lifted the painted level off the ladder as well and
     that is a step at every block: measured on the seam ruler (seed 1, camp
     centred, `files/probe-seam3.mjs`) ON gives 471 seams with 87 of them
     corrected on one side only, OFF gives 427 with 25 -- so the picture with
     it off is the better one and it is the one in the game. The door stays
     for the probe. */
  lightFix: false,
  _xformSeq: 0,                /* bumped by anything that sets a transform  */
  planes: {},                  /* floor height -> its ground plane, this frame */
  cellAt: null,                /* world square -> its place in the batch (Map) */
  alphaPlan: null,             /* how strong each thing painted, this frame   */

  resize(w, h) {
    w = Math.max(64, Math.round(w));
    h = Math.max(48, Math.round(h));
    if (this.buf && this.w === w && this.h === h) return false;
    this.w = w; this.h = h;
    if (!this.buf) {
      this.buf = document.createElement('canvas');
      this.pick = document.createElement('canvas');
      /* The picture's buffer is opaque, as it always was: nothing in it is ever
         half-erased. The top of a wall fades by being painted with its own
         colour half-transparent -- see fadeBand() -- so transparency is decided
         by the paint, not by a hole in the buffer. */
      this.bctx = this.buf.getContext('2d', { alpha: false });
      this.pctx = this.pick.getContext('2d', { alpha: false, willReadFrequently: true });
    }
    this.buf.width = w; this.buf.height = h;
    this.pick.width = w; this.pick.height = h;
    return true;
  },

  ensure() {
    if (!this.buf) this.resize(CFG.maxBufW, CFG.maxBufH);
    if (!this.patCache) this.patCache = {};
    if (!this.mats) this.mats = {};
    if (!this.pics) this.pics = {};
    if (!this.skinCache) this.skinCache = {};
  },

  /* Throw away every material baked so far: the generated tiles, the tiles
     composed from dropped-in pictures, and every shaded pattern of either.
     
     Called when the pictures finish decoding -- everything baked before them was
     baked without them -- and by the tests that paint one frame each way. */
  forgetMaterials() {
    this.mats = {};
    this.pics = {};
    this.patCache = {};
    this.skinCache = {};
  },

  /* Will this material be a picture rather than a generated tile? Asked once per
     square of ground and twice per block in a frame, so it counts nothing and
     does no work. */
  drawn(name) {
    return !!(this.pictures && name && Textures.live[name]);
  },

  /* ---- masonry -----------------------------------------------------------
   * A wall somebody BUILT, as opposed to rock somebody dug through: irregular
   * blocks, big ones packed among small ones, with the joints between them
   * showing dark.
   *
   * It is an OVERLAY -- dark lines along the joints and a small
   * shade delta per stone -- so it works over any colour at any light level and
   * goes through the same cached-pattern path. It is generated, not painted,
   * and seeded, so the same wall comes back every time.
   *
   * It TILES: course heights are chosen to sum exactly to the tile height and
   * each course's stones to sum exactly to its width, so there is no seam to
   * find. A wall is a metre of pattern repeated, and a metre is 32 pixels.
   */
  /* ---- the materials -----------------------------------------------------
   * Every surface in the labyrinth is GENERATED, not painted, and every one of
   * them is a transparent OVERLAY a metre square: dark where the stone is cut,
   * light where it catches, nothing where the base colour should show. One
   * tile is one square metre, so a material lands ON the grid rather than
   * floating over it.
   *
   * The look follows the standard dark-fantasy tile vocabulary -- flagstone,
   * cobble, dirt, moss, rubble, bone, water, raw rock -- and the rule that
   * makes such a set hang together: ONE LOCKED PALETTE, so anything you put
   * down belongs with everything else. The tiles tab holds that palette; these
   * only cut the shapes.
   */
  matTile(name) {
    if (this.mats[name]) return this.mats[name];
    const px = Math.max(8, Math.round(CFG.patternPx));
    const rand = makeRand(CFG.texSeed + name.length * 977 + 31);
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    const dark = (a) => 'rgba(16,13,11,' + Math.max(0, a).toFixed(3) + ')';
    const pale = (a) => 'rgba(255,250,238,' + Math.max(0, a).toFixed(3) + ')';
    /* a rectangle drawn three times across, so nothing is cut by the seam */
    const wrapRect = (x, y, w, h, fill) => {
      g.fillStyle = fill;
      for (let k = -1; k <= 1; k++) g.fillRect(x + k * px, y, w, h);
    };
    const speck = (n, size, fill) => {
      g.fillStyle = fill;
      for (let i = 0; i < n; i++) {
        const sx = Math.floor(rand() * px), sy = Math.floor(rand() * px);
        const w = 1 + Math.floor(rand() * size);
        g.fillRect(sx, sy, w, 1 + Math.floor(rand() * size));
        if (sx + w > px) g.fillRect(sx - px, sy, w, 1);
      }
    };

    if (name === 'masonry') { this.mats[name] = this.matMasonry(px, rand); return this.mats[name]; }

    if (name === 'flagstone') {
      /* Big cut slabs, laid square and worn at the edges. The joints are the
         whole read at this size, so they are the only strong marks. */
      const cut = [0, Math.round(px * 0.5)];
      const rows = [0, Math.round(px * 0.52)];
      for (const y of rows) {
        const off = y ? Math.round(px * 0.27) : 0;
        for (const x of cut) {
          const sx = x + off;
          wrapRect(sx, y, 1, Math.round(px * 0.5), dark(0.30));   /* the joint */
          wrapRect(sx + 1, y + 1, Math.round(px * 0.5) - 2, 1, pale(0.05));
        }
        g.fillStyle = dark(0.30); g.fillRect(0, y, px, 1);
      }
      speck(14, 2, dark(0.10));
      speck(8, 1, pale(0.07));

    } else if (name === 'rock') {
      /* Natural rock somebody hacked through -- the face you get when a hall is
         cut: no courses and no joints, just a mottled, gritty stone.
       *
       * It is built at THREE SCALES, and it needs all three. What stood here
       * was thirty wandering one-pixel cracks and nothing else, and at a metre
       * to the tile that is a fifth of the surface covered in hairlines: it
       * reads as hatching, a drawn shade, rather than as stone. Real rock has
       * no lines in it -- it has grain, lumps, and the odd split.
       *
       *   1. GRAIN -- a dense dust of single pixels both ways. This is what
       *      makes it read as stone rather than as a painted tone, and it is
       *      the part you notice when you are close to the wall.
       *   2. MOTTLING -- soft clumps of that grain, dark and light, so the
       *      surface has lumps and hollows instead of an even tone. Clumps
       *      again, never circles: a circle is the one shape stone does not
       *      make, and evenly spaced rounds read as polka dots.
       *   3. CREVICES -- a HANDFUL of short dark splits. Only a handful. The
       *      count is the whole difference between cracked stone and a hatch.
       *
       * All of it is isotropic on purpose: this material goes on the ground a
       * block stands on AND on the sides of the block, and unlike masonry it
       * has no grain direction that could be turned the wrong way on one of
       * them. */
      speck(96, 1, dark(0.06));
      speck(72, 1, pale(0.06));
      for (let i = 0; i < 16; i++) {
        const bx = rand() * px, by = rand() * px;
        const n = 5 + Math.floor(rand() * 12);
        const lit = rand() < 0.45;
        g.fillStyle = lit ? pale(0.11) : dark(0.12);
        for (let k = 0; k < n; k++) {
          const ox = Math.round(bx + (rand() - 0.5) * 11);
          const oy = Math.round(by + (rand() - 0.5) * 11);
          const w = 1 + Math.floor(rand() * 3), h = 1 + Math.floor(rand() * 3);
          for (let q = -1; q <= 1; q++) g.fillRect(ox + q * px, oy, w, h);
        }
      }
      for (let i = 0; i < 6; i++) {
        let x = rand() * px, y = rand() * px;
        const a = rand() * Math.PI * 2;
        let dx = Math.cos(a), dy = Math.sin(a);
        const steps = 3 + Math.floor(rand() * (px * 0.22));
        for (let k = 0; k < steps; k++) {
          g.fillStyle = dark(0.20 + rand() * 0.06);
          const sx = ((Math.round(x) % px) + px) % px, sy = ((Math.round(y) % px) + px) % px;
          for (let q = -1; q <= 1; q++) g.fillRect(sx + q * px, sy, 1, 1);
          /* the split wanders as it runs, the way a crack in stone does */
          if (rand() < 0.35) { const t = dx; dx = dy * (rand() < 0.5 ? 1 : -1); dy = t; }
          x += dx; y += dy;
        }
      }

    } else if (name === 'dirt') {
      /* Trodden earth: clods and small stones, no structure at all. */
      speck(46, 3, dark(0.13));
      speck(26, 2, pale(0.07));
      for (let i = 0; i < 7; i++) {                     /* the odd pebble */
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        wrapRect(x, y, 2, 2, pale(0.13));
        wrapRect(x, y + 2, 2, 1, dark(0.18));
      }

    } else if (name === 'moss') {
      /* Growth taking a floor back. A blotch is a CLUMP of little squares, not
         a circle: drawn as circles they came out as evenly spaced polka dots,
         which is the one shape nothing organic makes. */
      for (let i = 0; i < 22; i++) {
        const bx = rand() * px, by = rand() * px;
        const n = 4 + Math.floor(rand() * 10);
        g.fillStyle = rand() < 0.55 ? dark(0.15) : pale(0.09);
        for (let k = 0; k < n; k++) {
          const ox = Math.round(bx + (rand() - 0.5) * 7);
          const oy = Math.round(by + (rand() - 0.5) * 6);
          const w = 1 + Math.floor(rand() * 3), h = 1 + Math.floor(rand() * 2);
          for (let q = -1; q <= 1; q++) g.fillRect(ox + q * px, oy, w, h);
        }
      }
      speck(34, 2, dark(0.11));

    } else if (name === 'water') {
      /* Standing water: a few long soft ripples, not a scratchy hatch. Drawn
         every other row it read as scored lines rather than a surface. */
      for (let i = 0; i < 9; i++) {
        const y = Math.floor(rand() * px);
        const w = px * (0.25 + rand() * 0.45);
        const x = rand() * px;
        wrapRect(Math.round(x), y, Math.round(w), 1,
                 rand() < 0.55 ? pale(0.07) : dark(0.05));
      }
      /* and the odd bright catch where it moves */
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        wrapRect(x, y, 1 + Math.floor(rand() * 3), 1, pale(0.16));
      }

    } else if (name === 'rubble') {
      /* Collapse: angular pieces at every size, piled without order. */
      for (let i = 0; i < 34; i++) {
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        const w = 2 + Math.floor(rand() * 5), h = 2 + Math.floor(rand() * 4);
        wrapRect(x, y, w, h, rand() < 0.5 ? dark(0.16) : pale(0.09));
        wrapRect(x, y + h, w, 1, dark(0.22));          /* its shadow */
      }

    } else if (name === 'bones') {
      /* Somebody else got this far: pale splinters on a dark floor. */
      speck(30, 2, dark(0.14));
      for (let i = 0; i < 16; i++) {
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        const len = 2 + Math.floor(rand() * 5);
        if (rand() < 0.5) wrapRect(x, y, len, 1, pale(0.30));
        else wrapRect(x, y, 1, len, pale(0.26));
        wrapRect(x, y + 1, len, 1, dark(0.12));
      }
    }

    this.mats[name] = c;
    return c;
  },

  matMasonry(px, rand) {
    const pick = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

    /* Build the wall as a MODEL first, then draw it. The first version walked
       the randomness twice -- once to shade the stones, once to place the
       joints -- and the two walks drifted apart, so the joints did not land on
       the stones. One model, drawn once, cannot disagree with itself. */
    const courses = [];
    let left = px;
    while (left > 0) {
      let h = pick(CFG.masonryCourseMin, CFG.masonryCourseMax);
      if (left - h < CFG.masonryCourseMin) h = left;   /* swallow the remainder */
      courses.push({ h: h, y: px - left, stones: [] });
      left -= h;
    }
    for (let r = 0; r < courses.length; r++) {
      const co = courses[r];
      let x = -pick(0, px - 1);          /* a random start, so joints stagger */
      let w = px;
      while (w > 0) {
        let sw = pick(CFG.masonryStoneMin, CFG.masonryStoneMax);
        if (w - sw < CFG.masonryStoneMin) sw = w;
        co.stones.push({ x: x, w: sw, shade: (rand() - 0.5) * 2, tall: false });
        x += sw; w -= sw;
      }
    }

    /* Real rubble is not courses of equal blocks: every so often a big stone
       takes up two courses at once, and that is most of what stops this reading
       as brickwork. A tall stone SWALLOWS the ground it stands over -- the
       stones of the course below, their head joints and the bed joint between
       -- or the course below simply paints back over it and leaves stray marks
       down the middle of the big block. */
    for (const co of courses) co.covered = new Uint8Array(px);
    for (let r = 0; r + 1 < courses.length; r++) {
      for (const st of courses[r].stones) {
        if (rand() > 0.22) continue;
        st.tall = true;
        st.h = courses[r].h + courses[r + 1].h;
        const below = courses[r + 1].covered;
        for (let x = st.x; x < st.x + st.w; x++) below[((x % px) + px) % px] = 1;
      }
    }
    const buried = (co, st) => co.covered[((Math.floor(st.x + st.w / 2) % px) + px) % px];

    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.clearRect(0, 0, px, px);

    /* Each stone takes its own shade, drawn three times a tile apart so a stone
       crossing the seam is the same stone on both sides of it. */
    for (const co of courses) {
      for (const st of co.stones) {
        if (buried(co, st)) continue;
        const v = st.shade * CFG.masonryVariation;
        const dark = v < 0;
        const h = (st.tall ? st.h : co.h) - 1;
        g.fillStyle = 'rgba(' + (dark ? '18,15,12' : '255,250,238')
                    + ',' + Math.abs(v).toFixed(3) + ')';
        for (let k = -1; k <= 1; k++) {
          g.fillRect(st.x + 1 + k * px, co.y + 1, st.w - 1, h);
        }
      }
    }

    /* Then the joints, straight off the same model. A bed joint is drawn in
       segments so it can be left out under a stone that spans two courses. */
    g.fillStyle = 'rgba(14,11,9,' + Math.min(1, CFG.masonryMortar).toFixed(3) + ')';
    for (let r = 0; r < courses.length; r++) {
      const co = courses[r];
      for (const st of co.stones) {
        if (buried(co, st)) continue;
        for (let k = -1; k <= 1; k++) {
          g.fillRect(st.x + k * px, co.y, 1, st.tall ? st.h : co.h);  /* head joint */
        }
      }
      /* The bed joint along the top of this course, broken wherever a stone
         from the course above reaches down through it. */
      for (let x = 0; x < px; x++) {
        if (!co.covered[x]) g.fillRect(x, co.y, 1, 1);
      }
    }

    return c;
  },

  /* A material somebody DREW, rather than one the game generates: the pictures
     dropped into textures/<name>/, inlined into the page by build.py.

     ONE canvas per picture, each squared up to exactly one square metre -- and a
     square metre wears one of them, chosen from WHERE THE SQUARE IS (see
     pickFor) rather than by laying them out in a grid. Laid out in a grid, nine
     pictures of dirt made a three-metre tile, and what you saw was the tile: the
     same three by three arrangement repeating down the floor, so the ARRANGEMENT
     was the surface and the pictures were only its squares.

     An empty array when the material has no pictures, when the pictures are
     switched off, or before they have all decoded -- so everything downstream
     falls back to the generated tile without having to know this exists. */
  matPictures(name) {
    if (this.pics[name] !== undefined) return this.pics[name];
    const use = this.pictures ? Textures.live[name] : null;
    let list = [];
    if (use && use.length) {
      const px = Math.max(8, Math.round(CFG.patternPx));
      list = use.map((img) => {
        const c = document.createElement('canvas');
        c.width = px; c.height = px;
        /* Whatever size the picture was drawn at, it fills its square metre, so
           the pictures land on the grid rather than floating over it. */
        c.getContext('2d').drawImage(img, 0, 0, px, px);
        return this.wrapTile(c);
      });
    }
    this.pics[name] = list;
    return list;
  },

  /* A TILE SHOULD WRAP, and this one does not out of the box.

     Every one of these is laid down one metre at a time, because a tile is a
     metre square and so is the face of a block -- so wherever two of them meet,
     the material's own left edge is laid against its own right edge. A picture
     somebody drew is not obliged to match itself there, and rock's does not: its
     two edge columns differ by about sixteen levels, which is as much as two
     unrelated columns differ by.

     THIS WAS BUILT TO FIX THE WALL SEAM AND IT DOES NOT. It was the leading
     hypothesis and it was measured and disproved: with every picture closed to
     0.00 the seam went 15.6 -> 15.3, i.e. nowhere. It is parked, not shipped --
     `render.wrap_blend` defaults to 0, which makes this a plain copy and leaves
     the picture identical to v0.51.0. Kept because the defect is real and the
     next job (the wall material's own map) will want it.

     When switched on, the two edge columns are averaged into each other and the
     two edge rows with them, so the sequence is exactly continuous where it
     wraps. `render.wrap_blend` sets how many pixels in from each edge are
     treated, and 0 turns the whole thing off. */
  wrapTile(src) {
    const k = Math.max(0, Math.round(CFG.wrapBlend || 0));
    const w = src.width, h = src.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const n = Math.min(k, Math.floor(w / 2), Math.floor(h / 2));
    if (!(n > 0)) return c;
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const at = (x, y) => (y * w + x) * 4;
    const mean = (o, p) => {
      for (let ch = 0; ch < 4; ch++) {
        const m = (d[o + ch] + d[p + ch]) * 0.5;
        d[o + ch] = m; d[p + ch] = m;
      }
    };
    for (let i = 0; i < n; i++) {
      for (let y = 0; y < h; y++) mean(at(i, y), at(w - 1 - i, y));
      for (let x = 0; x < w; x++) mean(at(x, i), at(x, h - 1 - i));
    }
    g.putImageData(img, 0, 0);
    return c;
  },

  /* Which of a material's pictures one square metre wears, folded down from the
     square's own two grid coordinates and a salt that tells one surface from
     another standing on the same square (a block's left side from its right, a
     side from the ground).

     A PURE function of where the square is, so the surface is the same every
     frame and does not change when the view turns -- and because it is the
     square's own coordinates, two squares a long way apart agree by
     construction rather than by being made in the same pass.

     Multiplying the coordinates by large primes and mixing the bits is what
     makes neighbours land all over the sequence. Walking the grid and adding one
     -- `(x + y) % n`, say -- lays the pictures out in diagonals, which is the
     mosaic again with extra steps. */
  pickIndex(x, y, n, salt) {
    let v = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)
          ^ Math.imul(salt | 0, 83492791);
    v = Math.imul(v ^ (v >>> 16), 2246822519);
    v = Math.imul(v ^ (v >>> 13), 3266489917);
    return ((v ^ (v >>> 16)) >>> 0) % n;
  },

  /* The pick for a named material, through the list it actually has -- so a
     material with no pictures, or one, costs nothing and wears 0. */
  pickFor(name, x, y, salt) {
    const list = this.matPictures(name);
    if (list.length < 2) return 0;
    return this.pickIndex(x, y, list.length, salt);
  },

  /* A surface colour with its material baked into it, cached: one fill, not
     two. Filling every face twice -- once for the colour, once for an overlay
     on top -- cost eight milliseconds a frame, which was half the budget. The
     price of baking is that the lighting has to be stepped so the cache stays
     small; at this resolution the banding reads as paint.

     A material somebody DREW does not come through here as an overlay at all --
     the picture is the colour, and it is multiplied by `lit`, which is the
     shading with no colour of its own. See matPictures().

     `tag` tells two of these apart when the same colour and material are laid
     in different places -- a canvas pattern carries its own placement with it,
     so one shared between the floor at one height and the floor at the next
     would hand the second the first's transform, a metre out. Only the ground
     uses it, and floor heights are whole numbers, so it costs a few tiles.

     `pick` names which of the material's pictures this pattern wears. It is part
     of the key because two pictures are two surfaces: the whole point is that the
     square next door may wear the other one.

     `rampM` asks for the material WITH A FADE ON IT, `rampM` metres deep: the
     tile's own alpha is taken off along a slope running the whole depth, nothing
     at its top and all of it at the bottom. That is how the top of a wall carries
     its material and dissolves at the same time -- see wallBand(). It is part of
     the key for the same reason `pick` is: a tile with a fade baked into it is
     another surface, and handing it to a wall face that wanted the whole material
     would fade a metre off the middle of that wall. */
  matPattern(colour, name, tag, lit, pick, rampM) {
    const list = this.matPictures(name);
    const which = list.length ? (pick || 0) % list.length : 0;
    const pic = list.length ? list[which] : null;
    const tile = pic ? null : this.matTile(name);
    const px = pic ? pic.width : tile.width;
    /* HOW DEEP A FADE IS, counted in whole tiles of material. The tile a fade is
       baked into is that many tiles TALL: the material repeated down it exactly
       as it always was, with the gradient laid over the whole of it, so ONE pass
       of the gradient covers the whole band -- otherwise a band more than a metre
       deep would fade in stripes, one per repeat. A metre of wall is a tile of
       material, so the band's own height in metres is the count, and it is a
       whole number in this world: the cached tiles a whole map of walls can ask
       for number one or two, not thousands. A face shorter than the band takes
       the top of the gradient and so fades only part of the way, which is as
       close as a repeating pattern comes and is what the top of a stub should
       do anyway. */
    const tiles = rampM > 0 ? Math.max(1, Math.round(rampM)) : 0;
    const rampH = tiles ? tiles * px : px;
    /* A dropped-in picture IS the surface, so only the light is baked over it --
       `lit` is the shading with no colour of its own, see lightShade(). A
       generated material is a transparent overlay ON the tile's colour instead,
       so the two are different surfaces and may not share a cache entry. */
    const key = 'm|' + name + '|' + (pic ? 'pic|' + which + '|' + lit : colour)
              + (tag === undefined ? '' : '|' + tag)
              + (tiles ? '|r' + tiles : '');
    let pat = this.patCache[key];
    if (pat) return pat;
    const c = document.createElement('canvas');
    c.width = px; c.height = rampH;
    const g = c.getContext('2d');
    const down = tiles || 1;
    if (pic) {
      for (let i = 0; i < down; i++) g.drawImage(pic, 0, i * px);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = lit || '#ffffff';
      g.fillRect(0, 0, px, rampH);
      g.globalCompositeOperation = 'source-over';
    } else {
      for (let i = 0; i < down; i++) {
        g.fillStyle = colour;
        g.fillRect(0, i * px, px, px);
        g.globalAlpha = Math.max(0, Math.min(1, CFG.texStrength));
        g.drawImage(tile, 0, i * px);
      }
      g.globalAlpha = 1;
    }
    /* THE FADE ITSELF. `destination-in` KEEPS what is already on the tile and
       multiplies its alpha by the gradient, so this is the material fading out
       rather than a flat colour laid over the top of it -- which is exactly what
       the band this replaced used to be, and what the eye read as the stonework
       stopping. The gradient's own colour is irrelevant; only its alpha is used.
       Past the last stop it clamps, so the rest of the tile stays whole. */
    if (tiles) {
      const ramp = g.createLinearGradient(0, 0, 0, rampH);
      ramp.addColorStop(0, 'rgba(0,0,0,0)');
      ramp.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-in';
      g.fillStyle = ramp;
      g.fillRect(0, 0, px, rampH);
      g.globalCompositeOperation = 'source-over';
    }
    pat = this.bctx.createPattern(c, 'repeat');
    pat._pinned = '';
    pat._pick = pic ? which : -1;
    this.patCache[key] = pat;
    return pat;
  },

  /* THE MATERIAL ALONE, ON NOTHING -- the same generated tile matPattern()
     bakes, on an empty canvas instead of on the tile's own colour.

     Laid over a flat colour it gives exactly what the baked pattern gives, and
     the compositing is not approximately the same but the same: bake is
     `strength x material + (1 - strength) x colour` and this is
     `strength x material + (1 - strength) x whatever is underneath`, so put the
     same colour underneath and the two agree to the byte.

     Laid over a GRADIENT it gives the material on a surface whose colour
     changes as it goes, which is the one thing a baked pattern cannot do -- and
     the whole of what smooth light needs. See faceBase() and groundBase().

     A dropped-in picture never comes here: a picture IS its own colour, so
     there is nothing to lay over anything. See skinFor().

     Keyed by the same `tag` and `rampM` matPattern() keys by, and for the same
     reason -- a canvas pattern carries its own placement with it, so one shared
     between the floor at one height and the floor at the next would hand the
     second the first's transform, a metre out on screen. */
  matSkin(name, tag, rampM) {
    const tiles = rampM > 0 ? Math.max(1, Math.round(rampM)) : 0;
    const key = 'k|' + name + (tag === undefined ? '' : '|' + tag)
              + (tiles ? '|r' + tiles : '');
    let pat = this.skinCache[key];
    if (pat) return pat;
    const tile = this.matTile(name);
    const px = tile.width;
    const rampH = tiles ? tiles * px : px;
    const c = document.createElement('canvas');
    c.width = px; c.height = rampH;
    const g = c.getContext('2d');
    g.globalAlpha = Math.max(0, Math.min(1, CFG.texStrength));
    for (let i = 0; i < (tiles || 1); i++) g.drawImage(tile, 0, i * px);
    g.globalAlpha = 1;
    if (tiles) {
      const ramp = g.createLinearGradient(0, 0, 0, rampH);
      ramp.addColorStop(0, 'rgba(0,0,0,0)');
      ramp.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-in';
      g.fillStyle = ramp;
      g.fillRect(0, 0, px, rampH);
      g.globalCompositeOperation = 'source-over';
    }
    pat = this.bctx.createPattern(c, 'repeat');
    pat._pinned = '';
    /* Never a pick: this is a see-through overlay, and nothing behind it may be
       named by it. See pickFor(). */
    pat._pick = -1;
    this.skinCache[key] = pat;
    return pat;
  },

  /* IS THIS SURFACE PAINTED FROM A COLOUR, OR IS THE BAKED PATTERN THE SAME
     THING? One place asks it, because three have to agree -- the ground, a wall
     face and a wall's fade band -- and a surface painted one way by two of them
     and the other way by the third is a seam down the middle of it.

     Null, and the caller does exactly what it always did, whenever there is
     nothing to be had: smooth light turned off, no material, no material
     switched on, or a material that is a picture. */
  skinFor(mat, tag, rampM) {
    if (!(CFG.lightSmooth > 0) || !mat || CFG.texStrength <= 0) return null;
    if (this.drawn(mat)) return null;
    return this.matSkin(mat, tag, rampM);
  },

  /* A DROPPED-IN PICTURE WITH NO LIGHT ON IT AT ALL -- the picture as it was
     drawn, one cache entry per picture per material however many squares wear
     it, so the light can be multiplied over it instead of baked into it. See
     lightOver().

     A picture IS its own colour, so the two halves of smooth light arrive at it
     from opposite sides. A generated material is a see-through overlay, so its
     light goes UNDERNEATH it and shows through the holes -- that is matSkin().
     A picture is opaque, so nothing underneath it can be seen and the light has
     to be laid OVER it, taking the picture's brightness down without touching
     its colour, which is what multiplying does.

     The sum is the same one the bake does -- picture x light -- so a square
     whose light does not change across it is painted the old way, out of the
     baked pattern, for the price of one fill. This is only asked for where the
     light really does change, which is where the bake cannot follow: a pool of
     light is a ramp across the ground and a ladder down a wall, and a pattern
     carrying a whole step of the ladder faded into its neighbour six times along
     a metre of floor is exactly the stairs the smooth light exists to take out.

     Null whenever there is nothing to be had, so the caller does what it always
     did: no picture, no smoothing, or the materials switched off. */
  picSkin(mat, x, y, salt, rampM) {
    if (!(CFG.lightSmooth > 0) || CFG.texStrength <= 0) return null;
    if (!this.drawn(mat)) return null;
    return this.matPattern(null, mat, undefined, undefined,
                           this.pickFor(mat, x, y, salt), rampM);
  },

  /* Map a repeating pattern onto ONE FACE, in that face's own space, rather
     than pasting it flat across the screen.
     
     `a` is the face's top corner, `b` the far end of its top edge (wM metres
     along), `d` the corner straight down from `a` (hM metres). Both edges are
     straight lines under an isometric projection and the face is a
     parallelogram, so the map from texture space to the screen is exactly
     affine -- no perspective term is needed and none is missing.
     
     One metre of wall is one tile of texture, so the courses run along the
     wall, the stones sit on its surface, and the whole thing turns with the
     wall when the view swings. Pasted in screen space it sheared instead, and
     the stonework slid across the wall as the camera moved. */
  faceFill(pat, a, b, d, wM, hM) {
    if (!pat || !pat.setTransform) return pat;
    const px = Math.max(8, Math.round(CFG.patternPx));
    const su = wM * px, sv = hM * px;
    /* ONE matrix, reused. Allocating a DOMMatrix per face costs more than the
       fill it configures -- there are about a thousand faces in a frame. */
    const dm = this._faceM || (this._faceM = new DOMMatrix());
    dm.a = (b.x - a.x) / su; dm.b = (b.y - a.y) / su;
    dm.c = (d.x - a.x) / sv; dm.d = (d.y - a.y) / sv;
    dm.e = a.x; dm.f = a.y;
    pat.setTransform(dm);
    /* kept as plain numbers so a test can check where the texture landed */
    pat._lastMatrix = [dm.a, dm.b, dm.c, dm.d, dm.e, dm.f];
    pat._pinned = '';          /* per face now: never reuse a stale transform */
    /* Whatever this pattern was placed by, it is placed by THIS now. The count
       is how the ground tells a plane it laid from a plane a ramp has since
       taken away from it. See groundFill() and ownPlane. */
    this._xformSeq = (this._xformSeq || 0) + 1;
    pat._xformSeq = this._xformSeq;
    return pat;
  },

  /* The finished fill for ONE SIDE of a block, which is what a wall IS.

     `q` is the face's own four corners in the order build() makes them: the top
     corner, the far end of the top edge, the same end at the foot, and the foot
     under the first. So `q[0]` and `q[1]` are the top edge -- the direction the
     material has to run along -- and `q[3]` is straight down from `q[0]`.

     `hM` is how tall the face really stands, which the wall clip may have cut
     down. One metre of wall is one tile of material either way, so a cut wall
     shows whole courses from the foot up rather than a squashed course.

     `lit` is the light on this face with no colour of its own, and only a
     dropped-in picture has any use for it.

     `x`/`y` are the square the block stands in and `salt` tells this face from
     the other side of the same block, which are the two things a drawn material
     picks its picture from. See pickFor(). */
  wall(colour, mat, q, hM, lit, x, y, salt, skin) {
    /* `skin` is the material with no colour baked into it, when the face is
       being painted from a colour of its own -- see matSkin(). Plain null and
       this is exactly what it always was. */
    return this.faceFill(
      skin || this.matPattern(colour, mat, undefined, lit,
                              this.pickFor(mat, x, y, salt)),
      q[0], q[1], q[3], 1, hM);
  },

  /* THE SAME MATERIAL, DISSOLVING -- the top of a wall with its stonework still
     on it, going transparent as it goes up.

     `wall()` is the face below; this is the band above it, and the two are built
     from the SAME square and the same salt, so they always wear the same picture
     of the material and cannot drift apart. Handing the band an arbitrary picture
     -- or the material with no fade on it -- would show the stones of a wall not
     matching the stones fading off the top of it.

     `rampM` is how tall the band is in metres, and it is also what the fade is
     measured against: the band stretches one tile over its own height, so the
     fade always reaches nothing exactly at the bottom edge of the band whatever
     height the band turned out to be. Walls are whole metres tall, so the ordinary
     case is one tile over one metre -- the material below and the material fading
     above it at the same size, and no seam. */
  wallBand(colour, mat, lit, x, y, salt, rampM, skin) {
    return skin || this.matPattern(colour, mat, undefined, lit,
                                   this.pickFor(mat, x, y, salt), rampM);
  },

  /* Pin a material to the world so it does not swim as the view moves: flat
     across the screen, which is the way the GROUND used to be painted. Each
     pattern is moved at most once per frame per anchor.
     
     Kept for two reasons. It is the cheap way and the whole ground is a big
     share of the picture, so it is the thing the mapped way has to be worth
     beating; and a test can paint one frame each way, which is how the bug this
     replaced -- stonework and moss facing the camera instead of lying on the
     floor -- is kept from creeping back. Only `mappedGround` being off reaches
     it now. */
  pin(pat, ox, oy, stamp) {
    if (!pat || !pat.setTransform) return pat;
    if (pat._pinned === stamp) return pat;
    const m = new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)]);
    pat.setTransform(m);
    pat._lastMatrix = [m.a, m.b, m.c, m.d, m.e, m.f];
    pat._pinned = stamp;
    this._xformSeq = (this._xformSeq || 0) + 1;
    pat._xformSeq = this._xformSeq;
    return pat;
  },

  /* The finished fill for the roof of a square of the world: the ground
     underfoot, the cap of a stone block, or a ramp.
     
     A material here lies ON the square -- its two axes are the square's own two
     edges -- so it turns with the view, and on a floor it runs lengthways along
     the floor rather than facing the camera. Pasted flat across the screen a
     floor had no direction at all, which is what made it read as a pattern hung
     up behind the world instead of ground you are standing on.

     `texture.strength` 0 means NO material at all, a dropped-in picture
     included: the dial is what turns the materials off, and one material that
     ignored it would be a tile nothing could switch back to plain.

     `lit` is the light with no colour of its own, and only a dropped-in picture
     has any use for it. See matPictures(). */
  ground(colour, mat, it, s, worldStamp, lit, skin) {
    if (!mat || CFG.texStrength <= 0) return colour;
    /* WHICH of the material's pictures this square metre wears, from the
       square's own coordinates -- so the pick is the same however the ground is
       reached, and two floors at two heights wear the same scatter. */
    const pat = skin || this.matPattern(colour, mat, it.cell.h, lit,
      this.pickFor(mat, it.cell.x, it.cell.y, PICK_GROUND));
    if (!this.mappedGround) return this.pin(pat, -s.cam.ox, -s.cam.oy, worldStamp);
    /* A ramp is the one square tilted in its own plane -- its corners sit at two
       different heights -- so it is mapped from its own corners, the same as a
       wall face is. Every flat square, floor or block cap, is in the one plane
       for its height, and they share a transform. */
    if (it.cell.slope === SLOPE_FLAT) return this.groundFill(pat, s, it);
    return this.faceFill(pat, it.top[0], it.top[1], it.top[3], 1, 1);
  },

  /* Lay a material in the plane of the ground, from the shared plane rather
     than from the square's own corners.
     
     Every flat square at the same height is the same parallelogram of the same
     plane, so one transform places the material on all of them at once -- that
     is exactly what the square's own `top` corners say (north, east, west) --
     and a square a metre higher is that same map moved up the picture by one
     rise. One metre of ground is one tile of material, so the joints run along
     the edges of the squares on every square at once, whichever way the grid is
     turned.
     
     This is what makes mapping the ground affordable at all. Mapping a material
     onto one face costs about 50 microseconds, and the ground is most of the
     picture: 350 squares of it face by face took drawing from 8.7ms to 43ms
     when that was tried. Set once per material per height per frame it costs
     about what pasting it flat used to. */
  groundFill(pat, s, it) {
    if (!pat || !pat.setTransform) return pat;
    const stamp = this._frameStamp;
    const laid = pat._laid === stamp;
    /* Laid this frame -- and, when the rule that keeps a plane its own is on,
       nothing has written a transform onto this pattern since, so it is still
       carrying THIS floor's plane. Both halves are needed: a ramp at the same
       height wears the same pattern and is mapped from its own sloped corners
       (see ground()), so a square that skipped the placement on the stamp alone
       wore the ramp's stretch instead of its floor's plane. */
    const mine = laid && (!this.ownPlane || pat._laidSeq === this._xformSeq);
    if (laid && !mine && this.planeFaults) this._notePlaneFault(it, pat);
    if (mine) return pat;
    const h = it.cell.h;
    let pl = this.planes[h];
    if (!pl || pl.stamp !== stamp) pl = this.planes[h] = this.plane(s, it, stamp);
    this.faceFill(pat, pl.a, pl.b, pl.d, 1, 1);
    /* Its own record, kept apart from a face's: the same material may be a
       wall's face somewhere else in the same frame, and neither the placement
       nor what a test reads back may be the other's. */
    pat._lastLaid = pat._lastMatrix;
    pat._laidSeq = this._xformSeq;
    pat._laid = stamp;
    return pat;
  },

  /* Test only, and nothing in the game turns it on: write down every square of
     ground that got somebody else's plane, with the two answers side by side.
     What a rule against that is worth is the count going to nothing -- and the
     same count coming back with the rule switched off, in the same build, is
     what keeps it from passing on a picture with no ramp in it. */
  planeFaults: false,
  _faults: null,
  _notePlaneFault(it, pat) {
    const px = Math.round(CFG.patternPx);
    const pl = this.planes[it.cell.h];
    const m = pat._lastMatrix || [0, 0, 0, 0, 0, 0];
    const run = function (x0, y0, x1, y1) { return [x1 - x0, y1 - y0]; };
    (this._faults || (this._faults = [])).push({
      x: it.cell.x, y: it.cell.y, h: it.cell.h, tile: it.cell.tile,
      /* how far a metre of material went, both ways, as the square was painted
         (got) and as its own floor demands (want) */
      got: run(m[4], m[5], m[4] + m[0] * px, m[5] + m[1] * px)
        .concat(run(m[4], m[5], m[4] + m[2] * px, m[5] + m[3] * px)),
      want: pl ? run(pl.a.x, pl.a.y, pl.b.x, pl.b.y)
        .concat(run(pl.a.x, pl.a.y, pl.d.x, pl.d.y)) : null
    });
  },

  /* The ground plane at one floor's height: a metre either way from a whole
     grid corner, lifted to that floor.
     
     The corner is the first square of ground the frame drew, and it is a whole
     grid corner on purpose -- every square's own corners are then a whole
     number of tiles from it, which is what puts the joints on the edges of the
     squares. Which corner it is does not matter, because a repeating material
     looks the same a whole tile along; a small one keeps the numbers exact.
     Held for the frame because it is asked for once per material and it stops
     being true the moment the view moves. */
  plane(s, it, stamp) {
    const c = it.cell, h = c.h;
    return { stamp: stamp,
             a: this.project(s, c.x, c.y, h),
             b: this.project(s, c.x + 1, c.y, h),
             d: this.project(s, c.x, c.y + 1, h) };
  },

  /* Grid corner (gxx, gyy) at elevation h metres -> game pixels.
     The grid is turned by the camera's yaw first, which is what lets the view
     swing. No zoom term anywhere: the world has exactly one size. */
  project(s, gxx, gyy, h) {
    const cam = s.cam;
    const u = gxx * cam.cos - gyy * cam.sin;
    const v = gxx * cam.sin + gyy * cam.cos;
    return {
      x: (u - v) * (CFG.tileW / 2) - cam.ox + this.w / 2,
      y: (u + v) * (cam.tileH / 2) - h * CFG.rise - cam.oy + this.h / 2
    };
  },

  /* How far back something is, in the direction the camera is looking. Bigger
     is nearer the camera, so painting in ascending order paints back to front.
     At any yaw. */
  depth(s, gxx, gyy) {
    const cam = s.cam;
    return gxx * (cam.cos + cam.sin) + gyy * (cam.cos - cam.sin);
  },

  box(s, gx, gy, half, z0, z1) {
    const o = [[-half, -half], [half, -half], [half, half], [-half, half]];
    const top = new Array(4), bot = new Array(4);
    for (let c = 0; c < 4; c++) {
      top[c] = this.project(s, gx + o[c][0], gy + o[c][1], z1);
      bot[c] = this.project(s, gx + o[c][0], gy + o[c][1], z0);
    }
    return { top: top,
             right: [top[1], top[2], bot[2], bot[1]],
             left: [top[2], top[3], bot[3], bot[2]] };
  },

  /* Where the camera is, in the space the world is measured in. Two points on
     this line land on the same pixel, so it is both the cull test and the
     depth order -- and it swings with the view. */
  towardCamera(s, nx, ny, nz) {
    const cam = s.cam;
    const nu = nx * cam.cos - ny * cam.sin;
    const nv = nx * cam.sin + ny * cam.cos;
    return nu + nv + nz * (cam.tileH / CFG.rise);
  },

  /* One fixed light, in the WORLD rather than in the camera, so the sun does
     not spin when the view does. */
  lightOn(nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz) || 1;
    const d = (nx * 0.30 + ny * -0.42 + nz * 0.86) / len;
    const lit = CFG.lightAmbient + CFG.lightDiffuse * Math.max(0, d);
    /* Stepped, not continuous: it keeps the pattern cache small and it reads as
       paint rather than as a gradient. */
    return Math.round(lit * 14) / 14;
  },

  /* One piece of the camp, as real geometry rather than a box.
   *
   * Same lathe as a crawler's parts -- the sheet columns are the same -- but a
   * part hangs at an offset from the SQUARE instead of off a bone, with its own
   * lean and spin, so a log can lie across a fire and a mat can lie flat.
   *
   * `frac` is how far the thing has been built. A part marked `grows` rises out
   * of the floor as the work goes on, which is how you can SEE how far a camp
   * has got; a part that does not grow (a flame, a lid, a blanket) simply is not
   * there until the job is done.
   */
  structure3d(s, site, def, gx, gy, ground, frac) {
    const parts = STRUCT_PARTS(site.structure);
    const out = [];
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const done = frac >= 1;

    for (let i = 0; i < parts.length; i++) {
      const f = parts[i].part;
      if (!f.grows && !done) continue;
      const rise = f.grows && !done ? Math.max(0.08, frac) : 1;
      /* Lean tips the lathe over, spin turns it about the upright. */
      const bone = { p: [f.x, f.y, (f.z + ground) / 1], m: matMul(matRotZ(f.spin * DEG),
                                                                  matRotX(f.lean * DEG)) };
      const shrunk = { from_m: f.from_m * rise, to_m: f.to_m * rise,
                       w_top: f.w_top, w_bot: f.w_bot, d_top: f.d_top, d_bot: f.d_bot,
                       sides: f.sides, rings: f.rings, bulge: f.bulge,
                       cap_top: f.cap_top, cap_bot: f.cap_bot, ox: 0, oy: 0 };
      const mesh = partMesh({ p: [f.x, f.y, f.z * rise], m: bone.m }, shrunk, 1);
      const pts = mesh.verts, n8 = pts.length;
      const scr = new Array(n8);
      let cx = 0, cy = 0, cz = 0;
      for (let c = 0; c < n8; c++) {
        const q = pts[c];
        scr[c] = this.project(s, gx + q[0], gy + q[1], ground + q[2]);
        cx += q[0]; cy += q[1]; cz += q[2];
      }
      const faces = [];
      let biggest = null, biggestArea = 0;
      for (let k = 0; k < mesh.faces.length; k++) {
        const fa = mesh.faces[k];
        const a = pts[fa[0]], b2 = pts[fa[1]], c2 = pts[fa[2]];
        const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2];
        const vx = c2[0] - b2[0], vy = c2[1] - b2[1], vz = c2[2] - b2[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (this.towardCamera(s, nx, ny, nz) <= 0) continue;
        const poly = new Array(fa.length);
        for (let q = 0; q < fa.length; q++) poly[q] = scr[fa[q]];
        let area = 0;
        for (let q = 0; q < poly.length; q++) {
          const a1 = poly[q], b1 = poly[(q + 1) % poly.length];
          area += a1.x * b1.y - b1.x * a1.y;
        }
        const lit = this.lightOn(nx, ny, nz);
        const size = Math.abs(area) * 0.5;
        if (size > biggestArea) { biggestArea = size; biggest = { pts: poly, lit: lit }; }
        if (size < CFG.minFacePx) continue;
        faces.push({ pts: poly, lit: lit });
      }
      if (!faces.length && biggest) faces.push(biggest);
      if (!faces.length) continue;
      this.bounds(scr, box);
      out.push({ id: parts[i].id, colour: f.colour, glow: f.glow > 0, faces: faces,
                 depth: this.towardCamera(s, gx + cx / n8, gy + cy / n8,
                                          ground + cz / n8) });
    }
    out.sort(function (a, b) { return a.depth - b.depth; });
    return { parts: out, box: box };
  },

  /* One posed crawler, as real boxes on real bones. */
  figure3d(s, actor, gx, gy, ground, scale) {
    const pose = poseFor(actor, s.tick);
    const bones = buildSkeleton(pose);
    const parts = figureParts(actor);
    const out = [];
    const box = [Infinity, Infinity, -Infinity, -Infinity];

    for (let i = 0; i < parts.length; i++) {
      const f = parts[i].part;
      const bone = bones[f.bone];
      if (!bone) continue;
      const mesh = partMesh(bone, f, scale);
      const pts = mesh.verts;
      const n8 = pts.length;
      const scr = new Array(n8);
      let cx = 0, cy = 0, cz = 0;
      for (let c = 0; c < n8; c++) {
        const q = pts[c];
        scr[c] = this.project(s, gx + q[0], gy + q[1], ground + q[2]);
        cx += q[0]; cy += q[1]; cz += q[2];
      }
      const faces = [];
      let biggest = null, biggestArea = 0;
      for (let k = 0; k < mesh.faces.length; k++) {
        const fa = mesh.faces[k];
        const a = pts[fa[0]], b2 = pts[fa[1]], c2 = pts[fa[2]];
        const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2];
        const vx = c2[0] - b2[0], vy = c2[1] - b2[1], vz = c2[2] - b2[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (this.towardCamera(s, nx, ny, nz) <= 0) continue;   /* facing away */
        const poly = new Array(fa.length);
        for (let q = 0; q < fa.length; q++) poly[q] = scr[fa[q]];
        /* A rounded limb has a lot of surfaces that never cover a whole pixel.
           Drawing them costs real time and changes nothing anyone can see. */
        let area = 0;
        for (let q = 0; q < poly.length; q++) {
          const a1 = poly[q], b1 = poly[(q + 1) % poly.length];
          area += a1.x * b1.y - b1.x * a1.y;
        }
        const lit = this.lightOn(nx, ny, nz);
        const size = Math.abs(area) * 0.5;
        if (size > biggestArea) { biggestArea = size; biggest = { pts: poly, lit: lit }; }
        if (size < CFG.minFacePx) continue;
        faces.push({ pts: poly, lit: lit });
      }
      /* Rule 4: a part that is worn is a part that is drawn. If every one of its
         faces came out too small to bother with, keep the largest anyway rather
         than letting a piece of gear silently vanish. */
      if (!faces.length && biggest) faces.push(biggest);
      if (!faces.length) continue;
      this.bounds(scr, box);
      out.push({ id: parts[i].id, slot: f.slot, item: f.item, colour: f.colour,
                 glow: f.glow > 0, faces: faces,
                 depth: this.towardCamera(s, gx + cx / n8, gy + cy / n8, ground + cz / n8) });
    }
    /* Nearest last. Two dozen convex parts sort reliably by their middles. */
    out.sort(function (a, b) { return a.depth - b.depth; });
    return { parts: out, box: box };
  },

  bounds(pts, box) {
    for (let c = 0; c < pts.length; c++) {
      if (pts[c].x < box[0]) box[0] = pts[c].x;
      if (pts[c].y < box[1]) box[1] = pts[c].y;
      if (pts[c].x > box[2]) box[2] = pts[c].x;
      if (pts[c].y > box[3]) box[3] = pts[c].y;
    }
    return box;
  },

  /* How much of the picture a face covers, for the tests that have to prove the
     buried walls really are gone rather than take it on trust. */
  area(pts) {
    let sum = 0;
    for (let c = 0; c < pts.length; c++) {
      const p = pts[c], q = pts[(c + 1) % pts.length];
      sum += p.x * q.y - q.x * p.y;
    }
    return Math.abs(sum) / 2;
  },

  /* Could any of a piece's ground reach the picture?
   *
   * The world the game HOLDS is a window of pieces (see 12-world.js), and the
   * window is far bigger than the screen -- a ring of ground kept ready either
   * side of it -- so asking 3136 squares of every live piece whether they show
   * is most of the work of a frame, and almost all of the answer is no.
   *
   * A piece is one box of ground seen through the same projection its squares
   * are, so its four corners at ground level and at the tallest a square can
   * stand fence it in: every square of the piece lies inside that shape, which
   * is what the camera can see pulled back through a straight-edged change of
   * coordinates. So it is eight points to ask about instead of 3136, and a piece
   * that misses the screen simply is not walked.
   *
   * This decides nothing about how anything LOOKS: a piece that is walked goes
   * through exactly the loop it always did, and a piece that is not walked had
   * every one of its squares culled a moment later anyway. */
  pieceOnScreen(s, p) {
    const tall = CFG.maxElev + CFG.rockHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let c = 0; c < 4; c++) {
      const x = p.ox + CORNERS[c][0] * p.n, y = p.oy + CORNERS[c][1] * p.n;
      for (let k = 0; k < 2; k++) {
        const q = this.project(s, x, y, k ? tall : 0);
        if (q.x < minX) minX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.x > maxX) maxX = q.x;
        if (q.y > maxY) maxY = q.y;
      }
    }
    return !(maxX < 0 || minX > this.w || maxY < 0 || minY > this.h);
  },

  /* WHICH SQUARES OF A PIECE ARE ROCK STANDING ON THE GROUND, one byte each, in
     the same order the piece's own squares are stored -- so `rock[li]` is the
     square `cells[li]`, and a neighbour is one step along the array.

     Asked once for the whole piece before any of it is walked, because the skin
     asks it of four neighbours for every rock square of the frame and asking the
     WORLD each of those four times would be four lookups through the map of
     pieces for a question whose answer is already in the array in hand. The
     scratch array is kept on the renderer and refilled per piece: it is thrown
     away the moment a piece is done with it.

     A RAMP IS NOT ROCK HERE, however high it climbs. Its footing is a slope a
     crawler walks up, so a ramp beside a square makes that square rock you can
     see, which is the whole meaning of the test. */
  rockMap(piece) {
    const cells = piece.cells;
    let m = this._rockScratch;
    if (!m || m.length !== cells.length) m = this._rockScratch = new Uint8Array(cells.length);
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      m[k] = this.rockAt(c) ? 1 : 0;
    }
    return m;
  },

  /* IS THIS SQUARE ROCK -- the one word the skin, the cut and the fade all mean
     by it, said once so the three cannot drift apart. Rock is a square that
     stands up (`h > 0`) and whose tile is BLOCK FOOTING: the stuff the labyrinth
     was cut out of.

     IT IS NOT ASKED ABOUT SLOPE. A ramp is not rock -- its footing is a slope a
     crawler walks up -- and rockMap() has always counted it that way, so a
     question about the square itself must not quietly be a different question
     about its slope. Every caller that cares whether the ground is flat tests
     that separately, as it always did. */
  rockAt(c) {
    return !!c && c.h > 0 && TILE(c.tile).footing === 'block';
  },

  /* IS THERE ROCK ON ALL FOUR SIDES OF THIS SQUARE -- the one question the skin
     asks, worked out by stepping off the square's own edges with `EDGE_STEP`, the
     same way `clipFaces()` steps off them to find the block in front, so the look
     and the cut cannot disagree about which square is beside which.

     A SQUARE WITH NOTHING BESIDE IT COUNTS AS OPEN. The rim of a piece has no
     piece next door until the player walks there, and rock with bare nothing at
     its side is rock you can walk round and look at -- which is the rock that has
     to be drawn. It also means the answer does not depend on which pieces happen
     to be held this frame, so the same wall is drawn the same way while the
     player walks toward it.

     A NEIGHBOUR IS READ OUT OF THE PIECE'S OWN MAP where it is inside the piece
     (the overwhelmingly common case, and four array reads), and out of the world
     otherwise -- which is every neighbour at all along the rim of the piece, where
     there is no map entry to read. */
  buriedRock(w, piece, rock, x, y) {
    const n = piece.n, ox = piece.ox, oy = piece.oy;
    for (let e = 0; e < 4; e++) {
      const nx = x + EDGE_STEP[e][0], ny = y + EDGE_STEP[e][1];
      const lx = nx - ox, ly = ny - oy;
      if (lx >= 0 && ly >= 0 && lx < n && ly < n) {
        if (!rock[ly * n + lx]) return false;
      } else {
        if (!this.rockAt(w.at(nx, ny))) return false;
      }
    }
    return true;
  },

  /* Painter's order is back to front, which is ascending depth along whatever
     direction the camera is looking. With the view able to swing, that is no
     longer the order the cells are stored in, so everything visible goes into
     one list with its depth and the list is sorted. Crawlers and structures sit
     a hair in front of the ground they stand on, so they paint after it.

     The ground is walked a PIECE at a time rather than a square at a time, so
     the pieces nowhere near the screen are skipped without their squares ever
     being projected (see pieceOnScreen). Each square still carries the number
     of its place in the list of every live square, because that number is what
     the pointer answers with (see pickAt). */
  build(s) {
    const w = s.world, b = this.batch;
    this.ensure();
    if (s.lightDirty) computeLight(s);
    b.length = 0;
    this.skinDropped = 0; this.skinKept = 0;

    /* What is standing on which square, keyed by the square itself rather than
       by a number worked out from where it is -- which is also what keeps two
       pieces from ever colliding in the same key. */
    const standing = new Map(), sited = new Map();
    for (let i = 0; i < s.actors.length; i++) {
      const a = s.actors[i], cell = w.at(a.x, a.y);
      if (!cell) continue;
      const list = standing.get(cell);
      if (list) list.push(i); else standing.set(cell, [i]);
    }
    if (s.camp) {
      for (let i = 0; i < s.camp.sites.length; i++) {
        const st = s.camp.sites[i], cell = w.at(st.x, st.y);
        if (!cell) continue;
        const list = sited.get(cell);
        if (list) list.push(i); else sited.set(cell, [i]);
      }
    }

    const scale = CFG.actorHeight / CFG.figureNominal;

    for (let pi = 0; pi < w.live.length; pi++) {
      const piece = w.live[pi];
      if (!this.pieceOnScreen(s, piece)) continue;
      const first = piece.firstCell;
      const cells = piece.cells;
      /* Where the rock is in this piece, worked out once for the whole piece --
         see rockMap(). Null where the skin is off, so the arm the cull is proved
         against does not pay for a map it never reads. */
      const rock = this.wallSkin ? this.rockMap(piece) : null;
      for (let li = 0; li < cells.length; li++) {
        const cell = cells[li];
        const i = first + li;
        const x = cell.x, y = cell.y;

        /* ONE TILE OF WALL AND BLACK BEHIND IT: a square of rock with rock on
           every side of it is buried, and buried rock is not in the picture at
           all. See Render.wallSkin for the whole of it.

           A crawler and a camp site cannot be on this square: both stand where
           they can walk, and a block is not a square anybody walks on, so
           leaving it out cannot take anything else off the picture with it. */
        if (rock && rock[li]) {
          if (this.buriedRock(w, piece, rock, x, y)) { this.skinDropped++; continue; }
          this.skinKept++;
        }

        const top = new Array(4);
        const box = [Infinity, Infinity, -Infinity, -Infinity];
        /* What is LEFT of a block the picture is about to skip -- see
           stumpOf(). Worked out before the corners, because the corners ARE the
           answer: a stumped block is projected at its own foot height instead of
           its real one, and from there on it is an ordinary low block to every
           other line of this file -- its faces, its lid, its pick box and the
           clip against the block in front all come out of these four points. */
        const stub = this.stumpOf(cell);
        /* The highest corner of the square AS DRAWN, which is not the same thing
           as the square's own height `h`: a ramp that starts at the floor has no
           height of its own and still rises a metre across itself, and the rock
           in that metre is a wall. See `solid` below. */
        let hi = 0;
        for (let c = 0; c < 4; c++) {
          const ch = cornerHeight(cell, c);
          const chd = stub > 0 ? Math.min(ch, stub) : ch;
          if (chd > hi) hi = chd;
          top[c] = this.project(s, x + CORNERS[c][0], y + CORNERS[c][1], chd);
        }
        this.bounds(top, box);
        if (box[2] < 0 || box[0] > this.w || box[1] > this.h) continue;

        const baseB = this.project(s, x + 1, y, 0);
        const baseC = this.project(s, x + 1, y + 1, 0);
        const baseD = this.project(s, x, y + 1, 0);
        const baseA = this.project(s, x, y, 0);
        let low = Math.max(baseA.y, baseB.y, baseC.y, baseD.y);
        if (low > box[3]) box[3] = low;
        if (box[3] < 0) continue;

        const depth = this.depth(s, x + 0.5, y + 0.5);
        const light = lightAt(s, cell);

        /* Which two walls of the block face the camera changes as the view
           swings, so pick the pair by which corners are lowest on screen. */
        const order = [0, 1, 2, 3].sort(function (p, q) { return top[p].y - top[q].y; });
        const near = order[3], left = order[2], right = order[1];
        const bases = [baseA, baseB, baseC, baseD];

        const wallM = this.drawnM(cell);
        const solid = cell.h > 0 || hi > cell.h;
        /* Whether this square's own top is painted at all. Where it is NOT (the
           lid of a wall block, unless Render.wallBody or the square is a stump),
           the far half of the square is left bare and something has to cover it
           -- see Render.backBands and backBand() below. A floor's top is always
           painted, so a floor never needs the help. Asked with the same words
           the picture paints the top by, item and all, so the two cannot drift
           -- `stub` is the one word that has to be here as well as there,
           because a stump paints its own cut top (see Render.capShown) and
           therefore has nothing left to fill. */
        const lid = this.wallCaps || TILE(cell.tile).footing !== 'block'
                 || (this.wallBody && solid) || stub > 0;
        const backR = lid ? null : this.backBand(w, x, y, wallM, order[0], right, top, bases);
        const backL = lid ? null : this.backBand(w, x, y, wallM, order[0], left, top, bases);

        b.push({
          kind: 'cell', i: i, cell: cell, top: top, depth: depth, light: light,
          left: [top[near], top[left], bases[left], bases[near]],
          right: [top[near], top[right], bases[right], bases[near]],
          /* Anything with rock standing in it is solid, INCLUDING a ramp that
             climbs out of the floor: its own `h` is 0 and its far corner is a
             metre up, so the metre of rock under that corner is a wall face and
             has to be drawn like one. That was the "missing floor at wall
             corners" -- a h0 ramp's flank was being skipped as if it were
             ground. */
          solid: solid,
          /* Whether the square's top face is a wall's lid rather than ground you
             can stand on -- see Render.capShown(). Read off the tile's FOOTING,
             because a ramp's square has height too and its top is the slope the
             crawler climbs. */
          block: TILE(cell.tile).footing === 'block',
          wallM: wallM,               /* how far the faces drop, in metres */
          /* The corner both faces hang from, and the far corner of each face, so
             the clip below can tell which of the four edges a face stands on.
             Then the wall cut down to the block in front: see clipFaces(). */
          near: near, cornerL: left, cornerR: right,
          nbrL: -1, nbrR: -1, cutL: null, cutR: null, cutML: 0, cutMR: 0,
          /* Whether ROCK stands in front of each face -- see clipFaces(). Kept
             apart from `nbrL`/`nbrR` because rock can be in front of a face
             without being in the picture at all: the wall skin drops the buried
             square before it is ever added, and -1 is what a face with nothing in
             front of it looks like, so the two cannot share a field. */
          rockL: false, rockR: false,
          backL: backL, backR: backR,
          cutaway: cell.cutaway === true,
          /* A block that is hidden behind the wall in front but keeps a foot of
             itself standing -- see stumpOf(). It paints solid all the way down
             and is never faded: the fade's whole job is to let you see over a
             tall wall, and a one-metre foot is not in the way of anything. */
          stumped: stub > 0,
          minX: box[0], minY: box[1], maxX: box[2], maxY: box[3],
          cx: (top[0].x + top[2].x) / 2, cy: (top[0].y + top[2].y) / 2
        });

        const ground = surfaceHeight(cell);

        const here = sited.get(cell);
        if (here) {
          for (let q = 0; q < here.length; q++) {
            const site = s.camp.sites[here[q]];
            const def = STRUCT(site.structure);
            const frac = site.built ? 1 : site.progress / 100;
            const fig = this.structure3d(s, site, def, x + 0.5, y + 0.5, ground, frac);
            if (!fig.parts.length) continue;
            const sbox = fig.box;
            if (sbox[2] < 0 || sbox[0] > this.w || sbox[3] < 0 || sbox[1] > this.h) continue;
            b.push({
              kind: 'site', i: w.cells.length + s.actors.length + here[q],
              site: site, parts: fig.parts, solid: true, depth: depth + 0.01, light: light,
              minX: sbox[0], minY: sbox[1], maxX: sbox[2], maxY: sbox[3],
              cx: (sbox[0] + sbox[2]) / 2, cy: sbox[1] + (sbox[3] - sbox[1]) * 0.4
            });
          }
        }

        const people = standing.get(cell);
        if (!people) continue;
        for (let q = 0; q < people.length; q++) {
          const actor = s.actors[people[q]];
          /* Mid-stride a crawler is between two squares, so where they are drawn
             -- and how far back they paint -- comes from actorPos(), not from the
             square they are filed under. */
          const at = actorPos(s, actor);
          const fig = this.figure3d(s, actor, at.gx, at.gy, at.h, scale);
          const abox = fig.box;
          if (!fig.parts.length) continue;
          if (abox[2] < 0 || abox[0] > this.w || abox[3] < 0 || abox[1] > this.h) continue;
          /* HOW FAR BACK A WALKING CRAWLER PAINTS. Mid-stride the feet are
             already inside the square ahead and already outside the square
             behind, so ordering by the feet alone hands the step to whichever of
             those two squares is the nearer one, and it paints over their legs
             for half of every stride. A crawler therefore paints after the whole
             of the ground their step covers -- the square they left, the square
             they are arriving at, and the feet in between. Rock genuinely
             standing in front is nearer than all three and still covers them.
             Standing still, the feet are back on the middle of one square and
             this changes nothing at all. */
          let stride = this.depth(s, at.gx, at.gy);
          if (this.stepGround && actor.moveT < 1) {
            stride = Math.max(stride,
                              this.depth(s, actor.fromX + 0.5, actor.fromY + 0.5),
                              this.depth(s, actor.x + 0.5, actor.y + 0.5));
          }
          b.push({
            kind: 'actor', i: w.cells.length + people[q],
            actor: actor, parts: fig.parts, solid: true,
            gx: at.gx, gy: at.gy, gh: at.h,
            depth: stride + 0.02, light: light, light: light,
            minX: abox[0], minY: abox[1], maxX: abox[2], maxY: abox[3],
            cx: (abox[0] + abox[2]) / 2, cy: abox[1] + (abox[3] - abox[1]) * 0.35
          });
        }
      }
    }

    /* The shade solid things throw, worked out from the fires rather than from
       the picture, and put into the same list everything else is in -- see
       castShadows() for why it has to be here, before the sort. */
    this.castShadows(s, b);

    b.sort(function (p, q) { return p.depth - q.depth; });

    /* Where each square ended up. A wall may only be cut down when the block it
       faces is painted after it, and that is not known until the whole list is
       in painter's order. */
    let at = this.cellAt;
    if (!at) at = this.cellAt = new Map();
    at.clear();
    for (let k = 0; k < b.length; k++) if (b[k].kind === 'cell') at.set(b[k].cell, k);
    /* EVERY item, including the frontmost one. The last item used to be skipped
       on the argument that nothing can be in front of it -- true of the PICTURE,
       and not true of the question being asked: a side also asks whether rock
       stands in front of it in the WORLD, whether that rock is painted or not
       (see `rockSides`), and a rock block can be the last thing in the list
       without being the last thing in the way. It happens as soon as the skin
       takes the buried rock out: a block that was 275th of a list of 318 had 106
       buried blocks taken out ahead of it and ended up standing at the front of
       212, where the skip left its two rock-facing sides unanswered -- so it
       painted its whole stored face down over the floor of the room behind it,
       1,580 pixels of it. Nothing is in front of the last item, so the extra
       call can only ever find that out; it is one call a frame. */
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      if (it.kind !== 'cell' || !it.solid) continue;
      /* A block with a ramp in it is drawn from its two lowest corners, which
         are not always the two faces it shows, so a ramp keeps its whole wall. */
      if (it.cell.slope !== SLOPE_FLAT) continue;
      /* A depth step, in metres: how far down the picture the top edge of one
         block sits below the top edge of the block in front of it. Derived from
         the camera every frame rather than written down -- `tileH` is 16 at the
         low angle and 27 at the raised one, so a literal here would be wrong the
         moment the view is tilted. See cutMeet(). */
      this.clipFaces(s, w, it, k, at, s.cam.tileH / CFG.rise);
    }

    s.geomDirty = false;
    return b;
  },

  /* How far up a face the square standing in front of it may hide it -- the ONE
     answer the picture, the outline and the pointer all share, so the three
     cannot disagree.

     MEETING IS NOT COVERING. Where two blocks meet, and the face cut down to
     where they meet, was right for as long as a wall wore a LID. A lid lies
     across the top of its own square, so it covered the STAGGER between the two
     blocks: our top edge sits `cam.tileH` pixels below the top edge of the block
     one square in front of us, and the lid of that block -- painted after us --
     covered every one of them. One pixel of stagger per pixel of ground: at the
     low camera angle `tileH` is 16 and a metre is 32, so the lid covered a depth
     step, which is what `tileH / rise` metres is.

     The lids are gone, so the front block's own two near sides are all there is,
     and those start at its top edge. Everything between its top edge and ours is
     now bare -- which is why a face keeps a depth step more than the meeting.

     AND A METRE MORE THAN THAT WHEN IT FADES. The top metre of a wall is
     dissolved upward to nothing (paintSide), so what shows through it has to be
     ROCK and not the backdrop. The block behind a fading top therefore keeps that
     metre, and is seen through it: the rock continues up the wall and goes
     see-through, which is the whole point of the fade.

     A FLOOR OR A RAMP in front is not like a block at all: its top face IS
     painted (`capShown`), it is never more than a step or two below us, and the
     wall standing on the edge of a room must go on being cut exactly where it
     was cut. So there the old rule stands, to the pixel.

     `drawnM` rather than `cell.h`, because what a square promises from the world
     and what it PAINTS are two different things once a hidden block is keeping
     only a foot of itself standing.

     AND ROCK IN FRONT IS NOT A FLOOR. A face whose neighbour square is walkable
     ground is cut exactly as it always was. A face whose neighbour is ROCK is a
     side with rock behind it, which is what `Render.rockSides` is about: it may
     not keep the extra fade metre (nothing there is dissolving into anything --
     see arm 1) and at the strictest it may not be drawn at all (arm 2). */
  cutMeet(nbr, mine, stepM) {
    const capped = this.capShown(nbr);
    const rock = !capped && this.rockAt(nbr);
    /* Arm 2: the answer is `mine`, so `meet < mine` is false wherever this is
       read and the side comes out as no side at all -- which is the same answer
       the fringe cases already give, so nothing downstream needs a new shape. */
    if (rock && this.rockSides >= 2) return mine;
    const hide = capped ? 0
               : rock && this.rockSides >= 1 ? stepM
               : stepM + CFG.wallFadeM;
    const meet = Math.max(0, Math.min(mine, this.drawnM(nbr) - hide));
    /* Whole blocks only -- see `Render.voxelBlocks`. `mine` is a whole number of
       metres (a square's height, or `cut_stump_m`), and the cut is never allowed
       above it, so flooring can only ever move the foot DOWN. It can never raise
       a face above its own block count, which is what keeps
       `Math.floor` from inventing a metre of wall the block has not got. */
    return this.voxelBlocks ? Math.floor(meet) : meet;
  },

  /* Cut a block's two side walls down to where the square standing in front of
     it reaches.
     *
     * A face stands on the edge it shares with that square. Where the square is
     * a block tall enough to bury the face, the whole face comes out of the
     * picture, and a face cut away to nothing is not painted at all. How much of
     * it counts as buried is `cutMeet()` -- a depth step short of the meeting,
     * because there is no lid any more to cover the stagger.
     *
     * ONLY A FLAT neighbour qualifies, and it has to be full-height: a ramp is
     * drawn from its two lowest corners, which are not always the two faces it
     * shows, and a floor or a pit is far too low to hide anything.
     *
     * The cut is only allowed while that block PAINTS SOLID, and that is not
     * known until draw() -- fade it, because you are inspecting something behind
     * it, and the whole face has to come back or the fade would open a hole. So
     *      both shapes are worked out here and draw() picks between them.

     AND A SQUARE CAN BE STANDING IN FRONT OF THIS FACE WITHOUT BEING IN THE
     PICTURE AT ALL. That is the whole reason this takes `s`: since the wall skin
     (`Render.wallSkin`) the buried rock is dropped before it is ever added to the
     list, so `at` -- which is built FROM the list -- answers "nothing here" for
     a square that is unquestionably there. A face that believed it painted its
     whole stored side, and a block's stored side runs from its top all the way
     down to the floor of the world: eight metres of wall hanging over the black
     where the square that used to cover it was, and over whatever lay behind it.
     The world is asked instead, and asked what the picture is really about: is
     the square in front of this face ROCK, and is it in front of us at all.

     IT IS ASKED OF THE WORLD AND NOT OF THE SKIN, and that is deliberate: the
     list is missing squares for more than one reason (the skin dropped them, the
     screen cut them, their whole piece is off it) and a side that stood against
     rock is rock facing rock whichever of those it was. Asking the skin's own
     question -- rock AND buried -- would have left the fringe cases painting the
     whole side again, which is the flap this rule exists to stop, standing at the
     edge of the frame. */
  clipFaces(s, w, it, k, at, stepM) {
    const cell = it.cell, x = cell.x, y = cell.y;
    for (let f = 0; f < 2; f++) {
      const other = f === 0 ? it.cornerL : it.cornerR;
      /* Which of the four edges the face stands on, named by the corner it runs
         from: one of the two corners it hangs between is the near corner. */
      const e = other === (it.near + 1) % 4 ? it.near : other;
      const nx = x + EDGE_STEP[e][0], ny = y + EDGE_STEP[e][1];
      const nbr = w.at(nx, ny);
      if (!nbr) continue;      /* nothing there: no piece, so no block in front */
      const nk = at.get(nbr);
      const rock = this.rockAt(nbr);
      let front = false;       /* rock in front of this face, in the picture or not */
      if (nk === undefined) {
        /* Rock in front that the picture has not got: buried and dropped by the
           skin, or off the screen, or in a piece that is. It is still rock, so
           this side is rock facing rock like any other -- see `Render.rockSides`. */
        if (!rock) continue;
        /* A square the list holds is in front of us because it PAINTS after us.
           A square the list does not hold has to answer the same question the
           only way it can, by its own depth -- and if it is further from the
           camera than we are it is behind us, not in front, and can neither hide
           this face nor lie over it. */
        if (!(this.depth(s, nx + 0.5, ny + 0.5) > it.depth)) continue;
        front = true;
      } else {
        if (nk <= k) continue; /* painted before this face: it hides nothing */
        if (nbr.slope !== SLOPE_FLAT || nbr.h <= 0) continue;
        front = rock;
      }
      /* Where the two blocks meet, and never longer than our own wall: a cut
         that ended up above it would paint outside the block. OUR OWN WALL is
         `wallM` and not `cell.h`, because a block that only keeps a foot of
         itself standing (`stumpOf`) is a one-metre block as far as this picture
         is concerned -- clipped against a metre of rock in front it would come
         out as a sliver of no height at all. */
      const mine = it.wallM;
      const meet = this.cutMeet(nbr, mine, stepM);
      /* WHICH SURFACE IS IN FRONT IS WRITTEN DOWN SEPARATELY FROM WHICH BLOCK
         IS. `nbrL`/`nbrR` are a position in the picture's list, and there is no
         position for a square that was dropped before it was added -- so the
         dropped case leaves them at -1, exactly as if the piece ended there, and
         says `rockL`/`rockR` instead. `wallsPainted()` is what reads the two,
         and draw()'s `lost` guard goes on reading only the numbers, because it
         is about a block that was looked for and is missing. */
      if (f === 0) {
        it.nbrL = front && nk === undefined ? -1 : nk;
        it.rockL = front;
        it.cutML = mine - meet;
        it.cutL = meet < mine ? this.cutWall(it.left, it.top[it.near], it.top[other], meet) : null;
      } else {
        it.nbrR = front && nk === undefined ? -1 : nk;
        it.rockR = front;
        it.cutMR = mine - meet;
        it.cutR = meet < mine ? this.cutWall(it.right, it.top[it.near], it.top[other], meet) : null;
      }
    }
  },

  /* The same wall, cut off at `meet` metres. Screen x does not depend on height
     and screen y moves render.rise pixels per metre, so the cut-off foot is the
     wall's own foot, raised -- no need to project anything again. */
  cutWall(quad, topNear, topOther, meet) {
    return [topNear, topOther,
            { x: quad[2].x, y: quad[2].y - meet * CFG.rise },
            { x: quad[3].x, y: quad[3].y - meet * CFG.rise }];
  },

  /* THE STRIP OF ROCK A BLOCK SHOWS WHERE THE BLOCK BEHIND IT IS LOWER.

     A wall has no lid any more (see this.wallBody), so a block paints its two
     near faces and nothing else. What covers the rest of its square -- the whole
     of its top diamond, both halves -- is the block BEHIND it, whose own near
     wall runs down from the edge they share. That is why deleting the lid did
     not leave a hole everywhere: the wall behind was already painting that space
     and does not know the lid is gone.

     It only works while the block behind reaches as high. Where it is lower --
     a floor, a step down, a wall a metre short -- its wall stops short of this
     block's top edge, and the strip between the two is bare backdrop: a black
     wedge along the back edge of the rock, at every corner where two low
     neighbours meet. That is exactly what "missing floor pieces at wall corners"
     was.

     The strip is the far face of THIS block, seen over the top of the one behind
     it, and it is drawn as the same wall cut down to `drawnM(neighbour)` -- the
     face from this block's own top edge down to the height its neighbour reaches,
     so it fills the gap exactly and stops where the neighbour's wall begins.

     NOTE WHAT THIS IS NOT: a lid. Nothing is drawn where the neighbour is as
     tall as this block (`low < mine` refuses), which is most of the rock in the
     labyrinth -- `Render.wallBody` painted a slab across EVERY wall and that is
     the wrong answer. This paints only the far side of a block that has nothing
     standing behind it, and that side is visible rock by anybody's reading.

     Returns null when there is nothing to paint -- no strips asked for, no rock
     in this square, a neighbour that reaches as high, or (v0.45.0) a look in
     which nothing at all is drawn short, see `Render.backBands` -- so the common
     case costs two world lookups and no quad. */
  backBand(w, x, y, mine, anchor, other, top, bases) {
    if (!this.backBands || !(mine > 0)) return null;
    /* AND NOTHING IS DRAWN SHORT UNLESS THE CUT IS IN USE (`drawnM`, `cutOut` at
       `cut_solid` 0), so at the shipped setting there is nothing here to fill:
       measured over the 120-view census in files/probe-backcull.mjs, turning the
       strips off moves 0 pixels of bare backdrop and 16% of the frame stops being
       repainted. See `Render.backBands`; `backBandsSolid` is the A/B. */
    if (CFG.cutSolid > 0 && !this.backBandsSolid) return null;
    /* Which of the four edges the far corner and this one share, named by the
       corner it runs from: the same rule the clip uses. */
    const e = other === (anchor + 1) % 4 ? anchor : other;
    const nbr = w.at(x + EDGE_STEP[e][0], y + EDGE_STEP[e][1]);
    if (!nbr) return null;             /* no piece there: nothing to read */
    const low = this.drawnM(nbr);
    if (!(low < mine)) return null;    /* the neighbour's wall covers it all */
    return this.cutWall([top[anchor], top[other], bases[other], bases[anchor]],
                        top[anchor], top[other], low);
  },

  /* One path, one fill. `snap` puts every corner on a whole pixel -- see
     snapOver. It is not tidiness: a corner half a pixel out is a pixel only
     half covered, and a `multiply` only half applied. */
  poly(ctx, pts, fill, snap) {
    this.path(ctx, pts, snap);
    ctx.fillStyle = fill;
    ctx.fill();
  },

  /* PUT THE LIGHT ON SOMETHING THAT IS ALREADY PAINTED -- `multiply` keeps the
     picture's colour and takes only its brightness down: red x amber is dark
     red, red x grey is dark red, which is what a light does to a surface. The
     alternative, laying a see-through light over the top, can only ever wash a
     surface out towards its own colour, so a fire would bleach the flagstones
     instead of glowing on them.

     It costs the polygon a second time, so it is asked for only where the light
     really changes across the face -- see picSkin(). Multiply leaves whatever is
     under the polygon alone, which is why this can be painted over ground that
     has already been drawn without erasing it.

     WHAT REACHES THE CANVAS IS PUT ON WHOLE PIXELS -- see snapOver. This is the
     one fill in the game whose result depends on how much of a pixel it covers,
     so it is the one fill that may not be given a fraction. */
  lightOver(ctx, pts, shade) {
    ctx.globalCompositeOperation = 'multiply';
    this.poly(ctx, pts, shade, this.snapOver);
    ctx.globalCompositeOperation = 'source-over';
  },

  /* IS THIS SQUARE'S TOP FACE PAINTED? A floor's always is -- that is the ground
     you walk on. A ramp's always is too. A BLOCK'S IS NOT: a wall's top is a
     surface nobody in the game ever stands on, so it comes out of the picture --
     cap, material and all it cost (v0.42.0; `wallCaps` and `wallBody` are the two
     controls that put a top back, and this answer has to be asked in one place
     because four things depend on it: the picture, what fills the space the top
     leaves, `clipFaces()`, and the halo round a selected thing -- a halo that
     rings a surface nobody painted is a ring drawn round nothing).

     IT TAKES A CELL AS WELL AS AN ITEM, and that is not tidiness: `cutMeet()` asks
     this about the NEIGHBOUR, which has no item built for it yet -- `clipFaces()`
     runs after the sort, long after the items were made.

     AND A STUMP ANSWERS YES FOR ITSELF AND NO FOR ITS NEIGHBOUR. The other way
     round was built and measured, because the argument for it is good: a square
     whose top is painted covers the stagger between itself and the face standing
     in front of it, so `cutMeet()` may cut that face a metre and a half deeper
     than it otherwise would. It buys nothing and costs paint. Over 48 views, one
     build each way (`files/probe-cutmeet.mjs`): the deeper cut painted 8504 wall
     faces across the whole sweep where the old answer painted 9175, and the bare
     backdrop was 225 pixels against 211 -- one view apart, one seam's worth
     either way, and no notch in either. Cutting a face deeper than the last look
     cut it, for nothing, is the one direction this file calls unsafe (see
     `cutMeet`), so the deeper cut is not here: the cell branch below answers for
     a stump exactly as it answered in v0.42.0.

     A SQUARE THE CUT HAS CUT IS NOT A WALL, and its top IS painted. Where a
     hidden block keeps a foot of rock standing (`stumpOf`), the lid comes back
     for that square alone, and for the same reason it was taken away: a lid is
     wrong because a wall's top is a surface nobody stands on and a row of them
     across the labyrinth read as tiling, and neither of those is true of a metre
     of rock standing in the middle of a room. The CUT made that surface. It is
     the raw cross-section of the rock, it is the one thing a player sees from
     across a room, and it is the only thing that covers the near half of its own
     square: the half behind the shared edge with the square BEHIND it, where
     that square is level with the foot or lower -- which is every floor and
     every other stump -- leaves `backBand()` with nothing to paint (`low < mine`
     refuses at level) and the front faces standing below it. Measured with
     `files/probe-voids.mjs --why`: bare backdrop, a lens 12 px wide and 20 px
     tall in the middle of the top diamond. That is "black notches at wall
     corners", and it is this face.

     Painting it where something else covers it too costs one fill and can hide
     nothing, because the square in front of this one is painted after it (see
     `drawnM`). */
  capShown(it) {
    if (this.wallCaps) return true;
    if (it.block === undefined) {
      const t = TILE(it.tile);
      return t.footing !== 'block' || (this.wallBody && it.h > 0);
    }
    return !it.block || (this.wallBody && it.solid) || it.stumped === true;
  },


  bandQuad(quad, d) {
    const a = quad[0], c = quad[1];
    return [a, c, { x: c.x, y: c.y + d }, { x: a.x, y: a.y + d }];
  },

  /* THE TOP METRE OF A WALL, FADED AWAY.

     A face is a parallelogram with two vertical sides: screen x does not depend
     on height and screen y moves render.rise pixels per metre, so the top metre
     of a wall is its own top edge with the same two sides, `d` pixels further
     down. The band is that parallelogram, and the gradient runs ACROSS it --
     perpendicular to the slanted top edge, nothing at all on the edge itself and
     the face's own colour at the band's bottom -- so every point of the band
     fades by how far down from the top edge it is, and the two ends of a slanted
     edge match. A plain vertical gradient would fade the uphill end of a slanted
     top edge by half of what it faded the downhill end.

     THE BAND IS THE FACE'S OWN COLOUR, half-transparent, rather than an eraser.
     There is no erasing available: canvas paint OVERWRITES, so `destination-out`
     can only take the alpha off the top layer, and the layer it uncovers is not
     the picture behind the wall -- there is nothing behind it: the buffer was
     filled with one flat colour and the rock and floor that were painted earlier
     were then covered, not stored. An erase therefore fades a wall toward the
     backdrop, which stripes a rock face with dark bands. Only paint that can be
     seen through shows what is really behind: the far side of the room, the
     floor, a crawler standing at the base of the wall.

     THIS IS THE FLAT FALLBACK. A wall whose material is mapped onto its faces
     wears that material in the band instead and dissolves it -- see paintSide()
     and wallBand() -- which is what a person sees as the stonework continuing up
     the wall and going see-through. The flat band is what is left for a wall with
     no material on it at all (`texture.strength` 0, or a face no material is
     mapped onto), where there is no stonework to continue. */
  fadeBand(ctx, quad, metres, colour) {
    const d = Math.min(CFG.wallFadeM, metres) * CFG.rise;
    if (!(d > 1)) return 0;
    const a = quad[0], c = quad[1];          /* the face's top edge */
    const ex = c.x - a.x, ey = c.y - a.y;
    const len = Math.sqrt(ex * ex + ey * ey) || 1;
    let nx = -ey / len, ny = ex / len;
    if (ny < 0) { nx = -nx; ny = -ny; }      /* always downhill on the screen */
    const t = d * ny;                        /* where a drop of d lands along it */
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    const g = ctx.createLinearGradient(mx, my, mx + nx * t, my + ny * t);
    g.addColorStop(0, this.withAlpha(colour, 0));
    g.addColorStop(1, this.withAlpha(colour, 1));
    this.poly(ctx, this.bandQuad(quad, d), g);
    return d;
  },

  /* A wall face with its top metre gone: the same quad with the top edge dropped
     `d` pixels and the foot left where it was. */
  belowBand(quad, d) {
    const a = quad[0], c = quad[1];
    return [{ x: a.x, y: a.y + d }, { x: c.x, y: c.y + d }, quad[2], quad[3]];
  },

  /* One side of a block, whole: the material from the foot up to the faded band,
     then the band over the top of it. The band is painted LAST and a pixel down
     into the material, so the join between flat colour and material is covered
     by the band's opaque end rather than left as an antialiased hairline.

     `fill` is the whole face's fill -- a colour, or the material's pattern, which
     is registered to this face's own top corner -- so handing it the shorter
     quad fills that shorter quad with exactly the part of the material that
     belongs there. Nothing slides.

     `band` is the material WITH THE FADE BAKED INTO IT, for a wall that has a
     material mapped onto it (see wallBand()). It is anchored to the same corner
     the face's own material is anchored to, at the same scale -- one tile of
     material to one metre of wall -- so the stones in the band ARE the stones of
     the face below it, running straight through the join, and they dissolve as
     they rise rather than stopping. Without one -- a flat-coloured wall -- the
     band falls back to `fadeBand()`, which fades the face's own colour.

     `over` is the light to MULTIPLY over the face, for a face that is a picture
     rather than a colour -- the picture was painted with no light on it at all.
     It goes over the WHOLE face, band and all: the ramp it carries is a ramp in
     the light, and the top metre of a wall is the same surface as the metre below
     it, standing in less light.

     That sounds like it darkens the room beyond the wall, and it does not, for a
     reason worth writing down. The band is a canvas whose alpha is ITS OWN
     dissolve: nothing at the top, everything at the bottom, and the multiply's
     gradient carries the same ramp -- both are linear in screen height across the
     same two corners, so one is the other pointwise, whatever the band is worth.
     Where the band is transparent the multiply is transparent too, so the sky or
     the room beyond comes through untouched; where the band is opaque the
     multiply is at full strength; and in between the two fade together, which is
     the answer that was wanted. Painting it over the solid part only is what the
     shipped build did, and it left the top metre of every lit wall at the raw
     brightness of its own picture.

     Returns 0 when the face was painted whole, 1 for a flat band and 2 for a band
     carrying the material, so `consumed` can count them and a test can prove the
     material reached the fade rather than arguing that it did. */
  paintSide(ctx, quad, metres, colour, fill, band, base, over) {
    /* A face NO TALLER THAN THE FADE BAND is painted whole, material and all.
       There is no "top metre" of a one-metre face to fade -- the band would be
       the whole face, and a gradient across all of it dissolves a stump of rock
       into nothing, which is a hole in the wall rather than a fading one. The
       band is the top of a wall, not a height. */
    const fd = this.fadeDepth(metres);
    if (!(fd > 0)) {
      if (base) this.poly(ctx, quad, base);
      this.poly(ctx, quad, fill);
      if (over) this.lightOver(ctx, quad, over);
      return 0;
    }
    const d = fd * CFG.rise;
    /* THE SURFACE THE MATERIAL IS LAID ON IS PAINTED THE WHOLE HEIGHT OF THE
       FACE, band and all -- because the band below is a PATTERN, and a pattern
       cannot dissolve. What dissolves is the canvas it was cut from, and what is
       behind it shows through the holes that leaves. So the colour the face's
       light was worked out against has to be under all of it, or the top metre
       of every wall would fade into the backdrop instead of into its own shade.
       See matSkin().

       A face with a base is always a face with a band when it fades at all --
       skinFor() only says yes to a generated material, and every generated
       material's fading face asks for one -- so the fadeBand() arm at the bottom
       is never reached with a base already painted. */
    if (base) this.poly(ctx, quad, base);
    const low = this.belowBand(quad, d - 1);
    this.poly(ctx, low, fill);
    if (band) {
      const q = this.bandQuad(quad, d);
      /* THE BAND'S OWN HEIGHT, not the face's. One metre of wall is one tile of
         material, and the pattern's own v axis is laid over `fd` -- so the stones
         in the band are the size of the stones in the face it sits on and the
         courses run straight through the join. Mapped over a face two metres
         tall while only one metre of it is band, the stones in the band would
         come out twice the height of the stones below them. */
      this.faceFill(band, q[0], q[1], q[3], 1, fd);
      this.poly(ctx, q, band);
    } else {
      this.fadeBand(ctx, quad, metres, colour);
    }
    /* THE LIGHT GOES ON LAST, and over everything the face covers. A band is
       painted before the light rather than after it, because the light has to be
       able to reach it -- see the note on `over` above, and see how far the top
       metre of a wall was out when it could not. `bandLight` false paints it over
       the solid part only, which is what the build shipped with, so the one
       picture can be had both ways inside one build and a test can show that the
       difference is the band and nothing else. */
    if (over) this.lightOver(ctx, this.bandLight && band ? quad : low, over);
    return band ? 2 : 1;
  },

  /* `rgb(r,g,b)` -- which is what every shade in this file hands back -- as the
     same colour at another strength. A hex is taken too, because the camp and
     the figures carry plain tile colours about. */
  withAlpha(colour, a) {
    const s = String(colour);
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255)
           + ',' + a + ')';
    }
    return s.indexOf('rgb(') === 0 ? 'rgba(' + s.slice(4, -1) + ',' + a + ')' : s;
  },

  /* HOW DEEP THE FADE AT THE TOP OF A FACE IS, in metres, or 0 for a face that
     does not fade at all. One place asks it, because the fade is painted by two
     -- the band of material and the surface underneath it -- and they have to
     agree on how far down it reaches or the band has nothing to fade into. */
  fadeDepth(metres) {
    if (!this.wallFade || !(CFG.wallFadeM > 0)) return 0;
    if (!(metres > CFG.wallFadeM)) return 0;
    return Math.min(CFG.wallFadeM, metres);
  },

  /* HOW BRIGHT A PIECE OF GROUND REALLY IS, as opposed to how bright its SQUARE
     is. The square's level is a whole number of steps -- that is the game's own
     answer and what the panel reads -- and it is what a plain fill is painted
     with. A surface that carries a material is painted from a colour of its own
     and can carry the light itself instead: at the floor, lightValueAt hands
     back the same number with the stepping taken off, so the edge of a pool of
     light is soft rather than a stair two thirds of a metre wide.

     `stepped` is true when this square is a dropped-in PICTURE, because a
     picture's pattern IS its colour -- the shade is baked into the cache entry
     -- so a key that varied with a continuous light would be a cache entry per
     pixel. Pictures keep the steps, which is the other reason the steps exist. */
  floorLight(s, it, stepped) {
    if (stepped || !(CFG.lightSmooth > 0)) return it.light;
    /* Whether there is light here at all is asked of the SQUARE'S OWN number.
       The stepped value is 0 for the whole outer rim of every pool, and using it
       as the test collapsed those faces to one flat fill at the darkest light
       there is. See lightFix. */
    const lit = this.lightFix ? (it.cell.light > 0) : (it.light > 0);
    if (!lit || !s.sources) return it.light;
    return lightValueAt(s, it.cell, surfaceHeight(it.cell));
  },

  /* A FACE PAINTED FROM ITS FOOT UP, by the light that is really falling on it.

     A square has one light level; a wall is three metres of stone standing in a
     fire's glow, bright at the bottom and dark at the top, and painting all
     three metres at the level of the floor below it is what made a fire read as
     a puddle of colour. So the face is sampled up its own height and the colour
     is laid on as a straight gradient.

     AND IT RUNS ACROSS THE FACE, NOT UP THE PICTURE. `project` takes `rise`
     pixels off a point's y for every metre it stands up -- at ONE grid corner.
     A metre ALONG the wall moves the picture half a rise down instead, so the
     line where a face's height is constant is not a screen row: it is the face's
     own slanted top edge, and a row crosses from one altitude to another as it
     goes. A ramp read off screen rows therefore gives the two ends of a single
     face different heights -- a whole metre out at the foot of a one-metre face
     and nothing at all at the crown -- and the two faces of one wall, each
     reading its own leading side, disagree along the join by that much. That is
     a vertical edge at every block, worst at the foot. The axis that holds a
     height still is the one PERPENDICULAR to the face's horizontal edge, and
     that is what the gradient is built along here, at any camera turn and both
     camera angles. `fadeBand()` has always built its fade this way; the light
     was the odd one out.

     `quad` is the face as it will be PAINTED -- which a cut may have shortened,
     so the foot is taken from `zFoot`, the height that foot really stands at,
     rather than from the floor of the world. `fade` is how many metres of the
     top dissolve away (see fadeDepth), and the gradient fades with them, so the
     surface under the band of material dissolves at the same rate as the band.

     A face whose light comes out the same all the way up, on a face with no
     fade, is ONE flat fill -- which is most of the rock in the labyrinth, and
     must stay one fill.

     `colour` IS THE SURFACE'S OWN COLOUR, before any light is put on it -- the
     tile's own `side`, and not a colour that has already been through
     `litShade`. It was handed an already-shaded colour for one version, along
     with the very facing factor that had shaded it, so the ramp was
     `litShade(litShade(c, f, L0), f, L)` -- the facing TWICE in the brightness,
     and the level twice over, which squared both. It showed as a face whose foot
     did not match the fill above it and whose mid-height did not match the
     ground beside it; the darker the corner and the dimmer the square, the worse
     it read. One colour in, light and all, light and all out.

     WHERE THE STOPS GO is a claim about the world and not about the face -- see
     altGrid. A stop is an altitude in metres, the light is asked at that
     altitude, and the fractions along the picture come from where those
     altitudes land between the foot and the top. */
  faceBase(s, cell, colour, f, quad, fade, zFoot, mul) {
    const yTop = quad[0].y, yBot = quad[3].y;
    const dz = (yBot - yTop) / CFG.rise;
    /* `mul` SCALES the whole profile, and it is how a face is painted bright
       enough for the across-the-run gradient to darken it back down (see
       acrossFace()): a multiply can take light away and never give it.

       IT SCALES RATHER THAN RAISES, and the difference is the whole of a seam.
       A raise is a constant added to every stop, so the topmost metre of a
       raised face keeps that constant as a FLOOR while the face beside it -- one
       that happened to need no rise -- goes on down to black. That floor is not
       a shade, it is a wall of light standing on the top of one block and not
       on its neighbour, and it is what the owner saw as "the light stops and
       starts" at every vertical join.

       And it does not only hide a seam: it is the wrong number in the middle of
       the face too. A face painted at `ref + (level - ref)` and multiplied by
       light(e)/light(level) lands on e at its ends and on `ref` at its own
       reference altitude, but anywhere else it lands on
       `(L(z) + level - ref) * ref / level`, which is L(z) only when level is
       ref. A scale lands on `L(z) * level/ref * e/level` -- the LEVEL CANCELS
       -- so the face is the shape it always was, stretched to reach the brighter
       end of the run, and two faces sharing an edge land on the same number
       whether their levels agree or not. */
    const up = mul === undefined ? 1 : mul;
    if (!(dz > 0)) return litShade(colour, f, this.faceLight(s, cell, zFoot) * up);
    const zTop = zFoot + dz;
    let zs, ls;
    if (this.altGrid) {
      zs = [zFoot];
      for (let k = Math.floor(zFoot) + 1; k < zTop - 1e-6; k++) zs.push(k);
      zs.push(zTop);
      /* THE ONE-METRE LINE of the world's light: asked of the source at the
         whole metres and a straight line across the metre in between. Reading
         every stop off it -- including the two that are not on a whole metre --
         is what makes the same altitude the same number however the face has
         been cut, which is the whole point of the grid. A face a metre taller
         gains a stop at the metre it gained and every other stop is untouched. */
      const at = new Map();
      const metre = (k) => {
        if (!at.has(k)) at.set(k, this.faceLight(s, cell, k));
        return at.get(k);
      };
      ls = zs.map((z) => {
        const a = Math.floor(z), t = z - a;
        const lo = metre(a);
        return t > 0 ? lo + (metre(a + 1) - lo) * t : lo;
      });
    } else {
      /* Equal fractions of whatever this face happens to be: the yardstick. */
      const m = Math.max(1, Math.min(6, Math.round(dz)));
      zs = new Array(m + 1); ls = new Array(m + 1);
      for (let i = 0; i <= m; i++) {
        zs[i] = zFoot + (i / m) * dz;
        ls[i] = this.faceLight(s, cell, zs[i]);
      }
    }
    const n = zs.length - 1;
    const stops = new Array(n + 1);
    let same = true;
    for (let i = 0; i <= n; i++) {
      const lv = up === 1 ? ls[i] : ls[i] * up;
      stops[i] = litShade(colour, f, lv > 1 ? 1 : lv < 0 ? 0 : lv);
      if (i && stops[i] !== stops[0]) same = false;
    }
    const tf = fade > 0 ? Math.min(1, fade / dz) : 0;
    if (same && !(tf > 0)) return stops[0];
    /* THE AXIS IS THE FACE'S OWN, PERPENDICULAR TO ITS TOP EDGE: 0 on that edge
       and `span` pixels down onto the foot, so equal altitude is equal fraction
       everywhere on the face. `faceAxis` set false puts back the screen-vertical
       ramp this replaced -- the axis that sheared every face's light by up to a
       metre of height -- so one build can paint the same moment both ways and a
       test can count the seam that appears. A degenerate top edge (no run at
       all) keeps the vertical axis, which for a face with no run is exactly
       right. */
    let nx = 0, ny = 1, span = yBot - yTop;
    if (this.faceAxis !== false) {
      const ex = quad[1].x - quad[0].x, ey = quad[1].y - quad[0].y;
      const elen = Math.sqrt(ex * ex + ey * ey);
      if (elen > 0.5) {
        nx = ey / elen; ny = -ex / elen;
        if (ny < 0) { nx = -nx; ny = -ny; }  /* downhill in the picture, always */
        const sp = nx * (quad[3].x - quad[0].x) + ny * (quad[3].y - quad[0].y);
        if (sp > 0.5) span = sp;
        else { nx = 0; ny = 1; span = yBot - yTop; }
      }
    }
    const g = this.bctx.createLinearGradient(quad[0].x, quad[0].y,
      quad[0].x + nx * span, quad[0].y + ny * span);
    for (let i = 0; i <= n; i++) {
      const t = Math.max(0, Math.min(1, (zs[i] - zFoot) / dz));
      const a = tf > 0 ? Math.max(0, Math.min(1, (1 - t) / tf)) : 1;
      g.addColorStop(t, a >= 1 ? stops[i] : this.withAlpha(stops[i], a));
    }
    return g;
  },

  /* IS THIS FACE'S OWN FILL A RAMP -- does its light change with height, or is
     the whole face one flat colour? It decides which altitude the face's own
     light is read at (see acrossFor()). `rampProbe` is the probe faceBase() call
     the caller already makes for a picture: a gradient back means it ramps, a
     colour back means it does not. `under` is the material arm's base, and any
     material base that spans real height ramps, because faceBase() reads the
     world's light down it. */
  faceRamped(pic, rampProbe, under) {
    if (pic) return rampProbe !== null && typeof rampProbe !== 'string';
    return !!under;
  },

  /* ONE SQUARE'S LIGHT, read the same way by every face that asks.

     A seam is two faces that must put the SAME number on the edge they share,
     and a face's OWN light is not that number: it is read at the altitude its
     fill is built at, so two faces of different heights read their own light
     differently and would never agree. The number they can agree on is the one
     that belongs to the SQUARE -- light at the floor it stands on -- because
     that is the same number whichever face asks for it.

     Read smooth wherever the world has a smoothed light to give, for the same
     reason: a face whose light is stepped reads floor level, its neighbour whose
     light ramps reads a metre up, and the two blocks of one join then disagree
     by a quarter of a light step. Only a picture's own bake still wants the
     stepped reading, and that is floorLight()'s business, not this one's. */
  faceSquare(s, cell) {
    const lv = lightAt(s, cell);
    if (this.flatLight) return 0.5;
    if (!(CFG.lightSmooth > 0) || !s.sources) return lv;
    /* A square is lit when ITS OWN light is above zero. `lv` is that number
       rounded onto the six-step ladder, so it is exactly 0 for every square in
       the outer rim of a pool -- and asking it made a whole band of wall read as
       unlit. See lightFix. */
    if (this.lightFix ? !(cell && cell.light > 0) : !(lv > 0)) return lv;
    return lightValueAt(s, cell, surfaceHeight(cell));
  },

  /* THE LIGHT A WALL FACE PAINTS WITH, at one altitude, through ONE door.

     `flatLight` answers a constant instead of the world: every face at the same
     level, whatever is burning nearby and however high up the face you look.
     Light that does not vary cannot make a seam, so it is the control that says
     what the material is doing on its own -- run the probe with the flag on and
     whatever seams are left belong to the stonework and to none of the light.
     Without it every arm of the probe measures the light and the material
     TOGETHER and no reading can tell which one moved. */
  faceLight(s, cell, z) {
    return this.flatLight ? 0.5 : lightValueAt(s, cell, z);
  },

  /* ONE END OF A FACE'S RUN: half of this square's own light and half of the
     square's on the far side of that edge -- so the block next along, asking
     about its own opposite end, works out the same number. That is what closes a
     join, and it is why both halves come from faceSquare() and neither from the
     asker's own fill.

     A neighbour with no rock standing on it has no face and casts no light, so
     it is not a level to average with; the caller then reads this square's own
     light, which is what "the run stops here" means. */
  acrossEdge(s, cell, nbr) {
    if (!nbr || !(this.drawnM(nbr) > 0)) return null;
    return (this.faceSquare(s, cell) + this.faceSquare(s, nbr)) / 2;
  },

  /* THE LIGHT ACROSS ONE WALL FACE'S OWN RUN, as a gradient to multiply over it.

     quad[0] and quad[1] are the two ends of the run -- true of both near faces
     and of both strips: quad[0] stands on corner `cA` of this square and quad[1]
     on `cB`, so the run carries on past the u=0 end into the square at
     `cell - runDir` and past the u=1 end into `cell + runDir`, where runDir is
     CORNERS[cB] minus CORNERS[cA]. The square past each end is the one whose own
     face on this same line ends exactly there, so both faces ask the same two
     squares and the join has ONE number on both sides of it. That is the whole
     trick, and it needs no talking between neighbours: each derives it.

     Three samples, not two. The ends are half this square's light and half its
     neighbour's; the middle is this face's OWN level, which is where its own
     fill already is. A run that is bright ahead and dim behind therefore bows
     the right way instead of running straight between two averages neither face
     has.

     Returns null when there is nothing to do -- the flag off, a face turning
     edge-on mid-swing with no width to draw across, or a run whose ends agree
     with this square to within `light.across_min` -- and the caller then paints
     exactly what it painted before. */
  acrossFace(ctx, s, it, cA, cB, quad, ref) {
    if (!this.acrossLight) return null;
    const x0 = quad[0].x, x1 = quad[1].x;
    if (!(Math.abs(x1 - x0) >= 0.5)) return null;
    const ux = CORNERS[cB][0] - CORNERS[cA][0];
    const uy = CORNERS[cB][1] - CORNERS[cA][1];
    const w = s.world;
    /* w.at() and never w.ensure(): a run that reaches past the ground the match
       holds is drawn short of its neighbour, not given one. */
    const nA = w.at(it.cell.x - ux, it.cell.y - uy);
    const nB = w.at(it.cell.x + ux, it.cell.y + uy);
    const a0 = this.acrossEdge(s, it.cell, nA);
    const a1 = this.acrossEdge(s, it.cell, nB);
    const mine = this.faceSquare(s, it.cell);
    /* An end with no wall past it keeps THIS square's own light, so an exposed
       end of a run is flat and never takes a step down to something that is not
       there. `ref` would do the opposite: it is the fill's own altitude, and a
       picture's stepped fill sits half a light step from its square's smooth
       one, which is a seam invented out of nothing at the end of every wall. */
    const e0 = a0 === null ? mine : a0;
    const e1 = a1 === null ? mine : a1;
    const log = this.acrossLog ? { x: it.cell.x, y: it.cell.y, kd: it.kind,
        h: it.cell.h, n0h: nA ? nA.h : -99, n1h: nB ? nB.h : -99,
        n0x: nA ? nA.x : -1, n0y: nA ? nA.y : -1, n0d: nA ? this.drawnM(nA) : -1,
        n1x: nB ? nB.x : -1, n1y: nB ? nB.y : -1, n1d: nB ? this.drawnM(nB) : -1,
        e0: e0, e1: e1, mine: mine, ref: ref, p0: cA, p1: cB,
        wallM: it.wallM, step: it.light, fired: false } : null;
    if (log) this.acrossLog.push(log);
    /* Is the light ACROSS this run actually uneven? That is the only question
       worth asking, and it is asked of the squares -- `mine` against the ends --
       and never of this face's own fill. Comparing the ends against `ref` instead
       would be wrong twice over: a uniform run of wall would fire, because a
       picture's stepped level sits half a step away from its square's smooth one,
       and every wall in the game would be re-lit to smooth for no reason.

       How big a difference is worth painting is `light.across_min`, and it is
       ZERO: any difference at all, however small. A threshold was tried and it
       lost seams it should have kept -- a seam whose two faces happen to agree
       with their own squares to within the threshold is still a seam between
       two different levels, and 682 rows across sixteen views were let through
       that way, eight of them a visible step. A rule that cannot lose a seam is
       worth one extra fill on the thirteen per cent of faces it newly fires on. */
    if (!(Math.abs(mine - e0) > CFG.acrossMin
        || Math.abs(mine - e1) > CFG.acrossMin)) return null;
    /* A face with no light of its own has nothing to scale FROM. `lvl(0)` is the
       ambient floor -- the darkest the light scale goes -- and the ratio the
       gradient carries would have to be brighter than white for this face to
       reach the number it shares with its neighbour, which a multiply cannot
       paint. Painting it anyway paints it DARKER than the ambient it is already
       at, which is a seam invented by the correction. Leave it flat: the lit
       face beside it ramps down to the same number the two of them agree on, and
       the most the flat one can be out by is the light it never had. */
    if (this.lightFix && !(ref > 1e-6)) return null;
    /* Scaled to the brighter end, so that every stop of the gradient is 1 or
       less and a multiply is only ever taking light away. */
    const win = Math.max(e0, e1);
    /* THE LEVEL IS THE BRIGHTER END ITSELF, not that number rounded UP onto a
       light step.

       The rounding was the seam. A face whose ends stood a thousandth of a step
       above the rung below was lifted a whole rung -- 2.87x, on the join measured
       at the camp -- and its neighbour, a thousandth below it, was lifted not at
       all, so two blocks of one wall painted brightnesses that had nothing to do
       with the fire between them. The scale is for one thing only: a multiply
       cannot brighten, so the base is parked at or above the brightest end and
       the gradient takes the difference off. `max(ref, win)` does exactly that
       and nothing else, and it makes the two faces land on the same number
       EXACTLY wherever they meet -- the base is painted at `mul * ref`, the
       gradient takes `lvl(e)/lvl(level)` off it, and `mul * ref` IS `level`, so
       the product at the edge is `lvl(e)` on both sides whatever either face's
       own light happens to be. */
    const level = this.lightFix
      ? Math.min(1, Math.max(ref, win))
      : (win > ref + CFG.acrossMin
          ? Math.min(1, Math.max(ref,
              Math.ceil(win * CFG.lightSteps - 1e-6) / CFG.lightSteps))
          : ref);
    /* THE SCALE, NEVER THE DIFFERENCE, and this is the line the whole seam turns
       on. `level` is rounded onto a light step and `ref` is not, so two faces
       that share an edge can land on different levels even though they agree
       exactly on the number AT that edge -- one crossed the step by a thousandth
       and one did not. A raised face keeps `level - ref` as a floor under the
       gradient and the other does not, so the two paint different numbers on the
       edge they share. A scaled face has no floor to keep: the level divides out
       of the product on both sides, and the two faces land on `ref`-normalised
       shapes of their own light, which is all the difference there ever was. */
    const mul = level !== ref && ref > 1e-6 ? level / ref : 1;
    if (log) { log.fired = true; log.win = win; log.level = level;
               log.mul = mul; }
    const g = ctx.createLinearGradient(x0, quad[0].y, x1, quad[0].y);
    g.addColorStop(0, shadeRatio(level, e0));
    g.addColorStop(0.5, shadeRatio(level, ref));
    g.addColorStop(1, shadeRatio(level, e1));
    return { grad: g, mul: mul, level: level };
  },

  /* WHERE A FACE'S OWN LIGHT IS READ, in one place, so the two faces of a block
     and the two strips of it cannot disagree about it.

     A face whose fill ramps is read at a whole metre inside its span, because
     that is an altitude the fill is known to paint at exactly (see faceBase()'s
     altGrid: every whole metre is a stop). A face whose fill is one flat colour
     is read at that colour's own level -- and it must be the FLAT level, not the
     smooth one, or a baked surface would be raised to a level the ratio cannot
     undo.

     This is the altitude the FILL is normalised at, and nothing else. The two
     ends of the run are worked out from the squares and never from here, which is
     what lets two faces of different heights share one edge. */
  acrossFor(ctx, s, it, cA, cB, quad, zFoot, d, ramped, flat) {
    if (!(d > 0)) return null;
    const zRef = ramped ? zFoot + Math.round(d / 2) : null;
    const n = this.acrossLog ? this.acrossLog.length : -1;
    const out = this.acrossFace(ctx, s, it, cA, cB, quad,
      zRef === null ? flat : lightValueAt(s, it.cell, zRef));
    if (this.acrossLog && this.acrossLog.length > n) {
      Object.assign(this.acrossLog[this.acrossLog.length - 1],
        { d: d, zFoot: zFoot, ramped: ramped, flat: flat, zRef: zRef });
    }
    return out;
  },

  /* HOW THE LIGHT ON THE FLOOR CHANGES, in light per metre, along each of the
     world's two axes: a central difference of the light at the four squares
     around this one.

     It is worked out from the SQUARES and not from the fire, and that is the
     whole point of it. The light the world keeps is a WALK -- how far the light
     had to come to a square is a whole number of steps, and that number changes
     at every square's edge -- so the source's own falloff, asked at two points
     of one square, gives a brightness that JUMPS at the boundary between that
     square and the next. A field built out of whole squares does not jump: it is
     one number a square, changing gently from one to the next.

     A neighbour counts only if it is floor at the SAME height, so rock and a
     floor a metre up make a one-sided slope rather than a cliff into something
     that is not there; asked of a square with no floor beside it either way, the
     slope is nothing at all. */
  floorGrad(s, cell, h) {
    const at = (dx, dy) => {
      const c = s.world.at(cell.x + dx, cell.y + dy);
      if (!c || c.slope !== SLOPE_FLAT || c.h !== cell.h) return null;
      return lightValueAt(s, c, h);
    };
    const c0 = lightValueAt(s, cell, h);
    let gx = 0, gy = 0;
    for (let axis = 0; axis < 2; axis++) {
      const dx = axis ? 0 : 1, dy = axis ? 1 : 0;
      const lo = at(-dx, -dy), hi = at(dx, dy);
      /* Both neighbours, or whichever one there is, or neither. */
      const g = (lo === null && hi === null) ? 0
        : (lo === null) ? hi - c0
        : (hi === null) ? c0 - lo
        : (hi - lo) / 2;
      if (axis) gy = g; else gx = g;
    }
    const mag = Math.hypot(gx, gy);
    if (!(mag > 1e-4)) return null;
    return { gx, gy, mag };
  },

  /* A SQUARE OF FLOOR PAINTED THE SAME WAY, which is harder than a wall: a floor
     is not a surface standing in the light, it is the ground the light is lying
     ON, so the brightness changes ACROSS it -- towards the fire at one edge and
     away from it at the other.

     Sampling the four corners and interpolating would agree at every edge, and
     cost four numbers a square. What is done instead is one straight line across
     the square, which is a single gradient fill, and the direction of that line
     is the direction the light itself is changing in -- the two ends come from
     `floorGrad`, which is where the promise that two squares agree at their
     shared edge comes from.

     The two ends are placed along a direction, and WHICH direction is a
     question about the picture as well as about the world -- see the gradExact
     flag. The world direction is turned into the direction a line across the
     picture means, because that is the line a canvas gradient actually measures
     along.

     Rotated ground (a ramp) keeps the flat answer: it is one square of tilted
     stone and the ramp already has a transform of its own.

     `rampEnds` works the two ends out and is separate from the paint so that the
     ramp can be MEASURED rather than only looked at: the light this square
     claims at any point of it is a straight line between two published numbers,
     which is a thing a test can assert on without a picture in the way. */
  rampEnds(s, cell, h) {
    if (cell.slope !== SLOPE_FLAT || !s.sources) return null;
    const c0 = lightValueAt(s, cell, h);
    const g = this.rampField ? this.floorGrad(s, cell, h) : null;
    /* The way the square's light changes. With the field, it is the way the
       floor around it changes; without it, the way to the fire, which is the way
       one source's own falloff runs. */
    let ux, uy;
    if (g) {
      ux = g.gx / g.mag;
      uy = g.gy / g.mag;
    } else {
      const src = s.sources[cell.lightSrc];
      if (!src) return null;
      const sx = (src.x + 0.5) - (cell.x + 0.5);
      const sy = (src.y + 0.5) - (cell.y + 0.5);
      const d = Math.hypot(sx, sy);
      if (!(d > 0.001)) return null;
      ux = sx / d;
      uy = sy / d;
    }
    if (this.gradExact) {
      /* The projection sends a world offset (wx, wy) to the picture as
           x = ((wx cos - wy sin) - (wx sin + wy cos)) * tileW/2
           y = ((wx cos - wy sin) + (wx sin + wy cos)) * tileH/2
         so in the turned frame the map is (p, q) -> ((p - q)a, (p + q)b) with
         a = tileW/2 and b = tileH/2, and the two ends of a ramp must lie along
         the direction that frame's own perpendicular takes. That direction is
         (p, q) -> (A p - B q, A q - B p) with A = a*a + b*b and B = b*b - a*a,
         which is the inverse of the map's own square, and any multiple of it
         will do because only the direction is wanted. */
      const cos = s.cam.cos, sin = s.cam.sin;
      const a2 = (CFG.tileW * CFG.tileW + s.cam.tileH * s.cam.tileH) / 4;
      const b2 = (s.cam.tileH * s.cam.tileH - CFG.tileW * CFG.tileW) / 4;
      const p = ux * cos - uy * sin, q = ux * sin + uy * cos;
      const P = a2 * p - b2 * q, Q = a2 * q - b2 * p;
      const n = Math.hypot(P, Q);
      if (n > 1e-9) { ux = (P * cos + Q * sin) / n; uy = (Q * cos - P * sin) / n; }
    }
    /* Half a metre towards the fire from the middle of the square lands on the
       edge if the fire is along an axis and on the corner if it is diagonal, so
       the two samples are exactly the two extremes of what this square holds. */
    /* Half a metre towards the light's own way from the middle of the square
       lands on an edge if that way is along a wall and on a corner if it is
       diagonal, so the two ends are the two extremes of what this square holds. */
    const half = (Math.abs(ux) + Math.abs(uy)) / 2;
    const near = this.project(s, cell.x + 0.5 - ux * half,
                                 cell.y + 0.5 - uy * half, h);
    const far = this.project(s, cell.x + 0.5 + ux * half,
                                cell.y + 0.5 + uy * half, h);
    let p1, p2;
    if (g) {
      /* The light at each end comes from the field: this square's own level,
         changed by how fast the light is changing over the half metre the end
         sits at. Held inside the range a light can be, because the straight
         line through the middle is only a fit and at the rim of a pool it may
         want to run past nothing at all -- and a light below zero is painted as
         black, which is a smear rather than a shadow. */
      const reach = (g.gx * ux + g.gy * uy) * half;
      const d = Math.max(-c0, Math.min(1 - c0, reach));
      p1 = c0 - d;
      p2 = c0 + d;
    } else {
      p1 = lightPoint(s, cell, h, -ux * half, -uy * half);
      p2 = lightPoint(s, cell, h, ux * half, uy * half);
    }
    return { p1, p2, near, far };
  },

  groundBase(s, it, colour, f) {
    const cell = it.cell, h = surfaceHeight(cell);
    const e = this.rampEnds(s, cell, h);
    if (!e) return litShade(colour, f, lightValueAt(s, cell, h));
    const a = litShade(colour, f, e.p1), b = litShade(colour, f, e.p2);
    if (a === b) return a;
    if (Math.hypot(e.far.x - e.near.x, e.far.y - e.near.y) < 1) return a;
    const g = this.bctx.createLinearGradient(e.near.x, e.near.y, e.far.x, e.far.y);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  },

  path(ctx, pts, snap) {
    ctx.beginPath();
    if (snap) {
      ctx.moveTo(Math.round(pts[0].x), Math.round(pts[0].y));
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo(Math.round(pts[k].x), Math.round(pts[k].y));
      }
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    }
    ctx.closePath();
  },

  /* THE TWO WALLS OF A BLOCK AS THE DRAWING PAINTS THEM this frame: whole when
     nothing in front of them hides them, cut down to where the block in front
     reaches when one does, and gone when that block is as tall as they are.

     Note what this is NOT: it is not the shape of the block. A side stored here
     runs from the cap down to the floor of the world, and `hideL`/`hideR` are
     false whenever the block in front paints anything less than solid -- because
     a block that paints nothing leaves a hole in the wall unless the whole side
     is painted again. That is right for a PICTURE and wrong for an OUTLINE: the
     silhouette of a thing cannot change because something in front of it was cut
     away. `sideShown()` is the silhouette, and it is worked out from the world
     instead. */
  wallsPainted(it, alphaOf) {
    /* A face with a square in the picture in front of it is hidden when that
       square paints solid. A face with a DROPPED square in front of it has no
       such test to take -- there is nothing to paint solid -- and the wall skin
       has already said the square is there: what `Render.rockSides` says about
       such a face is settled in `cutMeet()`, which is where `cutL`/`cutR` come
       from. At arm 0 those two disagree on purpose and this reads `it.left`, the
       whole stored side, which is exactly the v0.47.0 picture.

       AND THE ONE FACE THAT COMES BACK WHOLE at arm 2 is the one whose rock in
       front is not painted AT ALL (`alphaOf` 0, the cutaway's own doing): the
       rule gives way there, because a side cut short against a square that is
       not on the screen leaves a hole, and that is the hole v0.34.0 closed. The
       cutaway only does that at `cut_solid` 0, which is not the shipped look. */
    const rockL = it.rockL === true, rockR = it.rockR === true;
    const hideL = this.clipWalls &&
      (it.nbrL >= 0 ? alphaOf[it.nbrL] === 1 : rockL && this.rockSides > 0);
    const hideR = this.clipWalls &&
      (it.nbrR >= 0 ? alphaOf[it.nbrR] === 1 : rockR && this.rockSides > 0);
    return { l: hideL ? it.cutL : it.left, r: hideR ? it.cutR : it.right,
             ml: hideL ? it.cutML : it.wallM, mr: hideR ? it.cutMR : it.wallM,
             /* And the strip of rock this block shows along its far edges, where
                the block behind is too low to cover it -- see backBand(). Null
                for every block that has a wall of its own height behind it, which
                is most of them, and null for ALL of them while `cut_solid` is 1,
                where nothing is drawn short; null for a floor or a ramp, which
                paint their own top and so are never bare up there. */
             bl: it.backL, br: it.backR };
  },

  /* HOW FAR A SIDE OF A BLOCK STANDS, and no further: from that square's own cap
     down to the ground next door, because what is below the ground next door is
     inside the rock and nobody can see it.

     Worked out from the WORLD -- how far the neighbour square's own rock is
     PAINTED, which is its real height except for a hidden block keeping a foot
     of itself -- so it can never be stretched by the picture deciding to fade or
     skip something, and then by `cutMeet()`, which is the same answer the cut
     uses: a side stops a depth step short of the meeting, because the lid that
     used to cover that step is not painted any more. How tall the side itself is
     comes from the item's `wallM`, which is its own height unless it is a hidden
     block keeping only a foot of itself (`stumpOf`). `f` is
     0 for the left side and 1 for the right, matching `it.left` / `it.right`; the
     edge index is the same one `clipFaces()` names, so the two agree about which
     neighbour a side faces. Null means that side is not part of the silhouette
     at all. */
  sideShown(w, item, f, stepM) {
    const quad = f === 0 ? item.left : item.right;
    const cell = item.cell;
    if (!this.clipWalls || cell.slope !== SLOPE_FLAT) return quad;
    const other = f === 0 ? item.cornerL : item.cornerR;
    const e = other === (item.near + 1) % 4 ? item.near : other;
    const nbr = w.at(cell.x + EDGE_STEP[e][0], cell.y + EDGE_STEP[e][1]);
    /* No square there, or ground that is not flat: the drawing keeps the whole
       side, so the outline keeps it too. */
    if (!nbr || nbr.slope !== SLOPE_FLAT) return quad;
    /* How far the side really stands, which is `wallM` -- the block's own height
       unless it is a hidden block keeping only a foot of itself, and then a
       metre. The block in front is asked the same way and with the same helper,
       `cutMeet()` -- the very one `clipFaces()` asks, so the outline, the pick
       list and the picture cannot disagree about a stumped block, about the
       block covering it, or about the depth step. */
    const meet = this.cutMeet(nbr, item.wallM, stepM);
    return meet < item.wallM
      ? this.cutWall(quad, item.top[item.near], item.top[other], meet)
      : null;
  },

  /* Every polygon a thing's silhouette is made of, so it can be haloed as one
     shape -- and nothing else, because the halo is painted UNDER the thing and
     only what sticks out past it is ever seen. A crawler and a piece of the camp
     are made of parts, and every part's faces are painted, so one path rings
     either of them.
   *
     A BLOCK is the case that has to be worked out, and ringing its stored faces
     was the bug: a side is stored running from the block's cap all the way down
     to the floor of the world, so a selected floor tile was haloed for the whole
     height of the rock under it and the outline ran away down the screen as a
     long spike -- which is what "highlight lines zig-zagging all over the place"
     was, and it came and went with which blocks happened to be see-through. A block is
     ringed by its cap and by the two sides as far as they really stand. */
  shapeOf(w, item, stepM) {
    if (item.parts) {
      const out = [];
      for (let i = 0; i < item.parts.length; i++) {
        const fs = item.parts[i].faces;
        for (let g = 0; g < fs.length; g++) out.push(fs[g].pts);
      }
      return out;
    }
    if (!item.solid) return [item.top];
    /* A wall's lid is not painted, so it is not part of the silhouette either --
       a halo is the thing's own shapes drawn under it, and a ring round a
       surface that was never painted is a ring drawn round nothing. */
    const out = this.capShown(item) ? [item.top] : [];
    /* The A/B control the selection test is proved against: handing the halo the
       STORED sides -- the quads that run down to the floor of the world -- is the
       rule this was fixed from. Measured, it escapes the shapes that were painted
       in 37 of that test's 50 selections, by as much as 220px. */
    if (this.ringStored) return [item.top, item.left, item.right].filter(Boolean);
    const l = this.sideShown(w, item, 0, stepM), r = this.sideShown(w, item, 1, stepM);
    if (l) out.push(l);
    if (r) out.push(r);
    return out;
  },

  /* The highlight: the thing's own shapes, fattened by a stroke, painted in one
     colour UNDERNEATH it. The thing is then drawn on top and covers all of it
     except the ring that stuck out -- which is the silhouette, and only the
     silhouette. Internal edges never show, because they are covered. */
  halo(ctx, polys, colour, width) {
    ctx.save();
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < polys.length; i++) {
      const pts = polys[i];
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },

  outline(ctx, pts, colour) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let c = 1; c < pts.length; c++) ctx.lineTo(pts[c].x, pts[c].y);
    ctx.closePath();
    ctx.stroke();
  },

  /* HOW MUCH OF A BLOCK THE PICTURE LEAVES STANDING WHEN IT HIDES IT.

     Rock standing between you and a room is not painted, so you see the room
     through the gap -- and the gap is not quite covered by what is behind it.
     The floors behind a hidden column start half a step short of where the
     column's own foot was (their near corner projects half a metre further up
     the screen than the foot of the square in front), and the floors in FRONT of
     it only reach up the screen as far as their own near edge, so the band from
     a metre above the hidden block's base down to the top of its base diamond is
     covered by nothing at all unless the block itself covers it. Measured with
     `files/probe-voids.mjs --why` on the look that shipped without this (v0.37.0,
     buffer 534x348, seeds 1 and 3, 16 views): every pixel of every hole answered
     `pickAt -1`, and named the hidden square's own left face as the only shape
     whose box it was inside -- 13,119 px of it in 16 of 16 views.

     None of that is new. The holes were there before the wall tops were deleted
     (13,029 px with the lids back on, same views), which is why deleting the tops
     only looked like the cause: the LID is what used to cover it. A metre of rock
     covers it by construction -- a block's own two faces reach a metre above its
     base and its top face reaches half a metre above that, and the whole of the
     measured band lies inside those -- and the scale is why it is one metre and
     not more: at 32 pixels to the metre a crawler is 52 px tall, so a metre of
     low rock is something you see a room over, not a wall.

     It also has to be a block of rock, not a hole with the floor behind showing
     through it, which means the pick list has to answer for it (rule 8): a
     stumped square is built at its foot height, so the pointer's own shape test
     finds the low rock that is really painted and the absent rock above it stays
     unpickable.

     `cut_stump_m` is the dial: 0 is the whole square gone (the negative control
     in the probe and the picture v0.37.0 shipped), 1 is a low kerb of rock,
     anything at or above the block's own height leaves the block painted whole
     and is the same thing as `cut_solid` 1. */
  stumpOf(cell) {
    if (cell.cutaway !== true || CFG.cutSolid > 0) return 0;
    return Math.max(0, Math.min(CFG.cutStumpM, cell.h));
  },

  /* HOW FAR A SQUARE'S OWN ROCK IS PAINTED, in metres: its real height, unless
     it is a hidden block keeping a foot of itself standing (`stumpOf`), and then
     the foot -- or nothing at all, when `cut_stump_m` is 0 and the square is left
     out of the picture whole. ZERO IS A HEIGHT TOO: a square that paints nothing
     covers nothing, and the two clips ask this of the block in FRONT, so a
     square with the foot switched off must hand back 0 and let what is behind it
     come back whole. The item built for a square carries this as `wallM`; this is
     the same number asked of a SQUARE, which is what the two clips below need,
     because they ask it of the block in front rather than of the block itself.

     IT MUST BE THIS NUMBER AND NOT `cell.h`. A face may only be cut down to hide
     behind the block in front, so it may only be cut as far as that block
     PAINTS -- and a hidden block paints a metre whatever the world says its
     height is. Clipped against `cell.h` it swallowed a face whole and, painting
     only a foot itself, covered none of the band it had just cleared: that is
     the strip of bare rock that has been showing along the backs of walls since
     the cut was invented, and it is the same strip a stumped block used to trade
     for another one somewhere else. Painting MORE than we must is always safe,
     because the block in front is painted after this one and covers what it
     covers -- so the only way this can be wrong is by hiding too much, never by
     hiding too little. */
  drawnM(cell) {
    if (cell.cutaway !== true || CFG.cutSolid > 0) return cell.h;
    return this.stumpOf(cell);
  },

  /* How strong every item paints this frame, worked out in one place.
   *
   * ONE thing can be painted see-through, and it is the rock of the fourth wall:
   * rock standing between you and a floor behind it. `cut_solid` says how solid
   * that rock stays -- 0 meaning it is not painted at all and the room is seen
   * through the gap, 1 meaning it is drawn like any other rock. WHICH rock that
   * is was settled in markCutaway(), from the view alone, so this is only the
   * strength it is painted at. Everything else paints solid, always.
   *
   * It used to be two things. The other was a fade over whatever stood between
   * you and the thing you were inspecting, chosen by comparing the BOX each
   * thing is stored with against the box of what you had selected (the way the
   * game had done it since v0.25.0, and the way before that painted each thing
   * into a hidden buffer and read it back). A box is not a silhouette: a
   * crawler, a bedroll and a camp store are drawn by the ground around them, and
   * their boxes reach out over the squares either side -- so pointing at the
   * campfire put the two tiles beside it into see-through, and the town's own
   * rock was hazed over whenever you looked at a room. That whole branch, the
   * cover test behind it, and the `fadeBox` flag a test kept as its other arm
   * are gone. If one thing in the picture may be painted at half strength, the
   * next thing may be too, and there is no answer to "is this behind that" that
   * a stored box can give.
   *
   * The list is reused between frames: one picture, one allocation. */
  alphas(s, b) {
    const plan = this.alphaPlan || (this.alphaPlan =
      { list: [], focus: null, focusPos: -1, focusIdx: -1, cutaway: 0 });
    const list = plan.list;
    /* A pinned selection outranks whatever the pointer happens to be over, so
       the crawler you picked stays ringed while they walk away. The focus is
       needed for the halo, which goes under the shape -- not for an opacity. */
    const focusIdx = s.selected >= 0 ? s.selected : s.hover;
    let focus = null, focusPos = -1;
    if (focusIdx >= 0) {
      for (let k = 0; k < b.length; k++) {
        if (b[k].i === focusIdx) { focus = b[k]; focusPos = k; break; }
      }
    }
    let cutaway = 0;
    list.length = b.length;
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      if (it.kind === 'cell' && it.cutaway) {
        /* A cut-away square that keeps a foot of rock (`stumped`) is painted
           like any other square, so it must not fade -- and it must not be
           skipped by the pointer either. See cutOut() and stumpOf(). */
        list[k] = it.stumped ? 1 : CFG.cutSolid;
        cutaway++;
      } else list[k] = 1;
    }
    plan.focus = focus; plan.focusPos = focusPos; plan.focusIdx = focusIdx;
    plan.cutaway = cutaway;
    return plan;
  },

  /* The one question the picture and the pointer have to answer the same way: is
     this square in the way, and so not painted at all? It is asked in exactly
     the two places that decide it, so an item that is not in the picture can
     never be picked and an item that is painted can never be unpickable --
     rule 8 holds in lockstep, with no exception for the thing you have selected
     (that is given a halo instead, and a halo with no shape under it is a ring
     around nothing).

     A square that keeps a foot of rock is NOT out of the picture: it paints, so
     the pointer has to find it -- but only where it paints, which is why the
     stump is built at its foot height rather than tested for here. */
  cutOut(it) {
    if (it.stumped) return false;
    return it.kind === 'cell' && it.cutaway === true && CFG.cutSolid <= 0;
  },

  /* ======================================================================
     SHADE CAST BY SOMETHING SOLID
     ======================================================================

     A shadow is AESTHETIC ONLY. Nothing in the game reads one: a square's light
     is what it always was, worked out square by square from the fires, and a
     crawler behind a fire stands in full light whether there is a shape on the
     floor saying otherwise. What a shadow adds is the one thing a light level
     per square cannot carry -- which WAY the solid things are lying from the
     fire. A level is a number; a shadow is a direction.

     WHERE THE SHAPE GOES. A caster stands `height` metres tall and the fire
     hangs `sz` metres above the ground under it. The ray from the flame over the
     top of the caster meets the floor at

         k = sz / (sz - hh)     times further from the flame than the caster is

     so `k` is 1 when the flame is at the caster's own height (no shadow at all)
     and 2 when the flame is twice as high as they are tall. A campfire is knee
     high and a crawler is nearly two metres, which puts `sz - height` BELOW
     zero: the ray would climb and never reach the floor, and the shadow would
     run to the horizon. So the caster's height is capped at half the flame's
     first (`hh`), which is what makes the length come out as the caster's own
     distance from the fire rather than as infinity, and `light.shade_reach` cuts
     even that off -- a fire behind you smears across the whole room otherwise.

     THE SHAPE IS A STADIUM: a disc at the caster's feet joined to a bigger disc
     at the far end, with the two sides straight between them. That is what a
     solid post of a thing standing in a point of light actually throws. Nine
     points, no repeats, one way round, and convex -- which is what lets the
     clipping below be four straight half-planes instead of a general clipper.

     HOW IT FADES. Crisp ACROSS (no fade), soft ALONG (fade at both ends). A
     shadow with a hard edge all the way round reads as a stencil cut out of the
     picture, and one with a soft edge all the way round has no shape at all --
     `light.shade_give` is metres of fade at each end of the shape and nothing at
     its sides, which is the firm-but-not-cut-out look.

     HOW IT LANDS. One shadow is MANY items, one per square of floor it covers,
     each clipped to that square and sorted as that square is sorted, a hair in
     front of it. That is why this runs BEFORE the sort rather than after: a
     shadow is a mark on the floor, so it belongs to the floor's own place in
     painter's order, and the things standing on that floor -- the caster
     included -- have to paint after it. A square in front still covers it, and
     so does a wall standing between the fire and the floor.

     NOTHING IS DRAWN ON A SQUARE THE PICTURE DOES NOT PAINT. A shadow is a
     shade ON the ground, so a square whose floor is not in the picture -- rock
     standing in front of it, a wall's lid that the wall look leaves off, a ramp
     drawn from its own corners -- has nowhere to put one, and painting it anyway
     lays grey over the backdrop or over the top of a wall.

     WHAT IS ACCEPTED AS WRONG: a shadow that reaches the foot of a wall standing
     behind it paints onto that wall's floor and not up it, and one that crosses
     onto higher or lower ground is drawn flat on the caster's own plane. Both
     are one square out at most, and both are cheaper than a per-square height
     test. */

  /* How tall a half-built structure stands, in metres above its own floor. The
     parts are the same ones that are drawn, asked the same way: a part that only
     grows is present at the fraction of its height the work has reached, and a
     part that does not grow -- a flame, a lid -- is not there at all until the
     job is done. See structure3d(). */
  structureHeight(site) {
    const parts = STRUCT_PARTS(site.structure);
    const frac = site.built ? 1 : Math.max(0.08, site.progress / 100);
    let top = TILE_METRES * 0.5;
    for (let i = 0; i < parts.length; i++) {
      const f = parts[i].part;
      if (!f.grows && !site.built) continue;
      const h = (f.z + f.to_m) * (f.grows && !site.built ? frac : 1);
      if (h > top) top = h;
    }
    return top;
  },

  /* One straight cut off a polygon, and close the shape where it crossed.
     `axis` 0 is x, 1 is y. `keep` -1 keeps the side of `lim` with the LARGER
     coordinate (x >= lim), `keep` 1 the smaller (x <= lim) -- getting that
     backwards keeps the hole instead of the shape and throws every shadow away.
     Returns null when nothing is left, which is how a piece that missed this
     square is dropped instead of being pushed as an empty shape. */
  clipHalf(poly, axis, lim, keep) {
    const out = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], c = poly[(i + 1) % n];
      const da = keep * (a[axis] - lim), dc = keep * (c[axis] - lim);
      if (da <= 0) out.push(a);
      if ((da <= 0) !== (dc <= 0)) {
        const t = da / (da - dc);
        const p = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
        p[axis] = lim;
        out.push(p);
      }
    }
    return out.length >= 3 ? out : null;
  },

  /* A shadow cut down to one square of floor. */
  clipSquare(poly, cx, cy) {
    let q = this.clipHalf(poly, 0, cx, -1);
    if (!q) return null;
    q = this.clipHalf(q, 1, cy, -1);
    if (!q) return null;
    q = this.clipHalf(q, 0, cx + 1, 1);
    if (!q) return null;
    return this.clipHalf(q, 1, cy + 1, 1);
  },

  /* Every shadow this frame. Called from build() with the list still unsorted,
     because the shadows go INTO that list.

     The casters are read off the batch rather than out of the world, so only
     things that are actually in the picture throw anything, and a caster off the
     side of the screen costs nothing. A fire off the side still lights and still
     casts: what a caster needs is the light ON ITS OWN SQUARE, which is the
     match's to answer, not the camera's. */
  castShadows(s, b) {
    this.shadowPieces = 0;
    this.shadowActorPieces = 0;
    this.shadowActorCasters = 0;
    if (!this.lightShadows || !(CFG.shadeStrength > 0)) return;
    if (!(CFG.shadeGirth > 0) || !s.sources || !s.sources.length) return;
    if (!this.bctx) this.ensure();

    /* Square -> its item, which `draw()` works out only after the sort. A
       shadow has to know whether the floor it is about to be laid on is painted
       at all, and the answer is on the item. */
    let seen = this.shadowCells;
    if (!seen) seen = this.shadowCells = new Map();
    seen.clear();
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      if (it.kind === 'cell') seen.set(it.cell, it);
    }

    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      if (it.kind === 'actor') {
        /* Who threw the shade is asked here rather than guessed at later: the
           person asked for "a crawler walking past a fire drags a shadow with
           them", and `shadeMade` alone cannot tell a crawler's shade from a
           tent's. */
        const was = this.shadowPieces;
        this.castOne(s, b, seen, it.actor, it.gx, it.gy,
                     CFG.actorHeight, CFG.shadeGirth);
        if (this.shadowPieces > was) {
          this.shadowActorPieces += this.shadowPieces - was;
          this.shadowActorCasters++;
        }
      } else if (it.kind === 'site') {
        if (!(it.site.built || it.site.progress > 0)) continue;
        this.castOne(s, b, seen, it.site, it.site.x + 0.5, it.site.y + 0.5,
                     this.structureHeight(it.site), CFG.shadeGirth * 2);
      }
    }
  },

  castOne(s, b, seen, own, gx, gy, height, girth) {
    const cell = s.world.at(Math.floor(gx), Math.floor(gy));
    if (!cell || !(cell.light > 0)) return;
    const src = s.sources[cell.lightSrc];
    /* The thing carrying the light does not cast a shadow of itself: a walking
       lantern does not darken the floor it is walking on, and a fire does not
       darken the ground it burns on. */
    if (!src || src.actor === own || src.site === own) return;

    const sz = src.z - surfaceHeight(cell);
    if (!(sz > 0.05)) return;
    const dx = gx - (src.x + 0.5), dy = gy - (src.y + 0.5);
    const dist = Math.hypot(dx, dy);
    if (!(dist > 0.05)) return;

    /* The ray from the flame over the top of the caster, and where it lands. */
    const hh = Math.min(height, sz * 0.5);
    let k = sz / (sz - hh);
    if (dist * (k - 1) > CFG.shadeReach) k = 1 + CFG.shadeReach / dist;
    if (!(k > 1.02)) return;
    /* How dark the shade is: a share of the light the caster's own square is
       standing in, so a shadow at the far edge of a fire is as faint as the
       firelight out there -- which is what stops one being painted as a black
       hole in a dark room. */
    const strength = Math.min(1, CFG.shadeStrength * cell.light);
    if (!(strength > 0.02)) return;

    const phi = Math.atan2(dy, dx);
    const ux = Math.cos(phi), uy = Math.sin(phi);
    const fx = gx + dx * k, fy = gy + dy * k;
    /* Four points a cap is enough: this is two or three pixels across on the
       screen, and two would make it a quadrilateral that reads as a box. */
    const seg = 4;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const t = phi - Math.PI / 2 + (i * Math.PI) / seg;
      pts.push([fx + Math.cos(t) * girth * k, fy + Math.sin(t) * girth * k]);
    }
    for (let i = 0; i < seg; i++) {
      const t = phi + Math.PI / 2 + (i * Math.PI) / seg;
      pts.push([gx + Math.cos(t) * girth, gy + Math.sin(t) * girth]);
    }

    /* One gradient for the whole shadow, reused by every piece of it, so a
       shadow crossing four squares is one shape and not four. It runs from the
       shape's own back point to its own front point, so the `give` at each end
       is a fixed number of METRES no matter how long the shadow is -- a short
       one and a long one fade out at the same rate. */
    const gz = surfaceHeight(cell);
    const near = this.project(s, gx - ux * girth, gy - uy * girth, gz);
    const far = this.project(s, fx + ux * girth * k, fy + uy * girth * k, gz);
    if (!(Math.hypot(far.x - near.x, far.y - near.y) > 1)) return;
    const run = Math.max(0.1, dist * (k - 1) + girth * (1 + k));
    const give = Math.min(0.34, CFG.shadeGive / run);
    const ink = 'rgba(0,0,0,' + strength.toFixed(3) + ')';
    const grad = this.bctx.createLinearGradient(near.x, near.y, far.x, far.y);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(give, ink);
    grad.addColorStop(1 - give, ink);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }

    for (let cx = Math.floor(minX); cx <= Math.floor(maxX); cx++) {
      for (let cy = Math.floor(minY); cy <= Math.floor(maxY); cy++) {
        const c = s.world.at(cx, cy);
        const item = c ? seen.get(c) : null;
        if (!item || item.block || this.cutOut(item)) continue;
        if (!this.capShown(item) || item.cell.slope !== SLOPE_FLAT) continue;
        const poly = this.clipSquare(pts, cx, cy);
        if (!poly) continue;
        const screen = [];
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
        for (let i = 0; i < poly.length; i++) {
          const p = this.project(s, poly[i][0], poly[i][1], gz);
          screen.push(p);
          if (p.x < bx0) bx0 = p.x;
          if (p.x > bx1) bx1 = p.x;
          if (p.y < by0) by0 = p.y;
          if (p.y > by1) by1 = p.y;
        }
        if (bx1 < 0 || bx0 > this.w || by1 < 0 || by0 > this.h) continue;
        /* The square's own depth, a hair behind the caster's: the shade goes
           down on the floor, and whatever is standing on that floor paints after
           it. A square nearer the camera still paints over the whole of it. */
        b.push({
          kind: 'shadow', i: -1, poly: screen, grad: grad,
          solid: false, depth: this.depth(s, cx + 0.5, cy + 0.5) + 0.005,
          minX: bx0, minY: by0, maxX: bx1, maxY: by1,
          cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2
        });
        this.shadowPieces++;
      }
    }
  },

  draw(s) {
    this.ensure();
    const ctx = this.bctx, b = this.batch;
    const kinds = {};
    let drawn = 0, people = 0, structures = 0;
    let walls = 0, wallPx = 0, buried = 0, kept = 0, lost = 0, faded = 0;
    let backs = 0, backPx = 0;
    let banded = 0;
    /* How many faces took the across-the-run correction. ZERO WHEN
       `Render.acrossLight` IS OFF, which is the whole of what the flag-off
       picture being byte-identical rests on. See acrossFace(). */
    let acrossed = 0;
    /* SIDES WITH ROCK IN FRONT OF THEM -- what `Render.rockSides` is about.
       Counted here, in the one place the painted quads exist, and not in
       `wallsPainted()`, which the pointer's own answer calls too: a count that
       moves when somebody merely POINTS at the picture is not a count of what
       reached it. `stoneSides` is how many side faces had rock in front of them,
       in the picture or not; `stoneShown` is how many of those were painted
       anyway; `stoneM` is how far those painted ones drop, in metres, and
       `stonePx` the area they cover. At arm 0 `stoneShown` is most of
       `stoneSides` and `stoneM` is a whole stored side each (8 m); at arm 1 the
       same faces drop one depth step (about half a metre); at arm 2 nothing is
       painted at all and `stoneShown` is 0. Those four numbers are what a test
       asserts, because "the side facing rock is not shown" is a claim about ALL
       of them and a sample of one proves nothing (lesson 15). */
    let stoneSides = 0, stoneShown = 0, stoneM = 0, stonePx = 0;
    /* How many top faces were painted, how many of those were the rock of a wall
       rather than a surface somebody laid, and how many were left out because
       `wallBody` is switched off. A test reads all three: with the look the game
       ships no block is a lid, every block is rock, and every square is counted
       by exactly one of them. */
    let caps = 0, capsOff = 0, body = 0;
    /* How many squares the picture did not paint because rock was standing in
       front of a room. `drawn + cut` is every square the batch holds, and a test
       reads exactly that: a square that is neither painted nor counted here is a
       square that fell through the floor of the renderer. */
    let cut = 0;
    /* How many squares paint a low foot of rock because the wall in front hides
       the rest of them -- see stumpOf(). Zero of these where the world has hidden
       blocks is the look v0.37.0 shipped, and it leaves a gap at the foot of each
       hidden column: a test reads this count rather than arguing the gap is shut. */
    let stumps = 0;
    /* HOW MANY PATCHES OF SHADE THE PICTURE LAID DOWN. A shadow is a purely
       aesthetic thing -- nothing in the game reads one, nothing collides with
       one, and the light a square carries is worked out without them -- so the
       only evidence that the feature is real is that they REACHED THE CANVAS.
       This counts the ones that did, out of the ones the caster pass made
       (`Render.shadowPieces`). A test reads the pair: made but not painted is a
       builder with no consumer, which is the failure this project has been
       bitten by before. */
    let shadows = 0;
    /* The middle of the last block's own near face: a pixel that block REALLY
       painted. The middle of its square will not do any more, because the middle
       of a square's screen footprint is its TOP, and the tops are exactly what
       the wall look deletes -- so the honest answer there is whatever the
       deleted lid was covering. Recorded here because this is the one place the
       painted quads exist; `recordItems` only keeps a summary of each item. */
    let faceAim = null;
    const picks = new Set();
    const wornDrawn = [];

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, this.w, this.h);
    /* Changes whenever the view does, which is when the ground's own placement
       has to be worked out again. The size of the picture is part of it because
       the ground is projected through the middle of it, and zooming the view
       makes that size change. */
    this._frameStamp = s.cam.ox + ',' + s.cam.oy + ',' + s.cam.yaw + ','
      + s.cam.tileH + ',' + this.w + 'x' + this.h;

    /* How strong everything paints this frame, worked out in one place: a wall
       is only cut down in build() where the block in front of it paints solid,
       and two copies of that rule would disagree the first time either
       changed. */
    const plan = this.alphas(s, b);
    const alphaOf = plan.list, focus = plan.focus, focusPos = plan.focusPos;
    const focusIdx = plan.focusIdx, cutaway = plan.cutaway;

    const items = this.recordItems ? [] : null;
    let outlined = false;

    const outlineColour = N('ui.colour_outline');
    const worldStamp = 'w' + s.cam.ox + ',' + s.cam.oy;

    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      const alpha = alphaOf[k];
      let myAim = null;

      /* Rock standing in the way is not painted at all while `cut_solid` is 0,
         and it is skipped BEFORE the halo: a column that is not in the picture
         cannot be ringed either, so what you can pick stays exactly what you can
         see. The panel still names a thing that is cut away -- see cutOut(). */
      if (alpha <= 0) { cut++; continue; }

      if (it.stumped) stumps++;

      /* The highlighted thing is never painted see-through -- it is the one you
         are looking at -- and its halo goes down first, at full strength. */
      if (focus && k === focusPos) {
        ctx.globalAlpha = 1;
        this.halo(ctx, this.shapeOf(s.world, it, s.cam.tileH / CFG.rise),
          outlineColour, CFG.outlineWidth);
        outlined = true;
      }
      ctx.globalAlpha = alpha;

      /* SHADE CAST BY SOMETHING SOLID. One patch per square of floor it lies
         over, each sorted to the square it lies on, so it covers the ground and
         is covered by anything nearer the camera -- including the thing that
         cast it. See castShadows(). */
      if (it.kind === 'shadow') {
        /* ONE PATCH OF SHADE, laid rather than painted: a shade takes brightness
           away from what is under it, exactly as the light a surface carries is
           put on it, so it goes down in the same composite. See shadeMultiply.
           It COUNTS as painted like anything else -- it reached the canvas, and
           the self-check that reads `drawn + cut` against the batch would
           otherwise report every shadow in the picture as a shape that fell
           through the floor of the renderer. */
        if (this.shadeMultiply) {
          ctx.globalCompositeOperation = 'multiply';
          this.poly(ctx, it.poly, it.grad);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          this.poly(ctx, it.poly, it.grad);
        }
        shadows++;
        drawn++;
        continue;
      }

      if (it.kind === 'actor') {
        for (let r = 0; r < it.parts.length; r++) {
          const pt = it.parts[r];
          /* A flame is not darkened by the room it is lighting. */
          const pl = pt.glow ? 1 : it.light;
          for (let g = 0; g < pt.faces.length; g++) {
            this.poly(ctx, pt.faces[g].pts, litShade(pt.colour, pt.faces[g].lit, pl));
          }
          if (pt.slot !== 'body') wornDrawn.push(pt.item);
        }
        people++; drawn++;
        if (items) {
          items.push({ i: it.i, kind: 'actor', name: it.actor.name,
                       x: it.actor.x, y: it.actor.y, doing: it.actor.doing,
                       /* where the figure actually stood on the ground this
                          frame -- fractional while the stride plays out */
                       gx: it.gx, gy: it.gy, gh: it.gh,
                       face: it.actor.face,
                       parts: it.parts.map(function (q) { return q.id; }),
                       worn: it.parts.filter(function (q) { return q.slot !== 'body'; })
                              .map(function (q) { return q.item; }),
                       faces: it.parts.reduce(function (n, q) { return n + q.faces.length; }, 0),
                       alpha: alpha, sx: it.cx, sy: it.cy });
        }
        continue;
      }

      if (it.kind === 'site') {
        const done = it.site.built;
        /* A fire lights itself once it is burning. */
        const lit = STRUCT(it.site.structure).light > 0 && done ? 1 : it.light;
        for (let k = 0; k < it.parts.length; k++) {
          const pt = it.parts[k];
          /* Unfinished work is drawn dim: the shape is there, the thing is not
             yet. A flame is never dimmed -- it IS the light. */
          const col = pt.glow || done ? pt.colour : shade(pt.colour, 0.55);
          const pl = pt.glow ? 1 : lit;
          for (let g = 0; g < pt.faces.length; g++) {
            this.poly(ctx, pt.faces[g].pts, litShade(col, pt.faces[g].lit, pl));
          }
        }
        structures++; drawn++;
        if (items) {
          items.push({ i: it.i, kind: 'site', structure: it.site.structure,
                       x: it.site.x, y: it.site.y, built: done,
                       progress: it.site.progress, cleared: it.site.cleared,
                       parts: it.parts.map(function (q) { return q.id; }),
                       alpha: alpha, sx: it.cx, sy: it.cy });
        }
        continue;
      }

      const def = TILE(it.cell.tile);
      const lift = Math.round((1 + it.cell.h * CFG.heightTint) * 100) / 100;
      /* Every tile may name its own material; blank is plain colour.
       *
       * A floor or a block cap carries its material mapped onto the ground it
       * lies on, so it runs lengthways along the corridor instead of facing the
       * camera. That is one transform per material per height for the whole
       * frame, so it costs about what pasting it flat did -- see groundFill().
       *
       * The SIDES of a block carry the material too, mapped onto each face, so
       * the courses run along the wall and turn with it. They used to be left as
       * flat colour, and only masonry was mapped -- the facing somebody had put
       * on a worked room. What was written here for that was that rock's sides
       * are in shadow and edge-on, so a material there reads as almost nothing
       * and costs a third of the frame, and that masonry was all anybody would
       * lay. The first half is true and the conclusion was still wrong: rock is
       * nearly every wall in the labyrinth, so the rule meant the walls a player
       * actually walks between were the one surface in the game with no material
       * on them at all. See wall().
       *
       * Measured, A/B-ed inside one build (v0.24.0, seed 1, 624x368, best of
       * three alternating passes of 30 frames each): 182 sides are painted at
       * the camp and 636 more are buried behind a neighbour and never painted
       * at all. The ones that are painted cover 987,000 pixels of surface --
       * 4.3 screenfuls -- of which only 29,457 are actually visible, the rest
       * lying inside rock standing in front of them. That costs +3.9ms of
       * drawing a frame, and it is the FILL rather than the transform: the 182
       * setTransform calls are about half a millisecond of the total. For
       * comparison the ground's own material costs the same +3.9ms for 72,691
       * visible pixels -- so a screenful of wall costs about two and a half
       * times a screenful of floor, and the 33x overdraw above is why.
       *
       * It does not grow with the size of the world: +3.89ms holding 2 pieces,
       * +4.01ms holding 28. It grows the pattern cache instead, 24 -> 45
       * patterns at the camp, which is the other reason the lighting is stepped
       * rather than smooth.
       *
       * The sides stayed flat for a long time on a measurement that said
       * mapping them took drawing from 8.7ms to 43ms. That was taken BEFORE the
       * walls were clipped against the rock next door (v0.18.0), which is what
       * cut the faces to the couple of hundred above; on a clipped world the
       * same change is +3.9ms. */
      const mat = def.pattern;
      if (it.solid) {
        /* A block's sides are where a material really belongs: they are the
           walls you walk between, and the material is mapped ONTO each face
           rather than pasted over it, so the courses run along the wall and
           turn with it. */
        /* HOW BRIGHT THE STONE IS, at the foot of the face: the level the paint
           starts from. A generated material on screen carries the light itself
           (see floorLight); a dropped-in picture of one cannot, because the
           shade is baked into the pattern it wears. */
        const drawnMat = !!(mat && CFG.texStrength > 0 && this.drawn(mat));
        const sl = this.floorLight(s, it, drawnMat);
        const lf = litShade(def.side, CFG.shadeLeft * lift, sl);
        const rf = litShade(def.side, CFG.shadeRight * lift, sl);
        /* A wall cut down where the block in front hides it -- but only while
           that block really does paint solid. Fade it and the whole wall has to
           come back, or the fade would open a hole, so the choice is made here
           rather than in build(). A wall is only as tall as the cut left it
           (mL/mR), or the stonework would stretch and the courses would not line
           up with the block's own. At `cut_solid` 0 the block in front paints
           nothing at all and therefore counts as no cover, so a cut column's
           neighbours come back at their full height -- which is what stops a
           square that is not painted from leaving a hole in the rock beside it.

           The HALO above is NOT read off this. It is the silhouette, and a
           silhouette cannot grow because something in front of it was faded, so
           it is worked out from the world by `sideShown()` -- the same two sides
           of the same square, and never the stored wall running to the floor of
           the world. Here the choice is what to PAINT, and painting the whole
           side under a fade is what stops the fade opening a hole. */
        const faced = this.wallsPainted(it, alphaOf);
        const qL = faced.l, qR = faced.r, mL = faced.ml, mR = faced.mr;
        if (it.rockL) { stoneSides++; if (qL) { stoneShown++; stoneM += mL; stonePx += this.area(qL); } }
        if (it.rockR) { stoneSides++; if (qR) { stoneShown++; stoneM += mR; stonePx += this.area(qR); } }
        /* Both sides of a block, in the block's own material. */
        const sided = this.mappedWalls && mat && CFG.texStrength > 0;
        /* The same two shadings with no colour of their own, for a surface that
           IS a picture -- a picture carries its own colour, so multiplying it by
           the tile's as well would leave it nearly black. Worked out only for a
           material that has pictures, since these lines run for every block in
           the frame. */
        const pic = sided && this.drawn(mat);
        const lfPic = pic ? lightShade(CFG.shadeLeft * lift, sl) : undefined;
        const rfPic = pic ? lightShade(CFG.shadeRight * lift, sl) : undefined;
        /* THE MATERIAL WITH NO COLOUR BAKED INTO IT, so the face's own light can
           be painted underneath and show through the holes in the material.
           Null for every material this build does not generate, and null
           whenever `light.smooth` is off -- in which case every line below is
           exactly what it always was. `bandSkin` is the same material with the
           fade cut into it already (the band's own height, like wallBand's
           `rampM`), because a canvas pattern cannot be dissolved after the fact;
           there is only ever one of those per material, since a band only exists
           where the fade is at its full depth. */
        const skin = sided ? this.skinFor(mat, undefined) : null;
        const bandSkin = skin ? this.skinFor(mat, undefined, CFG.wallFadeM) : null;
        /* THE STRIP OF ROCK THIS BLOCK SHOWS ALONG ITS FAR EDGES, where the block
           behind it is too low to cover it -- see backBand(), which is the whole
           story. Painted FIRST of this block's faces, because a strip reaches
           down past the far edge and over the ground the two near faces are about
           to cover; painted after them it would lie across the front of the
           stonework. What it actually shows is the part our own faces do not
           cover, which is the strip that was bare backdrop.

           Flat and OPAQUE, on purpose. Opaque, because a strip that dissolved
           would reopen the very gap it is here to shut. Flat only where the
           strip has no drop of its own to map onto (see faceFill): otherwise the
           material is MAPPED onto it exactly as it is onto the faces below it,
           one tile to one metre, because a strip of plain colour along the top of
           every wall's back edge is the same complaint as a texture that stops
           where the fade begins.

           Each strip is parallel to one of the two near faces and takes that
           face's own shade, so the rock at the back of a block is lit as the
           block is: the far edge running with the left face's edge takes the
           left shade. */
        const bkL = faced.bl, bkR = faced.br;
        /* THE FAR CORNER: the one of the block's four that is neither the near
           one nor either of the two the near faces stand on. Both strips hang
           from it -- see backBand() -- so it is the u=0 end of each of them, and
           the corner acrossFace() needs to know the run runs from. */
        const anchor = 6 - it.near - it.cornerL - it.cornerR;
        if (bkR) {
          const brD = Math.max(0, (bkR[3].y - bkR[0].y) / CFG.rise);
          /* No fade on a strip: the fade is the top of a WALL, and a strip is
             the back edge of a block seen over the top of it. Its foot stands
             `brD` metres under the block's own top, and a strip only ever grows
             on a block -- a floor and a ramp have no strip at all (see `lid` in
             build()) and a block's four corners are all at `cell.h` -- so the
             ground beneath it is `cell.h - brD` up. */
          const zBkR = it.cell.h - brD;
          /* A strip is painted beside the strip of the block next along, so it
             wears the same light ACROSS it that the faces below it wear: without
             that, the back edge of a wall keeps the hard steps the faces have
             just lost. See acrossFace(). The probe comes first because whether
             the strip ramps decides where its own light is read (acrossFor). */
          const rampBkR = pic && brD > 0
            ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeLeft * lift, bkR, 0,
                            zBkR) : null;
          const rampedBkR = this.faceRamped(pic, rampBkR, skin !== null && brD > 0);
          const acrBkR = this.acrossFor(ctx, s, it, anchor, it.cornerR, bkR,
                                        zBkR, brD, rampedBkR, sl);
          const base = skin && brD > 0
            ? this.faceBase(s, it.cell, def.side, CFG.shadeLeft * lift, bkR, 0,
                            zBkR, acrBkR ? acrBkR.mul : 1) : null;
          /* A strip that is a picture takes its light MULTIPLIED over it, exactly
             as the faces under it do -- a strip left flat while the stonework
             below ramps is a hard line across the back of every lit wall. The
             probe is only rebuilt once the across correction knows which level
             the face is painted at; with no correction the two are one call. */
          const overBkR = rampBkR !== null && typeof rampBkR !== 'string'
            ? (acrBkR
                ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeLeft * lift, bkR,
                                0, zBkR, acrBkR.mul)
                : rampBkR)
            : null;
          const fill = sided && brD > 0 ? this.wall(lf, mat, bkR, brD,
            overBkR !== null ? undefined
              : (acrBkR ? lightShade(CFG.shadeLeft * lift, acrBkR.level) : lfPic),
            it.cell.x, it.cell.y, PICK_LEFT,
            overBkR !== null
              ? this.picSkin(mat, it.cell.x, it.cell.y, PICK_LEFT) : skin)
            : (acrBkR ? litShade(def.side, CFG.shadeLeft * lift, acrBkR.level) : lf);
          if (base) this.poly(ctx, bkR, base);
          this.poly(ctx, bkR, fill);
          if (overBkR !== null) this.lightOver(ctx, bkR, overBkR);
          if (acrBkR) { this.lightOver(ctx, bkR, acrBkR.grad); acrossed++; it.across = (it.across || 0) + 1; }
          backs++; backPx += this.area(bkR);
        }
        if (bkL) {
          const blD = Math.max(0, (bkL[3].y - bkL[0].y) / CFG.rise);
          const zBkL = it.cell.h - blD;
          const rampBkL = pic && blD > 0
            ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeRight * lift, bkL, 0,
                            zBkL) : null;
          const rampedBkL = this.faceRamped(pic, rampBkL, skin !== null && blD > 0);
          const acrBkL = this.acrossFor(ctx, s, it, anchor, it.cornerL, bkL,
                                        zBkL, blD, rampedBkL, sl);
          const base = skin && blD > 0
            ? this.faceBase(s, it.cell, def.side, CFG.shadeRight * lift, bkL, 0,
                            zBkL, acrBkL ? acrBkL.mul : 1) : null;
          const overBkL = rampBkL !== null && typeof rampBkL !== 'string'
            ? (acrBkL
                ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeRight * lift, bkL,
                                0, zBkL, acrBkL.mul)
                : rampBkL)
            : null;
          const fill = sided && blD > 0 ? this.wall(rf, mat, bkL, blD,
            overBkL !== null ? undefined
              : (acrBkL ? lightShade(CFG.shadeRight * lift, acrBkL.level) : rfPic),
            it.cell.x, it.cell.y, PICK_RIGHT,
            overBkL !== null
              ? this.picSkin(mat, it.cell.x, it.cell.y, PICK_RIGHT) : skin)
            : (acrBkL ? litShade(def.side, CFG.shadeRight * lift, acrBkL.level) : rf);
          if (base) this.poly(ctx, bkL, base);
          this.poly(ctx, bkL, fill);
          if (overBkL !== null) this.lightOver(ctx, bkL, overBkL);
          if (acrBkL) { this.lightOver(ctx, bkL, acrBkL.grad); acrossed++; it.across = (it.across || 0) + 1; }
          backs++; backPx += this.area(bkL);
        }
        if (qL) {
          /* How far the face really drops at the corner it is drawn from, which
             is what a mapped material is measured against -- one tile of
             stonework to one metre of wall. It is `mL` for every block (the cut
             raises the foot and shortens the metres together) and it is the DROP
             for a ramp, whose own `h` is measured from the floor it climbs out
             of and so can be a metre out. A face with no drop here is the thin
             end of a triangle, and a map is not defined on one. */
          const dL = Math.max(0, (qL[3].y - qL[0].y) / CFG.rise);
          /* Where the FOOT of this face stands, in metres up from the ground:
             zero when the face runs all the way down, and the height of the cut
             when a block in front hides the bottom of it. `it.left[3]` is the
             ground under the very corner the face hangs off -- the same x as
             `qL[3]`, whatever the cut did -- so the difference between the two
             is exactly how far up the foot has been raised. */
          const fdL = this.fadeDepth(mL);
          const zFootL = (it.left[3].y - qL[3].y) / CFG.rise;
          /* A FACE THAT IS A PICTURE carries its own colour, so there is nothing
             to lay a light UNDER and the light has to be MULTIPLIED over the
             picture instead -- see picSkin() and lightOver(). This is the whole
             of what a wall looked like before: the light was baked into the
             pattern, a pattern can only wear ONE level, so three metres of stone
             took the level of the ground at its foot and stood there at one
             brightness while the floor beside it ramped. */
          const rampL = pic && dL > 0
            ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeLeft * lift, qL, 0,
                            zFootL) : null;
          /* THE LIGHT ACROSS THIS FACE'S OWN RUN, which is what stops the block
             beside it reading as a separate stripe: both faces ask the same two
             squares at the same height and land on the same number at the join.
             See acrossFace() and acrossFor(), and note the probe above decides
             where this face's own light is read, so it has to come first. */
          const rampedL = this.faceRamped(pic, rampL, skin !== null && dL > 0);
          const acrL = this.acrossFor(ctx, s, it, it.near, it.cornerL, qL,
                                      zFootL, dL, rampedL, sl);
          const baseL = skin && dL > 0
            ? this.faceBase(s, it.cell, def.side, CFG.shadeLeft * lift, qL, fdL,
                            zFootL, acrL ? acrL.mul : 1) : null;
          /* TWO QUESTIONS ABOUT ONE FACE, and they are not the same question.
             Above: does the light RAMP up this face at all -- asked with no fade
             laid on, so a face in flat light still answers with one flat colour
             and stays the single fill it always was. Here: the same stops with
             the alpha that belongs to the material's own dissolve over them, so
             the multiply ramps away exactly as the band does.

             They were one call once, and the answer it gave was that a band is
             painted BEFORE the light -- so a face wearing a dropped-in picture,
             which is every rock wall at the camp, took its top metre straight
             off the picture and stood there at one brightness whatever light
             reached it. The brightest stripe of a wall was the part being
             dissolved. Fold the two questions back together and every flat-light
             face in the world starts answering with a gradient: a fill, a second
             picture and a new pixel or two on every face in the game, for
             nothing. Only the ramp is judged by the ramp; flat stays flat.

             The ACROSS correction is the third thing laid on the same face, and
             it is why this one is rebuilt rather than reused as the probe: the
             whole profile has to be SCALED to the brighter end of the run before
             the across gradient can darken it back down. With no correction the
             two calls are one object, exactly as they were. */
          const overL = rampL !== null && typeof rampL !== 'string'
            ? (acrL
                ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeLeft * lift, qL,
                                fdL, zFootL, acrL.mul)
                : this.faceBase(s, it.cell, '#ffffff', CFG.shadeLeft * lift, qL,
                                fdL, zFootL))
            : null;
          const picL = overL !== null
            ? this.picSkin(mat, it.cell.x, it.cell.y, PICK_LEFT) : null;
          /* `lf` taken to the brighter end of the run, so a flat fill is bright
             enough for the across gradient to take light away from it. */
          const fill = sided && dL > 0 ? this.wall(
            acrL ? litShade(def.side, CFG.shadeLeft * lift, acrL.level) : lf,
            mat, qL, dL,
            overL !== null ? undefined
              : (acrL ? lightShade(CFG.shadeLeft * lift, acrL.level) : lfPic),
            it.cell.x, it.cell.y, PICK_LEFT, picL || skin) : (
            acrL ? litShade(def.side, CFG.shadeLeft * lift, acrL.level) : lf);
          /* The band above the face wears the SAME picture of the material, from
             the same square and the same salt, and dissolves it -- which is the
             whole of what a person sees when they say the texture stops where the
             fade starts. It is asked for only where there is opaque rock BENEATH
             it (`mL` more than the band is worth): a band whose whole face is
             band is a face painted at nothing at all, which is how a one-metre
             stump used to disappear into a hole.
             With a ramp to wear it, this picture stays UNLIT and the ramp is
             multiplied over it -- see paintSide() -- so bandLitL below only has
             to answer for the arm with no ramp in it. */
          const bandM = Math.min(CFG.wallFadeM, mL);
          const picBandL = overL !== null
            ? this.picSkin(mat, it.cell.x, it.cell.y, PICK_LEFT, CFG.wallFadeM)
            : null;
          /* ONE brightness, for one flat fill. A pattern cannot ramp -- that is
             why the band is a picture of the material at all -- so where the band
             is painted as a single colour it takes the brightness the ramp has
             where the band begins, which is the one place the two are painted on
             top of each other. Take the floor's level instead and every wall
             wears a bright cap over a ramp it does not match. With a ramp over
             it this value is not read: a picture is the RAMP's arm, and the
             light reaches it as the multiply. */
          const bandLitL = overL !== null
            ? lightShade(CFG.shadeLeft * lift,
                         lightValueAt(s, it.cell, zFootL + dL - bandM))
            : (acrL ? lightShade(CFG.shadeLeft * lift, acrL.level) : lfPic);
          const band = sided && mL > CFG.wallFadeM
            ? this.wallBand(lf, mat, bandLitL, it.cell.x, it.cell.y, PICK_LEFT,
                            bandM, picBandL || bandSkin) : null;
          const bit = this.paintSide(ctx, qL, mL, lf, fill, band, baseL, overL);
          if (bit) faded++;
          if (bit === 2) banded++;
          /* THE LAST THING LAID ON THIS FACE, and the only one that reaches
             ACROSS it: everything above painted it at some one brightness (a
             flat fill, or a ramp that changes with height), and this takes the
             ends of the run down to the light of the squares on either side of
             them. Painted over the whole quad -- the base, the fill and the
             dissolving band alike -- because a run's ends are ends however the
             face is painted. See acrossFace(). */
          if (acrL) { this.lightOver(ctx, qL, acrL.grad); acrossed++; it.across = (it.across || 0) + 1; }
          walls++; wallPx += this.area(qL);
          /* A point this block certainly painted AND that nothing in front of it
             painted over -- because a face is now only ever cut PART of the way
             down (`cutMeet`), and what it keeps below is exactly the strip the
             block in front covers.
             *
             * How tall the strip that really shows is: the block in front stands
             * one square nearer, which is `cam.tileH / 2` pixels down the picture
             * -- 16 at the low angle, 27 at the raised one -- and it paints its
             * own faces from there down. So a quarter of a depth step below the
             * face's own top edge is inside the face and above every coverer,
             * whether the face was cut or not. The middle of the face will not
             * do any more: a cut face is two metres and more, and its lower half
             * belongs to the block in front, which is the whole reason for the
             * cut. */
          myAim = { x: (qL[0].x + qL[1].x) / 2,
                    y: (qL[0].y + qL[1].y) / 2 + s.cam.tileH / 4 };
        } else {
          buried++;
        }
        if (qR) {
          const dR = Math.max(0, (qR[3].y - qR[0].y) / CFG.rise);
          const fdR = this.fadeDepth(mR);
          const zFootR = (it.right[3].y - qR[3].y) / CFG.rise;
          /* The same lines as the left face, and for the same reasons: the
             light on a picture is MULTIPLIED over it, a face whose light does
             not change keeps the one flat fill, and both ends of the run are
             taken from the squares either side so the block next along agrees
             with this one about the light at the join. See above, picSkin(),
             faceRamped() and acrossFace(). */
          const rampR = pic && dR > 0
            ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeRight * lift, qR, 0,
                            zFootR) : null;
          const rampedR = this.faceRamped(pic, rampR, skin !== null && dR > 0);
          const acrR = this.acrossFor(ctx, s, it, it.near, it.cornerR, qR,
                                      zFootR, dR, rampedR, sl);
          const baseR = skin && dR > 0
            ? this.faceBase(s, it.cell, def.side, CFG.shadeRight * lift, qR, fdR,
                            zFootR, acrR ? acrR.mul : 1) : null;
          /* The same two questions as the left face, and for the same reasons: one
             call to ask whether the light ramps at all, a second to lay the
             fade's own alpha over the ramp the band will wear. See above. */
          const overR = rampR !== null && typeof rampR !== 'string'
            ? (acrR
                ? this.faceBase(s, it.cell, '#ffffff', CFG.shadeRight * lift, qR,
                                fdR, zFootR, acrR.mul)
                : this.faceBase(s, it.cell, '#ffffff', CFG.shadeRight * lift, qR,
                                fdR, zFootR))
            : null;
          const picR = overR !== null
            ? this.picSkin(mat, it.cell.x, it.cell.y, PICK_RIGHT) : null;
          const fill = sided && dR > 0 ? this.wall(
            acrR ? litShade(def.side, CFG.shadeRight * lift, acrR.level) : rf,
            mat, qR, dR,
            overR !== null ? undefined
              : (acrR ? lightShade(CFG.shadeRight * lift, acrR.level) : rfPic),
            it.cell.x, it.cell.y, PICK_RIGHT, picR || skin) : (
            acrR ? litShade(def.side, CFG.shadeRight * lift, acrR.level) : rf);
          const bandM = Math.min(CFG.wallFadeM, mR);
          const picBandR = overR !== null
            ? this.picSkin(mat, it.cell.x, it.cell.y, PICK_RIGHT, CFG.wallFadeM)
            : null;
          const bandLitR = overR !== null
            ? lightShade(CFG.shadeRight * lift,
                         lightValueAt(s, it.cell, zFootR + dR - bandM))
            : (acrR ? lightShade(CFG.shadeRight * lift, acrR.level) : rfPic);
          const band = sided && mR > CFG.wallFadeM
            ? this.wallBand(rf, mat, bandLitR, it.cell.x, it.cell.y, PICK_RIGHT,
                            bandM, picBandR || bandSkin) : null;
          const bit = this.paintSide(ctx, qR, mR, rf, fill, band, baseR, overR);
          if (bit) faded++;
          if (bit === 2) banded++;
          if (acrR) { this.lightOver(ctx, qR, acrR.grad); acrossed++; it.across = (it.across || 0) + 1; }
          walls++; wallPx += this.area(qR);
        } else {
          buried++;
        }
        /* THE TOP METRE OF A VISIBLE WALL FADES AWAY, right here rather than in
           a pass of its own, because the block in front of this one paints after
           it and must cover the fade where it covers the wall. A wall cut down
           to mL/mR metres is only faded as far down as it really stands, so a
           stub of wall behind a tall block never fades past its own height. That
           is what paintSide() above does, band and all. */
        /* A face may only be cut away where the block in front of it paints
           solid. Where that block is not painted the whole wall comes back, so
           a cut column can never open a hole -- and the two counts are what a
           test reads to prove the guard does the work rather than to argue it
           does. */
        if (it.nbrL >= 0 && alphaOf[it.nbrL] !== 1) { if (qL) kept++; else lost++; }
        if (it.nbrR >= 0 && alphaOf[it.nbrR] !== 1) { if (qR) kept++; else lost++; }
      }
      /* THE TOP OF A WALL IS NOT PAINTED AT ALL. Everything else is painted as it
         always was: the ground here is a floor's own surface, or a ramp's slope,
         and both carry their material -- that is the ground you walk on. A block's
         cap, the stone lid it laid across the top of the rock, is not, and NOTHING
         takes its place. What fills that space is the rock's own SIDES: a face is
         only cut down to where the block in front reaches, plus a depth step and
         the front block's own fade band above that (`cutMeet`), so the wall behind
         reaches up into the space the lid vacated and the one in front dissolves
         into ROCK rather than into the backdrop.

         The two control arms put something back, and both are proved against this
         look inside one build: `wallCaps` paints the old lit lid, material and
         all, and `wallBody` paints the rock flat and untextured -- v0.41.0's
         picture, which is the wrong answer: a slab of rock laid across the top of
         every wall is a lid again to anybody looking at it.

         ONE TOP DOES COME BACK, and it is the flat rock arm that paints it: a
         square the cut has cut, keeping a foot of rock standing, has a top the
         cut itself made and nothing else covers that part of it. `capShown` is
         the single place that decides it, so this branch is where the cut face of
         a stump is painted -- flat, because it is rock and not a surface anybody
         laid, and in the block's own side colour so the kerb reads as the same
         stone it was cut out of. It counts as `body` with the control arm's
         slabs, and `capsOff` no longer counts it. */
      if (this.capShown(it)) {
        if (it.block && !this.wallCaps) {
          this.poly(ctx, it.top, litShade(def.side, CFG.shadeLeft * lift, it.light));
          body++;
        } else {
          /* A GENERATED MATERIAL CAN CARRY THE LIGHT ITSELF. Its pattern is the
             material's colour with nothing of the tile baked into it, so the
             square's own brightness goes underneath and shows through -- and a
             floor is not one colour, it is a ramp from the edge nearest the fire
             to the edge furthest from it. See groundBase().

             A DROPPED-IN PICTURE CANNOT: a picture is its own colour, so the
             shade is baked into the pattern it wears, and it keeps the stepped
             level (see floorLight) -- a key that varied with a continuous light
             would be a cache entry per pixel. Nothing below runs at all when
             `light.smooth` is off, which is the picture this replaced. */
          const drawnMat = !!(mat && CFG.texStrength > 0 && this.drawn(mat));
          const sl = this.floorLight(s, it, drawnMat);
          const tf = litShade(def.top, lift, sl);
          /* LIT IS ASKED OF THE SQUARE'S OWN NUMBER, all three times below -- see
             lightFix. `it.light` is that number rounded onto the six-step ladder,
             so the whole outer rim of a pool of light -- every square whose light
             is under one twelfth -- read as UNLIT, and the ground there wore the
             baked, flat, stepped picture while the ground a step further in wore
             the smooth one. That is a wall of colour across the floor, and it is
             the same cliff the walls were standing on. `ramp` decides whether the
             material is laid under a live gradient, `skin` whether there is a
             material at all, and `bare` whether the gradient IS the surface. */
          const lit = this.lightFix ? (it.cell.light > 0) : (it.light > 0);
          /* A PICTURE IS ITS OWN COLOUR, so the light cannot be laid under it and
             cannot be baked into it either: a pattern carries ONE level, one
             level per square is a flight of stairs across a pool of light, and
             that is the division between tiles this is here to take out. So ask
             for the same ramp with no colour in it -- white put through the same
             sum -- and MULTIPLY it over the picture instead. Picture x light is
             exactly what the bake does, so a square whose light comes out even
             across it is still painted the old way, out of the baked pattern,
             for the price of one fill; that is most of the labyrinth. */
          const ramp = drawnMat && lit && CFG.lightSmooth > 0
            ? this.groundBase(s, it, '#ffffff', lift) : null;
          const pic = ramp !== null && typeof ramp !== 'string';
          const skin = lit ? this.skinFor(mat, it.cell.h) : null;
          const gpat = this.ground(tf, mat, it, s, worldStamp,
            drawnMat && !pic ? lightShade(lift, sl) : undefined, skin);
          /* A GRADIENT IS WHAT A MATERIAL IS PAINTED ON, so with no material
             there is nothing to lay anything over and the gradient is not under
             the surface -- it IS the surface. That is a tile with no material at
             all, and every tile with `texture.strength` at 0. Skipping this left
             the ground painted at the square's own stepped level whenever the
             materials were off, which is the stairs in a pool of light coming
             back through a knob that has nothing to do with light. */
          const bare = !skin && !pic && typeof gpat === 'string'
                       && CFG.lightSmooth > 0 && lit;
          if (skin || bare) {
            this.poly(ctx, it.top, this.groundBase(s, it, def.top, lift));
          }
          /* How many DIFFERENT pictures this frame's ground actually wore, so a
             test can say the scatter reached the screen rather than that the list
             it was picked from had more than one entry in it. */
          if (gpat && gpat._pick >= 0) picks.add(mat + '|' + gpat._pick);
          if (!bare) this.poly(ctx, it.top, gpat);
          if (pic) this.lightOver(ctx, it.top, ramp);
          caps++;
        }
      } else capsOff++;

      kinds[it.cell.tile] = (kinds[it.cell.tile] || 0) + 1;
      drawn++;
      if (items) {
        items.push({ i: it.i, kind: 'cell', x: it.cell.x, y: it.cell.y, h: it.cell.h,
                     tile: it.cell.tile, slope: it.cell.slope, cutaway: it.cutaway,
                     light: it.light, alpha: alpha, sx: it.cx, sy: it.cy, aim: myAim });
      }
    }

    ctx.globalAlpha = 1;

    this.consumed = {
      tick: s.tick, count: drawn, kinds: kinds,
      people: people, structures: structures, worn: wornDrawn,
      cutaway: cutaway, cut: cut, outlined: outlined,
      /* How many hidden blocks kept a foot of rock standing. See stumpOf(): a
         test reads it together with `cut`, because between them every square the
         batch holds has to be painted exactly once -- either whole, or as its own
         foot, or not at all. */
      stumps: stumps,
      /* Side walls only: how many were painted, how much picture they covered,
         and how many were buried in the block in front and not painted at all. */
      walls: walls, wallPx: Math.round(wallPx), buried: buried,
      /* And the strips of rock a block shows along its far edges where rock is
         drawn SHORT -- see backBand() and Render.backBands. At the shipped
         `cut_solid` 1 nothing is ever drawn short, so this is 0 and the picture
         is right; the count is what makes the A/B honest (a cull arm whose
         control painted nothing would pass on a picture that never had strips
         in it), and on the cut-away look, where zero of these IS a picture with
         black wedges in it -- which is what "missing floor pieces at wall
         corners" was. A lot of them is a block being given its top back;
         `wallBody` is the flag that paints a slab over every wall, and it is
         off: this count is the honest one. */
      backs: backs, backPx: Math.round(backPx),
      /* The top faces of the picture: floors and ramps painted as surfaces
         somebody laid, `body` of them painted as the plain rock of a wall
         (`wallBody`, and the cut face of every stump), and `capsOff` of them not
         painted at all -- which is every wall block in the frame, because a wall
         has no top, and a stump is not a wall. The three together are
         every square that got as far as being drawn. */
      caps: caps, capsOff: capsOff, body: body,
      /* How many wall faces painted a faded band across their top metre, and how
         many of those bands carried the face's own material rather than a flat
         colour. Zero bands with walls > 0 and the fade switched on is a fade that
         reached nothing; bands > 0 with banded 0 is a wall whose stonework still
         stops at the bottom of the band. */
      faded: faded, banded: banded, acrossed: acrossed,
      /* How many faces came back in full because the block that would have
         hidden them is cut away, and how many stayed out anyway -- which must
         be none. */
      kept: kept, lost: lost,
      /* How many different dropped-in pictures the GROUND wore this frame: 1
         means every square metre picked the same one, which is a material with
         one picture or a picker that is doing nothing. */
      picks: picks.size,
      /* What the rock skin did to the list this frame was drawn from: how many
         squares of rock were left out of the batch because rock stood on every
         side of them, and how many were kept because open air did. BOTH are
         read, because either alone passes on the wrong picture: `skinDropped` 0
         is a cull that never fired, and `skinKept` 0 with `skinDropped` > 0 is a
         frame with no walls standing in it at all. See Render.wallSkin. */
      skinDropped: this.skinDropped, skinKept: this.skinKept,
      /* Sides with ROCK IN FRONT OF THEM -- in the picture or not: how many,
         how many were painted anyway, how far those drop and how much picture
         they cover. The whole of `Render.rockSides` is in the difference between
         the first two, and it is the same count in every arm because it is a
         question about the world. See the counters' comment in draw(). */
      stoneSides: stoneSides, stoneShown: stoneShown,
      stoneM: stoneM, stonePx: stonePx,
      lights: s.lit ? lightSourcesIn(s).length : 0,
      /* The shade solid things threw this frame: how many pieces of it reached
         the canvas, and how many were worked out at all. Both are read, because
         either alone passes on the wrong picture -- `shadows` 0 with `shadowMade`
         > 0 is a shade that never reached the floor, and `shadowMade` 0 with
         `lightShadows` on and a fire in the picture is a pass that fired at
         nothing. See castShadows(); `Render.lightShadows` is the switch and
         `light.shade_strength` 0 turns it off from the sheet. */
      shadows: shadows, shadowMade: this.shadowPieces,
      /* And the same two numbers for the CRAWLERS alone. The person asked for
         "a crawler walking past a fire drags a shadow with them", and the two
         above cannot answer that: a shade thrown by a tent counts in both. */
      shadowActor: this.shadowActorPieces, shadowCasters: this.shadowActorCasters,
      focus: focusIdx, zoom: s.cam.zoom,
      bufW: this.w, bufH: this.h
    };
    if (items) this.consumed.items = items;
    s.viewDirty = false;
    return this.consumed;
  },

  /* The scene painted flat in identity colours: one pixel of it says what the
     player is pointing at, elevation and ramps and crawlers and half-built
     structures included.
     
     NOTHING IN THE GAME READS THIS ANY MORE. pickAt() works the same answer
     out arithmetically, and the mouse went from being the most expensive thing
     in a frame to almost free. This stays because it is the YARDSTICK: it is
     the answer the game gave for years, painted the straightforward way, and
     the battery that proves the new way agrees with the old way is a
     comparison against this. Keeping a correct but slow version of a thing
     beside a fast one, and proving them equal, is the whole reason the fast
     one is allowed to exist. (See "nothing is painted twice" in CLAUDE.md.) */
  drawPick(s) {
    this.ensure();
    const ctx = this.pctx, b = this.batch;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.w, this.h);
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      const id = it.i + 1;
      const col = 'rgb(' + (id & 255) + ',' + ((id >> 8) & 255) + ',' + ((id >> 16) & 255) + ')';
      /* A square the picture does not paint is not painted here either, so the
         yardstick stays the same question the game asks in both dial settings. */
      if (this.cutOut(it)) continue;
      /* Not painted here either: drawPick() is the YARDSTICK the worked-out
         picker is held against, so it has to paint exactly what the picture
         paints. See `Render.lightShadows` and pickAt(). */
      if (it.kind === 'shadow') continue;
      if (it.kind === 'actor') {
        for (let r = 0; r < it.parts.length; r++) {
          const fs = it.parts[r].faces;
          for (let g = 0; g < fs.length; g++) this.poly(ctx, fs[g].pts, col);
        }
        continue;
      }
      if (it.kind === 'site') {
        for (let r = 0; r < it.parts.length; r++) {
          const fs = it.parts[r].faces;
          for (let g = 0; g < fs.length; g++) this.poly(ctx, fs[g].pts, col);
        }
        continue;
      }
      if (it.solid) {
        /* WHICH two wall faces are painted is decided by the same call the
           picture makes, and it has to be. A wall is cut down only where the
           block in front of it paints SOLID, so with `cutSolid` 0 -- rock
           standing in for a left-out square -- the cut is refused and the whole
           wall comes back (`wallsPainted`). Reading the stored `cutL`/`cutR`
           here instead claimed those walls were not there, and the battery that
           compares this answer with the game's own was then measuring this
           function's blind spot rather than the two agreeing. */
        const faced = this.wallsPainted(it, this.alphas(s, b).list);
        const qL = faced.l, qR = faced.r;
        /* The strips at the back, in the same order the picture paints them --
           this is the yardstick the pointer is measured against, so it has to
           cover what the picture covers. */
        if (faced.br) this.poly(ctx, faced.br, col);
        if (faced.bl) this.poly(ctx, faced.bl, col);
        if (qL) this.poly(ctx, qL, col);
        if (qR) this.poly(ctx, qR, col);
      }
      /* Whatever covers a square's top in the picture covers it here too: a
         wall's top is not painted at all now, and the two must not disagree about
         that in either direction, or the pointer would name a surface nobody can
         see. */
      if (this.capShown(it)) this.poly(ctx, it.top, col);
    }
    return b.length;
  },

  /* Pick numbers run cells, then crawlers, then camp sites, so one number
     identifies anything on screen. */
  actorBase(s) { return s.world.cells.length; },
  siteBase(s) { return s.world.cells.length + s.actors.length; },
  isActorPick(s, p) { return p >= this.actorBase(s) && p < this.siteBase(s); },
  isSitePick(s, p) { return p >= this.siteBase(s); },
  actorFromPick(s, p) { return s.actors[p - this.actorBase(s)]; },
  siteFromPick(s, p) { return s.camp ? s.camp.sites[p - this.siteBase(s)] : null; },

  /* Is this point inside this shape? Even-odd crossing count, which for a
     simple shape is the same as the winding rule canvas fills by.
     
     The point asked about is the MIDDLE of a pixel, because that is the point
     canvas itself tests when it decides whether to fill one -- so asking here
     gives the same answer the painted buffer gave. */
  inShape(pts, px, py) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > py) !== (b.y > py) &&
          px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  },

  /* What is under the pointer?
   *
   * "Anything you can SEE" (rule 8) is the standing answer, and the way that
   * was honoured until now was to paint the whole scene a second time flat in
   * identity colours and read the pixel back. That is a second full pass over
   * every face in the frame -- the single most expensive thing left in a
   * frame, paid every frame the pointer was over the canvas, because the view
   * rides a walking crawler and so the picture is rebuilt every frame anyway.
   *
   * It is not needed. The list this reads is already in painter's order, back
   * to front, and the last thing to paint a pixel is what the player sees
   * there. Walking that list the OTHER way -- front to back -- and stopping at
   * the first shape that contains the point finds that exact same thing, with
   * no canvas, no colours and no pixels: just the shapes that were already
   * worked out for the picture.
   *
   * So what is compared is not "the same polygons" but the same polygons
   * tested at the same point in the same order, which is why the two answers
   * agree. Where they DO differ is a genuine improvement: a pixel on the edge
   * of a shape came back from the painted buffer as a BLEND of two identity
   * colours -- a number belonging to neither, sometimes a number belonging to
   * something else entirely, and sometimes nothing at all. There is no blend
   * here. A pixel belongs to the shape it is inside, and to nothing else.
   *
   * The bounding box each item already carries is a cheap no: that is the same
   * box the picture was culled by, widened by a pixel so that a box drawn a
   * hair too tight can never hide a shape behind it. */
  pickAt(s, bx, by) {
    const x = Math.floor(bx), y = Math.floor(by);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const px = x + 0.5, py = y + 0.5;
    const b = this.batch;
    /* Whether a square is painted at all is part of the answer -- a wall is
       painted whole where the block in front of it is not painted at all -- so
       the plan the picture used is worked out here once, rather than per square. */
    const alphaOf = this.alphas(s, b).list;
    for (let k = b.length - 1; k >= 0; k--) {
      const it = b[k];
      /* A shadow is a mark on the floor, not a thing. Rule 8 says everything
         VISIBLE can be hovered, and what you are pointing at when you point at
         a shadow is the floor under it -- which is the answer the square gives,
         and a better one than "shade". Skipped before the box test so the two
         walks (with the boxes and without) stay the same question. */
      if (it.kind === 'shadow') continue;
      if (px < it.minX - 1 || px > it.maxX + 1 ||
          py < it.minY - 1 || py > it.maxY + 1) continue;
      if (it.kind === 'cell') {
        /* Rock that is not in the picture is not an answer either: whatever is
           visible where the rock would have been is what the player meant. */
        if (this.cutOut(it)) continue;
        if (it.solid) {
          /* The same two choices drawPick() makes, and the same ones the picture
             makes -- see wallsPainted(). A wall is cut down where something flat
             and tall enough stands in front of it and is painted; where that
             something is not painted at all, the whole wall comes back, and a
             wall you can see is a wall you can point at (rule 8). Both faces
             belong to this one square, so their order does not matter here. */
          const faced = this.wallsPainted(it, alphaOf);
          const qL = faced.l, qR = faced.r;
          /* The strips of rock at the back of the block are painted, so they are
             part of the answer: a pixel the picture fills with this block's own
             rock belongs to this block (rule 8). */
          if (faced.br && this.inShape(faced.br, px, py)) return this.hit(s, it.i);
          if (faced.bl && this.inShape(faced.bl, px, py)) return this.hit(s, it.i);
          if (qL && this.inShape(qL, px, py)) return this.hit(s, it.i);
          if (qR && this.inShape(qR, px, py)) return this.hit(s, it.i);
        }
        if (this.capShown(it) && this.inShape(it.top, px, py)) return this.hit(s, it.i);
        continue;
      }
      const parts = it.parts;
      for (let r = 0; r < parts.length; r++) {
        const fs = parts[r].faces;
        for (let g = 0; g < fs.length; g++) {
          if (this.inShape(fs[g].pts, px, py)) return this.hit(s, it.i);
        }
      }
    }
    return -1;
  },

  /* One number identifies anything on screen, and the three runs of numbers
     are worked out from how much is in the world -- so a number left over from
     before a piece was fetched is refused rather than answered as somebody
     else. */
  hit(s, i) {
    const max = s.world.cells.length + s.actors.length
              + (s.camp ? s.camp.sites.length : 0);
    return (i < 0 || i >= max) ? -1 : i;
  }
};
