/**
 * ActivityWatch → Forsion 活动日志桥(外置 Amadeus 插件,裸 setup(ctx) 体)。
 *
 * 每分钟轮询本机 ActivityWatch(localhost:5600)的窗口焦点桶,把「已结束」的焦点段折叠写进
 * Forsion 活动日志(宿主强制 plugin:activitywatch: 前缀 + 消毒,数据只进本地 ~/.forsion/activity):
 *
 *   202607121110 plugin:activitywatch:focus app="Google Chrome" m=5 "页面标题"
 *
 * 去重原理:只处理「结束时间 ∈ (上次同步, 现在-90s]」的段——进行中的段 duration 还在增长,
 * 留给它结束后的那一轮,既不重复也不低估时长。焦点段之间的时间空洞即挂机(afk 桶暂不接)。
 * 隐私:装插件=同意记录;SKIP 名单命中的 app/标题直接丢;禁用插件即停(disposer 清定时器);
 * ActivityWatch 未运行时静默待机,每分钟重试(⌘K「ActivityWatch:检测连接状态」可手动查)。
 */
const AW = 'http://localhost:5600/api/0'
const POLL_MS = 60_000
const MIN_FOCUS_S = 20 // 停留 <20s 的切窗噪音不记
const MAX_LINES_PER_POLL = 12 // 单轮上限(离线补拉防刷屏,超出丢弃更早的段)
const END_LAG_MS = 90_000 // 只处理 90s 前已结束的段
const LOOKBACK_MS = 2 * 3600_000 // 查询回看 2h,覆盖跨轮长段(按结束时间去重,不会重复)
const LS_SYNC = 'plugin.activitywatch.lastSyncMs'
const SKIP = [/1password/i, /keychain/i, /bitwarden/i, /password/i] // 命中 app 名或标题即丢

const iso = (ms) => new Date(ms).toISOString()

async function pickBuckets() {
  const r = await fetch(`${AW}/buckets/`)
  if (!r.ok) throw new Error(`aw ${r.status}`)
  const all = await r.json()
  let win = null
  for (const [id, b] of Object.entries(all || {})) {
    if (b && b.type === 'currentwindow' && !win) win = id
  }
  return { win }
}

/** 拉桶事件,只保留「结束时间落在 (sinceMs, endMs]」的段(=已结束且未记过),按结束时间升序。 */
async function doneEvents(bucket, sinceMs, endMs) {
  const url = `${AW}/buckets/${encodeURIComponent(bucket)}/events` +
    `?limit=500&start=${encodeURIComponent(iso(sinceMs - LOOKBACK_MS))}&end=${encodeURIComponent(iso(endMs))}`
  const r = await fetch(url)
  if (!r.ok) return []
  const list = await r.json()
  if (!Array.isArray(list)) return []
  return list
    .map((e) => {
      const ts = Date.parse(e && e.timestamp)
      const secs = Number(e && e.duration) || 0
      return { ts, secs, end: ts + secs * 1000, data: (e && e.data) || {} }
    })
    .filter((e) => Number.isFinite(e.ts) && e.secs > 0 && e.end > sinceMs && e.end <= endMs)
    .sort((a, b) => a.end - b.end)
}

/** 相邻同 app 段合并 → [{app,title,secs}];SKIP 命中直接丢;合并后 <MIN_FOCUS_S 的段丢。 */
function foldFocus(evs) {
  const out = []
  for (const e of evs) {
    const app = String(e.data.app || '').trim()
    const title = String(e.data.title || '').trim()
    if (!app) continue
    if (SKIP.some((re) => re.test(app) || re.test(title))) continue
    const last = out[out.length - 1]
    if (last && last.app === app) {
      last.secs += e.secs
      if (title) last.title = title
    } else {
      out.push({ app, title, secs: e.secs })
    }
  }
  return out.filter((s) => s.secs >= MIN_FOCUS_S)
}

async function poll() {
  try {
    const { win } = await pickBuckets()
    if (!win) return
    const sinceMs = Number(localStorage.getItem(LS_SYNC)) || (Date.now() - 15 * 60_000) // 首次只回看 15min
    const endMs = Date.now() - END_LAG_MS
    if (endMs <= sinceMs) return
    const segs = foldFocus(await doneEvents(win, sinceMs, endMs))
    for (const s of segs.slice(-MAX_LINES_PER_POLL)) {
      ctx.activity?.log?.('focus', { app: s.app, m: Math.round(s.secs / 60) || undefined, text: s.title })
    }
    localStorage.setItem(LS_SYNC, String(endMs))
  } catch { /* ActivityWatch 不在线:静默待机,下一轮重试 */ }
}

ctx.registerCommand({
  id: 'aw-status',
  title: 'ActivityWatch：检测连接状态',
  keywords: 'activitywatch aw 系统活动 电脑 监控 status',
  run: async () => {
    try {
      const { win } = await pickBuckets()
      ctx.app.notify(win
        ? 'ActivityWatch 已连接,窗口焦点每分钟同步进活动日志'
        : 'ActivityWatch 在线但没有窗口监控桶(aw-watcher-window 未运行?)')
    } catch {
      ctx.app.notify('未检测到 ActivityWatch:请安装并运行 activitywatch.net(免费开源,数据全在本机)')
    }
  },
})

const timer = setInterval(poll, POLL_MS)
void poll()
return () => clearInterval(timer)
