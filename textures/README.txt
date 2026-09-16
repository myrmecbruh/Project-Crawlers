TEXTURES -- the pictures the game wears on its surfaces

Eight folders, one for each material in the game. Drop image files straight
into a folder. More than one file in a folder is fine -- they get mixed up.

What makes a good file here:
  - square, 32 x 32 pixels. That is one metre, and a metre is the patch the
    game repeats across a floor. 64 x 64 is fine too, or anything bigger --
    bigger gets shrunk, and the smaller the picture the chunkier it reads.
  - it has to tile: the right edge should meet the left edge and the bottom
    the top, so it can be laid next to itself with no seam showing.
  - the picture BECOMES the surface: the colours in your picture are what you
    see. The game still darkens it in shadow and warms it near a fire, so a
    picture that is already dark will come out black -- keep it light enough
    that the dark of the labyrinth still reads as dark.
  - PNG is best. JPG is fine.
  - the game is dark and grim and built from one small palette. A bright,
    clean, modern picture will look like a sticker.

Nothing in the game changes yet. The folders are empty slots -- say the word
once there are pictures in them and they will be wired in.
