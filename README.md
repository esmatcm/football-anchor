# 金银伯直播管理系统 | Football Anchor

> **中文优先** · 赛程 · 排班 · 审核 · 统计 · 一站管理

**English:** A full-stack anchor scheduling & match management system for live sports broadcasting operations.

---

## 功能概览 | Features

| 模块 | 说明 |
|------|------|
| 🏆 赛程管理 | 自动抓取足球 / CBA / NBA / 韩篮甲 / NBL 赛程，开关报名、状态管控 |
| 📋 报名审核 | 主播报名申请、管理员审核、优先级与异常标注 |
| 🗓️ 排班时间表 | 按日期/联赛/主播查看排班，支持快速筛选 |
| 📊 月度统计 | 日历视图查看每月各主播出勤场次与统计数据 |
| 🎙️ 主播端 | 主播独立报名入口、查看排班、场次状态追踪 |
| 🔄 数据核对 | 自动比对数据源，补抓缺漏赛事 |
| 📡 今日赛事 | 24小时时间轴总览，实时显示排班进度 |
| 🌏 多联赛支持 | 足球 · CBA · NBA · 韩篮甲 · NBL(澳篮) |

---

## 技术栈 | Tech Stack

```
前端 Frontend   : React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand + React Router
后端 Backend    : Express 4 + TypeScript (ESM)
数据库 Database  : SQLite (better-sqlite3) · 单机部署零依赖
认证 Auth       : JWT + bcryptjs
抓取 Scraper    : axios + iconv-lite · 定时自动抓取 (30min interval)
运行环境 Runtime : Node.js 22+ · systemd 管理
```

---

## 目录结构 | Project Structure

```
football-anchor/
├── src/
│   ├── pages/
│   │   ├── admin/        # 管理后台页面
│   │   └── anchor/       # 主播端页面
│   ├── components/       # 共用组件
│   ├── lib/              # 工具函数、API、日期处理
│   └── server/
│       ├── routes/       # API 路由 (matches/applications/stats/auth)
│       ├── scraper.ts    # 赛程数据抓取引擎
│       └── db.ts         # 数据库初始化与 Schema
├── server.ts             # Express 主入口
├── scripts/              # 运维脚本 (备份/修复/回归测试)
└── data/                 # SQLite 数据库 (gitignore)
```

---

## 快速部署 | Deployment

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env: JWT_SECRET, PORT, AUTO_SCRAPE 等

# 3. 开发模式
npm run dev

# 4. 生产构建
npm run build
node build/server.js
```

### systemd 服务示例

```ini
[Unit]
Description=Football Anchor Node App
After=network.target

[Service]
WorkingDirectory=/srv/football-anchor
Environment=NODE_ENV=production
EnvironmentFile=/srv/football-anchor/.env
ExecStart=/usr/bin/node /srv/football-anchor/build/server.js
Restart=always
User=www-data
```

---

## 数据源 | Data Sources

- **足球**: [bf.titan007.com](https://bf.titan007.com) — 日赛程快照
- **篮球** (CBA/NBA/韩篮甲/NBL): [nba.titan007.com](https://nba.titan007.com) — 月度赛程 + 季后赛

---

## 版本历史 | Changelog

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-03-29 | 首版发布：多联赛抓取、完整后台、主播端、NBL 季后赛支持 |

---

## License

MIT © 2026 esmatcm
