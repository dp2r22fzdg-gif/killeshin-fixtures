#!/usr/bin/env python3
"""
Pull every Killeshin (Gleann Uiseann) fixture, result and league table from the
Laois GAA county board site and write data/killeshin.json for the app.

Killeshin is listed on the county system as "Gleann Uiseann". The county board
publishes one page carrying every grade the club fields, which is what we read.

    pip install requests beautifulsoup4
    python scrape.py

Exits non-zero if it finds nothing, so a scheduled run fails loudly instead of
quietly overwriting good data with an empty file.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

TEAM_URL = ("https://laoisgaa.ie/fixtures-results/team/gleann-uiseann/"
            "6547884c-ea64-5502-8472-8eb26b092437/")
CLUB = "Gleann Uiseann"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "killeshin.json")
HEADERS = {"User-Agent": "KilleshinGAA-Fixtures/1.0 (club fixtures app; contact: Killeshin GAA)"}

MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}

GRADE_ORDER = ["Senior", "Junior", "Adult League", "U20", "U17", "U15", "U13", "Féile"]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def grade_of(comp):
    """Work out which club team a competition belongs to."""
    c = comp.lower()
    for n in ("20", "17", "15", "13"):
        if re.search(r"\bu-?%s\b|under[\s-]*%s\b" % (n, n), c):
            return "U" + n
    if "féile" in c or "feile" in c:
        return "Féile"
    if "junior" in c:
        return "Junior"
    if "acfl" in c or "kelly cup" in c:
        return "Adult League"
    if "senior" in c or "intermediate" in c:
        return "Senior"
    return "Other"


def total(score):
    """GAA score to points: 1-13 -> 16."""
    if not score:
        return None
    m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", score)
    if not m:
        return None
    return int(m.group(1)) * 3 + int(m.group(2))


def tidy_comp(comp):
    """Drop the sponsor prefix so it fits a phone screen."""
    comp = re.sub(r"^(Laois Shopping Centre|Midlands Park Hotel|Laois Hire)\s+", "", comp.strip())
    return re.sub(r"\s+", " ", comp)


def parse_heading_date(text):
    """'Sunday 6th Sep 2026' -> '2026-09-06'."""
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\s+(\d{4})", text)
    if not m:
        return None
    day, mon, year = int(m.group(1)), m.group(2)[:3].title(), int(m.group(3))
    if mon not in MONTHS:
        return None
    return "%04d-%02d-%02d" % (year, MONTHS[mon], day)


def clean(node):
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)) if node else ""


# --------------------------------------------------------------------------
# parsing
# --------------------------------------------------------------------------
SCORE_RE = re.compile(r"^\d+-\d+$")
TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")


def parse_match_block(block, date):
    """
    Read one match. The county theme lays each match out as:
      competition link, home team link, home score, time, away score, away team link,
      then a venue link and a referee name.
    We read it by picking out the pieces rather than by relying on class names,
    so a theme tweak doesn't break the whole thing.
    """
    text_bits = [t.strip() for t in block.stripped_strings if t.strip()]

    teams, comp, venue, ref = [], None, None, None
    for a in block.find_all("a"):
        href = a.get("href", "")
        label = clean(a)
        if not label:
            continue
        if "/team/" in href:
            teams.append(label)
        elif "/venue/" in href:
            venue = label
        elif "/fixtures-results/" in href and comp is None and len(label) > 8:
            comp = label

    # BYE entries have a single team
    if len(teams) < 2:
        return None

    scores = [t for t in text_bits if SCORE_RE.match(t)]
    times = [t for t in text_bits if TIME_RE.match(t)]
    conceded = "CONC" in text_bits

    m = re.search(r"Referee:\s*(.+?)(?:\s{2,}|$)", " ".join(text_bits))
    if m:
        ref = m.group(1).strip()

    home, away = teams[0], teams[1]
    hs = scores[0] if len(scores) >= 2 else None
    as_ = scores[1] if len(scores) >= 2 else None
    time = times[0] if times else "TBC"

    return {
        "date": date,
        "time": time,
        "competition": tidy_comp(comp or ""),
        "grade": grade_of(comp or ""),
        "home": home,
        "away": away,
        "homeScore": hs,
        "awayScore": as_,
        "venue": venue or "TBC",
        "referee": ref or "TBC",
        "conceded": conceded,
        "isHome": home == CLUB,
        "opponent": away if home == CLUB else home,
    }


def parse_page(html):
    soup = BeautifulSoup(html, "html.parser")
    fixtures, results, seen = [], [], set()

    # The page runs two streams: upcoming fixtures, then played results, each
    # introduced by a date heading. Anything with a real score is a result.
    date = None
    for el in soup.find_all(["h2", "h3", "h4", "div", "section", "article", "li"]):
        heading = clean(el)
        if el.name in ("h2", "h3", "h4") and len(heading) < 40:
            got = parse_heading_date(heading)
            if got:
                date = got
            continue

        if not date:
            continue
        if not el.find("a", href=re.compile(r"/team/")):
            continue
        # only take the innermost block holding a match
        if el.find(lambda t: t is not el and t.find("a", href=re.compile(r"/venue/"))):
            continue
        if not el.find("a", href=re.compile(r"/venue/")):
            continue

        m = parse_match_block(el, date)
        if not m:
            continue
        if CLUB not in (m["home"], m["away"]):
            continue

        key = (m["date"], m["time"], m["home"], m["away"])
        if key in seen:
            continue
        seen.add(key)

        ht, at = total(m["homeScore"]), total(m["awayScore"])
        played = (ht is not None and at is not None and (ht > 0 or at > 0)) or m["conceded"]

        if played:
            our = ht if m["isHome"] else at
            their = at if m["isHome"] else ht
            if our is None or their is None:
                continue
            m["homeTotal"], m["awayTotal"] = ht, at
            m["ourTotal"], m["theirTotal"] = our, their
            m["outcome"] = "W" if our > their else ("L" if our < their else "D")
            results.append(m)
        else:
            for k in ("homeScore", "awayScore", "conceded"):
                m.pop(k, None)
            fixtures.append(m)

    return fixtures, results, soup


def parse_tables(soup):
    """League tables. Keep only the ones Killeshin actually appears in."""
    tables = []
    for tbl in soup.find_all("table"):
        head = tbl.find_previous(["h3", "h4"])
        name = clean(head)
        if not name:
            continue
        rows = []
        for tr in tbl.find_all("tr"):
            cells = [clean(td) for td in tr.find_all("td")]
            if len(cells) < 9:
                continue
            try:
                # #, Team, Pts, P, W, L, D, F, A, Pts
                nums = [c for c in cells if re.match(r"^-?\d+$", c)]
                team = next((c for c in cells if not re.match(r"^-?\d+$", c)), None)
                if not team or len(nums) < 8:
                    continue
                _, p, w, l, dr, f, a, pts = nums[0], nums[2], nums[3], nums[4], nums[5], nums[6], nums[7], nums[-1]
                rows.append({"team": team, "p": int(p), "w": int(w), "l": int(l),
                             "d": int(dr), "f": int(f), "a": int(a), "pts": int(pts)})
            except (ValueError, StopIteration, IndexError):
                continue
        if rows and any(r["team"] == CLUB for r in rows):
            tables.append({"competition": tidy_comp(name), "grade": grade_of(name), "rows": rows})
    return tables


# --------------------------------------------------------------------------
def main():
    print("Fetching", TEAM_URL)
    r = requests.get(TEAM_URL, headers=HEADERS, timeout=45)
    r.raise_for_status()

    fixtures, results, soup = parse_page(r.text)
    tables = parse_tables(soup)

    fixtures.sort(key=lambda x: (x["date"], x["time"]))
    results.sort(key=lambda x: (x["date"], x["time"]), reverse=True)

    grades = [g for g in GRADE_ORDER
              if any(m["grade"] == g for m in fixtures + results)]

    dub = timezone(timedelta(hours=1))
    payload = {
        "club": "Killeshin GAA",
        "clubIrish": "CLG Gleann Uiseann",
        "teamName": CLUB,
        "county": "Laois",
        "source": TEAM_URL,
        "updated": datetime.now(dub).isoformat(timespec="seconds"),
        "grades": grades,
        "venueHome": "Killeshin GAA Grounds",
        "ground": "Seamus Hearns Park",
        "fixtures": fixtures,
        "results": results,
        "tables": tables,
    }

    print("  fixtures: %d\n  results:  %d\n  tables:   %d\n  grades:   %s"
          % (len(fixtures), len(results), len(tables), ", ".join(grades) or "none"))

    if not fixtures and not results:
        print("\nNothing scraped. The page layout has probably changed — check "
              "parse_match_block() against the live HTML before trusting this.",
              file=sys.stderr)
        sys.exit(1)

    payload = merge_news(payload)

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print("Wrote", OUT)


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------------------
# News is gathered by news.py into data/news.json. This folds it into the same
# file the app reads, so there is only ever one fetch from the phone.
# ---------------------------------------------------------------------------
def merge_news(payload):
    path = os.path.join(os.path.dirname(OUT) or ".", "news.json")
    try:
        with open(path, encoding="utf-8") as fh:
            blob = json.load(fh)
    except (OSError, ValueError):
        print("  news:     none yet (run news.py)")
        return payload
    payload["news"] = blob.get("news", [])
    payload["newsSources"] = blob.get("sources", [])
    free = sum(1 for n in payload["news"] if n.get("access") != "subscriber")
    print("  news:     %d (free %d, subscriber %d)"
          % (len(payload["news"]), free, len(payload["news"]) - free))
    return payload
