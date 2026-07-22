#!/usr/bin/env python3
"""Resolve a conflicted merge of listings.json / geocodes.json by union.

Listing PRs only ever ADD — a new hackathon, a new city. Neither side of a merge
deletes. So when git reports a conflict in these two files the answer is always
"keep everything from both sides", and doing it by hand (or picking a side in
GitHub's web editor) is how a hackathon silently goes missing.

Usage, from inside a conflicted merge:

    python .github/scripts/resolve_data_merge.py            # resolve both files
    python .github/scripts/resolve_data_merge.py --check    # report, change nothing

For every record present on both sides, `theirs` (the branch being merged in,
normally main) wins, because main is authoritative for records it already has.
Records that exist on only one side are always kept.

Exits non-zero if a conflict cannot be resolved safely, so a caller can stop
rather than commit a half-merged file.
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LISTINGS = os.path.join(HERE, "listings.json")
GEOCODES = os.path.join(HERE, "geocodes.json")

# git's numbered merge stages for a conflicted path
BASE, OURS, THEIRS = 1, 2, 3


def _stage(stage, path):
    """Return the parsed content of one merge stage, or None if absent."""
    rel = os.path.relpath(path, os.path.join(HERE, "..", ".."))
    proc = subprocess.run(
        ["git", "show", f":{stage}:{rel}"],
        capture_output=True,
        text=True,
        cwd=os.path.join(HERE, "..", ".."),
    )
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise ValueError(f"stage {stage} of {rel} is not valid JSON: {e}") from e


def _write(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def merge_listings(ours, theirs):
    """Union two listing arrays by id. Returns (merged, added_from_ours)."""
    by_id = {l["id"]: l for l in theirs}
    added = [l for l in ours if l["id"] not in by_id]
    for l in added:
        by_id[l["id"]] = l
    return list(by_id.values()), added


def merge_geocodes(ours, theirs):
    """Union two geocode tables. Returns (merged, added_keys)."""
    merged = json.loads(json.dumps(theirs))  # deep copy
    added = []
    for key, coords in ours.get("coordinates", {}).items():
        if key not in merged["coordinates"]:
            merged["coordinates"][key] = coords
            added.append(key)
    merged["coordinates"] = dict(sorted(merged["coordinates"].items()))
    for entry in ours.get("unmappable", []):
        if entry not in merged.get("unmappable", []):
            merged.setdefault("unmappable", []).append(entry)
    return merged, added


def resolve(check_only=False):
    import util  # imported here so the module works standalone

    resolved, problems = [], []

    ours, theirs = _stage(OURS, LISTINGS), _stage(THEIRS, LISTINGS)
    if ours is not None and theirs is not None:
        merged, added = merge_listings(ours, theirs)
        # A union can only grow; anything else means we misread the stages.
        if len(merged) < max(len(ours), len(theirs)):
            problems.append(
                f"listings.json: union produced {len(merged)}, fewer than "
                f"ours={len(ours)} / theirs={len(theirs)}"
            )
        else:
            if not check_only:
                _write(LISTINGS, util.listings_file_order(merged))
            resolved.append(
                f"listings.json: ours={len(ours)} theirs={len(theirs)} "
                f"-> {len(merged)} (+{len(added)} kept from this branch)"
            )

    ours, theirs = _stage(OURS, GEOCODES), _stage(THEIRS, GEOCODES)
    if ours is not None and theirs is not None:
        merged, added = merge_geocodes(ours, theirs)
        if not check_only:
            _write(GEOCODES, merged)
        resolved.append(
            f"geocodes.json: -> {len(merged['coordinates'])} cities "
            f"(+{len(added)} kept from this branch)"
        )

    return resolved, problems


def main():
    check_only = "--check" in sys.argv
    sys.path.insert(0, HERE)
    try:
        resolved, problems = resolve(check_only)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    if not resolved and not problems:
        print("No conflicted listings.json/geocodes.json stages found.")
        print("(Run this from inside a conflicted merge.)")
        return 0

    for line in resolved:
        print(("would resolve " if check_only else "resolved ") + line)
    for p in problems:
        print(f"UNRESOLVED {p}", file=sys.stderr)

    if problems:
        return 1
    if not check_only and resolved:
        print("\nNow: git add .github/scripts/listings.json .github/scripts/geocodes.json")
        print("Then regenerate the tables: python .github/scripts/update_readmes.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
