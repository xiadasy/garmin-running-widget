# 🏃 Garmin Running Widget

iOS 桌面挂件：从 Garmin Connect 自动同步跑步数据到桌面，**零维护**。

- 🏅 本周/本月累计 · 7 天柱状图
- ⏱ 平均配速 · 心率 · 最长一次
- 🎯 Jack Daniels VDOT 比赛成绩预测（5K/10K/半马/全马）
- 🔄 GitHub Actions 每 15 分钟自动拉取，手机关了也在跑
- 🚨 连续 3 次同步失败自动开 issue 告警
- ⚡ 点击挂件立即刷新

![预览](https://raw.githubusercontent.com/your-username/your-repo/main/docs/preview.png)

---

## 🚀 5 分钟部署

### 1. 用本模板建一个仓库

点右上角绿色的 **Use this template → Create a new repository**，建一个**公开（Public）**仓库（私有仓库 raw URL 不开放匿名访问，挂件就读不到）。

### 2. 配 Garmin 账号

你的新仓库 → **Settings → Secrets and variables → Actions**：

**Secrets** 标签：
- `GARMIN_EMAIL`    = 你的 Garmin 邮箱
- `GARMIN_PASSWORD` = 你的 Garmin 密码

**Variables** 标签（可选）：
- `VDOT`      = 你的 VDOT（手表里有，默认 50）
- `USER_NAME` = 挂件上显示的名字，默认 "Runner"

> 🔒 GitHub Secrets 加密存储，只有 Actions runner 能读。仓库里本身**不会存任何密码**。

### 3. 首次运行

Actions 标签 → **Sync Garmin Widget → Run workflow** → 等 1 分钟。

成功后你会看到仓库里多了 `data/widget_data.json` 这个文件。

### 4. 装 Scriptable 挂件

1. App Store 下 [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)（免费）
2. 打开 Scriptable → **右上角 +** 创建新脚本，粘贴 [scripts/widget.js](scripts/widget.js) 的内容
3. 改脚本顶部这一行（换成**你自己**的用户名和仓库名）：
   ```js
   const REMOTE_URL = "https://raw.githubusercontent.com/你的用户名/仓库名/main/data/widget_data.json";
   ```
4. 脚本命名为 `Garmin Widget`，保存
5. 回桌面 → 长按空白 → 加 Scriptable 挂件（推荐 **Large**）
6. 长按挂件 → 编辑 → Script 选 `Garmin Widget`

✅ 搞定。训练 → 上传 Garmin → 20-40 分钟后挂件自动显示。

---

## 🎛️ 常见问题

**Q: 挂件多久会更新？**
- GitHub cron：每 15 分钟跑一次（实际 15-25 分钟，免费 cron 会有抖动）
- iOS 挂件：系统按预算刷新，锁屏久了可能 30-60 分钟才拉一次
- **端到端期望：训练上传到挂件显示 ≈ 20-40 分钟**
- 想立刻刷新：点挂件（触发脚本立即重跑）

**Q: 右下角显示"X 小时前"在红色/橙色？**
- 🟢 灰色 = 正常（2 小时内）
- 🟠 橙色 = 超过 2 小时没更新（建议看下 Actions 页面）
- 🔴 红色 = 超过 6 小时没更新（多半 Actions 挂了）

**Q: Garmin 账号被要求二次验证 / CAPTCHA 怎么办？**
- 去 Garmin Connect 网页登录一次通过验证
- 去仓库 Settings → Secrets → 更新 `GARMIN_PASSWORD`
- Actions 页面手动触发一次 sync，OK 就正常了

**Q: 我不想让数据仓库公开，可以私有吗？**
- 可以，但私有仓库的 `raw.githubusercontent.com` URL 不允许匿名访问，挂件拉不到
- 解决方案：申请一个 GitHub PAT（`repo` scope）→ 在挂件脚本里加 `Authorization: token <PAT>` 请求头
- 或者：保持 public，仓库里只有脚本和 widget_data.json（成绩数据），不敏感

**Q: 我想自定义样式 / 添加字段？**
- `scripts/sync.py` 里改 `build_widget()` 函数，加字段到 `widget_data.json`
- `scripts/widget.js` 里读新字段、渲染

**Q: 连续失败了怎么办？**
- 仓库 Issues 页面会自动开一个告警 issue
- 邮箱也会收到 GitHub 的通知
- 按 issue 里的排查步骤走就行

---

## 🧱 架构

```
Garmin Connect
     ↓ python-garminconnect
GitHub Actions (每 15 分钟)
     ↓ commit
仓库: data/widget_data.json  (公开 raw URL)
     ↓ fetch
Scriptable 挂件
```

技术栈：
- `garminconnect` - Garmin 非官方 SDK
- Python 3.11 - 数据处理 + Jack Daniels VDOT 算法
- GitHub Actions - 免费 cron 调度（每月约 2880 次 × 30s ≈ 24 分钟，远低于免费额度）
- Scriptable - iOS 挂件引擎

---

## 📜 License

MIT. 随便用，随便改。

## 🙏 致谢

- [python-garminconnect](https://github.com/cyberjunky/python-garminconnect)
- [Scriptable](https://scriptable.app/)
- Jack Daniels' Running Formula

---

如果你觉得有用，给个 ⭐ 呗~
