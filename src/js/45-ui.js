/* The inspector. Rule 8: anything you can see can be hovered on a desktop or
 * tapped on a phone, and it tells you its name, its footing and its tags.
 *
 * describe() returns plain data and render() puts that data on the page. They
 * are split so a test can prove BOTH: that the description is right, and that
 * it actually reached the screen. A description nothing displays is the same
 * failure as a picture nobody draws.
 */
const Tooltip = {
  el: null,
  showing: -1,

  ensure() {
    if (this.el) return;
    this.el = document.getElementById('tooltip');
  },

  footingText(footing) {
    if (footing === 'block') return N('ui.footing_block');
    if (footing === 'ramp') return N('ui.footing_ramp');
    return N('ui.footing_walk');
  },

  describe(s, idx) {
    if (idx < 0 || idx >= s.world.cells.length) return null;
    const cell = s.world.cells[idx];
    const def = TILE(cell.tile);
    return {
      index: idx,
      name: def.name,
      at: cell.x + ', ' + cell.y,
      elevation: cell.h,
      elevationText: cell.h + ' m',
      footing: def.footing,
      footingText: this.footingText(def.footing),
      slope: cell.slope,
      tags: def.tags.map(function (t) { return TAG(t).name; }),
      note: def.note
    };
  },

  render(s) {
    this.ensure();
    if (!this.el) return null;
    const idx = s.hover >= 0 ? s.hover : s.selected;
    const d = this.describe(s, idx);

    if (!d) {
      this.el.hidden = true;
      this.showing = -1;
      return null;
    }

    const rows = [
      ['', '<b class="tt-name">' + d.name + '</b> <span class="tt-at">' + d.at + '</span>'],
      [N('ui.label_elevation'), d.elevationText],
      [N('ui.label_footing'), d.footingText]
    ];
    let html = '';
    for (const r of rows) {
      html += r[0]
        ? '<div class="tt-row"><span class="tt-k">' + r[0] + '</span><span class="tt-v">' + r[1] + '</span></div>'
        : '<div class="tt-head">' + r[1] + '</div>';
    }
    html += '<div class="tt-row"><span class="tt-k">' + N('ui.label_tags') + '</span><span class="tt-v tt-tags">';
    for (const t of d.tags) html += '<span class="tag">' + t + '</span>';
    html += '</span></div>';
    this.el.innerHTML = html;
    this.el.hidden = false;
    this.showing = idx;

    /* Follow the pointer, but never off the edge of the window. */
    const pad = 12;
    const w = this.el.offsetWidth || 190, h = this.el.offsetHeight || 70;
    let px = s.pointer.clientX + 16, py = s.pointer.clientY + 16;
    if (px + w + pad > innerWidth) px = s.pointer.clientX - w - 16;
    if (py + h + pad > innerHeight) py = innerHeight - h - pad;
    this.el.style.left = Math.max(pad, px) + 'px';
    this.el.style.top = Math.max(pad, py) + 'px';
    return d;
  }
};
