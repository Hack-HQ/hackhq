#!/usr/bin/env python3
"""
generate_banner.py — render a live, animated stats banner SVG that is unique
to this repo. It parses the Hackathons table in README.md (the source of truth
for what is displayed) and writes assets/hackathons-banner.svg.

Stats shown:
  - total hackathons tracked
  - open / opens-soon / closing-soon counts
  - in-person / virtual / hybrid format mix (animated stacked bar)
"""

import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

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
    headers = [h.strip() for h in lines[0].split("|")[1:-1]]
    rows = []
    for line in lines[1:]:
        if re.match(r"^\|\s*-+", line.strip()):
            continue
        cells = [c.strip() for c in line.split("|")[1:-1]]
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


def svg(s):
    now = datetime.now(tz=PST).strftime("%b %d, %Y")
    W, H = 840, 230
    bar_x, bar_y, bar_w, bar_h = 40, 168, 760, 16
    segs = bar_segments(s, bar_w)

    seg_rects = []
    seg_anims = []
    rx = bar_x
    for i, (x, w, color, label, count) in enumerate(segs):
        seg_rects.append(
            f'<rect x="{bar_x + x:.1f}" y="{bar_y}" width="{w:.1f}" height="{bar_h}" '
            f'fill="{color}" rx="3"><title>{label}: {count}</title>'
            f'<animate attributeName="width" from="0" to="{w:.1f}" '
            f'begin="{0.2 + i*0.25}s" dur="0.7s" fill="freeze" '
            f'calcMode="spline" keySplines="0.2 0.8 0.2 1"/></rect>'
        )

    # legend
    legend_items = [
        ("#3fb950", "In-Person", s["in_person"]),
        ("#58a6ff", "Virtual", s["virtual"]),
        ("#bc8cff", "Hybrid", s["hybrid"]),
    ]
    legend = []
    lx = bar_x
    for color, label, count in legend_items:
        legend.append(
            f'<circle cx="{lx+6}" cy="206" r="5" fill="{color}"/>'
            f'<text x="{lx+18}" y="210" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" '
            f'font-size="13" fill="#8b949e">{label} <tspan fill="#c9d1d9" font-weight="700">{count}</tspan></text>'
        )
        lx += 30 + (len(label) + len(str(count))) * 8 + 24

    def stat_block(x, value, label, color):
        return (
            f'<text x="{x}" y="118" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" '
            f'font-size="40" font-weight="800" fill="{color}">{value}</text>'
            f'<text x="{x}" y="140" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" '
            f'font-size="13" fill="#8b949e" letter-spacing="1">{label}</text>'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Hackathons live stats">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/>
      <stop offset="1" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3fb950" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#3fb950" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#3fb950" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect x="1" y="1" width="{W-2}" height="{H-2}" rx="14" fill="url(#bg)" stroke="#30363d" stroke-width="1.5"/>

  <!-- top accent sweep -->
  <rect x="14" y="0" width="200" height="3" fill="url(#sweep)" rx="2">
    <animate attributeName="x" from="-200" to="{W}" dur="3.5s" repeatCount="indefinite"/>
  </rect>

  <!-- title -->
  <text x="40" y="50" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="13" fill="#8b949e" letter-spacing="3">$ HACKATHONS --status</text>

  <!-- live pill -->
  <g>
    <rect x="710" y="34" width="90" height="24" rx="12" fill="#3fb95022" stroke="#3fb95055"/>
    <circle cx="726" cy="46" r="4" fill="#3fb950">
      <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite"/>
    </circle>
    <text x="737" y="50" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="12" font-weight="700" fill="#3fb950">LIVE</text>
  </g>

  <line x1="40" y1="66" x2="800" y2="66" stroke="#21262d" stroke-width="1"/>

  <!-- stat blocks -->
  {stat_block(40, s["total"], "TRACKED", "#c9d1d9")}
  {stat_block(230, s["open"], "OPEN", "#3fb950")}
  {stat_block(420, s["opens_soon"], "OPENS SOON", "#d29922")}
  {stat_block(640, s["closing"], "CLOSING SOON", "#f85149")}

  <!-- format bar -->
  <rect x="{bar_x}" y="{bar_y}" width="{bar_w}" height="{bar_h}" rx="3" fill="#21262d"/>
  {''.join(seg_rects)}

  {''.join(legend)}

  <text x="800" y="210" text-anchor="end" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="12" fill="#6e7681">updated {now}</text>
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
