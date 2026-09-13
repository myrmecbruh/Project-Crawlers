#!/usr/bin/env python3
"""Create docs/crawlers.xlsx from src/defaults.json.

    python3 tools/make_sheet.py            # only if the sheet does not exist
    python3 tools/make_sheet.py --force    # overwrite it, losing every edit

It REFUSES to overwrite an existing sheet without --force. The sheet is the
authority; the person tuning the game edits it by hand and those edits must
never be destroyed by a routine rebuild.

To add a knob: add it to src/defaults.json AND to the sheet. build.py will not
build while it exists in only one of the two.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sheet as S

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "crawlers.xlsx"

README = [
    "PROJECT CRAWLERS - THE MASTER SHEET",
    "",
    "This is the authority on every number and every piece of wording in the game.",
    "Change something here, say so, and it is in the game the next time it is built.",
    "You do not need to know anything about the code to use this file.",
    "",
    "HOW TO USE IT",
    "",
    "  Each tab below is one kind of setting. Change the value in the 'value' or",
    "  'text' column. Leave the 'note' column alone or rewrite it - notes are for",
    "  you, and changing one never changes the game.",
    "",
    "  Clear a cell entirely and that setting goes back to its built-in default.",
    "",
    "  Every time the game is built, it prints a list of exactly which settings you",
    "  moved and what they moved from and to. If that list does not mention your",
    "  change, your change did not reach the game - say so.",
    "",
    "THE TABS",
    "",
    "  knobs     Numbers that are meant to be tuned. Sizes, speeds, how often",
    "            something happens, how bright a wall is. Safe to experiment with.",
    "",
    "  geometry  READ ONLY. The shape of the world - one tile is one square metre,",
    "            and the camera angle. These are recorded here so you can see them.",
    "            Editing one deliberately stops the build, because changing them is",
    "            changing what the game IS, not balancing it.",
    "",
    "  names     Every piece of wording the player reads. Rewrite freely.",
    "",
    "  tags      The vocabulary. A tag is a short word that says what something is",
    "            or does, and tags are what tooltips show. Adding a brand new tag",
    "            needs a conversation first, because everything in the game has to",
    "            agree on what tags mean.",
    "",
    "  tiles     The catalogue of ground and walls: what each is called, what it is",
    "            made of, its two colours, and whether you can walk on it.",
    "            'footing' must be one of: walk, ramp, block.",
    "",
    "ADDING A NEW ROW",
    "",
    "  A new row here also has to be added on the other side, in the game's own",
    "  list of defaults, or the build stops. That is deliberate: a dial connected",
    "  to nothing, and a number you cannot reach, are both worse than neither.",
    "  Ask for the row to be added and it will be added in both places at once.",
]


def main():
    force = "--force" in sys.argv
    if OUT.exists() and not force:
        print("docs/crawlers.xlsx already exists. Refusing to overwrite hand edits.")
        print("Pass --force if you really mean to throw them away.")
        return 0
    OUT.parent.mkdir(exist_ok=True)
    defaults = S.load_defaults(ROOT / "src" / "defaults.json")
    S.write_xlsx(defaults, OUT, README)
    rows = sum(len(v) for v in defaults.values())
    print("wrote docs/crawlers.xlsx -- %d settings across %d tabs"
          % (rows, len(defaults)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
