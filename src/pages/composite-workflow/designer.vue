<script setup lang="ts">
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@/common/utils/format"
import { getItemDetailOf } from "@/common/apis/game"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionConfig from "@/pages/dashboard/components/ActionConfig.vue"
import GameInfo from "@/pages/dashboard/components/GameInfo.vue"
import PriceStatusSelect from "@/pages/dashboard/components/PriceStatusSelect.vue"
import { ElMessage } from "element-plus"
import type { Action } from "~/game"
import type { DiscoveredWorkflowRow, WorkflowDiscoverySearchIntensity } from "./discovery"
import { discoverWorkflowRows, summarizeWorkflowItems } from "./discovery"

const { t } = useI18n()
const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const form = useMemory("workflow-discovery-form", {
  includeEquipment: false,
  maxSteps: 4,
  maxExternalProducts: 2,
  maxExternalIngredients: 4,
  minProfitPD: 0,
  resultLimit: 30,
  allowedManufactureActions: ["crafting", "cheesesmithing", "tailoring"] as Action[],
  searchIntensity: "standard" as WorkflowDiscoverySearchIntensity
})

if (!Array.isArray(form.value.allowedManufactureActions) || !form.value.allowedManufactureActions.length) {
  form.value.allowedManufactureActions = ["crafting", "cheesesmithing", "tailoring"]
}
if (form.value.searchIntensity !== "standard" && form.value.searchIntensity !== "deep") {
  form.value.searchIntensity = "standard"
}

const rows = shallowRef<DiscoveredWorkflowRow[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailRow = shallowRef<DiscoveredWorkflowRow>()
const stats = ref({
  actionCount: 0,
  generatedCount: 0,
  evaluatedCount: 0,
  truncated: false
})

function resetStats() {
  stats.value = {
    actionCount: 0,
    generatedCount: 0,
    evaluatedCount: 0,
    truncated: false
  }
}

const emptyDescription = computed(() => {
  if (!stats.value.generatedCount) {
    return t("还没有结果，调整条件后点击 开始搜索")
  }
  return t("已生成候选组合，但都未通过当前过滤条件。可尝试放宽净产物/净消耗上限，或降低最低日利。")
})

const actionOptions: Array<{ label: string, value: Action }> = [
  { label: t("制作"), value: "crafting" },
  { label: t("奶酪制作"), value: "cheesesmithing" },
  { label: t("裁缝"), value: "tailoring" },
  { label: t("烹饪"), value: "cooking" },
  { label: t("酿造"), value: "brewing" }
]

const onPriceStatusChange = usePriceStatus("workflow-designer-price-status")

async function runSearch() {
  loading.value = true
  try {
    const result = await discoverWorkflowRows({
      includeEquipment: !!form.value.includeEquipment,
      maxSteps: Math.min(5, Math.max(2, Number(form.value.maxSteps) || 4)),
      maxExternalProducts: Math.min(6, Math.max(1, Number(form.value.maxExternalProducts) || 2)),
      maxExternalIngredients: Math.min(8, Math.max(1, Number(form.value.maxExternalIngredients) || 4)),
      minProfitPD: Number(form.value.minProfitPD) || 0,
      resultLimit: Math.min(100, Math.max(5, Number(form.value.resultLimit) || 30)),
      allowedManufactureActions: form.value.allowedManufactureActions,
      searchIntensity: form.value.searchIntensity
    })
    rows.value = result.rows
    stats.value = result.stats
  } finally {
    loading.value = false
  }
}

function copyJson(row: DiscoveredWorkflowRow) {
  navigator.clipboard.writeText(row.exportJson).then(() => {
    ElMessage.success(t("已复制到剪贴板"))
  }).catch(() => {
    ElMessage.error(t("复制失败，请检查浏览器剪贴板权限"))
  })
}

function openDetail(row: DiscoveredWorkflowRow) {
  detailRow.value = row
  detailVisible.value = true
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
  <div class="app-container workflow-designer-page">
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
              <div class="hero-title">{{ t("工作流设计") }}</div>
              <div class="hero-subtitle">
                {{ t("自动从短链里发现更高收益的复合工作流，并可导出为现有复合工作流页可导入的 JSON") }}
              </div>
            </div>
            <el-button type="primary" :loading="loading" @click="runSearch">
              {{ t("开始搜索") }}
            </el-button>
          </div>
        </template>

        <el-alert
          :title="t('当前版本仅搜索 制作/转化/分解 的短链，默认忽略装备类物品；深度搜索会额外尝试图扩展，但仍不会处理无限循环类转化。')"
          type="info"
          :closable="false"
          class="hero-alert"
        />

        <el-row :gutter="12">
          <el-col :xs="24" :lg="14">
            <el-form label-width="110px" class="control-form">
              <el-form-item :label="t('制作动作')">
                <el-checkbox-group v-model="form.allowedManufactureActions">
                  <el-checkbox
                    v-for="option in actionOptions"
                    :key="option.value"
                    :label="option.value"
                  >
                    {{ option.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item :label="t('包含装备')">
                <el-switch v-model="form.includeEquipment" />
              </el-form-item>
              <el-form-item :label="t('搜索强度')">
                <el-radio-group v-model="form.searchIntensity">
                  <el-radio-button label="standard">
                    {{ t("标准") }}
                  </el-radio-button>
                  <el-radio-button label="deep">
                    {{ t("深度") }}
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>
            </el-form>
          </el-col>
          <el-col :xs="24" :lg="10">
            <el-row :gutter="12">
              <el-col :xs="12" :sm="12">
                <div class="control-card">
                  <div class="control-label">{{ t("最大步数") }}</div>
                  <el-input-number v-model="form.maxSteps" :min="2" :max="5" :step="1" />
                </div>
              </el-col>
              <el-col :xs="12" :sm="12">
                <div class="control-card">
                  <div class="control-label">{{ t("结果数量") }}</div>
                  <el-input-number v-model="form.resultLimit" :min="5" :max="100" :step="5" />
                </div>
              </el-col>
              <el-col :xs="12" :sm="12">
                <div class="control-card">
                  <div class="control-label">{{ t("净产物上限") }}</div>
                  <el-input-number v-model="form.maxExternalProducts" :min="1" :max="6" :step="1" />
                </div>
              </el-col>
              <el-col :xs="12" :sm="12">
                <div class="control-card">
                  <div class="control-label">{{ t("净消耗上限") }}</div>
                  <el-input-number v-model="form.maxExternalIngredients" :min="1" :max="8" :step="1" />
                </div>
              </el-col>
              <el-col :xs="12" :sm="12">
                <div class="control-card">
                  <div class="control-label">{{ t("最低日利") }}</div>
                  <el-input-number v-model="form.minProfitPD" :min="-999999999" :max="9999999999" :step="1000" />
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
              {{ t("候选动作") }}: {{ stats.actionCount }} |
              {{ t("已生成组合") }}: {{ stats.generatedCount }} |
              {{ t("已评估组合") }}: {{ stats.evaluatedCount }}
              <template v-if="stats.truncated">
                | {{ t("已触发搜索上限，结果可能仍有遗漏") }}
              </template>
            </div>
          </div>
        </template>

        <el-empty
          v-if="!rows.length && !loading"
          :description="emptyDescription"
        />

        <el-table v-else :data="rows" v-loading="loading" size="small" style="width: 100%">
          <el-table-column type="index" width="54" />
          <el-table-column :label="t('工作流')" min-width="340">
            <template #default="{ row }">
              <div class="step-list">
                <el-tag
                  v-for="label in row.stepLabels"
                  :key="label"
                  effect="plain"
                  type="info"
                >
                  {{ label }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('日利')" width="140" align="right">
            <template #default="{ row }">
              <span :class="row.profitPD >= 0 ? 'positive' : 'negative'">
                {{ Format.money(row.profitPD) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('利润率')" width="120" align="right">
            <template #default="{ row }">
              <span :class="row.profitRate >= 0 ? 'positive' : 'negative'">
                {{ Format.percent(row.profitRate) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('净产出摘要')" min-width="220">
            <template #default="{ row }">
              {{ summarizeWorkflowItems(row.workflow.productList) || "-" }}
            </template>
          </el-table-column>
          <el-table-column :label="t('净消耗摘要')" min-width="220">
            <template #default="{ row }">
              {{ summarizeWorkflowItems(row.workflow.ingredientList) || "-" }}
            </template>
          </el-table-column>
          <el-table-column :label="t('操作')" width="180" align="center" fixed="right">
            <template #default="{ row }">
              <el-space>
                <el-button link type="primary" @click="openDetail(row)">
                  {{ t("详情") }}
                </el-button>
                <el-button link type="success" @click="copyJson(row)">
                  {{ t("复制 JSON") }}
                </el-button>
              </el-space>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-space>

    <el-drawer v-model="detailVisible" :title="t('工作流详情')" size="80%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="control-label">{{ t("日利") }}</div>
                <div class="summary-value" :class="detailRow.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(detailRow.profitPD) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("利润 / h") }}</div>
                <div class="summary-value" :class="detailRow.profitPH >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(detailRow.profitPH) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("利润率") }}</div>
                <div class="summary-value">
                  {{ Format.percent(detailRow.profitRate) }}
                </div>
              </div>
              <div>
                <el-button type="success" @click="copyJson(detailRow)">
                  {{ t("复制 JSON") }}
                </el-button>
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">{{ t("步骤") }}</div>
            </template>
            <div class="step-list">
              <el-tag
                v-for="label in detailRow.stepLabels"
                :key="label"
                effect="plain"
                type="info"
                size="large"
              >
                {{ label }}
              </el-tag>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">{{ t("净消耗") }}</div>
                </template>
                <el-table :data="detailRow.workflow.ingredientList" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('物品')">
                    <template #default="{ row }">
                      {{ t(getItemDetailOf(row.hrid).name) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('数量 / h')" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.countPH, 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('估值 / h')" width="130" align="right">
                    <template #default="{ row }">
                      {{ Format.money(row.totalPH) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">{{ t("净产出") }}</div>
                </template>
                <el-table :data="detailRow.workflow.productList" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('物品')">
                    <template #default="{ row }">
                      {{ t(getItemDetailOf(row.hrid).name) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('数量 / h')" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.countPH, 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('估值 / h')" width="130" align="right">
                    <template #default="{ row }">
                      {{ Format.money(row.totalPH) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
          </el-row>
        </el-space>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.workflow-designer-page {
  --page-card-bg: var(--el-bg-color);
  --page-card-overlay: color-mix(in srgb, var(--el-bg-color-overlay) 86%, transparent);
  --page-card-border: var(--el-border-color-light);
  --page-text-secondary: var(--el-text-color-regular);
  --page-hero-radial: rgba(49, 120, 198, 0.12);
  --page-hero-linear-start: color-mix(in srgb, var(--el-bg-color) 92%, #fcfdff);
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
      radial-gradient(600px 180px at 8% 0%, var(--page-hero-radial), transparent 60%),
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

  .step-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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

  .positive {
    color: #67c23a;
  }

  .negative {
    color: #f56c6c;
  }
}

:global(html.dark-blue) .workflow-designer-page {
  --page-card-overlay: color-mix(in srgb, var(--el-bg-color-overlay) 92%, transparent);
  --page-hero-radial: rgba(84, 160, 255, 0.16);
  --page-hero-linear-start: color-mix(in srgb, var(--el-bg-color) 88%, #0f1b2d);
  --page-hero-linear-end: color-mix(in srgb, var(--el-bg-color) 96%, #08111f);
}
</style>
