#!/usr/bin/env python3
"""
GitHub Actions 专用：一次性完成
  Garmin 登录 → 拉最近 7 天活动 → 生成 widget_data.json

产物：
  ./data/summary_7d.json
  ./data/activities_7d.json
  ./data/widget_data.json   <-- 这个给挂件用

凭据（环境变量）：
  GARMIN_EMAIL
  GARMIN_PASSWORD

Token 持久化：
  ./data/tokens/  —— 由 actions/cache 在 run 之间保留，避免每 15 分钟硬登录被限流
"""
import os, sys, json, math, datetime
from datetime import datetime as dt, timedelta, timezone

# Shanghai 时区（GitHub Actions runner 默认 UTC，必须显式带时区，
# 否则挂件脚本会把裸字符串当本地时间解析，多算 8 小时差）
TZ_SH = timezone(timedelta(hours=8))
from pathlib import Path

from garminconnect import Garmin

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
TOKEN_DIR = DATA_DIR / "tokens"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TOKEN_DIR.mkdir(parents=True, exist_ok=True)

OUT_SUMMARY = DATA_DIR / "summary_7d.json"
OUT_ACTIVITIES = DATA_DIR / "activities_7d.json"
OUT_WIDGET = DATA_DIR / "widget_data.json"

VDOT = int(os.environ.get("VDOT", "65"))
USER_NAME = os.environ.get("USER_NAME", "小老虎")
DAYS = int(os.environ.get("DAYS", "7"))


# ────────────────────────────────────────────────────────────
# 1. Garmin 登录（优先用缓存 token）
# ────────────────────────────────────────────────────────────
def login():
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        print("ERR: GARMIN_EMAIL / GARMIN_PASSWORD 未设置", file=sys.stderr)
        sys.exit(2)

    client = Garmin(email, password)
    try:
        client.login(str(TOKEN_DIR))
        print("INFO: token login ok")
    except Exception as e:
        print(f"INFO: token login failed ({e}), fresh login")
        client.login()
        try:
            client.garth.dump(str(TOKEN_DIR))
            print(f"INFO: token saved to {TOKEN_DIR}")
        except Exception as ex:
            print(f"WARN: token dump failed: {ex}")
    return client


# ────────────────────────────────────────────────────────────
# 2. 工具函数
# ────────────────────────────────────────────────────────────
def sec_to_pace(sec_per_km):
    if sec_per_km is None:
        return None
    m = int(sec_per_km // 60)
    s = int(round(sec_per_km - m * 60))
    if s == 60:
        m += 1; s = 0
    return f"{m}'{s:02d}\""


def pace_to_sec(p):
    if not p:
        return None
    try:
        m, s = p.replace('"', '').split("'")
        return int(m) * 60 + int(s)
    except Exception:
        return None


# ────────────────────────────────────────────────────────────
# 3. Jack Daniels VDOT 预测
# ────────────────────────────────────────────────────────────
def _vdot_at(distance_m, time_min):
    v = distance_m / time_min
    vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v
    pct = (0.8
           + 0.1894393 * math.exp(-0.012778 * time_min)
           + 0.2989558 * math.exp(-0.1932605 * time_min))
    return vo2 / pct


def predict_time_min(distance_m, vdot, lo=5.0, hi=400.0):
    for _ in range(80):
        mid = (lo + hi) / 2
        if _vdot_at(distance_m, mid) > vdot:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def fmt_time(min_total):
    h = int(min_total // 60)
    rest = min_total - h * 60
    m = int(rest)
    s = int(round((rest - m) * 60))
    if s == 60:
        m += 1; s = 0
    return f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m}:{s:02d}"


def fmt_pace_per_km(min_total, distance_m):
    sec = (min_total * 60) / (distance_m / 1000)
    m = int(sec // 60); s = int(round(sec - m * 60))
    if s == 60:
        m += 1; s = 0
    return f"{m}'{s:02d}\""


def build_predictions(vdot):
    races = [("5K", 5000), ("10K", 10000), ("HM", 21097.5), ("M", 42195)]
    out = []
    for name, dist in races:
        t = predict_time_min(dist, vdot)
        out.append({
            "name": name,
            "distance_km": round(dist / 1000, 3),
            "time": fmt_time(t),
            "pace": fmt_pace_per_km(t, dist),
        })
    return {"vdot": vdot, "races": out}


# ────────────────────────────────────────────────────────────
# 4. 拉 Garmin → summary_7d.json
# ────────────────────────────────────────────────────────────
def fetch_summary(client):
    today = dt.now(TZ_SH).date()
    start = today - timedelta(days=DAYS - 1)
    month_start = today.replace(day=1)

    days_to_cover = max(DAYS, (today - month_start).days + 1)
    fetch_count = max(80, int(days_to_cover * 1.5) + 20)

    raw = client.get_activities(0, fetch_count)
    acts = [a for a in raw
            if start.isoformat() <= a.get("startTimeLocal", "")[:10] <= today.isoformat()]
    print(f"INFO: {len(acts)} activities in {start}~{today}")

    month_acts = [a for a in raw
                  if a.get("activityType", {}).get("typeKey") == "running"
                  and month_start.isoformat() <= a.get("startTimeLocal", "")[:10] <= today.isoformat()]
    month_total_km = round(sum((a.get("distance") or 0) for a in month_acts) / 1000.0, 2)
    month_run_count = len(month_acts)
    print(f"INFO: 本月 {month_total_km}km / {month_run_count} 次")

    activities_slim = []
    by_date = {}
    for a in acts:
        d = a.get("startTimeLocal", "")[:10]
        t = a.get("activityType", {}).get("typeKey", "")
        dist_m = a.get("distance") or 0
        dur_min = (a.get("duration") or 0) / 60.0
        cal = a.get("calories") or 0
        avg_hr = a.get("averageHR")
        max_hr = a.get("maxHR")
        name = a.get("activityName") or t

        avg_pace = None
        if dist_m > 0 and dur_min > 0 and t == "running":
            sec_per_km = (dur_min * 60) / (dist_m / 1000.0)
            avg_pace = sec_to_pace(sec_per_km)

        activities_slim.append({
            "name": name, "type": t, "date": d,
            "distance_km": round(dist_m / 1000.0, 2),
            "duration_min": round(dur_min, 1),
            "avg_hr": avg_hr, "max_hr": max_hr,
            "calories": cal, "avg_pace": avg_pace,
        })

        if dist_m > 0:
            day = by_date.setdefault(d, {"distance_m": 0, "cal": 0})
            day["distance_m"] += dist_m
            day["cal"] += cal

    days_out = []
    for i in range(DAYS):
        dt_str = (start + timedelta(days=i)).isoformat()
        info = by_date.get(dt_str)
        days_out.append({
            "date": dt_str, "steps": None,
            "distance_m": int(info["distance_m"]) if info else None,
            "active_calories": (info["cal"] if info else None),
            "total_calories": (info["cal"] if info else None),
            "floors": None, "resting_hr": None,
            "sleep_seconds": None, "sleep_score": None, "avg_stress": None,
        })

    activities_slim.sort(key=lambda x: x["date"], reverse=True)

    summary = {
        "sync_time": dt.now(TZ_SH).isoformat(timespec="seconds"),
        "days": days_out,
        "activities": activities_slim,
        "month": {
            "year_month": month_start.strftime("%Y-%m"),
            "total_km": month_total_km,
            "run_count": month_run_count,
            "days_elapsed": (today - month_start).days + 1,
        },
    }

    OUT_SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_ACTIVITIES.write_text(json.dumps(acts, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return summary


# ────────────────────────────────────────────────────────────
# 5. 生成挂件 widget_data.json
# ────────────────────────────────────────────────────────────
def build_widget(raw):
    days = raw.get("days", [])
    acts = raw.get("activities", [])

    runs = [a for a in acts if a.get("type") == "running" and (a.get("distance_km") or 0) > 0]
    runs.sort(key=lambda x: x.get("date", ""), reverse=True)
    today = runs[0] if runs else None

    by_date = {d["date"]: d for d in days}
    today_date = dt.now(TZ_SH).date()
    cn_weekdays = ["一", "二", "三", "四", "五", "六", "日"]

    week = []
    for i in range(6, -1, -1):
        day_date = today_date - timedelta(days=i)
        key = day_date.strftime("%Y-%m-%d")
        d = by_date.get(key, {})
        dist_km = (d.get("distance_m") or 0) / 1000.0
        week.append({
            "date": key,
            "weekday": cn_weekdays[day_date.weekday()],
            "weekday_en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day_date.weekday()],
            "distance_km": round(dist_km, 2),
            "calories": d.get("active_calories") or 0,
            "is_today": (i == 0),
        })

    total_km = sum(x["distance_km"] for x in week)
    total_cal = sum(x["calories"] or 0 for x in week)
    run_count = len(runs)

    avg_pace_sec = None
    if runs:
        tot_dist = sum(r["distance_km"] for r in runs if pace_to_sec(r.get("avg_pace")))
        if tot_dist > 0:
            avg_pace_sec = sum(pace_to_sec(r["avg_pace"]) * r["distance_km"]
                               for r in runs if pace_to_sec(r.get("avg_pace"))) / tot_dist

    hr_samples = [r["avg_hr"] for r in runs if r.get("avg_hr")]
    avg_hr = round(sum(hr_samples) / len(hr_samples)) if hr_samples else None

    longest = max(runs, key=lambda x: x["distance_km"]) if runs else None

    out = {
        "sync_time": raw.get("sync_time"),
        "updated_at": dt.now(TZ_SH).isoformat(timespec="seconds"),
        "today": today,
        "week": week,
        "summary": {
            "total_km": round(total_km, 2),
            "total_cal": int(total_cal),
            "run_count": run_count,
            "avg_pace": sec_to_pace(avg_pace_sec),
            "avg_hr": avg_hr,
            "longest_km": longest["distance_km"] if longest else 0,
            "longest_date": longest["date"] if longest else None,
        },
        "month": raw.get("month", {}),
        "recent_runs": runs[:5],
        "vo2max": VDOT,
        "predictions": build_predictions(VDOT),
    }

    OUT_WIDGET.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ widget_data.json 已生成")
    print(f"   周: {out['summary']['total_km']}km / {run_count} 次 / 均配速 {out['summary']['avg_pace']}")
    print(f"   月: {out['month'].get('total_km')}km / {out['month'].get('run_count')} 次")
    return out


# ────────────────────────────────────────────────────────────
# 6. （可选）推到 Gist
# ────────────────────────────────────────────────────────────
def push_to_gist():
    """如果设置了 GIST_TOKEN + GIST_ID，就顺手推一份到 Gist。否则跳过。"""
    token = os.environ.get("GIST_TOKEN")
    gist_id = os.environ.get("GIST_ID")
    if not token or not gist_id:
        print("INFO: 未配置 GIST_TOKEN / GIST_ID，跳过 Gist 推送")
        return

    import urllib.request
    data = OUT_WIDGET.read_text(encoding="utf-8")
    payload = {"files": {"garmin_widget.json": {"content": data}}}
    req = urllib.request.Request(
        f"https://api.github.com/gists/{gist_id}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        method="PATCH",
    )
    with urllib.request.urlopen(req) as resp:
        resp.read()
    print(f"✅ Gist 已更新：{gist_id}")


# ────────────────────────────────────────────────────────────
def main():
    client = login()
    summary = fetch_summary(client)
    build_widget(summary)
    push_to_gist()


if __name__ == "__main__":
    main()
