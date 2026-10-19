"""Analyse a Peakhour JSON export.

Usage:
    .venv/bin/python analysis/analyze.py path/to/peakhour-export.json [--project "CFA Level I"] [--charts]

Prints totals and the patterns behind your best (and worst) sessions.
With --charts, PNGs are written to analysis/out/.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
DAYPARTS = [(0, "Nacht 0–5"), (5, "Früh 5–9"), (9, "Vormittag 9–12"), (12, "Nachmittag 12–17"), (17, "Abend 17–21"), (21, "Spät 21–24")]
LENGTHS = [0, 30, 60, 90, 120, 10_000]
LENGTH_LABELS = ["< 30 min", "30–60 min", "1–1,5 h", "1,5–2 h", "> 2 h"]


def load(path: Path) -> pd.DataFrame:
    data = json.loads(path.read_text(encoding="utf-8"))
    df = pd.DataFrame(data["sessions"])
    if df.empty:
        return df
    # keep each session's local wall-clock time (the offset is in the ISO string)
    df["start"] = pd.to_datetime(df["start"].str.slice(0, 19))
    df["end"] = pd.to_datetime(df["end"].str.slice(0, 19))
    df["hours"] = df["durationMin"] / 60
    df["weekday_idx"] = df["start"].dt.weekday
    df["hour"] = df["start"].dt.hour
    bounds = [b for b, _ in DAYPARTS] + [24]
    df["daypart"] = pd.cut(df["hour"], bins=bounds, right=False, labels=[label for _, label in DAYPARTS])
    df["length"] = pd.cut(df["durationMin"], bins=LENGTHS, right=False, labels=LENGTH_LABELS)
    df["week"] = df["start"].dt.to_period("W").dt.start_time.dt.date
    return df


def weighted(group: pd.DataFrame) -> pd.Series:
    """Hours, session count and duration-weighted mean rating."""
    h = group["hours"].sum()
    return pd.Series(
        {
            "hours": round(h, 1),
            "sessions": len(group),
            "rating": round((group["rating"] * group["hours"]).sum() / h, 1) if h else float("nan"),
        }
    )


def summarize(groups) -> pd.DataFrame:
    return groups.apply(weighted, include_groups=False).astype({"sessions": "Int64"})


def section(title: str) -> None:
    print(f"\n── {title} " + "─" * max(0, 60 - len(title)))


def report(df: pd.DataFrame) -> None:
    span = (df["end"].max() - df["start"].min()).days + 1
    section("Überblick")
    print(f"{len(df)} Sessions · {df['hours'].sum():.1f} h · {span} Tage · Ø Bewertung {(df['rating'] * df['hours']).sum() / df['hours'].sum():.0f}/100")

    section("Stunden pro Projekt")
    print(summarize(df.groupby("project")).sort_values("hours", ascending=False).to_string())

    section("Stunden pro Woche")
    print(df.pivot_table(index="week", columns="project", values="hours", aggfunc="sum", fill_value=0).round(1).to_string())

    by_day = summarize(df.groupby("weekday_idx")).reindex(range(7))
    by_day.index = WEEKDAYS
    section("Wochentage")
    print(by_day.to_string())

    section("Tageszeit")
    print(summarize(df.groupby("daypart", observed=False)).to_string())

    section("Session-Länge")
    print(summarize(df.groupby("length", observed=False)).to_string())

    min_n = 2 if len(df) >= 12 else 1
    windows = summarize(df.groupby(["weekday_idx", "daypart"], observed=True))
    windows = windows[windows["sessions"] >= min_n].sort_values(["rating", "hours"], ascending=False)
    windows.index = [f"{WEEKDAYS[d]} · {p}" for d, p in windows.index]
    section(f"Top-Zeitfenster (min. {min_n} Sessions)")
    print(windows.head(5).to_string())
    section("Schwächste Zeitfenster")
    print(windows.tail(3).iloc[::-1].to_string())

    section("Nie genutzt")
    if span >= 14:
        never_days = [WEEKDAYS[d] for d in range(7) if d not in set(df["weekday_idx"])]
        print("Wochentage:", ", ".join(never_days) or "–")
    else:
        print("(erst ab 14 Tagen Historie aussagekräftig)")
    never_hours = sorted(set(range(6, 24)) - set(df["hour"]))
    print("Start-Stunden zwischen 6 und 24 Uhr ohne Session:", ", ".join(f"{h}h" for h in never_hours) or "–")

    commented = df[df["comment"].fillna("") != ""]
    if not commented.empty:
        section("Kommentare der besten Sessions")
        for _, r in commented.sort_values("rating", ascending=False).head(5).iterrows():
            print(f"{r['rating']:>3}  {WEEKDAYS[r['weekday_idx']][:2]} {r['start']:%d.%m. %H:%M}  {r['comment']}")


def charts(df: pd.DataFrame, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out.mkdir(parents=True, exist_ok=True)
    grid = df.pivot_table(index="weekday_idx", columns="hour", values="rating", aggfunc="mean").reindex(index=range(7), columns=range(24))
    fig, ax = plt.subplots(figsize=(10, 3.4))
    im = ax.imshow(grid, aspect="auto", cmap="RdBu", vmin=0, vmax=100)
    ax.set_yticks(range(7), [d[:2] for d in WEEKDAYS])
    ax.set_xticks(range(0, 24, 3), [f"{h}h" for h in range(0, 24, 3)])
    ax.set_title("Ø Bewertung nach Wochentag × Startstunde")
    fig.colorbar(im, ax=ax, label="Bewertung")
    fig.tight_layout()
    fig.savefig(out / "heatmap_rating.png", dpi=160)

    fig, ax = plt.subplots(figsize=(8, 3.4))
    df.groupby("week")["hours"].sum().plot.bar(ax=ax, color="#2a78d6")
    ax.set_title("Stunden pro Woche")
    ax.set_xlabel("")
    fig.tight_layout()
    fig.savefig(out / "hours_per_week.png", dpi=160)
    print(f"\nCharts gespeichert in {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export", type=Path)
    ap.add_argument("--project", help="nur dieses Projekt auswerten")
    ap.add_argument("--charts", action="store_true", help="PNG-Charts nach analysis/out/ schreiben")
    args = ap.parse_args()

    df = load(args.export)
    if args.project:
        df = df[df["project"] == args.project]
    if df.empty:
        raise SystemExit("Keine Sessions gefunden.")
    pd.set_option("display.width", 120)
    report(df)
    if args.charts:
        charts(df, Path(__file__).parent / "out")


if __name__ == "__main__":
    main()
