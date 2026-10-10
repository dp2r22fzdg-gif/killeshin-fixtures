#!/usr/bin/env python3
"""Copy Killeshin home fixtures from the website's data.json into the pitch bookings app.

Runs in GitHub Actions straight after update.py. For every home fixture with a
throw-in time it books the pitch as a match. Any training on those halves is
moved, and the trainer is emailed automatically (with LATE CHANGE in the
subject if the match is within 72 hours).

If the county board moves a fixture, the booking moves with it. If a fixture
disappears, its booking is taken off the pitch.

Needs two GitHub secrets: SUPABASE_URL and SUPABASE_SERVICE_KEY.
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

# ---------------- Club settings: edit these ----------------
# Which halves each team's home matches use: (branch, grade) -> halves
PITCH_FOR_GRADE = {
    ("ladies", "U16"): [1, 2],   # Old Pitch (Sonny Byrne Park)
    ("ladies", "U14"): [1, 2],   # Old Pitch (Sonny Byrne Park)
    ("men", "U13"):    [3, 4],   # Juvenile Pitch
}
DEFAULT_PITCH = [5, 6]           # everyone else: Senior Pitch
BEFORE_MIN = 45                  # pitch held from 45 min before throw-in (warm-up)
AFTER_MIN = 135                  # ...until 2h15 after throw-in
# ------------------------------------------------------------

TZ = ZoneInfo("Europe/Dublin")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def rpc(name, payload):
    headers = {"apikey": KEY, "Content-Type": "application/json"}
    if not KEY.startswith("sb_secret_"):          # older JWT-style service key
        headers["Authorization"] = "Bearer " + KEY
    req = urllib.request.Request(f"{URL}/rest/v1/rpc/{name}",
                                 data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode() or "null")


def pitch_for(f, ground):
    """Which halves a fixture needs, or None if it isn't at home."""
    v = (f.get("venue") or "").strip()
    low = v.lower()
    known = bool(v) and not re.match(r"(?i)^tbc\b", v)
    home = ("killeshin" in low or "hearns" in low or "sonny byrne" in low
            or (ground and ground.lower() in low)
            or (f.get("isHome") and not known))      # drawn at home, ground not named yet
    if not home:
        return None                                  # away, or a neutral county ground
    return PITCH_FOR_GRADE.get((f.get("branch", "men"), f.get("grade", "")), DEFAULT_PITCH)


def window(date_s, time_s):
    throw = dt.datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M")
    start, end = throw - dt.timedelta(minutes=BEFORE_MIN), throw + dt.timedelta(minutes=AFTER_MIN)
    s = "00:00" if start.date() < throw.date() else start.strftime("%H:%M")
    e = "23:59" if end.date() > throw.date() else end.strftime("%H:%M")
    return s, e


def main():
    if not URL or not KEY:
        print("Pitch bookings sync skipped: SUPABASE_URL / SUPABASE_SERVICE_KEY secrets not set.")
        return
    path = sys.argv[1] if len(sys.argv) > 1 else "data.json"
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    ground = data.get("ground", "")
    today = dt.datetime.now(TZ).date().isoformat()
    keys, counts = [], {}

    for f in data.get("fixtures", []):
        if f.get("date", "") < today or not re.match(r"^\d{1,2}:\d{2}$", f.get("time", "")):
            continue                                  # past, or throw-in not set yet
        halves = pitch_for(f, ground)
        if not halves:
            continue
        branch, grade, opp = f.get("branch", "men"), f.get("grade", ""), f.get("opponent", "")
        key = "|".join([branch, grade, f.get("competition", ""), opp]).lower()
        title = f"{'Ladies ' if branch == 'ladies' else ''}{grade} v {opp}".strip()
        start, end = window(f["date"], f["time"].zfill(5))
        keys.append(key)
        try:
            res = rpc("sync_fixture", {"p_key": key, "p_day": f["date"], "p_start": start, "p_end": end,
                                       "p_halves": sorted(halves), "p_title": title})
        except urllib.error.HTTPError as e:
            print(f"  ! {title} {f['date']}: {e.code} {e.read().decode()[:200]}")
            continue
        except Exception as e:                       # network blip: try again next run
            print(f"  ! {title} {f['date']}: {e}")
            continue
        status = (res or {}).get("status", "?")
        counts[status] = counts.get(status, 0) + 1
        if status != "unchanged":
            extra = f" ({res.get('moved')} training moved)" if res.get("moved") else ""
            extra += f" - {res['reason']}" if res.get("reason") else ""
            print(f"  {status}: {title}, {f['date']} {start}-{end}{extra}")

    try:
        gone = rpc("sync_cleanup", {"p_keys": keys})
        if gone:
            print(f"  removed {gone} fixture(s) no longer on the website")
    except Exception as e:
        print(f"  ! cleanup: {e}")

    print("Pitch bookings sync:", ", ".join(f"{v} {k}" for k, v in counts.items()) or "no home fixtures")


if __name__ == "__main__":
    main()
