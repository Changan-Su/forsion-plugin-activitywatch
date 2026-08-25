# ActivityWatch 系统活动(Forsion 外置插件)

把本机 [ActivityWatch](https://activitywatch.net) 记录的**窗口焦点**折叠进 Forsion 活动日志，
让 Muse 等后台智能体知道你在电脑上用什么(而不只是 Forsion 内的操作):

```
202607121110 plugin:activitywatch:focus app="Google Chrome" m=5 "GitHub - PR"
202607121118 plugin:activitywatch:focus app=Code m=7 "main.js"
```

## 前置

需要本机安装并运行 [ActivityWatch](https://activitywatch.net)(免费开源,数据全在本机)。
**设置 → Forsion → 社区插件 → 点开本插件详情页,「依赖应用」区可一键安装并检测连接**
(manifest 的 `requiresApp: "activitywatch"` 声明,由宿主白名单驱动)。
插件每分钟轮询它的本地 API(`localhost:5600`),未运行时静默待机。

## 安装

把本目录整个复制到 Forsion 插件目录:

```
~/.forsion/plugins/activitywatch/
```

设置 → Forsion → 社区插件里可启停;⌘K「ActivityWatch：检测连接状态」可验证连接。

## 隐私

- **装插件=同意记录**;禁用/删除即停,历史日志仍在本地 `~/.forsion/activity/`(30 天轮转)。
- 数据只写本地活动日志,**绝不上云**。
- 内置隐私名单(1Password/Keychain/Bitwarden 等)命中的窗口直接丢弃;
  想加自己的名单改 `main.js` 顶部 `SKIP`。
- 停留不足 20 秒的切窗噪音不记;每分钟至多 12 行。

## 自检

```
node check.mjs
```

## 开发纪律(照抄本仓写新插件的人必读)

- **命令/斜杠 id 必须带插件前缀**(本仓即 `aw-status`):id 处于全局命名空间,裸 `start`/`status` 两个插件一撞就互相顶掉。成就系列/活动事件不用前缀(宿主自动加 `plugin:<id>:`)。
- **时间纪律**:插件内取「现在」一律 `Date.now()`,本地日期用 `new Date(Date.now())` 推导——check.mjs 靠覆写 `Date.now` 冻钟,裸 `new Date()` 冻不住;轮询用 setTimeout 自排程(每轮现读设置),别用 setInterval。
- **设置值全是字符串**:`registerSetting` 的值存 `localStorage plugin.<插件id>.<key>`(boolean 存 `'true'/'false'`),无变更通知——用时现读,下一轮生效。
- **自检模式**:`new Function('ctx', src)(mockCtx)` 宿主同款执行 + 假定时器(收集 setTimeout 手动触发)+ mock 存储与网络,`node check.mjs` 一条命令回归。发布插件请带上你的 check.mjs。
- 较新的贡献点(`ctx.registerView` 自定义视图、manifest `onboarding` 首启引导)旧宿主可能没有——分发的插件调用前判断存在性(`ctx.registerView?.(…)`),与本仓对 `ctx.activity?.` 的处理同款。
