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
    if (idx < 0) return null;
    if (Render.isActorPick(s, idx)) {
      const a = Render.actorFromPick(s, idx);
      if (!a) return null;
      const d = describeActor(a);
      d.index = idx;
      return d;
    }
    if (Render.isSitePick(s, idx)) {
      const site = Render.siteFromPick(s, idx);
      if (!site) return null;
      const def = STRUCT(site.structure);
      return {
        kind: 'site', index: idx, name: def.name,
        at: site.x + ', ' + site.y,
        built: site.built, progress: site.built ? 100 : site.progress,
        state: site.built ? N('ui.state_built')
             : !site.cleared ? N('ui.state_clearing')
             : site.progress > 0 ? N('ui.state_building') : N('ui.state_planned'),
        ground: TILE(s.world.at(site.x, site.y).tile).name,
        efforts: site.efforts,
        tags: def.tags.map(function (t) { return TAG(t).name; })
              .concat(site.built ? [] : [TAG('unbuilt').name]),
        note: def.note
      };
    }
    if (idx >= s.world.cells.length) return null;
    const cell = s.world.cells[idx];
    const def = TILE(cell.tile);
    return {
      kind: 'ground',
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

  row(k, v) {
    return '<div class="tt-row"><span class="tt-k">' + k
         + '</span><span class="tt-v">' + v + '</span></div>';
  },

  tagsRow(tags) {
    let h = '<div class="tt-row"><span class="tt-k">' + N('ui.label_tags')
          + '</span><span class="tt-v tt-tags">';
    for (const t of tags) h += '<span class="tag">' + t + '</span>';
    return h + '</span></div>';
  },

  head(d) {
    return '<div class="tt-head"><b class="tt-name">' + d.name
         + '</b> <span class="tt-at">' + d.at + '</span></div>';
  },

  groundHtml(d) {
    return this.head(d)
      + this.row(N('ui.label_elevation'), d.elevationText)
      + this.row(N('ui.label_footing'), d.footingText)
      + this.tagsRow(d.tags);
  },

  siteHtml(d) {
    return this.head(d)
      + this.row(N('ui.label_state'), d.state)
      + this.row(N('ui.label_progress'),
          '<span class="bar"><span class="bar-fill" style="width:' + d.progress + '%"></span></span> '
          + d.progress + '%')
      + this.row(N('ui.label_ground'), d.ground)
      + this.tagsRow(d.tags);
  },

  doingText(doing) {
    if (doing === 'walking') return N('ui.doing_walking');
    if (doing === 'clearing') return N('ui.doing_clearing');
    if (doing === 'building') return N('ui.doing_building');
    return N('ui.doing_idle');
  },

  /* Rule 2 made visible: the six attributes first, then every skill with the
     attributes it is derived from written next to it. */
  crawlerHtml(d) {
    let h = this.head(d);
    h += '<div class="tt-row"><span class="tt-k">' + N('ui.label_attributes')
       + '</span><span class="tt-v tt-attrs">';
    for (const a of d.attributes) {
      h += '<span class="attr"><span class="attr-k">' + a.abbrev
         + '</span><span class="attr-v' + (a.shift ? (a.shift > 0 ? ' up' : ' down') : '')
         + '">' + a.value + '</span></span>';
    }
    h += '</span></div>';

    h += '<div class="tt-row"><span class="tt-k">' + N('ui.label_skills')
       + '</span><span class="tt-v">';
    if (d.skills.length) {
      for (const sk of d.skills) {
        h += '<div class="skill"><span class="skill-n">' + sk.name
           + '</span> <span class="skill-l">' + sk.level
           + '</span> <span class="skill-f">' + sk.from + '</span></div>';
      }
    } else {
      h += '<span class="tt-dim">' + N('ui.label_bare') + '</span>';
    }
    h += '</span></div>';

    h += this.row(N('ui.label_doing'), this.doingText(d.doing));

    /* All twelve slots, always -- an empty one is information too. */
    h += '<div class="tt-row"><span class="tt-k">' + N('ui.label_gear')
       + '</span><span class="tt-v tt-gear">';
    for (const g of d.gear) {
      if (g.empty) {
        h += '<div class="gear gear-off"><span class="gear-s">' + g.slotName
           + '</span><span class="gear-n">' + N('ui.label_empty') + '</span></div>';
      } else {
        h += '<div class="gear"><span class="gear-s">' + g.slotName
           + '</span><span class="gear-n">' + g.name + '</span>'
           + (g.effects.length ? '<span class="gear-e">' + g.effects.join(' ') + '</span>' : '')
           + '</div>';
      }
    }
    h += '</span></div>';
    return h + this.tagsRow(d.tags);
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

    this.el.innerHTML = d.kind === 'crawler' ? this.crawlerHtml(d)
                      : d.kind === 'site' ? this.siteHtml(d)
                      : this.groundHtml(d);
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
