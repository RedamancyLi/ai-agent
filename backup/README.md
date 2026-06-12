# 原版静态页面备份

`public-vanilla/` 为 React 重构前的完整前端（HTML + CSS + JS）。

## 如何临时使用原版

1. 将 `public-vanilla` 中的文件复制回项目根目录的 `public/`（覆盖当前内容）
2. 确保 `server.js` 未指向 `dist/`（或删除 `dist` 目录）
3. 运行 `npm run ui`，访问 http://localhost:3000

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.html` | 页面结构 |
| `app.js` | 流式 SSE、Markdown、工具确认、时间线 |
| `styles.css` | 样式 |

备份时间：React 重构时自动生成（与 `public/` 原版同步）。

## React 版如何使用

```bash
# 生产：构建 React 后启动（优先使用 dist/）
npm run dev

# 开发热更新：后端 3000 + Vite 5173
npm run dev:hot
# 浏览器打开 http://localhost:5173

# 仅原版静态页（不构建 React）
npm run ui
# 若存在 dist/，需先删除 dist 或改 server.js 才会用 public/
```
