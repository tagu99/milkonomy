<script lang="ts" setup>
import type { ManufactureCalculator } from "@/calculator/manufacture"
import type { BargainAnalysisRow } from "@/common/apis/jungle/bargain-analysis"
import type { MarketWarningRow } from "@/common/apis/jungle/market-warning"
import type { StableEnhanceRow } from "@/common/apis/jungle/stable"
import { debounce } from "lodash-es"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { getItemDetailOf } from "@/common/apis/game"
import { getBargainAnalysisRows } from "@/common/apis/jungle/bargain-analysis"
import { getInheritSavingRows } from "@/common/apis/jungle/inherit"
import { getMarketWarningRows } from "@/common/apis/jungle/market-warning"
import { getStableEnhanceRows } from "@/common/apis/jungle/stable"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import * as Format from "@/common/utils/format"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

type OverviewFilterState = {
  banJewelry: boolean
  onlyPositiveProfit: boolean
  excludeThinMarket: boolean
}

const router = useRouter()
const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const loading = ref(false)
const loadedAt = ref("")
const stableSourceRows = ref<StableEnhanceRow[]>([])
const inheritSourceRows = ref<ManufactureCalculator[]>([])
const bargainSourceRows = ref<BargainAnalysisRow[]>([])
const warningSourceRows = ref<MarketWarningRow[]>([])

const filters = useMemory("strategy-overview-filters", {
  banJewelry: true,
  onlyPositiveProfit: true,
  excludeThinMarket: true
}) as Ref<OverviewFilterState>

function isJewelryType(itemType: string) {
  return ["neck", "ring", "earrings"].includes(itemType)
}

function isJewelryItem(hrid: string) {
  return isJewelryType(getEquipmentTypeOf(getItemDetailOf(hrid)))
}

const stableRows = computed(() => {
  return stableSourceRows.value
    .filter((row) => {
      if (filters.value.banJewelry && isJewelryType(row.itemType)) {
        return false
      }
      if (filters.value.excludeThinMarket && row.thinMarket) {
        return false
      }
      if (filters.value.onlyPositiveProfit && row.profitPH < 0) {
        return false
      }
      return true
    })
    .sort((left, right) => {
      if (right.profitPH !== left.profitPH) return right.profitPH - left.profitPH
      if (right.profitToLossRatio !== left.profitToLossRatio) return right.profitToLossRatio - left.profitToLossRatio
      return left.hoursPerTarget - right.hoursPerTarget
    })
    .slice(0, 8)
})

const inheritRows = computed(() => {
  return inheritSourceRows.value
    .filter((row) => {
      if (filters.value.banJewelry && isJewelryItem(row.hrid)) {
        return false
      }
      if (filters.value.onlyPositiveProfit && row.result.profitPH < 0) {
        return false
      }
      return true
    })
    .sort((left, right) => right.result.profitPH - left.result.profitPH)
    .slice(0, 8)
})

const bargainRows = computed(() => {
  return bargainSourceRows.value
    .filter((row) => {
      if (filters.value.banJewelry && isJewelryType(row.itemType)) {
        return false
      }
      return row.gapToAskUnit > 0
    })
    .sort((left, right) => {
      if (right.opportunityScore !== left.opportunityScore) return right.opportunityScore - left.opportunityScore
      return right.gapToAskUnit - left.gapToAskUnit
    })
    .slice(0, 8)
})

const warningRows = computed(() => {
  return warningSourceRows.value
    .filter((row) => {
      if (filters.value.banJewelry && isJewelryType(row.itemType)) {
        return false
      }
      return row.riskScore >= 50
    })
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, 8)
})

const summaryCards = computed(() => {
  const stableTop = stableRows.value[0]
  const inheritTop = inheritRows.value[0]
  const bargainTop = bargainRows.value[0]
  const highRiskCount = warningSourceRows.value.filter(row => row.riskScore >= 80).length

  return [
    {
      title: "稳定强化",
      value: stableTop ? Format.money(stableTop.profitPH) : "-",
      subtitle: stableTop ? `${stableTop.name} ${stableTop.project}` : "暂无符合条件的路线"
    },
    {
      title: "继承省钱",
      value: inheritTop ? Format.money(inheritTop.result.profitPH) : "-",
      subtitle: inheritTop ? `${inheritTop.result.name} ${inheritTop.project}` : "暂无符合条件的路线"
    },
    {
      title: "可收捡漏",
      value: bargainRows.value.length ? `${bargainRows.value.length}` : "0",
      subtitle: bargainTop ? `${bargainTop.name} +${bargainTop.targetLevel}` : "当前没有正向捡漏"
    },
    {
      title: "高风险提醒",
      value: `${highRiskCount}`,
      subtitle: highRiskCount ? "建议先看反操盘提醒" : "当前没有明显高风险项"
    }
  ]
})

function clearOverviewCaches() {
  gameStore.clearStableEnhanceCache()
  gameStore.clearInheritCache()
  gameStore.clearRecoveryFloorCache()
  gameStore.clearDemandHeatCache()
  gameStore.clearBargainAnalysisCache()
  gameStore.clearMarketWarningCache()
}

const loadOverview = debounce(async () => {
  loading.value = true
  try {
    const [stableRowsData, inheritRowsData, bargainRowsData, warningRowsData] = await Promise.all([
      getStableEnhanceRows({ originLevelMode: "zero_only", silent: true }),
      getInheritSavingRows({ silent: true }),
      getBargainAnalysisRows({ silent: true }),
      getMarketWarningRows({ silent: true })
    ])
    stableSourceRows.value = stableRowsData
    inheritSourceRows.value = inheritRowsData
    bargainSourceRows.value = bargainRowsData
    warningSourceRows.value = warningRowsData
    loadedAt.value = new Date().toLocaleTimeString("zh-CN", { hour12: false })
  } catch (error) {
    console.error(error)
    stableSourceRows.value = []
    inheritSourceRows.value = []
    bargainSourceRows.value = []
    warningSourceRows.value = []
  } finally {
    loading.value = false
  }
}, 200)

function refreshOverview() {
  clearOverviewCaches()
  loadOverview()
}

function goTo(path: string) {
  router.push(path)
}

function sourceName(row: ManufactureCalculator) {
  return getItemDetailOf(row.actionItem.upgradeItemHrid).name
}

function formatMoneyOrDash(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "-"
  }
  return Format.money(value)
}

function formatSignedMoney(value: number) {
  if (!Number.isFinite(value)) {
    return "-"
  }
  return Format.money(value)
}

function formatPercentOrDash(value: number) {
  if (!Number.isFinite(value)) {
    return "-"
  }
  return Format.percent(value)
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-"
  }
  return `${Format.number(value, 2)} h`
}

function formatExpLossRatio(value: number) {
  if (!Number.isFinite(value)) {
    return value > 0 ? "INF" : "-INF"
  }
  const absValue = Math.abs(value)
  if (absValue < 0.1) {
    return Format.number(value, 4)
  }
  if (absValue < 1) {
    return Format.number(value, 3)
  }
  return Format.number(value, 2)
}

function riskTagType(score: number) {
  if (score >= 80) return "danger"
  if (score >= 50) return "warning"
  return "info"
}

const onPriceStatusChange = usePriceStatus("strategy-overview-price-status")

watch([
  () => gameStore.marketData,
  () => gameStore.buyStatus,
  () => gameStore.sellStatus,
  () => playerStore.config
], () => {
  clearOverviewCaches()
  loadOverview()
}, { deep: true, immediate: true })

watch(() => priceStore.$state, () => {
  clearOverviewCaches()
  loadOverview()
}, { deep: true })
</script>

<template>
  <div class="app-container strategy-overview-page" v-loading="loading">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig
          :actions="['enhancing', 'cheesesmithing', 'crafting', 'tailoring', 'alchemy']"
          :equipments="['off_hand', 'hands', 'neck', 'earrings', 'ring', 'pouch']"
        />
      </div>
      <PriceStatusSelect @change="onPriceStatusChange" />
    </div>

    <el-card shadow="never" class="hero-card">
      <template #header>
        <div class="hero-header">
          <div>
            <div class="hero-title">强化策略总览</div>
            <div class="hero-subtitle">
              把稳定强化、继承省钱、可收捡漏和风险提醒收敛到一个面板里，先判断今天该看什么，再决定是否进入对应细页深挖。
            </div>
          </div>
          <div class="hero-actions">
            <div class="loaded-at">最近加载：{{ loadedAt || "-" }}</div>
            <el-button type="primary" plain @click="refreshOverview">
              刷新面板
            </el-button>
          </div>
        </div>
      </template>

      <div class="filter-row">
        <el-checkbox v-model="filters.banJewelry">排除首饰</el-checkbox>
        <el-checkbox v-model="filters.onlyPositiveProfit">只看正收益路线</el-checkbox>
        <el-checkbox v-model="filters.excludeThinMarket">排除薄市场强化</el-checkbox>
      </div>

      <div class="summary-grid">
        <div v-for="card in summaryCards" :key="card.title" class="summary-card">
          <div class="summary-title">{{ card.title }}</div>
          <div class="summary-value">{{ card.value }}</div>
          <div class="summary-subtitle">{{ card.subtitle }}</div>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" class="section-grid">
      <el-col :xs="24" :xl="12">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="section-header">
              <div>
                <div class="section-title">今日稳定强化</div>
                <div class="section-subtitle">默认只看 +0 起步的重复路线。</div>
              </div>
              <el-button type="primary" link @click="goTo('/stable-enhance')">
                查看全部
              </el-button>
            </div>
          </template>

          <el-table v-if="stableRows.length" :data="stableRows" size="small">
            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.itemHrid" />
              </template>
            </el-table-column>
            <el-table-column label="路线" min-width="220">
              <template #default="{ row }">
                <div class="cell-main">{{ row.name }}</div>
                <div class="cell-sub">目标 +{{ row.targetLevel }} · {{ row.project }} · {{ row.fallbackMode }}</div>
              </template>
            </el-table-column>
            <el-table-column label="利润 / h" min-width="96" align="right">
              <template #default="{ row }">
                {{ formatSignedMoney(row.profitPH) }}
              </template>
            </el-table-column>
            <el-table-column label="经验 / h" min-width="96" align="right">
              <template #default="{ row }">
                {{ Format.number(row.expPH) }}
              </template>
            </el-table-column>
            <el-table-column label="资金占用" min-width="96" align="right">
              <template #default="{ row }">
                {{ formatMoneyOrDash(row.singleCapital) }}
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="当前没有符合条件的稳定强化路线" />
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="12">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="section-header">
              <div>
                <div class="section-title">继承省钱候选</div>
                <div class="section-subtitle">先买低强化底子再继续做，有时比从头开始更省。</div>
              </div>
              <el-button type="primary" link @click="goTo('/inherit-saving')">
                查看全部
              </el-button>
            </div>
          </template>

          <el-table v-if="inheritRows.length" :data="inheritRows" size="small">
            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>
            <el-table-column label="目标" min-width="200">
              <template #default="{ row }">
                <div class="cell-main">{{ row.result.name }}</div>
                <div class="cell-sub">{{ sourceName(row) }} +{{ row.originLevel }} · {{ row.project }}</div>
              </template>
            </el-table-column>
            <el-table-column label="目标等级" width="92" align="center">
              <template #default="{ row }">
                +{{ Format.number(row.targetLevel, 2) }}
              </template>
            </el-table-column>
            <el-table-column label="利润 / h" min-width="96" align="right">
              <template #default="{ row }">
                {{ formatSignedMoney(row.result.profitPH) }}
              </template>
            </el-table-column>
            <el-table-column label="经验 / h" min-width="96" align="right">
              <template #default="{ row }">
                {{ Format.number(row.result.expPH || 0) }}
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="当前没有符合条件的继承候选" />
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="12">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="section-header">
              <div>
                <div class="section-title">可收捡漏</div>
                <div class="section-subtitle">把回收底价和需求热度合并后，更适合普通玩家的收货视角。</div>
              </div>
              <el-button type="primary" link @click="goTo('/bargain-analysis')">
                查看全部
              </el-button>
            </div>
          </template>

          <el-table v-if="bargainRows.length" :data="bargainRows" size="small">
            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.itemHrid" />
              </template>
            </el-table-column>
            <el-table-column label="物品" min-width="200">
              <template #default="{ row }">
                <div class="cell-main">{{ row.name }}</div>
                <div class="cell-sub">+{{ row.targetLevel }} · 需求分 {{ Format.number(row.demandScore, 1) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="左价差" min-width="92" align="right">
              <template #default="{ row }">
                {{ formatMoneyOrDash(row.gapToAskUnit) }}
              </template>
            </el-table-column>
            <el-table-column label="价差率" min-width="90" align="right">
              <template #default="{ row }">
                {{ formatPercentOrDash(row.gapRateToAsk) }}
              </template>
            </el-table-column>
            <el-table-column label="建议" min-width="120">
              <template #default="{ row }">
                {{ row.recommendation }}
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="当前没有正向捡漏条目" />
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="12">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="section-header">
              <div>
                <div class="section-title">高风险提醒</div>
                <div class="section-subtitle">先识别哪些盘口不可靠，再决定要不要参与。</div>
              </div>
              <el-button type="primary" link @click="goTo('/market-warning')">
                查看全部
              </el-button>
            </div>
          </template>

          <el-table v-if="warningRows.length" :data="warningRows" size="small">
            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.itemHrid" />
              </template>
            </el-table-column>
            <el-table-column label="物品" min-width="180">
              <template #default="{ row }">
                <div class="cell-main">{{ row.name }}</div>
                <div class="cell-sub">+{{ row.targetLevel }} · 邻近需求 {{ row.targetNeighborDemandCount }}</div>
              </template>
            </el-table-column>
            <el-table-column label="风险" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="riskTagType(row.riskScore)" effect="light">
                  {{ Format.number(row.riskScore, 1) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="溢价到底价" min-width="96" align="right">
              <template #default="{ row }">
                {{ formatPercentOrDash(row.premiumToFloor) }}
              </template>
            </el-table-column>
            <el-table-column label="建议" min-width="140">
              <template #default="{ row }">
                {{ row.suggestion }}
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="当前没有达到阈值的风险提醒" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.strategy-overview-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-card,
.section-card {
  border: 1px solid var(--el-border-color-light);
  background: linear-gradient(180deg, var(--el-bg-color-overlay) 0%, var(--el-fill-color-extra-light) 100%);
}

.hero-header,
.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.hero-title,
.section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.section-title {
  font-size: 17px;
}

.hero-subtitle,
.section-subtitle,
.loaded-at,
.summary-subtitle,
.cell-sub {
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 18px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background: var(--el-bg-color);
}

.summary-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.summary-value {
  margin: 8px 0 6px;
  font-size: 28px;
  line-height: 1.1;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.section-grid {
  margin-top: 0;
}

.section-card :deep(.el-card__body) {
  padding-top: 12px;
}

.cell-main {
  color: var(--el-text-color-primary);
}

@media (max-width: 1200px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .hero-header,
  .section-header,
  .hero-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
