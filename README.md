<div align="center">
  <img alt="logo" width="120" height="120" src="./src/common/assets/images/layouts/logo.png">
  <h1>Milkonomy</h1>
  <p>Milky Way Idle 利润/强化/炼金等计算工具（Vue 3 + Vite + TypeScript）</p>
</div>

## 项目说明

本项目最初来自 [luyh7/milkonomy](https://github.com/luyh7/milkonomy)。它是一个纯前端工具站：读取游戏静态数据（`public/data/data.json`）与市场数据（远端接口），在浏览器端完成各类收益计算与排行展示。

## 本仓库增改说明（近期）

- 新增左侧菜单页签 `复合工作流`（路由：`/composite-workflow`）：用于计算多步链路的净产出与净收益（第一版先落地一条固定链路以验证流程与计算逻辑）。
- 引入“运行时补丁数据层”，用于在游戏更新后 `public/data/data.json` 过期或缺条目时，补齐新物品与必要字段，避免 UI/计算器不可用：
  - 入口：[supplemental-game-data.ts](./src/common/config/supplemental-game-data.ts)
  - 行为：加载 game data 后对 `itemDetailMap` 注入缺失物品，并为部分物品补齐 icon fallback
- 修复首页 `利润排行` 中筛选选择 `制造` 后无子项的问题（筛选值与翻译值不一致导致）。
- 修复强化“超等级”速度加成的上限，对齐游戏规则（每级最多 +25%）。
- 修复“转化”可用性判断：当 `transmuteDropTable` 为空或为 `null` 时不再误判为可转化。
- 新物品配方修复：`迷宫精炼碎片` 分解规则对齐 `海盗精炼碎片`（要求等级与副产品结构一致），主要产物为 `2000 迷宫精华`；本项目内“分解”基础成功率为 60%（见 `DecomposeCalculator.baseSuccessRate`）。

## 本地运行

1. 安装依赖：`pnpm install`
2. 启动开发：`pnpm dev`
3. 构建预览：`pnpm build` 后 `pnpm preview`

## 关于 public/private mode

仓库内仍保留 `public/private` 的 mode 配置与脚本（历史遗留）。当前默认以 `private` mode 使用（`pnpm dev` 即可），后续可以按需求进一步简化。

## 许可

[MIT](./LICENSE)

