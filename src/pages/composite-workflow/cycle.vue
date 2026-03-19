<script setup lang="ts">
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@/common/utils/format"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionConfig from "@/pages/dashboard/components/ActionConfig.vue"
import GameInfo from "@/pages/dashboard/components/GameInfo.vue"
import PriceStatusSelect from "@/pages/dashboard/components/PriceStatusSelect.vue"
import type { CycleWorkflowRow } from "./cycle"
import { discoverCycleWorkflowRows, summarizeCycleItems } from "./cycle"

const { t } = useI18n()
const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const form = useMemory("cycle-workflow-form", {
  includeEquipment: false,
  catalystRank: 0,
  includeTeaCost: true,
  includeBonusDrops: true,
  minGroupSize: 2,
  resultLimit: 100,
  keyword: ""
})

const rows = shallowRef<CycleWorkflowRow[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailRow = shallowRef<CycleWorkflowRow>()
const stats = ref({
  transmutableItemCount: 0,
  cycleGroupCount: 0,
  analyzedGroupCount: 0
})

const matchedRows = computed(() => {
  const keyword = String(form.value.keyword || "").trim().toLowerCase()
  if (!keyword) {
    return rows.value
  }
  return rows.value.filter((row) => {
    if (row.name.toLowerCase().includes(keyword)) return true
    if (row.bestStartName.toLowerCase().includes(keyword)) return true
    return row.details.some(item => item.name.toLowerCase().includes(keyword))
  })
})

const filteredRows = computed(() => {
  const limit = Math.min(500, Math.max(20, Number(form.value.resultLimit) || 100))
  return matchedRows.value.slice(0, limit)
})

function resetStats() {
  stats.value = {
    transmutableItemCount: 0,
    cycleGroupCount: 0,
    analyzedGroupCount: 0
  }
}

const emptyDescription = computed(() => {
  const keyword = String(form.value.keyword || "").trim()
  if (keyword && rows.value.length) {
    return t("当前关键词没有匹配到结果。可换个关键词，或先清空关键词查看全部结果。")
  }
  if (!stats.value.cycleGroupCount) {
    return t("还没有结果，调整条件后点击 开始搜索")
  }
  return t("已识别到循环组，但当前没有可展示结果。可尝试放宽包含装备等条件。")
})

const onPriceStatusChange = usePriceStatus("cycle-workflow-price-status")

async function runSearch() {
  loading.value = true
  try {
    const result = await discoverCycleWorkflowRows({
      includeEquipment: !!form.value.includeEquipment,
      catalystRank: Math.min(2, Math.max(0, Number(form.value.catalystRank) || 0)),
      includeTeaCost: !!form.value.includeTeaCost,
      includeBonusDrops: !!form.value.includeBonusDrops,
      minGroupSize: Math.min(50, Math.max(1, Number(form.value.minGroupSize) || 2)),
      resultLimit: Math.min(500, Math.max(20, Number(form.value.resultLimit) || 100))
    })
    rows.value = result.rows
    stats.value = result.stats
  } finally {
    loading.value = false
  }
}

function openDetail(row: CycleWorkflowRow) {
  detailRow.value = row
  detailVisible.value = true
}

function formatMaybeMoney(value: number) {
  if (!Number.isFinite(value)) {
    return "-"
  }
  return Format.money(value)
}

function formatMaybeHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-"
  }
  return `${Format.number(value, 3)} h`
}

function formatOutputSource(source: "transmute" | "bonus") {
  return source === "bonus" ? t("额外掉落") : t("转化产物")
}

watch([
  () => gameStore.marketData,
  () => gameStore.buyStatus,
  () => gameStore.sellStatus,
  () => playerStore.config,
  () => Array.from(priceStore.map.values()),
  () => priceStore.activated
], () => {
  rows.value = []
  resetStats()
}, { deep: true })
</script>

<template>
  <div class="app-container cycle-workflow-page">
    <el-space direction="vertical" fill :size="16" style="width: 100%">
      <div class="game-info">
        <GameInfo />
        <div>
          <ActionConfig />
        </div>
        <PriceStatusSelect @change="onPriceStatusChange" />
      </div>

      <el-card shadow="never" class="hero-card">
        <template #header>
          <div class="hero-header">
            <div>
              <div class="hero-title">{{ t("循环工作流") }}</div>
              <div class="hero-subtitle">
                {{ t("自动识别能互相转化的物品组，并计算每组里哪些物品应保留、哪些物品应继续转化，以及最佳起手物品的日利。") }}
              </div>
            </div>
            <el-button type="primary" :loading="loading" @click="runSearch">
              {{ t("开始搜索") }}
            </el-button>
          </div>
        </template>

        <el-alert
          :title="t('当前版本只分析转化闭环，不会并入制造/分解，也不会处理无限循环之外的复合流程。默认会计入茶成本与额外掉落收益；如果你想只看闭环本体，可以手动关闭。')"
          type="info"
          :closable="false"
          class="hero-alert"
        />

        <el-row :gutter="12">
          <el-col :xs="24" :lg="14">
            <el-form label-width="120px" class="control-form">
              <el-form-item :label="t('包含装备')">
                <el-switch v-model="form.includeEquipment" />
              </el-form-item>
              <el-form-item :label="t('催化剂')">
                <el-radio-group v-model="form.catalystRank">
                  <el-radio-button :label="0">
                    {{ t("不使用") }}
                  </el-radio-button>
                  <el-radio-button :label="1">
                    {{ t("普通") }}
                  </el-radio-button>
                  <el-radio-button :label="2">
                    {{ t("主要") }}
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item :label="t('计入茶成本')">
                <el-switch v-model="form.includeTeaCost" />
              </el-form-item>
              <el-form-item :label="t('计入额外掉落')">
                <el-switch v-model="form.includeBonusDrops" />
              </el-form-item>
              <el-form-item :label="t('关键词')">
                <el-input v-model="form.keyword" clearable :placeholder="t('可输入物品名，如 太阳石 / Precision / Tea')" />
              </el-form-item>
            </el-form>
          </el-col>
          <el-col :xs="24" :lg="10">
            <el-row :gutter="12">
              <el-col :xs="12">
                <div class="control-card">
                  <div class="control-label">{{ t("最小循环组大小") }}</div>
                  <el-input-number v-model="form.minGroupSize" :min="1" :max="50" :step="1" />
                </div>
              </el-col>
              <el-col :xs="12">
                <div class="control-card">
                  <div class="control-label">{{ t("显示数量") }}</div>
                  <el-input-number v-model="form.resultLimit" :min="20" :max="500" :step="20" />
                </div>
              </el-col>
            </el-row>
          </el-col>
        </el-row>
      </el-card>

      <el-card shadow="never" class="result-card">
        <template #header>
          <div class="result-header">
            <div class="hero-title">{{ t("搜索结果") }}</div>
            <div class="stats-text">
              {{ t("可转化物品") }}: {{ stats.transmutableItemCount }} |
              {{ t("闭环组") }}: {{ stats.cycleGroupCount }} |
              {{ t("有效结果") }}: {{ stats.analyzedGroupCount }} |
              {{ t("匹配结果") }}: {{ matchedRows.length }}
            </div>
          </div>
        </template>

        <el-empty
          v-if="!filteredRows.length && !loading"
          :description="emptyDescription"
        />

        <el-table v-else :data="filteredRows" v-loading="loading" size="small" style="width: 100%">
          <el-table-column type="index" width="54" />
          <el-table-column :label="t('循环组')" min-width="240">
            <template #default="{ row }">
              {{ summarizeCycleItems(row.summaryHrids, 5) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('推荐保留')" min-width="180">
            <template #default="{ row }">
              {{ summarizeCycleItems(row.keepHrids, 3) || "-" }}
            </template>
          </el-table-column>
          <el-table-column :label="t('继续转化')" min-width="180">
            <template #default="{ row }">
              {{ summarizeCycleItems(row.continueHrids, 3) || "-" }}
            </template>
          </el-table-column>
          <el-table-column :label="t('最佳起手')" min-width="140">
            <template #default="{ row }">
              {{ row.bestStartName }}
            </template>
          </el-table-column>
          <el-table-column :label="t('建议')" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.bestAction === 'transmute' ? 'warning' : 'success'" effect="plain">
                {{ row.bestAction === "transmute" ? t("继续转化") : t("保留") }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('日利')" width="140" align="right">
            <template #default="{ row }">
              <span :class="row.bestProfitPD >= 0 ? 'positive' : 'negative'">
                {{ formatMaybeMoney(row.bestProfitPD) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('利润率')" width="120" align="right">
            <template #default="{ row }">
              <span :class="row.bestProfitRate >= 0 ? 'positive' : 'negative'">
                {{ Format.percent(row.bestProfitRate) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('单件净收益')" width="140" align="right">
            <template #default="{ row }">
              <span :class="row.bestProfitPerItem >= 0 ? 'positive' : 'negative'">
                {{ Format.money(row.bestProfitPerItem) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('单件耗时')" width="120" align="right">
            <template #default="{ row }">
              {{ formatMaybeHours(row.bestHoursPerItem) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('操作')" width="100" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">
                {{ t("详情") }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-space>

    <el-drawer v-model="detailVisible" :title="t('循环工作流详情')" size="88%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="control-label">{{ t("最佳起手") }}</div>
                <div class="summary-value">{{ detailRow.bestStartName }}</div>
              </div>
              <div>
                <div class="control-label">{{ t("建议") }}</div>
                <div class="summary-value">
                  {{ detailRow.bestAction === "transmute" ? t("继续转化") : t("保留") }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("日利") }}</div>
                <div class="summary-value" :class="detailRow.bestProfitPD >= 0 ? 'positive' : 'negative'">
                  {{ formatMaybeMoney(detailRow.bestProfitPD) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("单件净收益") }}</div>
                <div class="summary-value" :class="detailRow.bestProfitPerItem >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(detailRow.bestProfitPerItem) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("利润率") }}</div>
                <div class="summary-value" :class="detailRow.bestProfitRate >= 0 ? 'positive' : 'negative'">
                  {{ Format.percent(detailRow.bestProfitRate) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("单件总成本") }}</div>
                <div class="summary-value">
                  {{ Format.money(detailRow.bestTotalCostPerItem) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("单件耗时") }}</div>
                <div class="summary-value">
                  {{ formatMaybeHours(detailRow.bestHoursPerItem) }}
                </div>
              </div>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">{{ t("推荐保留") }}</div>
                </template>
                <div class="step-list">
                  <el-tag
                    v-for="hrid in detailRow.keepHrids"
                    :key="hrid"
                    effect="plain"
                    type="success"
                  >
                    {{ summarizeCycleItems([hrid], 1) }}
                  </el-tag>
                  <span v-if="!detailRow.keepHrids.length">-</span>
                </div>
              </el-card>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">{{ t("推荐继续转化") }}</div>
                </template>
                <div class="step-list">
                  <el-tag
                    v-for="hrid in detailRow.continueHrids"
                    :key="hrid"
                    effect="plain"
                    type="warning"
                  >
                    {{ summarizeCycleItems([hrid], 1) }}
                  </el-tag>
                  <span v-if="!detailRow.continueHrids.length">-</span>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">{{ t("循环外收益产物") }}</div>
            </template>

            <el-table
              v-if="detailRow.bestExternalOutputs.length"
              :data="detailRow.bestExternalOutputs"
              size="small"
              style="width: 100%"
            >
              <el-table-column width="54">
                <template #default="{ row }">
                  <ItemIcon :hrid="row.hrid" />
                </template>
              </el-table-column>
              <el-table-column :label="t('物品')" min-width="180">
                <template #default="{ row }">
                  {{ row.name }}
                </template>
              </el-table-column>
              <el-table-column :label="t('来源')" width="120" align="center">
                <template #default="{ row }">
                  <el-tag effect="plain" :type="row.source === 'bonus' ? 'success' : 'info'">
                    {{ formatOutputSource(row.source) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('单件期望数量')" width="140" align="right">
                <template #default="{ row }">
                  {{ Format.number(row.expectedUnitsPerItem, 4) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('单价')" width="120" align="right">
                <template #default="{ row }">
                  {{ Format.money(row.unitPrice) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('单件价值')" width="140" align="right">
                <template #default="{ row }">
                  {{ Format.money(row.totalValuePerItem) }}
                </template>
              </el-table-column>
            </el-table>

            <el-empty
              v-else
              :description="t('当前最佳起手在最优策略下没有额外的循环外收益产物。')"
            />
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">{{ t("组内物品明细") }}</div>
            </template>

            <el-table :data="detailRow.details" size="small" style="width: 100%">
              <el-table-column width="54">
                <template #default="{ row }">
                  <ItemIcon :hrid="row.hrid" />
                </template>
              </el-table-column>
              <el-table-column :label="t('物品')" min-width="180">
                <template #default="{ row }">
                  {{ row.name }}
                </template>
              </el-table-column>
              <el-table-column :label="t('建议')" width="120" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.shouldTransmute ? 'warning' : 'success'" effect="plain">
                    {{ row.shouldTransmute ? t("继续转化") : t("保留") }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('买价')" width="120" align="right">
                <template #default="{ row }">
                  {{ Format.money(row.buyPrice) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('卖价')" width="120" align="right">
                <template #default="{ row }">
                  {{ Format.money(row.sellPrice) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('保留价值')" width="120" align="right">
                <template #default="{ row }">
                  {{ Format.money(row.keepValue) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('继续转化价值')" width="140" align="right">
                <template #default="{ row }">
                  {{ Format.money(row.transmuteValue) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('最终期望价值')" width="140" align="right">
                <template #default="{ row }">
                  {{ Format.money(row.resolvedValue) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('单件净收益')" width="140" align="right">
                <template #default="{ row }">
                  <span :class="row.profitPerItem >= 0 ? 'positive' : 'negative'">
                    {{ Format.money(row.profitPerItem) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column :label="t('单件动作数')" width="120" align="right">
                <template #default="{ row }">
                  {{ row.shouldTransmute ? Format.number(row.actionsPerItem, 3) : "-" }}
                </template>
              </el-table-column>
              <el-table-column :label="t('单件耗时')" width="120" align="right">
                <template #default="{ row }">
                  {{ formatMaybeHours(row.hoursPerItem) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('日利')" width="140" align="right">
                <template #default="{ row }">
                  <span :class="row.profitPD >= 0 ? 'positive' : 'negative'">
                    {{ formatMaybeMoney(row.profitPD) }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-space>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.cycle-workflow-page {
  --page-card-bg: var(--el-bg-color);
  --page-card-overlay: color-mix(in srgb, var(--el-bg-color-overlay) 88%, transparent);
  --page-card-border: var(--el-border-color-light);
  --page-text-secondary: var(--el-text-color-regular);
  --page-hero-radial: rgba(242, 184, 67, 0.18);
  --page-hero-linear-start: color-mix(in srgb, var(--el-bg-color) 92%, #fffef9);
  --page-hero-linear-end: var(--el-bg-color);

  .game-info {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: center;
  }

  .hero-card,
  .result-card {
    border-radius: 14px;
  }

  .hero-card {
    background:
      radial-gradient(620px 220px at 0% 0%, var(--page-hero-radial), transparent 58%),
      linear-gradient(180deg, var(--page-hero-linear-start) 0%, var(--page-hero-linear-end) 100%);
  }

  .hero-header,
  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .hero-title {
    font-size: 18px;
    font-weight: 700;
  }

  .hero-subtitle,
  .stats-text {
    color: var(--page-text-secondary);
    font-size: 13px;
    line-height: 1.6;
  }

  .hero-alert {
    margin-bottom: 16px;
  }

  .control-form {
    padding-right: 8px;
  }

  .control-card {
    height: 100%;
    padding: 12px;
    border: 1px solid var(--page-card-border);
    border-radius: 12px;
    background: var(--page-card-overlay);
  }

  .control-label {
    color: var(--page-text-secondary);
    font-size: 13px;
    margin-bottom: 8px;
  }

  .detail-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    align-items: center;
  }

  .summary-value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
  }

  .step-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 32px;
    align-items: center;
  }

  .positive {
    color: #67c23a;
  }

  .negative {
    color: #f56c6c;
  }
}

:global(html.dark-blue) .cycle-workflow-page {
  --page-card-overlay: color-mix(in srgb, var(--el-bg-color-overlay) 92%, transparent);
  --page-hero-radial: rgba(242, 184, 67, 0.12);
  --page-hero-linear-start: color-mix(in srgb, var(--el-bg-color) 88%, #1f1608);
  --page-hero-linear-end: color-mix(in srgb, var(--el-bg-color) 96%, #120d04);
}
</style>
