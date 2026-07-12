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
