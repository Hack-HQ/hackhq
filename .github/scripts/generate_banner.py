#!/usr/bin/env python3
"""
generate_banner.py — render a live, animated stats banner SVG that is unique
to this repo. It parses the Hackathons table in README.md (the source of truth
for what is displayed) and writes assets/hackathons-banner.svg.

Stats shown:
  - total hackathons tracked
  - open / opens-soon / closing-soon counts
  - in-person / virtual / hybrid format mix (animated stacked bar)

NOTE FOR WORKFLOW AUTHORS: the banner carries an "as of {today}" date, so this
script rewrites the SVG on *every* run — including days when the README table
is byte-for-byte unchanged. Any workflow that regenerates the banner must
therefore gate its commit on what is staged (`git add ...` then
`git diff --cached --quiet`), never on the README diff alone: a README-only gate
throws the fresh banner away and lets the committed date go stale (#112).
test_workflows.py enforces this.
"""

import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import util

PST = ZoneInfo("America/Los_Angeles")
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
README = os.path.join(ROOT, "README.md")
OUT = os.path.join(ROOT, "assets", "hackathons-banner.svg")

TABLE_RE = re.compile(
    r"<!-- HACKATHONS_TABLE_START -->(.*?)<!-- HACKATHONS_TABLE_END -->", re.DOTALL
)


def parse_rows():
    with open(README, "r") as f:
        content = f.read()
    m = TABLE_RE.search(content)
    if not m:
        return []
    lines = [l for l in m.group(1).split("\n") if l.strip().startswith("|")]
    if len(lines) < 3:
        return []
    headers = util.split_table_cells(lines[0])
    rows = []
    for line in lines[1:]:
        if re.match(r"^\|\s*-+", line.strip()):
            continue
        cells = util.split_table_cells(line)
        if len(cells) != len(headers):
            continue
        rows.append(dict(zip(headers, cells)))
    return rows


def compute_stats(rows):
    stats = {
        "total": len(rows),
        "open": 0,
        "opens_soon": 0,
        "closing": 0,
        "in_person": 0,
        "virtual": 0,
        "hybrid": 0,
    }
    for r in rows:
        status = r.get("Status", "")
        if "CLOSING SOON" in status:
            stats["closing"] += 1
        elif "OPENS SOON" in status:
            stats["opens_soon"] += 1
        elif "OPEN" in status:
            stats["open"] += 1
        fmt = r.get("Format", "").lower()
        if "hybrid" in fmt:
            stats["hybrid"] += 1
        elif "virtual" in fmt or "online" in fmt:
            stats["virtual"] += 1
        elif "person" in fmt:
            stats["in_person"] += 1
    return stats


def bar_segments(s, width):
    """Return list of (x, w, color, label) for the format stacked bar."""
    total = max(s["in_person"] + s["virtual"] + s["hybrid"], 1)
    parts = [
        ("in_person", "#3fb950", "In-Person"),
        ("virtual", "#58a6ff", "Virtual"),
        ("hybrid", "#bc8cff", "Hybrid"),
    ]
    segs = []
    x = 0.0
    for key, color, label in parts:
        w = width * (s[key] / total)
        if w > 0:
            segs.append((x, w, color, label, s[key]))
        x += w
    return segs


def format_banner_date(dt: datetime) -> str:
    """Readable banner date without platform-specific strftime directives."""
    return f"{dt.strftime('%B')} {dt.day}, {dt.strftime('%Y')}"


def svg(s, today=None):
    if today is None:
        today = datetime.now(tz=PST)
    now = format_banner_date(today)
    W, H = 760, 150
    pad = 28
    font = "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
    bar_x, bar_y, bar_w, bar_h = pad, 104, W - pad * 2, 8
    segs = bar_segments(s, bar_w)

    seg_rects = []
    for x, w, color, label, count in segs:
        seg_rects.append(
            f'<rect x="{bar_x + x:.1f}" y="{bar_y}" width="{w:.1f}" height="{bar_h}" '
            f'fill="{color}"><title>{label}: {count}</title></rect>'
        )

    # legend
    legend_items = [
        ("#57ab5a", "In-person", s["in_person"]),
        ("#539bf5", "Virtual", s["virtual"]),
        ("#b083f0", "Hybrid", s["hybrid"]),
    ]
    legend = []
    lx = pad
    for color, label, count in legend_items:
        legend.append(
            f'<circle cx="{lx+4}" cy="134" r="4" fill="{color}"/>'
            f'<text x="{lx+15}" y="138" font-family="{font}" font-size="12.5" fill="#9198a1">'
            f'{label} {count}</text>'
        )
        lx += 28 + len(label) * 7.2 + len(str(count)) * 8 + 22

    def stat(x, value, label, color):
        return (
            f'<text x="{x}" y="74" font-family="{font}" font-size="30" '
            f'font-weight="600" fill="{color}">{value}</text>'
            f'<text x="{x}" y="92" font-family="{font}" font-size="12.5" fill="#9198a1">{label}</text>'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Hackathon stats">
  <rect x="0.5" y="0.5" width="{W-1}" height="{H-1}" rx="10" fill="#0d1117" stroke="#21262d"/>

  <text x="{pad}" y="34" font-family="{font}" font-size="14" font-weight="600" fill="#e6edf3">HackHQ</text>
  <text x="{W-pad}" y="34" text-anchor="end" font-family="{font}" font-size="12.5" fill="#6e7681">as of {now}</text>

  {stat(pad, s["total"], "tracked", "#e6edf3")}
  {stat(210, s["open"], "open", "#57ab5a")}
  {stat(370, s["opens_soon"], "opens soon", "#daaa3f")}
  {stat(560, s["closing"], "closing soon", "#e5534b")}

  <rect x="{bar_x}" y="{bar_y}" width="{bar_w}" height="{bar_h}" rx="4" fill="#21262d"/>
  {''.join(seg_rects)}

  {''.join(legend)}
</svg>
'''


def main():
    rows = parse_rows()
    stats = compute_stats(rows)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write(svg(stats))
    print(f"Wrote banner: {stats['total']} tracked "
          f"({stats['open']} open, {stats['opens_soon']} opens-soon, {stats['closing']} closing) "
          f"[{stats['in_person']} in-person / {stats['virtual']} virtual / {stats['hybrid']} hybrid]")


if __name__ == "__main__":
    main()
