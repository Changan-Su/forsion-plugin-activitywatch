/**
 * 自检:用宿主同款方式(new Function('ctx', src))跑 main.js,mock ActivityWatch API,
 * 断言:相邻同 app 折叠、中断不合并、<20s 噪音丢、SKIP 隐私名单丢、进行中段本轮不记、
 * 二轮按 lastSync 去重零新行、registerSetting 声明齐全、minFocusS 设置生效。跑法:node check.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as A } from 'node:assert'

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8')

const NOW = Date.parse('2026-07-12T12:00:00Z')
Date.now = () => NOW
const T = (secAgo) => new Date(NOW - secAgo * 1000).toISOString()

// 窗口桶事件:两段 Chrome 中间隔了 Code(不该合并),Finder 10s 噪音,1Password 隐私,末尾进行中段
const winEvents = [
  { timestamp: T(600), duration: 300, data: { app: 'Google Chrome', title: 'GitHub - PR' } },
  { timestamp: T(240), duration: 45, data: { app: 'Code', title: 'main.js' } },
  { timestamp: T(300), duration: 120, data: { app: 'Google Chrome', title: 'Docs' } },
  { timestamp: T(180), duration: 10, data: { app: 'Finder', title: '' } },
  { timestamp: T(165), duration: 60, data: { app: '1Password', title: 'vault' } },
  { timestamp: T(60), duration: 55, data: { app: 'Slack', title: 'ongoing' } }, // end=NOW-5s,还没过 90s 缓冲
]
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.endsWith('/buckets/')) return { ok: true, json: async () => ({ 'aw-watcher-window_host': { type: 'currentwindow' } }) }
  if (u.includes('/events')) return { ok: true, json: async () => winEvents }
  return { ok: false }
}
// main.js 的轮询改为 setTimeout 自排程(每轮现读间隔设置);hook 掉长延时的注册,保留短延时(测试自用)。
const origSetTimeout = globalThis.setTimeout
let pollWrapper = null
globalThis.setTimeout = (fn, ms) => (ms >= 1000 ? ((pollWrapper = fn), 0) : origSetTimeout(fn, ms))
globalThis.clearTimeout = () => {}

const logged = []
const settings = []
const ctx = {
  activity: { log: (ev, d) => logged.push({ ev, d }) },
  registerCommand: () => {},
  registerSetting: (def) => settings.push(def),
  app: { notify: () => {} },
}
const dispose = new Function('ctx', src)(ctx)
await new Promise((r) => origSetTimeout(r, 30)) // 等 setup 里的首轮 void poll()

A.equal(logged.length, 3, `首轮应记 3 行,实际 ${JSON.stringify(logged)}`)
A.deepEqual(logged[0], { ev: 'focus', d: { app: 'Google Chrome', m: 5, text: 'GitHub - PR' } })
A.deepEqual(logged[1], { ev: 'focus', d: { app: 'Code', m: 1, text: 'main.js' } })
A.deepEqual(logged[2], { ev: 'focus', d: { app: 'Google Chrome', m: 2, text: 'Docs' } })

await pollWrapper() // 二轮:lastSync 已推进到 endMs → 零新行(wrapper 会再 schedule,mock 里只是覆盖 pollWrapper)
A.equal(logged.length, 3, '二轮不应重复记录')

// 设置声明齐全 + minFocusS 设置生效:抬到 50s → 重扫后 Code(45s)被丢,只剩两段 Chrome
A.deepEqual(settings.map((s) => s.key).sort(), ['endLagS', 'maxLinesPerPoll', 'minFocusS', 'pollMinutes'], '四个设置应已声明')
store.delete('plugin.activitywatch.lastSyncMs')
store.set('plugin.activitywatch.minFocusS', '50')
logged.length = 0
await pollWrapper()
A.equal(logged.length, 2, `minFocusS=50 应只记 2 行,实际 ${JSON.stringify(logged)}`)
A.ok(logged.every((l) => l.d.app === 'Google Chrome'), 'Code 45s 段应被 minFocusS=50 过滤')

A.equal(typeof dispose, 'function', 'setup 应返回 disposer')
dispose()
console.log('check ok —', settings.length, 'settings;', logged.map((l) => `${l.ev} ${l.d.app} m=${l.d.m}`).join(' | '))
