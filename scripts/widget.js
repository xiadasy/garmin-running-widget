// ============================================================
//  Garmin 跑者挂件 (Scriptable)
//  运动博主风 · 深色渐变 · 柱状图 · 多尺寸自适应
//
//  用法：
//  1. 把 widget_data.json 放到 iCloud Drive → Scriptable 文件夹下
//     （文件名：garmin_widget.json）
//     或者把它托管到一个 URL，见下方 REMOTE_URL 配置
//  2. 桌面长按 → 添加 Scriptable 小组件 → 选择本脚本
//  3. 长按挂件 → 编辑 → 小组件参数：small / medium / large
// ============================================================

// —— 配置 ——————————————————————————————————————————
const LOCAL_FILENAME = "garmin_widget.json";   // iCloud/Scriptable/ 下的文件名（备用）
const REMOTE_URL     = "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/data/widget_data.json";
const USER_NAME      = "Runner";               // 挂件右上角显示

// 点挂件跳转 URL（三选一，待实测哪个 minis scheme 能用）
// const TAP_URL        = "minis://session?id=46ED3E6B-E54D-4755-A23C-00437F5511C4";
// const TAP_URL        = "minis://sessions/46ED3E6B-E54D-4755-A23C-00437F5511C4";
// const TAP_URL        = "minis://chat?session_id=46ED3E6B-E54D-4755-A23C-00437F5511C4";
const TAP_URL        = "";  // 空 = 回退到点挂件重跑脚本

// 数据陈旧阈值：超过这个分钟数就在底部标红警告
const STALE_WARN_MIN = 120;    // 2 小时没更新 → 警告
const STALE_ERR_MIN  = 360;    // 6 小时没更新 → 严重
// ————————————————————————————————————————————————————

// 颜色主题
const C = {
  bgTop:    new Color("#0a1628"),
  bgBottom: new Color("#0f2942"),
  accent:   new Color("#00d4ff"),   // 青
  accent2:  new Color("#5eff8a"),   // 绿
  warm:     new Color("#ff9f0a"),   // 橙
  danger:   new Color("#ff453a"),   // 红
  white:    new Color("#ffffff"),
  mute:     new Color("#8e99a8"),
  mute2:    new Color("#5a6776"),
  barDim:   new Color("#ffffff", 0.12),
};

// —— 数据加载 ——————————————————————————————————————
async function loadData() {
  if (REMOTE_URL) {
    // 加时间戳参数 + no-cache 头，绕过 GitHub Gist CDN 缓存（默认~5分钟）
    const bust = Date.now();
    const url = REMOTE_URL + (REMOTE_URL.includes("?") ? "&" : "?") + "t=" + bust;
    const r = new Request(url);
    r.timeoutInterval = 15;
    r.headers = {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache"
    };
    return await r.loadJSON();
  }
  const fm = FileManager.iCloud();
  const dir = fm.documentsDirectory();
  const path = fm.joinPath(dir, LOCAL_FILENAME);
  if (!fm.fileExists(path)) throw new Error(`找不到 ${LOCAL_FILENAME}，请放到 iCloud/Scriptable/ 下`);
  if (!fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
  const txt = fm.readString(path);
  return JSON.parse(txt);
}

// —— 工具 ——————————————————————————————————————————
function fmtKm(n) { return (Math.round(n * 10) / 10).toFixed(1); }
function fmtInt(n) { return String(Math.round(n || 0)); }
function fmtDuration(min) {
  if (!min) return "-";
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return h > 0 ? `${h}h${m}m` : `${m}min`;
}

// 用 DrawContext 画渐变背景
function makeGradient() {
  const g = new LinearGradient();
  g.colors = [C.bgTop, C.bgBottom];
  g.locations = [0, 1];
  return g;
}

// 画 7 天柱状图（DrawContext 返回 Image）
function drawWeekChart(week, w, h) {
  const dc = new DrawContext();
  const scale = 3;
  dc.size = new Size(w * scale, h * scale);
  dc.opaque = false;
  dc.respectScreenScale = false;

  const bars = week.length;
  const gap = 5 * scale;
  const barW = (dc.size.width - gap * (bars - 1)) / bars;
  const valH = 12 * scale;   // 顶部数字区
  const dayH = 12 * scale;   // 底部星期区
  const chartTop = valH;
  const chartH = dc.size.height - valH - dayH - 4 * scale;
  const chartBottom = chartTop + chartH;

  const maxKm = Math.max(...week.map(d => d.distance_km), 1);

  for (let i = 0; i < bars; i++) {
    const d = week[i];
    const x = i * (barW + gap);
    const ratio = d.distance_km / maxKm;

    // 整条轨道（浅色背景）
    dc.setFillColor(new Color("#ffffff", 0.08));
    dc.fillRect(new Rect(x, chartTop, barW, chartH));

    // 填充条
    if (d.distance_km > 0) {
      const bh = Math.max(ratio * chartH, 2 * scale);
      const color = d.distance_km >= 15 ? C.accent2
                  : d.distance_km >= 10 ? C.accent
                  :                       C.warm;
      dc.setFillColor(color);
      dc.fillRect(new Rect(x, chartBottom - bh, barW, bh));
    }

    // 顶部公里数
    if (d.distance_km > 0) {
      dc.setFont(Font.boldSystemFont(8 * scale));
      dc.setTextColor(C.white);
      dc.setTextAlignedCenter();
      dc.drawTextInRect(
        d.distance_km.toFixed(1),
        new Rect(x - 4 * scale, 0, barW + 8 * scale, valH)
      );
    }

    // 底部星期（直接用 weekday 字段，已是中文）
    dc.setFont(Font.systemFont(9 * scale));
    dc.setTextColor(C.mute);
    dc.setTextAlignedCenter();
    dc.drawTextInRect(d.weekday || "", new Rect(x, chartBottom + 3 * scale, barW, dayH));
  }

  return dc.getImage();
}

// 画圆环（配速 / VO2Max 展示用）
function drawRing(value, max, label, subLabel, sizePx, color) {
  const dc = new DrawContext();
  const scale = 3;
  dc.size = new Size(sizePx * scale, sizePx * scale);
  dc.opaque = false;
  dc.respectScreenScale = false;

  const cx = dc.size.width / 2;
  const cy = dc.size.height / 2;
  const r = dc.size.width / 2 - 6 * scale;
  const lineW = 6 * scale;

  // 背景圆
  const path = new Path();
  path.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2));
  dc.setStrokeColor(C.barDim);
  dc.setLineWidth(lineW);
  dc.addPath(path);
  dc.strokePath();

  // 前景圆弧：近似用多个短线段
  const ratio = Math.max(0, Math.min(1, value / max));
  const steps = Math.max(1, Math.round(60 * ratio));
  dc.setStrokeColor(color);
  dc.setLineWidth(lineW);
  for (let i = 0; i < steps; i++) {
    const a1 = -Math.PI / 2 + (i / 60) * Math.PI * 2;
    const a2 = -Math.PI / 2 + ((i + 1) / 60) * Math.PI * 2;
    const p = new Path();
    p.move(new Point(cx + r * Math.cos(a1), cy + r * Math.sin(a1)));
    p.addLine(new Point(cx + r * Math.cos(a2), cy + r * Math.sin(a2)));
    dc.addPath(p);
    dc.strokePath();
  }

  // 中心文字
  dc.setTextAlignedCenter();
  dc.setFont(Font.boldSystemFont(18 * scale));
  dc.setTextColor(C.white);
  dc.drawTextInRect(label, new Rect(0, cy - 14 * scale, dc.size.width, 22 * scale));
  dc.setFont(Font.systemFont(9 * scale));
  dc.setTextColor(C.mute);
  dc.drawTextInRect(subLabel, new Rect(0, cy + 8 * scale, dc.size.width, 12 * scale));

  return dc.getImage();
}

// —— Widget 构建 ——————————————————————————————————————
async function buildWidget(data) {
  const size = config.widgetFamily || "medium";
  const w = new ListWidget();
  w.backgroundGradient = makeGradient();
  // 中号要更紧凑的内边距，留出更多空间给柱图
  if (size === "medium") {
    w.setPadding(10, 14, 10, 14);
  } else {
    w.setPadding(14, 16, 14, 16);
  }

  const s   = data.summary || {};
  const tdy = data.today;
  const week = data.week || [];
  const m   = data.month || {};

  // —— 顶部 header ——
  const header = w.addStack();
  header.centerAlignContent();
  const logo = header.addText("🐯");
  logo.font = Font.systemFont(13);
  header.addSpacer(5);
  const brand = header.addText(`${USER_NAME} · 本周`);
  brand.font = Font.semiboldSystemFont(12);
  brand.textColor = C.accent;
  header.addSpacer();
  // 右上角：本周日期范围
  const weekRange = header.addText(fmtWeekRange(week));
  weekRange.font = Font.systemFont(10);
  weekRange.textColor = C.mute;

  w.addSpacer(size === "small" ? 6 : (size === "medium" ? 4 : 10));

  // —— 主数据：本周总距离 ——
  const kmStack = w.addStack();
  kmStack.bottomAlignContent();
  const kmFontSize = size === "small" ? 30 : (size === "medium" ? 30 : 38);
  const kmNum = kmStack.addText(fmtKm(s.total_km || 0));
  kmNum.font = Font.boldSystemFont(kmFontSize);
  kmNum.textColor = C.white;
  kmStack.addSpacer(4);
  const kmUnit = kmStack.addText("km");
  kmUnit.font = Font.mediumSystemFont(size === "small" ? 13 : (size === "medium" ? 13 : 16));
  kmUnit.textColor = C.accent;
  kmStack.addSpacer();
  // 右上角：跑步次数
  if (size !== "small") {
    const cntStack = kmStack.addStack();
    cntStack.layoutVertically();
    cntStack.bottomAlignContent();
    const cnt = cntStack.addText(`${s.run_count || 0} 次`);
    cnt.font = Font.boldSystemFont(size === "medium" ? 13 : 15);
    cnt.textColor = C.white;
    cnt.rightAlignText();
    const cntLbl = cntStack.addText("本周训练");
    cntLbl.font = Font.systemFont(9);
    cntLbl.textColor = C.mute;
    cntLbl.rightAlignText();
  }

  // 副标题：均配速 · 均心率
  const sub = w.addStack();
  sub.centerAlignContent();
  const paceIcon = sub.addText("⚡");
  paceIcon.font = Font.systemFont(10);
  sub.addSpacer(3);
  const paceT = sub.addText(`${s.avg_pace || "-"}/km`);
  paceT.font = Font.mediumSystemFont(11);
  paceT.textColor = C.accent2;
  sub.addSpacer(10);
  const hrIcon = sub.addText("❤️");
  hrIcon.font = Font.systemFont(10);
  sub.addSpacer(3);
  const hrT = sub.addText(`${s.avg_hr || "-"} bpm`);
  hrT.font = Font.mediumSystemFont(11);
  hrT.textColor = C.warm;

  // —— 中等及以上：7天柱图 ——
  if (size !== "small") {
    w.addSpacer(size === "medium" ? 6 : 10);
    const chartW = size === "large" ? 320 : 300;
    const chartH = size === "large" ? 70 : 48;
    const img = drawWeekChart(week, chartW, chartH);
    const imgEl = w.addImage(img);
    imgEl.imageSize = new Size(chartW, chartH);
  }

  // —— 大尺寸：本月累计 + VDOT 预测 + 最近列表 ——
  if (size === "large") {
    w.addSpacer(10);

    // 分隔线
    const hr1 = w.addStack();
    hr1.size = new Size(300, 1);
    hr1.backgroundColor = new Color("#ffffff", 0.1);
    w.addSpacer(8);

    // —— 本月累计：横排一行 ——
    if (m.total_km) {
      const monthRow = w.addStack();
      monthRow.centerAlignContent();

      const monthLabel = monthRow.addText("📅 本月累计");
      monthLabel.font = Font.semiboldSystemFont(11);
      monthLabel.textColor = C.accent;

      monthRow.addSpacer();

      // 大数字 + 单位
      const kmBig = monthRow.addText(fmtKm(m.total_km));
      kmBig.font = Font.boldSystemFont(18);
      kmBig.textColor = C.accent2;
      monthRow.addSpacer(3);
      const kmBigU = monthRow.addText("km");
      kmBigU.font = Font.mediumSystemFont(10);
      kmBigU.textColor = C.mute;

      monthRow.addSpacer(8);

      // 次数
      const monthCnt = monthRow.addText(`${m.run_count || 0} 次`);
      monthCnt.font = Font.semiboldSystemFont(11);
      monthCnt.textColor = C.white;

      w.addSpacer(3);

      // 副标题：日均 + 月末预测
      if (m.days_elapsed) {
        const daily = m.total_km / m.days_elapsed;
        const monthSub = w.addStack();
        monthSub.centerAlignContent();
        const sub1 = monthSub.addText(`日均 ${daily.toFixed(1)}km`);
        sub1.font = Font.systemFont(9);
        sub1.textColor = C.mute;
        monthSub.addSpacer();

        // 月末预测（粗略线性外推）
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const proj = Math.round(daily * daysInMonth);
        const sub2 = monthSub.addText(`预计月末 ${proj}km`);
        sub2.font = Font.systemFont(9);
        sub2.textColor = C.mute;
      }

      w.addSpacer(8);
      const hrMid = w.addStack();
      hrMid.size = new Size(300, 1);
      hrMid.backgroundColor = new Color("#ffffff", 0.1);
      w.addSpacer(6);
    }

    // VDOT 预测
    const predTitle = w.addStack();
    predTitle.centerAlignContent();
    const pt = predTitle.addText("比赛预测");
    pt.font = Font.semiboldSystemFont(11);
    pt.textColor = C.accent;
    predTitle.addSpacer(6);
    const vdotTag = predTitle.addText(`VDOT ${(data.predictions && data.predictions.vdot) || data.vo2max || "-"}`);
    vdotTag.font = Font.mediumSystemFont(9);
    vdotTag.textColor = C.accent2;

    w.addSpacer(5);

    // 预测行（只显示 10K 和 HM，按用户要求）
    const preds = (data.predictions && data.predictions.races) || [];
    const filterRaces = ["10K", "HM"];
    const shown = preds.filter(r => filterRaces.includes(r.name));

    for (const r of shown) {
      const row = w.addStack();
      row.centerAlignContent();

      const nameLabel = r.name === "HM" ? "半马" : "10K";
      const n = row.addText(nameLabel);
      n.font = Font.mediumSystemFont(10);
      n.textColor = C.mute;
      // 固定宽度
      const nameStack = row;
      row.addSpacer(8);

      const t = row.addText(r.time);
      t.font = Font.boldSystemFont(15);
      t.textColor = C.white;

      row.addSpacer();

      const p = row.addText(r.pace + "/km");
      p.font = Font.mediumSystemFont(10);
      p.textColor = C.accent2;

      w.addSpacer(3);
    }

    w.addSpacer(6);
    const hr2 = w.addStack();
    hr2.size = new Size(300, 1);
    hr2.backgroundColor = new Color("#ffffff", 0.1);
    w.addSpacer(6);

    // 最近训练列表
    const title = w.addText("最近训练");
    title.font = Font.semiboldSystemFont(11);
    title.textColor = C.accent;

    w.addSpacer(3);

    const runs = (data.recent_runs || []).slice(0, 3);
    for (const r of runs) {
      const row = w.addStack();
      row.centerAlignContent();

      const date = row.addText(r.date.slice(5));
      date.font = Font.systemFont(10);
      date.textColor = C.mute;

      row.addSpacer(8);
      const km = row.addText(`${fmtKm(r.distance_km)}km`);
      km.font = Font.semiboldSystemFont(11);
      km.textColor = C.white;

      row.addSpacer();

      const pace = row.addText(r.avg_pace || "-");
      pace.font = Font.mediumSystemFont(10);
      pace.textColor = C.accent2;

      row.addSpacer(8);

      const hrT = row.addText(`${fmtInt(r.avg_hr)}bpm`);
      hrT.font = Font.systemFont(10);
      hrT.textColor = C.warm;

      w.addSpacer(2);
    }
  }

  // —— 底部：本月 / 最长 / 更新时间 ——
  if (size !== "small") {
    w.addSpacer();
    const footer = w.addStack();
    footer.centerAlignContent();

    // 本月公里数
    if (m.total_km) {
      const monthTxt = footer.addText(`📅 本月 ${fmtKm(m.total_km)}km`);
      monthTxt.font = Font.semiboldSystemFont(9);
      monthTxt.textColor = C.accent2;
      footer.addSpacer(10);
    }

    // VDOT
    const vo2 = footer.addText(`VDOT ${data.vo2max || "-"}`);
    vo2.font = Font.mediumSystemFont(9);
    vo2.textColor = C.accent;

    if (s.longest_km && size === "large") {
      footer.addSpacer(10);
      const lng = footer.addText(`🏔 ${fmtKm(s.longest_km)}km`);
      lng.font = Font.systemFont(9);
      lng.textColor = C.mute;
    }

    footer.addSpacer();
    const ts = footer.addText(fmtUpdate(data.updated_at));
    ts.font = Font.systemFont(9);
    ts.textColor = staleColor(data.updated_at, C);
  } else {
    w.addSpacer();
    // Small 紧凑：本月 + VDOT
    if (m.total_km) {
      const foot = w.addText(`📅 ${fmtKm(m.total_km)}km · VDOT ${data.vo2max}`);
      foot.font = Font.systemFont(9);
      foot.textColor = C.mute;
    } else {
      const foot = w.addText(`🏔 ${fmtKm(s.longest_km || 0)}km · VDOT ${data.vo2max}`);
      foot.font = Font.systemFont(9);
      foot.textColor = C.mute;
    }
  }

  // 点挂件跳转：有配置就跳 Minis 会话，否则回退到重跑本脚本
  w.url = TAP_URL && TAP_URL.length > 0
    ? TAP_URL
    : ("scriptable:///run/" + encodeURIComponent(Script.name()));

  // 提示 iOS：15 分钟后请重新刷新（系统会"尽量"按这个时间，实际可能 15-30 分钟）
  // 不设的话，刷新完全随系统心情，锁屏久了可能几小时不动
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  return w;
}

// 根据 updated_at 与当前时间差选颜色：正常/警告/严重
function staleColor(iso, C) {
  if (!iso) return C.mute2;
  try {
    const diffMin = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diffMin >= STALE_ERR_MIN)  return C.danger;   // 6h+ 红
    if (diffMin >= STALE_WARN_MIN) return C.warm;     // 2h+ 橙
    return C.mute2;
  } catch (e) { return C.mute2; }
}

function fmtUpdate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + "分钟前";
    if (diff < 86400) return Math.round(diff / 3600) + "小时前";
    return Math.round(diff / 86400) + "天前";
  } catch (e) { return ""; }
}

function fmtWeekRange(week) {
  if (!week || !week.length) return "";
  const s = week[0].date.slice(5);          // MM-DD
  const e = week[week.length - 1].date.slice(5);
  return `${s} ~ ${e}`;
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundGradient = makeGradient();
  w.setPadding(14, 16, 14, 16);
  const t = w.addText("⌚️ Garmin");
  t.font = Font.boldSystemFont(14);
  t.textColor = C.accent;
  w.addSpacer(6);
  const m = w.addText("❌ " + String(msg).slice(0, 140));
  m.font = Font.systemFont(10);
  m.textColor = C.danger;
  return w;
}

// —— 主入口 ——
async function main() {
  let widget;
  try {
    const data = await loadData();
    widget = await buildWidget(data);
  } catch (e) {
    widget = errorWidget(e.message || e);
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    const fam = args.widgetParameter || "large";
    if (fam === "small")      await widget.presentSmall();
    else if (fam === "medium") await widget.presentMedium();
    else                       await widget.presentLarge();
  }
  Script.complete();
}

await main();
