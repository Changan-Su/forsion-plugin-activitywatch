# 更新日志

插件生态约定:每次发布在最上方追加一节(`## x.y.z — YYYY-MM-DD` + 变更条目)。宿主 `listPlugins` 会读本文件,渲染成插件详情页的「更新日志」段。本文件自 1.2.0 起开始记录。

## 1.4.0 — 2026-08-25

- 随包附带引擎侧技能 `skills/activitywatch/`(「电脑活动探活」):模型侧终于能自己分清「用户没动电脑」和「ActivityWatch 没跑 / 窗口监控没跑 / 插件没启用」——此前活动日志一空,模型只能猜,实测出过「日志不记录外部应用」这种凭空断言。技能走 `run_bash` + `curl localhost:5600/api/0/info` 探活(`web_fetch` 钉公网 IP,到不了 loopback),探不到就诚实指路详情页「依赖应用」区或命令面板的「ActivityWatch：检测连接状态」,不自己装东西。
- 技能里写死两条边界:**host-only**(云端没有本机 AW,捆绑包也不进云端)与**隐私**(日志只在本地 `~/.forsion/activity/`;密码管理器窗口在写入前已被丢弃,技能不得绕过日志去 AW 原始 events 端点把它们捞回来)。
- 插件运行时零改动(`main.js` / `check.mjs` 未动),仅新增随包技能。

## 1.3.0 — 2026-07-23

- 接入宿主全局状态栏(`ctx.registerStatusItem`,2026-07-23 起):底部常驻「⏱」连接状态项,hover 看上次同步时间,点击即检测连接;老宿主可选链自动降级(无状态项,功能不受影响)。
- 「检测连接状态」改走右上角通知 `ctx.notify`(带级别;用户可在设置里按插件静音),老宿主回落底部吐司。

## 1.2.0 — 2026-07-20

- 当前能力基线:把本机 ActivityWatch(`localhost:5600`)的**窗口焦点**数据每分钟轮询、折叠进 Forsion 活动日志(`plugin:activitywatch:focus`),供 Muse 等后台智能体感知你在电脑上用什么。
- 详情页「依赖应用」区可一键安装 / 检测 ActivityWatch(manifest `requiresApp: "activitywatch"` 驱动)。
- 数据只写本地日志,绝不上云;ActivityWatch 未运行时静默待机。
