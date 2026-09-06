#!/usr/bin/env python3
"""
Killeshin GAA — the whole update in one script.

Reads both county boards, gathers local news, and writes the result straight
into index.html. The app carries its own data, so there is no second file to
fall out of step with it.

    pip install requests beautifulsoup4
    python update.py

Nothing is written unless at least one county board is read successfully.
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "index.html")

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IE,en;q=0.9",
}
TRIES, TIMEOUT = 3, 60

BRANCHES = {
    "men": {
        "name": "Men", "team": "Gleann Uiseann", "crest": "crest.png",
        "source": ("https://laoisgaa.ie/fixtures-results/team/gleann-uiseann/"
                   "6547884c-ea64-5502-8472-8eb26b092437/"),
    },
    "ladies": {
        "name": "Ladies", "team": "Killeshin", "crest": "crest-ladies.png",
        "source": ("https://laoislgfa.ie/fixtures-results/team/killeshin/"
                   "6063df22-0a35-9537-87e6-5276dfa17357/"),
    },
}
GROUND = "Seamus Hearns Park"

# Club links shown on the Club tab. Edit here; the app picks them up on the
# next run. "mark" is the letter in the circle.
CLUB_LINKS = [
    {"group": "Support the club", "mark": "\u20ac", "title": "Play the club lotto",
     "note": "Pick your numbers online \u2014 Clubforce",
     "url": "https://killeshingaa.clubforce.com/products/lotto/killeshin-gaa"},
    {"group": "Support the club", "mark": "M", "title": "Pay your membership",
     "note": "Sign in to Foireann, then find Killeshin",
     "url": "https://www.foireann.ie/"},
    {"group": "Follow the club", "mark": "L", "title": "Laois GAA",
     "note": "County board \u2014 men's fixtures and results",
     "url": "https://laoisgaa.ie/"},
    {"group": "Follow the club", "mark": "L", "title": "Laois LGFA",
     "note": "County board \u2014 ladies fixtures and results",
     "url": "https://laoislgfa.ie/"},
]

GRADE_ORDER = ["Senior", "Intermediate", "Junior A", "Junior C", "Junior",
               "Kelly Cup", "Adult League", "Minor",
               "U20", "U17", "U16", "U15", "U14", "U13", "U12", "Féile"]
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}

TEAM_RE = re.compile(r"/team/")
COMP_RE = re.compile(r"/fixtures-results/(?!team/|venue/)")
SCORE_RE = re.compile(r"^\d+-\d+$")
TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")

# ---------------------------------------------------------------- news
NEWS_SOURCES = [
    {"name": "Leinster Express", "access": "free",
     "feeds": ["https://www.leinsterexpress.ie/rss/", "https://www.leinsterexpress.ie/feed/"],
     "pages": ["https://www.leinsterexpress.ie/sport/gaa"]},
    {"name": "Laois Nationalist", "access": "free",
     "feeds": ["https://www.laois-nationalist.ie/feed/"],
     "pages": ["https://www.laois-nationalist.ie/sport/"]},
    {"name": "Carlow Nationalist", "access": "free",
     "feeds": ["https://www.carlow-nationalist.ie/feed/"],
     "pages": ["https://www.carlow-nationalist.ie/sport/gaa/"]},
    {"name": "Laois GAA", "access": "free",
     "feeds": ["https://laoisgaa.ie/feed/"], "pages": ["https://laoisgaa.ie/news/"]},
    {"name": "Laois LGFA", "access": "free",
     "feeds": ["https://laoislgfa.ie/feed/"], "pages": ["https://laoislgfa.ie/news/"]},
    # Premium sports subscription: treat sport as paid, general news as free.
    {"name": "LaoisToday", "access": "mixed", "paid_when": ["/sport/", "/gaa/"],
     "feeds": ["https://www.laoistoday.ie/tag/killeshin/feed/"],
     "pages": ["https://www.laoistoday.ie/tag/killeshin/"]},
]
KILLESHIN = re.compile(r"killeshin|gleann uiseann|seamus hearns", re.I)
NEWS_TAGS = [("Ladies", r"lgfa|ladies"), ("Schools", r"cumann na mbunscol|national school|schools"),
             ("Club", r"fundrais|lotto|agm|committee|development|grant|sponsor"),
             ("Community", r"community|heritage|parish"), ("GAA", r".")]


# ================================================================ helpers
def fetch(url, quiet=False):
    for attempt in range(1, TRIES + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if not quiet:
                print("    attempt %d/%d: %s" % (attempt, TRIES, type(e).__name__))
            if attempt < TRIES:
                time.sleep(attempt * 10)
    return None


def clean(node):
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)) if node else ""


def grade_of(comp, branch="men"):
    """
    Which club team a competition belongs to.

    Each adult team plays a championship and a league, and they need to count
    as one team, not two:
        Senior    - Senior Championship  + ACFL Division 2
        Junior A  - Junior Championship  + ACFL Division 4
        Junior C  - Junior C Championship + ACFL Division 7
    """
    c = (comp or "").lower()

    for n in ("20", "17", "16", "15", "14", "13", "12"):
        if re.search(r"\bu-?%s\b|under[\s-]*%s\b" % (n, n), c):
            return "U" + n
    if "féile" in c or "feile" in c:
        return "Féile"
    if "minor" in c:
        return "Minor"

    if branch == "men":
        if "junior c" in c or re.search(r"acfl division 7\b", c):
            return "Junior C"
        if re.search(r"acfl division 4\b", c):
            return "Junior A"
        if "junior" in c:
            return "Junior A"
        if re.search(r"acfl division 2\b", c) or "senior" in c:
            return "Senior"
        if "kelly cup" in c:
            return "Kelly Cup"
    else:
        # Ladies: first team is Intermediate, second is Junior B.
        if re.search(r"division 2\b", c) or "intermediate" in c:
            return "Intermediate"
        if re.search(r"division 4\b", c) or "junior" in c:
            return "Junior"
        if "senior" in c:
            return "Senior"

    if "division" in c or "league" in c or "cup" in c:
        return "Adult League"
    return "Other"


def total(score):
    if not score or not SCORE_RE.match(score.strip()):
        return None
    g, p = score.split("-")
    return int(g) * 3 + int(p)


def tidy(comp):
    comp = re.sub(r"^(LOETB|Laois Shopping Centre|Midlands Park Hotel|Laois Hire)\s+",
                  "", (comp or "").strip())
    return re.sub(r"\s+", " ", comp)


def heading_date(text):
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\s+(\d{4})", text)
    if not m or m.group(2)[:3].title() not in MONTHS:
        return None
    return "%s-%02d-%02d" % (m.group(3), MONTHS[m.group(2)[:3].title()], int(m.group(1)))


# ================================================================ fixtures
def match_blocks(soup):
    """
    Smallest blocks holding two team links, climbed until the competition
    link is inside too. The tight wrapper round the teams usually excludes
    the competition and venue, which sit in sibling elements.
    """
    seed = [el for el in soup.find_all(True) if len(el.find_all("a", href=TEAM_RE)) >= 2]
    ids = {id(e) for e in seed}
    minimal = [el for el in seed if not any(id(c) in ids for c in el.find_all(True))]

    blocks, seen = [], set()
    for el in minimal:
        node = el
        for _ in range(4):
            if node.find("a", href=COMP_RE) or node.parent is None:
                break
            node = node.parent
        if id(node) not in seen:
            seen.add(id(node))
            blocks.append(node)
    return blocks


def parse_match(block, date, club, branch):
    bits = [t.strip() for t in block.stripped_strings if t.strip()]
    teams, comp, venue, ref, conceder = [], None, None, None, None

    for a in block.find_all("a"):
        href, text = a.get("href", ""), clean(a)
        if not text:
            continue
        if "/team/" in href:
            name = re.sub(r"\s*\(C\)\s*$", "", text)
            if name != text:
                conceder = name
            teams.append(name)
        elif "/venue/" in href:
            venue = text
        elif COMP_RE.search(href) and comp is None and len(text) > 8:
            comp = text

    if len(teams) < 2:
        return None

    if not venue:                      # "Venue: TBC" carries no venue link
        m = re.search(r"Venue:\s*([^\n]{2,60})", " ".join(bits))
        venue = m.group(1).strip() if m else "TBC"

    m = re.search(r"Referee:\s*(.+?)(?:\s{2,}|$)", " ".join(bits))
    scores = [t for t in bits if SCORE_RE.match(t)]
    times = [t for t in bits if TIME_RE.match(t)]
    home, away = teams[0], teams[1]

    return {"date": date, "time": times[0] if times else "TBC",
            "competition": tidy(comp), "grade": grade_of(comp, branch), "branch": branch,
            "home": home, "away": away,
            "homeScore": scores[0] if len(scores) >= 2 else None,
            "awayScore": scores[1] if len(scores) >= 2 else None,
            "venue": venue, "referee": m.group(1).strip() if m else "TBC",
            "conceded": "CONC" in bits, "conceder": conceder,
            "isHome": home == club, "opponent": away if home == club else home}


def parse_board(html, club, branch):
    soup = BeautifulSoup(html, "html.parser")
    fixtures, results, seen, nodate = [], [], set(), 0

    for block in match_blocks(soup):
        date = None
        for prev in block.find_all_previous(["h1", "h2", "h3", "h4", "h5"]):
            date = heading_date(clean(prev))
            if date:
                break
        if not date:
            nodate += 1
            continue

        m = parse_match(block, date, club, branch)
        if not m or club not in (m["home"], m["away"]):
            continue
        key = (m["date"], m["time"], m["home"], m["away"])
        if key in seen:
            continue
        seen.add(key)

        ht, at = total(m["homeScore"]), total(m["awayScore"])
        if m["conceded"] and (ht is None or at is None):
            m.update({"homeScore": "\u2014", "awayScore": "\u2014", "homeTotal": 0,
                      "awayTotal": 0, "ourTotal": 0, "theirTotal": 0,
                      "outcome": "L" if m["conceder"] == club else "W",
                      "competition": m["competition"] + " (walkover)"})
            results.append(m)
        elif ht is not None and at is not None and (ht > 0 or at > 0):
            our, their = (ht, at) if m["isHome"] else (at, ht)
            m.update({"homeTotal": ht, "awayTotal": at, "ourTotal": our, "theirTotal": their,
                      "outcome": "W" if our > their else ("L" if our < their else "D")})
            results.append(m)
        else:
            for k in ("homeScore", "awayScore"):
                m.pop(k, None)
            fixtures.append(m)
        m.pop("conceded", None)
        m.pop("conceder", None)

    print("    blocks %d, Killeshin %d%s" % (
        len(match_blocks(soup)), len(fixtures) + len(results),
        ", %d without a date heading" % nodate if nodate else ""))
    return fixtures, results, soup


def parse_tables(soup, club, branch):
    out = []
    for tbl in soup.find_all("table"):
        name = clean(tbl.find_previous(["h3", "h4"]))
        if not name:
            continue
        rows = []
        for tr in tbl.find_all("tr"):
            cells = [clean(td) for td in tr.find_all("td")]
            if len(cells) < 9:
                continue
            nums = [c for c in cells if re.match(r"^-?\d+$", c)]
            team = next((c for c in cells if not re.match(r"^-?\d+$", c)), None)
            if not team or len(nums) < 8:
                continue
            try:
                rows.append({"team": team, "p": int(nums[2]), "w": int(nums[3]),
                             "l": int(nums[4]), "d": int(nums[5]), "f": int(nums[6]),
                             "a": int(nums[7]), "pts": int(nums[-1])})
            except (ValueError, IndexError):
                continue
        if rows and any(r["team"] == club for r in rows):
            out.append({"competition": tidy(name), "grade": grade_of(name, branch),
                        "branch": branch, "rows": rows})
    return out


# ================================================================ news
def read_feed(url):
    r = fetch(url, quiet=True)
    if not r:
        return []
    try:
        root = ET.fromstring(r.content)
    except ET.ParseError:
        return []
    out = []
    for it in root.iter("item"):
        t, l = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
        if t and l:
            out.append((t, l, norm_date(it.findtext("pubDate"))))
    if not out:
        ns = "{http://www.w3.org/2005/Atom}"
        for it in root.iter(ns + "entry"):
            t = (it.findtext(ns + "title") or "").strip()
            ln = it.find(ns + "link")
            if t and ln is not None:
                out.append((t, ln.get("href"), norm_date(it.findtext(ns + "updated"))))
    return out


def read_page(url):
    r = fetch(url, quiet=True)
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out, seen = [], set()
    for h in soup.find_all(["h1", "h2", "h3", "h4"]):
        a = h.find("a", href=True) or (h.parent.find("a", href=True) if h.parent else None)
        if not a:
            continue
        title = re.sub(r"\s+", " ", h.get_text(" ", strip=True))
        link = requests.compat.urljoin(url, a["href"])
        if len(title) < 20 or link in seen:
            continue
        seen.add(link)
        m = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", link)
        out.append((title, link, "%s-%s-%s" % m.groups() if m else None))
    return out


def norm_date(raw):
    if not raw:
        return None
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
                "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", raw)
    return m.group(0) if m else None


def gather_news(today):
    stories, seen = [], set()
    for src in NEWS_SOURCES:
        items = []
        for f in src.get("feeds", []):
            items = read_feed(f)
            if items:
                break
        if not items:
            for p in src.get("pages", []):
                items = read_page(p)
                if items:
                    break
        kept = 0
        for title, link, date in items:
            if not KILLESHIN.search(title) and not KILLESHIN.search(link):
                continue
            key = re.sub(r"[^a-z0-9]", "", title.lower())[:70]
            if key in seen:
                continue
            seen.add(key)
            access = src["access"]
            if access == "mixed":
                access = ("subscriber" if any(h in link.lower() for h in src["paid_when"])
                          else "free")
            tag = next(n for n, pat in NEWS_TAGS if re.search(pat, title, re.I))
            stories.append({"date": date or today, "title": title, "source": src["name"],
                            "tag": tag, "access": access, "url": link})
            kept += 1
        print("    %-19s %d" % (src["name"], kept))
    stories.sort(key=lambda s: (s["date"], s["access"] == "free"), reverse=True)
    return stories[:30]


# ================================================================ calendars
def write_calendars(fixtures, today):
    feeds = {"all": ("All fixtures", lambda m: True),
             "men": ("Men's", lambda m: m["branch"] == "men"),
             "ladies": ("Ladies", lambda m: m["branch"] == "ladies"),
             "home": ("Home games", lambda m: "Killeshin" in m["venue"])}
    upcoming = sorted([f for f in fixtures if f["date"] >= today],
                      key=lambda x: (x["date"], x["time"]))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    def esc(t):
        return re.sub(r"([,;\\])", r"\\\1", str(t or "")).replace("\n", "\\n")

    def fold(line):
        out = []
        while len(line.encode()) > 73:
            cut = 73
            while len(line[:cut].encode()) > 73:
                cut -= 1
            out.append(line[:cut])
            line = " " + line[cut:]
        out.append(line)
        return out

    for key, (label, keep) in feeds.items():
        sel = [m for m in upcoming if keep(m)]
        L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Killeshin GAA//EN",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             "X-WR-CALNAME:Killeshin GAA \u2014 " + label,
             "X-WR-TIMEZONE:Europe/Dublin", "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
             "X-PUBLISHED-TTL:PT6H"]
        for i, m in enumerate(sel):
            day = m["date"].replace("-", "")
            timed = bool(TIME_RE.match(m["time"]))
            who = ("Killeshin v " + m["opponent"]) if m["isHome"] else (m["opponent"] + " v Killeshin")
            L += ["BEGIN:VEVENT",
                  "UID:killeshin-%s-%s-%d@killeshingaa" % (m["branch"], m["date"], i),
                  "DTSTAMP:" + stamp]
            if timed:
                hh, mm = (int(x) for x in m["time"].split(":"))
                end = hh * 60 + mm + 90
                L += ["DTSTART;TZID=Europe/Dublin:%sT%02d%02d00" % (day, hh, mm),
                      "DTEND;TZID=Europe/Dublin:%sT%02d%02d00" % (day, (end // 60) % 24, end % 60)]
            else:
                L += ["DTSTART;VALUE=DATE:" + day]
            L += fold("SUMMARY:%s (%s %s)%s" % (
                esc(who), "Ladies" if m["branch"] == "ladies" else "Men's",
                esc(m["grade"]), "" if timed else " \u2014 time TBC"))
            L += fold("LOCATION:" + esc(m["venue"]))
            L += fold("DESCRIPTION:" + esc(m["competition"]))
            if timed:
                L += ["BEGIN:VALARM", "TRIGGER:-PT120M", "ACTION:DISPLAY",
                      "DESCRIPTION:" + esc(who) + " today", "END:VALARM"]
            L.append("END:VEVENT")
        L.append("END:VCALENDAR")
        with open(os.path.join(HERE, "killeshin-%s.ics" % key), "w",
                  encoding="utf-8", newline="") as fh:
            fh.write("\r\n".join(L) + "\r\n")
        print("    killeshin-%-6s %2d events" % (key + ".ics", len(sel)))


# ================================================================ write
def write_app(payload):
    """Replace the data block inside index.html, leaving the app untouched."""
    with open(APP, encoding="utf-8") as fh:
        html = fh.read()

    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    pattern = re.compile(
        r'(<script id="seed" type="application/json">).*?(</script>)', re.S)
    if not pattern.search(html):
        print("Could not find the data block in index.html.", file=sys.stderr)
        sys.exit(1)

    stamped = pattern.sub(lambda m: m.group(1) + blob + m.group(2), html, count=1)
    stamped = re.sub(r"Build [^<]*",
                     "Build " + datetime.now().strftime("%Y-%m-%d %H:%M"), stamped, count=1)

    # Prove the result is still readable before replacing a working file.
    check = pattern.search(stamped).group(0)
    json.loads(check.split(">", 1)[1].rsplit("<", 1)[0].replace("<\\/", "</"))

    with open(APP, "w", encoding="utf-8") as fh:
        fh.write(stamped)
    print("Wrote index.html (%d bytes)" % len(stamped))


def main():
    dub = timezone(timedelta(hours=1))
    now = datetime.now(dub)
    today = now.strftime("%Y-%m-%d")

    fixtures, results, tables, failed = [], [], [], []
    for branch, cfg in BRANCHES.items():
        print("%s \u2014 %s" % (cfg["name"], cfg["source"].split("/")[2]))
        r = fetch(cfg["source"])
        if r is None:
            print("    unreachable")
            failed.append(branch)
            continue
        fx, rs, soup = parse_board(r.text, cfg["team"], branch)
        tb = parse_tables(soup, cfg["team"], branch)
        print("    fixtures %d, results %d, tables %d" % (len(fx), len(rs), len(tb)))
        if not fx and not rs:
            failed.append(branch)
        fixtures += fx
        results += rs
        tables += tb

    if len(failed) == len(BRANCHES):
        print("\nNeither board could be read. index.html left as it was.", file=sys.stderr)
        sys.exit(1)

    if failed:
        # Keep the working branch's data rather than losing it with the other.
        try:
            with open(APP, encoding="utf-8") as fh:
                prev = json.loads(re.search(
                    r'<script id="seed" type="application/json">(.*?)</script>',
                    fh.read(), re.S).group(1).replace("<\\/", "</"))
            for b in failed:
                for key, bucket in (("fixtures", fixtures), ("results", results),
                                    ("tables", tables)):
                    bucket += [x for x in prev.get(key, []) if x.get("branch") == b]
                print("  %s: kept previous entries" % b)
        except Exception:
            print("  could not recover previous data for %s" % ", ".join(failed))

    print("News")
    news = gather_news(today)
    free = sum(1 for n in news if n["access"] == "free")
    print("    %d stories (free %d, subscriber %d)" % (len(news), free, len(news) - free))

    fixtures.sort(key=lambda x: (x["date"], x["time"]))
    results.sort(key=lambda x: (x["date"], x["time"]), reverse=True)
    items = fixtures + results + tables

    payload = {
        "club": "Killeshin GAA", "county": "Laois", "ground": GROUND,
        "branches": BRANCHES,
        "gradesBy": {b: [g for g in GRADE_ORDER
                         if any(m["grade"] == g for m in items if m["branch"] == b)]
                     for b in BRANCHES},
        "source": BRANCHES["men"]["source"],
        "updated": now.isoformat(timespec="seconds"),
        "fixtures": fixtures, "results": results, "tables": tables, "news": news,
        "club": {"links": CLUB_LINKS},
    }

    print("Calendars")
    write_calendars(fixtures, today)
    write_app(payload)
    print("\nDone \u2014 %d fixtures, %d results, %d tables, %d stories"
          % (len(fixtures), len(results), len(tables), len(news)))


if __name__ == "__main__":
    main()
