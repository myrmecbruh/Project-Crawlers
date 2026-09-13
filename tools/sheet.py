"""The master spreadsheet: how it is laid out, read, written and reconciled.

docs/crawlers.xlsx is the AUTHORITY on every number and name in the game.
src/defaults.json carries the same values so a fresh checkout still builds.

The one failure this arrangement exists to prevent is a value that lives in only
one of the two places: a knob in the sheet the game never reads, or a number in
the code the sheet cannot reach. reconcile() treats that as a build error, not a
warning, because a dial that is not connected to anything is worse than no dial.
"""

import json
import pathlib

# section -> (id column heading, value column headings, read-only?)
# The first value column is what the game reads for the simple sections.
SECTIONS = {
    "knobs":    ("key", ["value", "unit", "note"], False),
    "geometry": ("key", ["value", "unit", "note"], True),
    "names":    ("key", ["text"], False),
    "tags":     ("id",  ["name", "note"], False),
    "tiles":    ("id",  ["name", "tags", "top", "side", "footing", "note"], False),
}

# Columns that are documentation. They may be edited freely and are never
# reported as a moved value.
PROSE = {"note", "unit"}


def load_defaults(path):
    raw = json.loads(pathlib.Path(path).read_text())
    return {s: raw[s] for s in SECTIONS}


def blank(v):
    return v is None or (isinstance(v, str) and not v.strip())


def norm(col, v):
    """Compare 480 and 480.0 as the same number; compare text with the ends
    trimmed, because a spreadsheet loves a trailing space."""
    if blank(v):
        return ""
    if col in ("value",):
        try:
            f = float(v)
            return int(f) if f == int(f) else round(f, 10)
        except (TypeError, ValueError):
            return str(v).strip()
    if col == "footing":
        return str(v).strip().lower()
    if col == "tags":
        return ",".join(t.strip() for t in str(v).split(",") if t.strip())
    return str(v).strip()


def reconcile(defaults, sheet):
    """Merge the sheet over the defaults.

    Returns (merged, moved, errors). `moved` is the receipt printed on every
    build: every value the sheet actually changed. `errors` is fatal.
    """
    merged, moved, errors = {}, [], []

    for section, (idcol, cols, readonly) in SECTIONS.items():
        d = defaults.get(section, {})
        s = sheet.get(section, {}) if sheet else {}
        merged[section] = {}

        if sheet is not None:
            only_sheet = sorted(set(s) - set(d))
            only_code = sorted(set(d) - set(s))
            for k in only_sheet:
                errors.append("%s: '%s' is in the spreadsheet but not in the game "
                              "(a dial connected to nothing)" % (section, k))
            for k in only_code:
                errors.append("%s: '%s' is in the game but not in the spreadsheet "
                              "(a number nobody can reach)" % (section, k))

        for key, drow in d.items():
            row = dict(drow)
            srow = s.get(key) if sheet else None
            if srow:
                for col in cols:
                    if blank(srow.get(col)):
                        continue          # an empty cell means "leave it alone"
                    a, b = norm(col, drow.get(col)), norm(col, srow.get(col))
                    row[col] = srow[col]
                    if a != b and col not in PROSE:
                        if readonly:
                            errors.append(
                                "geometry: '%s' was changed in the spreadsheet "
                                "(%s -> %s). Geometry is recorded, never tuned."
                                % (key, a, b))
                        else:
                            moved.append((section, key, col, a, b))
            merged[section][key] = row

    return merged, moved, errors


def for_game(merged):
    """Strip the spreadsheet down to what the game actually reads."""
    out = {
        "knobs":    {k: norm("value", r["value"]) for k, r in merged["knobs"].items()},
        "geometry": {k: norm("value", r["value"]) for k, r in merged["geometry"].items()},
        "names":    {k: str(r["text"]) for k, r in merged["names"].items()},
        "tags":     {k: {"name": str(r["name"]), "note": str(r.get("note", ""))}
                     for k, r in merged["tags"].items()},
        "tiles":    {},
    }
    for k, r in merged["tiles"].items():
        out["tiles"][k] = {
            "name": str(r["name"]),
            "tags": [t for t in norm("tags", r["tags"]).split(",") if t],
            "top": str(r["top"]).strip(),
            "side": str(r["side"]).strip(),
            "footing": norm("footing", r["footing"]),
            "note": str(r.get("note", "")),
        }
    return out


def check_vocabulary(game):
    """Every tag a tile claims must exist in the tag list, and every footing must
    be one the renderer knows. A typo in the sheet should stop the build, not
    quietly produce a tile with a tag nothing recognises."""
    errors = []
    known = set(game["tags"])
    for tid, t in game["tiles"].items():
        for tag in t["tags"]:
            if tag not in known:
                errors.append("tiles: '%s' claims the tag '%s', which is not in "
                              "the tags sheet" % (tid, tag))
        if t["footing"] not in ("walk", "ramp", "block"):
            errors.append("tiles: '%s' has footing '%s'; expected walk, ramp or "
                          "block" % (tid, t["footing"]))
    return errors


def read_xlsx(path):
    from openpyxl import load_workbook
    wb = load_workbook(path, data_only=True)
    out = {}
    for section, (idcol, cols, _ro) in SECTIONS.items():
        if section not in wb.sheetnames:
            continue
        ws = wb[section]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        head = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
        if idcol not in head:
            continue
        idx = {c: head.index(c) for c in [idcol] + cols if c in head}
        table = {}
        for r in rows[1:]:
            key = r[idx[idcol]] if idx[idcol] < len(r) else None
            if blank(key):
                continue
            row = {c: (r[i] if i < len(r) else None)
                   for c, i in idx.items() if c != idcol}
            # A row with nothing in any value column is a note to the reader
            # (the READ ONLY banner, a spacer), not a setting.
            if all(blank(v) for v in row.values()):
                continue
            table[str(key).strip()] = row
        out[section] = table
    return out


def write_xlsx(defaults, path, readme_lines):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "read me first"
    ws.column_dimensions["A"].width = 100
    for i, line in enumerate(readme_lines, start=1):
        ws.cell(row=i, column=1, value=line).alignment = Alignment(wrap_text=True, vertical="top")
        if line and not line.startswith(" ") and line == line.upper():
            ws.cell(row=i, column=1).font = Font(bold=True)

    head_fill = PatternFill("solid", fgColor="1F2A33")
    ro_fill = PatternFill("solid", fgColor="5C3A1E")

    for section, (idcol, cols, readonly) in SECTIONS.items():
        ws = wb.create_sheet(section)
        headings = [idcol] + cols
        for c, h in enumerate(headings, start=1):
            cell = ws.cell(row=1, column=c, value=h)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = ro_fill if readonly else head_fill
        for r, (key, row) in enumerate(defaults[section].items(), start=2):
            ws.cell(row=r, column=1, value=key)
            for c, col in enumerate(cols, start=2):
                ws.cell(row=r, column=c, value=row.get(col))
        widths = {"key": 26, "id": 16, "value": 10, "unit": 10, "note": 78,
                  "text": 54, "name": 18, "tags": 30, "top": 10, "side": 10,
                  "footing": 10}
        for c, h in enumerate(headings, start=1):
            ws.column_dimensions[get_column_letter(c)].width = widths.get(h, 16)
        ws.freeze_panes = "B2"
        if readonly:
            ws.cell(row=len(defaults[section]) + 3, column=1,
                    value="READ ONLY -- these describe the shape of the world, "
                          "not its balance. Changing one stops the build on purpose.")

    wb.save(path)


def selftest():
    """A broken ruler is worse than no ruler: prove reconcile() can actually
    catch the failures it exists to catch, before trusting it with a build."""
    checks = []

    def add(name, ok, detail=""):
        checks.append((name, ok, detail))

    base = {
        "knobs": {"a": {"value": 1, "unit": "x", "note": "n"}},
        "geometry": {"g": {"value": 2, "unit": "m", "note": "n"}},
        "names": {"n1": {"text": "hello"}},
        "tags": {"t1": {"name": "t1", "note": ""}},
        "tiles": {"x": {"name": "X", "tags": "t1", "top": "#000", "side": "#111",
                        "footing": "walk", "note": ""}},
    }

    def sheet_from(base_, **patch):
        s = {k: {kk: dict(vv) for kk, vv in v.items()} for k, v in base_.items()}
        for path, val in patch.items():
            sec, key, col = path.split("__")
            s[sec][key][col] = val
        return s

    _, moved, errs = reconcile(base, sheet_from(base, knobs__a__value=5))
    add("a changed number is reported", moved == [("knobs", "a", "value", 1, 5)], str(moved))
    add("a changed number is not an error", not errs, str(errs))

    s = sheet_from(base); del s["knobs"]["a"]
    _, _, errs = reconcile(base, s)
    add("a knob missing from the sheet stops the build", len(errs) == 1, str(errs))

    s = sheet_from(base); s["knobs"]["ghost"] = {"value": 9, "unit": "", "note": ""}
    _, _, errs = reconcile(base, s)
    add("a dial the game never reads stops the build", len(errs) == 1, str(errs))

    _, _, errs = reconcile(base, sheet_from(base, geometry__g__value=99))
    add("edited geometry stops the build", len(errs) == 1, str(errs))

    _, moved, errs = reconcile(base, sheet_from(base, knobs__a__note="different prose"))
    add("an edited note is not a moved number", not moved and not errs, str(moved + errs))

    m, moved, errs = reconcile(base, sheet_from(base, knobs__a__value=None))
    add("an empty cell leaves the default alone",
        not moved and m["knobs"]["a"]["value"] == 1, str(m["knobs"]["a"]))

    m, _, _ = reconcile(base, sheet_from(base, tiles__x__tags="t1,nope"))
    add("a tile claiming an unknown tag stops the build",
        len(check_vocabulary(for_game(m))) == 1, "")

    m, _, _ = reconcile(base, None)
    add("with no sheet at all, the defaults still build",
        for_game(m)["knobs"]["a"] == 1, "")

    return checks
