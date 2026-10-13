#!/usr/bin/env python3
"""Turn an Apple Health export (export.zip or export.xml) into an Orbit Health file for
Data -> Apple Health in Orbit. Same day fields and rounding as the sync helper's /health:

  stpi  iPhone steps (iPhone samples only, so another app's steps aren't counted twice)
  kcal, p, c, f  dietary energy (kcal), protein, carbs, fat (g), summed per day
  wt    body weight (kg), the day's last reading
  hp    headphone level (dB), time-weighted energy average;  hpm  minutes listened

Usage:  python3 health-to-orbit.py export.zip [-o orbit-health.json] [--from 2025-01-01]
Streams the XML, so a multi-GB export is fine. Standard library only.
"""
import argparse, json, math, sys, zipfile, datetime
import xml.etree.ElementTree as ET

T = 'HKQuantityTypeIdentifier'
SUM = {T + 'DietaryEnergyConsumed': 'kcal', T + 'DietaryProtein': 'p', T + 'DietaryCarbohydrates': 'c', T + 'DietaryFatTotal': 'f'}
DEC = {'kcal': 0, 'p': 0, 'c': 0, 'f': 0, 'wt': 2, 'stpi': 0, 'hp': 1, 'hpm': 0}  # decimals kept, as the helper
TO_KCAL = {'kcal': 1, 'cal': 1, 'kj': 1 / 4.184, 'j': 1 / 4184}
TO_G = {'g': 1, 'mg': 1e-3, 'kg': 1e3}
TO_KG = {'kg': 1, 'g': 1e-3, 'lb': 0.45359237, 'st': 6.35029318}


def parse_ts(s):  # "2026-10-12 07:31:05 +1000"
    return datetime.datetime.strptime(s, '%Y-%m-%d %H:%M:%S %z')


def open_xml(path):
    if path.lower().endswith('.zip'):
        z = zipfile.ZipFile(path)
        name = next((n for n in z.namelist() if n.endswith('/export.xml') or n == 'export.xml'), None)
        if not name:
            sys.exit('No export.xml inside that zip. In the Health app: profile picture -> Export All Health Data.')
        return z.open(name)
    return open(path, 'rb')


def convert(path, start=None):
    days, sums, hpe, wts = {}, {}, {}, {}
    n = 0
    for _, el in ET.iterparse(open_xml(path), events=('end',)):
        if el.tag != 'Record':
            if el.tag in ('Workout', 'ActivitySummary', 'Correlation'):
                el.clear()
            continue
        n += 1
        t, unit = el.get('type'), (el.get('unit') or '').lower()
        sd, ed = el.get('startDate') or '', el.get('endDate') or ''
        date = sd[:10]
        try:
            v = float(el.get('value'))
        except (TypeError, ValueError):
            el.clear(); continue
        if start and date < start:
            el.clear(); continue
        if t == T + 'StepCount':
            if 'iphone' in (el.get('device') or '').lower() or 'iphone' in (el.get('sourceName') or '').lower():
                sums.setdefault(date, {}).setdefault('stpi', 0.0)
                sums[date]['stpi'] += v
        elif t in SUM:
            k = SUM[t]
            f = TO_KCAL.get(unit) if k == 'kcal' else TO_G.get(unit)
            if f is not None:
                sums.setdefault(date, {}).setdefault(k, 0.0)
                sums[date][k] += v * f
        elif t == T + 'BodyMass':
            f = TO_KG.get(unit)
            if f is not None and (date not in wts or sd > wts[date][0]):
                wts[date] = (sd, v * f)
        elif t == T + 'HeadphoneAudioExposure':
            try:
                d = (parse_ts(ed) - parse_ts(sd)).total_seconds()
            except ValueError:
                d = 0
            if 0 < d <= 86400:
                e = hpe.setdefault(date, [0.0, 0.0])
                e[0] += d * 10 ** (v / 10); e[1] += d
        el.clear()
    for date, o in sums.items():
        days.setdefault(date, {}).update(o)
    for date, (_, w) in wts.items():
        days.setdefault(date, {})['wt'] = w
    for date, (e, sec) in hpe.items():
        if sec >= 60:
            days.setdefault(date, {}).update(hp=10 * math.log10(e / sec), hpm=sec / 60)
    out = {}
    for date in sorted(days):
        x = {k: round(v, DEC[k]) if DEC[k] else int(round(v)) for k, v in days[date].items() if v and v > 0}
        if x:
            out[date] = x
    return out, n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('export', help='export.zip or export.xml from the Health app')
    ap.add_argument('-o', '--out', default='orbit-health.json')
    ap.add_argument('--from', dest='start', help='only days on or after YYYY-MM-DD')
    a = ap.parse_args()
    days, n = convert(a.export, a.start)
    if not days:
        sys.exit('No steps, nutrition, weight or headphone data found.')
    with open(a.out, 'w') as fh:
        json.dump({'app': 'orbit-health', 'v': 1, 'days': days}, fh, separators=(',', ':'))
    keys = sorted({k for d in days.values() for k in d})
    print(f'{len(days)} days ({min(days)} to {max(days)}) from {n:,} records: {", ".join(keys)} -> {a.out}')


if __name__ == '__main__':
    main()
