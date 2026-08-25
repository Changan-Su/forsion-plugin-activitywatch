---
name: 电脑活动探活
description: Use when the user asks what they have been doing on this computer ("我今天在电脑上干了什么", "这台电脑上的一天去哪了"), asks why their activity log has no computer records ("活动日志怎么没有电脑记录", "怎么只有 Forsion 里的操作"), or when a read_activity lookup comes back empty and you are about to tell them why. Probes whether the local ActivityWatch bridge is actually alive so an empty log gets diagnosed instead of guessed. NOT for drafting weekly reports out of the log.
version: 1.0.0
category: 系统集成
---

# 电脑活动探活 — an empty activity log is a question, not an answer

The ActivityWatch plugin folds this machine's window-focus history into the user's local
activity log, as `plugin:activitywatch:focus app=… m=<minutes> "window title"` lines. So the
log is **not** limited to in-app events — it can tell you the user spent the morning in Chrome.

When those lines are missing, several very different things could be true, and they need
opposite answers:

| What is actually true | What the user should hear |
|---|---|
| They really were away from the machine | 这段时间没有记录到活动 |
| The ActivityWatch daemon isn't running | 去装 / 启动 ActivityWatch |
| AW is up but `aw-watcher-window` isn't | 窗口监控没在跑,所以没有焦点数据 |
| The plugin is disabled or not installed | 去社区插件里启用 |
| Your look-back window was too small, or the newest minutes haven't landed yet | 扩大 `hours` 再看 |

**Never pick one of these without checking.** The specific failure this skill exists to
prevent: a two-hour window came back empty, and the model told the user "活动日志不记录外部
应用" — a cause it invented. It does record them. Guessing a cause is worse than saying
"我不知道", because the user acts on it.

## 1. First see which tools you actually have

Two tools matter here and they have different gates. Check before you promise anything:

- **`run_bash`** — host sessions only, and **not available in plan mode** (Muse's periodic
  runs are plan mode). It is the *only* way to reach ActivityWatch from here: `web_fetch`
  refuses loopback addresses by design, so `http://localhost:5600` is unreachable through it,
  and there is no other engine-side path. No `run_bash` → skip to §3.
- **`read_activity`** — only Muse and agents that have been granted activity access have it.
  No `read_activity` → you can still report liveness; do not pretend you can read the log.

## 2. Probe — needs `run_bash`

```sh
curl -s --max-time 3 http://localhost:5600/api/0/info
```

- JSON comes back → the ActivityWatch daemon is up.
- Connection refused / timeout / empty → it is not running. Go to §3.

Only when you need to separate "AW is up but recording nothing", ask what it is watching:

```sh
curl -s --max-time 3 http://localhost:5600/api/0/buckets/
```

Look for a bucket whose `type` is `currentwindow`.

- **Absent** → AW is up, but `aw-watcher-window` isn't, so no focus data is being produced at
  all. That fully explains an empty log; say it and stop.
- **Present** → the input side of the bridge is healthy. An empty log then points at the
  plugin (disabled? just installed?) or at your own look-back window — not at the user.

Read-only, both of them. Never POST or DELETE to this API. Never install or start anything
yourself: no `brew install`, no `apt`, no downloading a release. §3 is the install path.

## 3. Answer

**Daemon up, and you have `read_activity`** → answer from the log, with the log's own
discipline: a nearly-empty *small* window is not evidence of an idle user. Widen `hours` and
retry before you conclude anything, and remember the newest few minutes may legitimately be
missing — a focus segment is only written after it ends, and then only after a settling
delay. Report what you actually saw, not a tidy story.

**Daemon up, but no `read_activity`** → report the liveness result and stop there. "AW 在跑,
窗口监控也在,所以记录应该是有的" is a complete, honest answer from where you stand. Do not
narrate activity you never read.

**Daemon down, unreachable, or you never had `run_bash`** → say so plainly and point at the
UI. This is a two-click job for the user and a rabbit hole for you:

- 设置 → 社区插件 → 「ActivityWatch 系统活动」详情页 → 「依赖应用」区,可一键安装并检测
  ActivityWatch;
- 或在命令面板运行「ActivityWatch：检测连接状态」。

If you had no `run_bash` this round, say *that* — "我这轮没法探测,请用命令面板检测一下" is
honest. "ActivityWatch 没在跑" would be a guess wearing a diagnosis's clothes.

## Boundaries

**Host only.** This whole skill is about a service on the user's own machine. `web_fetch`
pins public IPs and rejects loopback, so `run_bash` + `curl` is the single path; in the cloud
there is no ActivityWatch, no plugin, and no local activity log — the bundle does not ship
there at all. In a cloud session this skill has nothing to offer: say the feature is desktop-only.

**Privacy.** The activity log is stored only on this machine (`~/.forsion/activity/`, dev mode
`~/.forsion-dev/activity/`, 30-day rotation) and nothing uploads it. But it is not sealed: the moment
you read it with `read_activity`, the lines you read become part of the request sent to whatever model
you are running on — so read the window you need, quote sparingly, and do not paste whole days into a
summary. Before writing, the plugin drops windows
belonging to password managers (1Password / Keychain / Bitwarden and anything whose app name
or title reads like one). **Do not go around the log to `/api/0/buckets/<id>/events` to get
them back.** That endpoint returns raw, unfiltered titles — it would hand you exactly what the
user was promised had been dropped, and it would make a second read path for data that already
has one. The log is the read path. Use the events API for nothing but the `type` check in §2.

**Don't quote the plugin's tuning as fact.** Minimum dwell time, poll interval, settling
delay and the per-poll line cap are all user-editable settings on the plugin's detail page.
Describe them qualitatively — "很短的切窗不记录", "最近几分钟可能还没落盘" — and never state a
number you did not read from this user's own configuration.

## 交付前自查

- [ ] I checked which tools I have before promising a probe.
- [ ] Every cause I named came from the probe or from the log — I invented none.
- [ ] I widened `hours` before saying "没有活动".
- [ ] I did not install, start, or reconfigure anything; I pointed at the UI.
- [ ] I did not read window titles out of the raw events endpoint.
