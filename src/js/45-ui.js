/* The inspector. Two surfaces, and the difference matters:
 *
 *   the TOOLTIP  follows the pointer, says one line, and cannot be clicked.
 *   the PANEL    is pinned by clicking or tapping something, stays put, and
 *                CAN be clicked -- which is what lets the long lists fold away.
 *
 * Rule 8 is satisfied by the tooltip alone (anything visible can be hovered and
 * says what it is). The panel is for when you want the whole story, and it
 * starts folded so it does not bury the game underneath it.
 *
 * describe() returns plain data and the two render() methods put that data on
 * the page. They are split so a test can prove BOTH: that the description is
 * right, and that it actually reached the screen.
 */
const Inspector = {
  tip: null,
  panel: null,
  showing: -1,    /* what the tooltip is describing */
  pinned: -1,     /* what the panel is describing   */

  ensure() {
    if (!this.tip) this.tip = document.getElementById('tooltip');
    if (!this.panel) this.panel = document.getElementById('panel');
  },

  /* Which parts of the panel are open. Folded by default: the twelve gear slots
     and a long skill list are exactly what made the old popup too big. */
  sections(s) {
    if (!s.panelOpen) s.panelOpen = { attributes: true, skills: false, gear: false };
    return s.panelOpen;
  },

  footingText(footing) {
    if (footing === 'block') return N('ui.footing_block');
    if (footing === 'ramp') return N('ui.footing_ramp');
    return N('ui.footing_walk');
  },

  doingText(doing) {
    if (doing === 'walking') return N('ui.doing_walking');
    if (doing === 'clearing') return N('ui.doing_clearing');
    if (doing === 'building') return N('ui.doing_building');
    return N('ui.doing_idle');
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
      kind: 'ground', index: idx, name: def.name,
      at: cell.x + ', ' + cell.y,
      elevation: cell.h, elevationText: cell.h + ' m',
      footing: def.footing, footingText: this.footingText(def.footing),
      slope: cell.slope,
      tags: def.tags.map(function (t) { return TAG(t).name; }),
      note: def.note
    };
  },

  /* One line. Whatever the thing most obviously is. */
  summary(d) {
    if (d.kind === 'crawler') return this.doingText(d.doing);
    if (d.kind === 'site') return d.state;
    return d.elevationText + ' · ' + d.footingText;
  },

  /* ---- the hover tooltip ------------------------------------------------ */
  renderTip(s) {
    this.ensure();
    if (!this.tip) return null;
    const d = this.describe(s, s.hover);
    if (!d) { this.tip.hidden = true; this.showing = -1; return null; }

    this.tip.innerHTML =
      '<b class="tt-name">' + d.name + '</b>'
      + '<span class="tt-sum">' + this.summary(d) + '</span>'
      + (s.selected === d.index ? '' : '<span class="tt-hint">' + N('ui.label_inspect') + '</span>');
    this.tip.hidden = false;
    this.showing = d.index;

    const pad = 12;
    const w = this.tip.offsetWidth || 150, h = this.tip.offsetHeight || 40;
    let px = s.pointer.clientX + 16, py = s.pointer.clientY + 16;
    if (px + w + pad > innerWidth) px = s.pointer.clientX - w - 16;
    if (py + h + pad > innerHeight) py = innerHeight - h - pad;
    this.tip.style.left = Math.max(pad, px) + 'px';
    this.tip.style.top = Math.max(pad, py) + 'px';
    return d;
  },

  /* ---- the pinned panel -------------------------------------------------- */
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

  fold(open, id, label, count, body) {
    return '<button type="button" class="fold' + (open ? ' open' : '') + '" data-section="' + id + '"'
         + ' aria-expanded="' + (open ? 'true' : 'false') + '">'
         + '<span class="fold-arrow">' + (open ? '▾' : '▸') + '</span>'
         + '<span class="fold-label">' + label + '</span>'
         + '<span class="fold-count">' + count + '</span></button>'
         + (open ? '<div class="fold-body">' + body + '</div>' : '');
  },

  /* The last attempt, read the way somebody at a table would read it:
     what they brought, what they threw, what they needed. */
  rollText(r) {
    if (!r) return '<span class="tt-dim">' + N('ui.label_empty') + '</span>';
    return '<span class="roll' + (r.ok ? ' win' : ' lose') + '">'
         + '<span class="roll-s">' + r.skillName + '</span> '
         + r.ability + ' + <b>' + r.dice + '</b> = ' + r.total
         + ' <span class="roll-v">vs ' + r.difficulty + '</span> '
         + (r.ok ? '\u2713' : '\u2717') + '</span>';
  },

  crawlerPanel(s, d) {
    const open = this.sections(s);
    let h = this.row(N('ui.label_doing'), this.doingText(d.doing));
    h += this.row(N('ui.label_lastroll'), this.rollText(d.lastRoll));

    let attrs = '<div class="tt-attrs">';
    for (const a of d.attributes) {
      attrs += '<span class="attr"><span class="attr-k">' + a.abbrev
             + '</span><span class="attr-v' + (a.shift ? (a.shift > 0 ? ' up' : ' down') : '')
             + '">' + a.value + '</span></span>';
    }
    attrs += '</div>';
    h += this.fold(open.attributes, 'attributes', N('ui.section_attributes'), 6, attrs);

    let skills = '';
    if (d.skills.length) {
      for (const sk of d.skills) {
        /* Pips, not a decimal: filled for what counts, and the one being worked
           on shows how far along it is. */
        let pips = '';
        for (let i = 0; i < sk.cap; i++) {
          const filled = i < sk.level;
          const working = i === sk.level;
          pips += '<span class="pip' + (filled ? ' on' : '') + '"'
                + (working ? ' style="opacity:' + (0.25 + sk.progress * 0.65).toFixed(2) + '"' : '')
                + '></span>';
        }
        skills += '<div class="skill"><span class="skill-n">' + sk.name
                + '</span><span class="pips">' + pips + '</span>'
                + '<span class="skill-f">' + sk.from + '</span></div>';
      }
    } else {
      skills = '<span class="tt-dim">' + N('ui.label_empty') + '</span>';
    }
    h += this.fold(open.skills, 'skills', N('ui.section_skills'), d.skills.length, skills);

    let gear = '';
    for (const g of d.gear) {
      gear += g.empty
        ? '<div class="gear gear-off"><span class="gear-s">' + g.slotName
          + '</span><span class="gear-n">' + N('ui.label_empty') + '</span></div>'
        : '<div class="gear"><span class="gear-s">' + g.slotName
          + '</span><span class="gear-n">' + g.name + '</span>'
          + (g.effects.length ? '<span class="gear-e">' + g.effects.join(' ') + '</span>' : '')
          + '</div>';
    }
    const filled = d.gear.filter(function (g) { return !g.empty; }).length;
    h += this.fold(open.gear, 'gear', N('ui.section_gear'), filled + '/' + d.gear.length, gear);

    return h + this.tagsRow(d.tags);
  },

  renderPanel(s) {
    this.ensure();
    if (!this.panel) return null;
    const d = this.describe(s, s.selected);
    if (!d) { this.panel.hidden = true; this.pinned = -1; return null; }

    let h = '<div class="pn-head"><b class="tt-name">' + d.name + '</b>'
          + '<span class="tt-at">' + d.at + '</span>'
          + '<button type="button" class="pn-close" data-close="1" title="'
          + N('ui.label_close') + '">×</button></div>';

    if (d.kind === 'crawler') {
      h += this.crawlerPanel(s, d);
    } else if (d.kind === 'site') {
      h += this.row(N('ui.label_state'), d.state)
         + this.row(N('ui.label_progress'),
             '<span class="bar"><span class="bar-fill" style="width:' + d.progress + '%"></span></span> '
             + d.progress + '%')
         + this.row(N('ui.label_ground'), d.ground)
         + this.tagsRow(d.tags);
    } else {
      h += this.row(N('ui.label_elevation'), d.elevationText)
         + this.row(N('ui.label_footing'), d.footingText)
         + this.tagsRow(d.tags);
    }

    this.panel.innerHTML = h;
    this.panel.hidden = false;
    this.pinned = d.index;
    return d;
  },

  /* One listener for the whole panel: the folds and the close button.
     It reads the CURRENT match every time rather than closing over the one that
     happened to exist when the page loaded -- otherwise starting a new match
     leaves the panel quietly wired to a game nobody is playing. */
  bind() {
    this.ensure();
    if (!this.panel || this.panel.dataset.bound) return;
    this.panel.dataset.bound = '1';
    this.panel.addEventListener('click', (e) => {
      const s = Game.state;
      if (!s) return;
      if (e.target.closest('[data-close]')) {
        s.selected = -1;
        s.viewDirty = true;
        this.renderPanel(s);
        return;
      }
      const fold = e.target.closest('[data-section]');
      if (!fold) return;
      const open = this.sections(s);
      open[fold.dataset.section] = !open[fold.dataset.section];
      this.renderPanel(s);
    });
  },

  render(s) {
    this.renderTip(s);
    this.renderPanel(s);
  }
};

/* The old name, kept so nothing that reaches for it breaks. */
const Tooltip = Inspector;
