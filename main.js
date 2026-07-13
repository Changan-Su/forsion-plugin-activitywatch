/**
 * ActivityWatch → Forsion 活动日志桥(外置 Forsion 插件,裸 setup(ctx) 体)。
 *
 * 周期轮询本机 ActivityWatch(localhost:5600)的窗口焦点桶,把「已结束」的焦点段折叠写进
 * Forsion 活动日志(宿主强制 plugin:activitywatch: 前缀 + 消毒,数据只进本地 ~/.forsion/activity):
 *
 *   202607121110 plugin:activitywatch:focus app="Google Chrome" m=5 "页面标题"
 *
 * 去重原理:只处理「结束时间 ∈ (上次同步, 现在-结算延迟]」的段——进行中的段 duration 还在增长,
 * 留给它结束后的那一轮,既不重复也不低估时长。焦点段之间的时间空洞即挂机(afk 桶暂不接)。
 * 隐私:装插件=同意记录;SKIP 名单命中的 app/标题直接丢;禁用插件即停(disposer 清定时器);
 * ActivityWatch 未运行时静默待机,下一轮重试(插件详情页可一键安装/检测连接)。
 *
 * 参数可调(插件详情页「设置」区,registerSetting 声明;值存 localStorage plugin.activitywatch.*,
 * poll 每轮现读 → 改动下一轮生效,无需重载):最小时长/轮询间隔/结算延迟/单轮行数帽。
 */
const AW = 'http://localhost:5600/api/0'
const LOOKBACK_MS = 2 * 3600_000 // 查询回看 2h,覆盖跨轮长段(按结束时间去重,不会重复)
const LS_SYNC = 'plugin.activitywatch.lastSyncMs'
const SKIP = [/1password/i, /keychain/i, /bitwarden/i, /password/i] // 命中 app 名或标题即丢

// 可调参数:详情页设置区写 localStorage,这里每次用时现读(缺省=default;非法值回落)。
const DEFAULTS = { minFocusS: 20, pollMinutes: 1, endLagS: 90, maxLinesPerPoll: 12 }
const num = (key) => {
  const v = Number(localStorage.getItem(`plugin.activitywatch.${key}`))
  return Number.isFinite(v) && v > 0 ? v : DEFAULTS[key]
}

ctx.registerSetting({ key: 'minFocusS', label: '最小停留时长(秒)', type: 'number', default: DEFAULTS.minFocusS, min: 5, max: 600, description: '同一 app 连续焦点(合并后)不足此时长的段当噪音丢弃' })
ctx.registerSetting({ key: 'pollMinutes', label: '轮询间隔(分钟)', type: 'number', default: DEFAULTS.pollMinutes, min: 1, max: 30, description: '多久检查一次 ActivityWatch 的新数据' })
ctx.registerSetting({ key: 'endLagS', label: '结算延迟(秒)', type: 'number', default: DEFAULTS.endLagS, min: 30, max: 600, description: '段结束多久后才计入(防 heartbeat 复活重复记录;调小=更快见到,略增重复风险)' })
ctx.registerSetting({ key: 'maxLinesPerPoll', label: '单轮行数上限', type: 'number', default: DEFAULTS.maxLinesPerPoll, min: 3, max: 50, description: '离线补拉防刷屏,超出丢弃更早的段' })

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

/** 相邻同 app 段合并 → [{app,title,secs}];SKIP 命中直接丢;合并后 < 最小时长的段丢。 */
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
  return out.filter((s) => s.secs >= num('minFocusS'))
}

async function poll() {
  try {
    const { win } = await pickBuckets()
    if (!win) return
    const sinceMs = Number(localStorage.getItem(LS_SYNC)) || (Date.now() - 15 * 60_000) // 首次只回看 15min
    const endMs = Date.now() - num('endLagS') * 1000
    if (endMs <= sinceMs) return
    const segs = foldFocus(await doneEvents(win, sinceMs, endMs))
    for (const s of segs.slice(-num('maxLinesPerPoll'))) {
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
        ? 'ActivityWatch 已连接,窗口焦点定期同步进活动日志'
        : 'ActivityWatch 在线但没有窗口监控桶(aw-watcher-window 未运行?)')
    } catch {
      ctx.app.notify('未检测到 ActivityWatch:请安装并运行 activitywatch.net(免费开源,数据全在本机)')
    }
  },
})

// setTimeout 自排程(而非 setInterval):每轮取最新的轮询间隔设置,改动下一轮生效。
let timer = null
let stopped = false
const schedule = () => {
  if (stopped) return
  timer = setTimeout(async () => { await poll(); schedule() }, num('pollMinutes') * 60_000)
}
void poll()
schedule()
return () => { stopped = true; if (timer) clearTimeout(timer) }
