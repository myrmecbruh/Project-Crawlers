/* THE PICTURES DROPPED IN BY HAND.
 *
 * Every material the game has can be either GENERATED -- the shapes cut into it
 * by matTile() in 40-render.js -- or DRAWN, by somebody putting image files in
 * `textures/<material>/`. A picture that is there BECOMES the surface: the
 * colours in it are what you see, and the light is what is done to them.
 *
 * They are inlined into the built page by build.py, in the order their files are
 * named, exactly the way the spreadsheet is -- so the page still plays from a
 * file on a phone with no network and nothing to install.
 *
 * What is here is only the business of getting them DECODED and saying when that
 * has happened. An image decodes when it decodes, which is after the first frame
 * would like to be drawn, so nothing may be baked before `ready` -- and whatever
 * was baked before them has to be thrown away, or the first frame of a match
 * would wear the generated tiles for the rest of the session. See
 * Render.forgetMaterials().
 */
const TEXTURE_FILES = {{TEXTURES}};

const Textures = {
  files: TEXTURE_FILES,        /* material -> [data URI, ...]                 */
  imgs: {},                    /* material -> [Image or null], holes kept     */
  live: {},                    /* material -> the pictures that decoded       */
  ready: false,
  wants: 0,
  done: 0,

  load() {
    if (this.wants) return;            /* already loading, or already loaded */
    for (const name of Object.keys(this.files)) {
      const list = this.files[name];
      this.imgs[name] = list.map(() => null);
      this.wants += list.length;
    }
    if (!this.wants) return;
    for (const name of Object.keys(this.files)) {
      this.files[name].forEach((uri, i) => {
        const img = new Image();
        img.onload = () => { this.imgs[name][i] = img; this.one(); };
        /* A picture that will not decode is silence rather than an error: the
           material keeps the tile the game generates, which is what a folder
           nobody has put anything in does too. */
        img.onerror = () => { this.one(); };
        img.src = uri;
      });
    }
  },

  /* One picture has arrived. The materials are handed to the renderer only when
     ALL of them have -- a surface made of some of its pictures is a surface that
     changes under the player a moment after they look at it. */
  one() {
    this.done++;
    if (this.done < this.wants) return;
    this.ready = true;
    for (const name of Object.keys(this.imgs)) {
      const got = this.imgs[name].filter(Boolean);
      if (got.length) this.live[name] = got;
    }
    Render.forgetMaterials();
    if (Game.state) {
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
  },
};
