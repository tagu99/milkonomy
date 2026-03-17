<div align="center">
  <img alt="logo" width="120" height="120" src="./src/common/assets/images/layouts/logo.png">
  <h1>Milkonomy</h1>
  <p>Milky Way Idle 利润/强化/炼金等计算工具（Vue3 + Vite + TypeScript）</p>
</div>

## 项目说明

本项目最初由 [luyh7/milkonomy](https://github.com/luyh7/milkonomy) 开源发布。原作者已停止维护，但仓库仍可用于自部署/自用。

Milkonomy 是一个纯前端工具站：读取游戏静态数据（`public/data/data.json`）与市场数据（远端接口），在浏览器侧完成各类计算与排行榜展示。

## 主要功能（概览）

- 利润排行榜（制造/采集/炼金等）
- 强化成本/收益测算（含保护道具、税率、时薪等）
- 工作流（多步骤链路）计算
- 收藏、手动价格、玩家配置（装备/茶/社区 Buff 等）

## 本仓库增改说明（近期）

- 新增页面：`复合工作流`（左侧菜单入口 `/composite-workflow`），用于计算“多步骤复合动作”的净收益。
- 复合工作流当前先落地了一条固定链路（用于验证流程与计算逻辑）：分解神秘原木/神圣牛奶/杨桃 → 制作点金催化剂 → 转化点金催化剂。
- 引入“运行时补丁数据层”以应对游戏更新导致 `public/data/data.json` 过期或缺失：
- 入口：`src/common/config/supplemental-game-data.ts`
- 行为：在应用启动加载 game data 后，向 `itemDetailMap` 注入缺失的新物品，并为部分物品补齐 icon fallback
- 目的：不依赖手工频繁更新整份静态数据文件，也避免 UI/计算器因为缺失条目直接不可用
- 已修复/已对齐的关键点：
- 首页利润排行筛选“制造”项目为空：修正筛选值与排行榜 `project` 字段一致
- 强化速度加成上限：对齐 wiki 的 over-level speed bonus 上限（每级最多 25%）
- 迷宫精炼碎片分解配方：对齐海盗精炼碎片的要求等级与副产结构，产物为 2000 迷宫精华（分解基础成功率本项目默认 60%）

## 技术栈

- 前端框架：Vue 3、TypeScript、Vite
- UI：Element Plus
- 状态：Pinia
- 路由：vue-router
- 国际化：vue-i18n
- 样式：UnoCSS + SCSS
- 测试：Vitest（`happy-dom`）

## 数据来源与刷新策略

- 游戏基础数据：`public/data/data.json`（仓库内置，可离线读取）
- 市场数据：默认从 `https://www.milkywayidle.com/game_data/marketplace.json` 拉取
- 刷新：应用启动时拉取一次；运行中每 5 分钟刷新一次（见 `src/main.ts`）

> 网络不可用时，页面可能只能使用本地缓存/静态数据，部分功能会提示获取失败。

## 双版本构建（public/private）

项目有两套 mode：`public` 与 `private`，通过环境文件控制（`.env.public`、`.env.private`）。

- 开发：`pnpm dev:public` / `pnpm dev:private`
- 构建：`pnpm build:public` / `pnpm build:private`

更详细说明见 `BUILD_SYSTEM.md`。

## 本地打开/运行（从“网页使用”到“本地使用”）

你之前访问的是作者部署的静态站点。自己使用时，推荐在本地起一个开发服务器或构建后预览。

### 1) 准备环境

- Node.js：建议 20+
- 包管理器：推荐 `pnpm`

### 2) 安装依赖

```bash
pnpm install
```

### 3) 启动开发模式（最常用）

```bash
# 默认启动 private mode（见 package.json）
pnpm dev

# 或显式启动 public/private
pnpm dev:public
pnpm dev:private
```

启动后 Vite 通常会自动打开浏览器，端口默认是 `3333`（见 `vite.config.ts`）。

### 4) 构建并本地预览（接近线上部署形态）

```bash
pnpm build:public
pnpm preview
```

构建产物在 `dist/`，也可以用任意静态文件服务器部署 `dist/`。

## 常见注意事项

- 仓库里同时存在 `pnpm-lock.yaml` 和 `package-lock.json`：建议统一使用 `pnpm`，避免依赖不一致。
- `.husky/pre-commit` 里使用了 `tsx scripts/update-version.ts`：如果你的环境没有 `tsx`，可先跳过 Git hooks 或自行调整。
- 部分 GitHub Actions / script 引用的 `scripts/alchemy-leaderboard/*` 在当前仓库中不存在，相关任务会失败（不影响本地运行）。

## 许可

[MIT](./LICENSE) License © 2025 [luyh7](https://github.com/luyh7)
