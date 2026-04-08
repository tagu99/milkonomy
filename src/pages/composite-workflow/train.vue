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
import {
  discoverTrainWorkflowRows,
  getTrainScenarioUnitPrice,
  summarizeTrainPath,
  summarizeTrainWorkflowItems,
  type TrainWorkflowRow
} from "./train"

const { t } = useI18n()
const router = useRouter()
const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const form = useMemory("train-workflow-form", {
  actions: ["crafting", "cheesesmithing", "tailoring"] as Action[],
  baseMaterialsOnly: true,
  equipmentOnly: true,
  exactSteps: 7,
  resultLimit: 60,
  keyword: ""
})

if (!Array.isArray(form.value.actions) || !form.value.actions.length) {
  form.value.actions = ["crafting", "cheesesmithing", "tailoring"]
}

const rows = shallowRef<TrainWorkflowRow[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailRow = shallowRef<TrainWorkflowRow>()
const stats = ref({
  upgradeActionCount: 0,
  chainCount: 0,
  evaluatedCount: 0
})

const actionOptions: Array<{ label: string, value: Action }> = [
  { label: t("\u5236\u4f5c"), value: "crafting" },
  { label: t("\u5976\u916a\u5236\u4f5c"), value: "cheesesmithing" },
  { label: t("\u88c1\u7f1d"), value: "tailoring" }
]

const matchedRows = computed(() => {
  const keyword = String(form.value.keyword || "").trim().toLowerCase()
  if (!keyword) {
    return rows.value
  }
  return rows.value.filter((row) => {
    if (row.name.toLowerCase().includes(keyword)) return true
    if (row.finalName.toLowerCase().includes(keyword)) return true
    if (row.materialSummary.toLowerCase().includes(keyword)) return true
    return row.stepLabels.some(label => label.toLowerCase().includes(keyword))
  })
})

const emptyDescription = computed(() => {
  const keyword = String(form.value.keyword || "").trim()
  if (keyword && rows.value.length) {
    return t("\u5f53\u524d\u5173\u952e\u8bcd\u6ca1\u6709\u5339\u914d\u5230\u7ed3\u679c\u3002")
  }
  if (!stats.value.evaluatedCount) {
    return t("\u8fd8\u6ca1\u6709\u7ed3\u679c\uff0c\u8c03\u6574\u6761\u4ef6\u540e\u70b9\u51fb\u5f00\u59cb\u641c\u7d22\u3002")
  }
  return t("\u5df2\u8bc6\u522b\u5230\u53ef\u7528\u94fe\u8def\uff0c\u4f46\u5f53\u524d\u6ca1\u6709\u53ef\u663e\u793a\u7684\u7ed3\u679c\u3002")
})

const onPriceStatusChange = usePriceStatus("train-workflow-price-status")

async function runSearch() {
  loading.value = true
  try {
    const result = await discoverTrainWorkflowRows({
      actions: form.value.actions,
      includeSpecialMaterials: !form.value.baseMaterialsOnly,
      equipmentOnly: !!form.value.equipmentOnly,
      exactSteps: Math.min(8, Math.max(2, Number(form.value.exactSteps) || 7)),
      resultLimit: Math.min(200, Math.max(20, Number(form.value.resultLimit) || 60))
    })
    rows.value = result.rows
    stats.value = result.stats
  } finally {
    loading.value = false
  }
}

function openDetail(row: TrainWorkflowRow) {
  detailRow.value = row
  detailVisible.value = true
}

function copyJson(row: TrainWorkflowRow) {
  navigator.clipboard.writeText(row.exportJson).then(() => {
    ElMessage.success(t("\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f"))
  }).catch(() => {
    ElMessage.error(t("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6d4f\u89c8\u5668\u6743\u9650"))
  })
}

function loadWorkflow(row: TrainWorkflowRow) {
  localStorage.setItem("composite-workflow-builder", JSON.stringify(row.snapshot))
  ElMessage.success(t("\u5df2\u5199\u5165\u590d\u5408\u5de5\u4f5c\u6d41"))
  router.push("/composite-workflow")
}

function formatBreakdownMoney(value: number, valid: boolean) {
  if (!valid || !Number.isFinite(value)) {
    return "-"
  }
  return Format.money(value)
}

function formatBreakdownPercent(value: number, valid: boolean) {
  if (!valid || Number.isNaN(value)) {
    return "-"
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? "INF" : "-INF"
  }
  return Format.percent(value)
}

function getAskPrice(item: { hrid: string, level?: number }) {
  return getTrainScenarioUnitPrice(item, "L")
}

function getBidPrice(item: { hrid: string, level?: number }) {
  return getTrainScenarioUnitPrice(item, "R")
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
  stats.value = {
    upgradeActionCount: 0,
    chainCount: 0,
    evaluatedCount: 0
  }
}, { deep: true })
</script>

<template>
  <div class="app-container train-workflow-page">
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
              <div class="hero-title">{{ t("\u706b\u8f66\u5de5\u4f5c\u6d41") }}</div>
              <div class="hero-subtitle">
                {{ t("\u81ea\u52a8\u53d1\u73b0\u4ece\u57fa\u7840\u7d20\u6750/\u521d\u7ea7\u88c5\u5907\u51fa\u53d1\u7684\u8fde\u7eed\u5236\u9020\u94fe\uff0c\u6309\u5b9e\u9645\u5236\u9020\u52a8\u4f5c\u6570\u8ba1\u7b97\u6b65\u6570\uff0cfabric/leather/lumber/cheese \u8fd9\u7c7b\u524d\u7f6e\u52a0\u5de5\u4e5f\u4f1a\u7b97 1 \u6b65\u3002") }}
              </div>
            </div>
            <el-button type="primary" :loading="loading" @click="runSearch">
              {{ t("\u5f00\u59cb\u641c\u7d22") }}
            </el-button>
          </div>
        </template>

        <el-alert
          :title="t('\u9ed8\u8ba4\u6309 \u5de6\u4e70\u5de6\u5356 \u6392\u5e8f\uff0c\u6b21\u770b \u5de6\u4e70\u53f3\u5356\uff1b\u56fa\u5b9a\u6b65\u6570\u662f\u6309\u5b9e\u9645\u5236\u9020\u52a8\u4f5c\u6761\u6570\u7b97\u7684\uff0c\u4e0d\u518d\u53ea\u770b\u88c5\u5907\u5347\u7ea7\u6bb5\u6570\u3002')"
          type="info"
          :closable="false"
          class="hero-alert"
        />

        <el-row :gutter="12">
          <el-col :xs="24" :lg="14">
            <el-form label-width="120px" class="control-form">
              <el-form-item :label="t('\u5236\u9020\u7ebf')">
                <el-checkbox-group v-model="form.actions">
                  <el-checkbox
                    v-for="option in actionOptions"
                    :key="option.value"
                    :label="option.value"
                  >
                    {{ option.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item :label="t('\u4ec5\u57fa\u7840\u7d20\u6750\u94fe')">
                <el-switch v-model="form.baseMaterialsOnly" />
              </el-form-item>
              <el-form-item :label="t('\u53ea\u770b\u88c5\u5907')">
                <el-switch v-model="form.equipmentOnly" />
              </el-form-item>
              <el-form-item :label="t('\u5173\u952e\u8bcd')">
                <el-input
                  v-model="form.keyword"
                  clearable
                  :placeholder="t('\u53ef\u8f93\u5165\u88c5\u5907\u540d\u3001\u6750\u6599\u540d\uff0c\u5982 Bow / Sword / Hat / Cheese')"
                />
              </el-form-item>
            </el-form>
          </el-col>

          <el-col :xs="24" :lg="10">
            <el-row :gutter="12">
              <el-col :xs="12">
                <div class="control-card">
                  <div class="control-label">{{ t("\u56fa\u5b9a\u6b65\u6570") }}</div>
                  <el-input-number v-model="form.exactSteps" :min="2" :max="8" :step="1" />
                </div>
              </el-col>
              <el-col :xs="12">
                <div class="control-card">
                  <div class="control-label">{{ t("\u7ed3\u679c\u6570\u91cf") }}</div>
                  <el-input-number v-model="form.resultLimit" :min="20" :max="200" :step="10" />
                </div>
              </el-col>
            </el-row>
          </el-col>
        </el-row>
      </el-card>

      <el-card shadow="never" class="result-card">
        <template #header>
          <div class="result-header">
            <div class="hero-title">{{ t("\u641c\u7d22\u7ed3\u679c") }}</div>
            <div class="stats-text">
              {{ t("\u53ef\u7528\u5347\u7ea7\u52a8\u4f5c") }}: {{ stats.upgradeActionCount }} |
              {{ t("\u5b8c\u6574\u94fe\u6570") }}: {{ stats.chainCount }} |
              {{ t("\u5df2\u8bc4\u4f30\u94fe\u8def") }}: {{ stats.evaluatedCount }} |
              {{ t("\u5339\u914d\u7ed3\u679c") }}: {{ matchedRows.length }}
            </div>
          </div>
        </template>

        <el-empty
          v-if="!matchedRows.length && !loading"
          :description="emptyDescription"
        />

        <el-table v-else :data="matchedRows" v-loading="loading" size="small" style="width: 100%">
          <el-table-column type="index" width="54" />
          <el-table-column width="62" align="center">
            <template #default="{ row }">
              <ItemIcon :hrid="row.finalHrid" />
            </template>
          </el-table-column>
          <el-table-column :label="t('\u706b\u8f66\u94fe')" min-width="320">
            <template #default="{ row }">
              <div class="chain-name">{{ row.name }}</div>
              <div class="chain-meta">
                {{ row.actionName }} | {{ t("\u7ec8\u70b9") }}: {{ row.finalName }} | {{ t("\u6b65\u6570") }}: {{ row.stepCount }}
              </div>
              <div class="chain-meta">
                {{ t("\u7d20\u6750") }}: {{ row.materialSummary || "-" }}
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('\u65e5\u5229(\u5de6\u4e70\u5de6\u5356)')" width="160" align="right">
            <template #default="{ row }">
              <span :class="row.breakdown_LL.valid && row.breakdown_LL.profitPD >= 0 ? 'positive' : 'negative'">
                {{ formatBreakdownMoney(row.breakdown_LL.profitPD, row.breakdown_LL.valid) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('\u65e5\u5229(\u5de6\u4e70\u53f3\u5356)')" width="160" align="right">
            <template #default="{ row }">
              <span :class="row.breakdown_LR.valid && row.breakdown_LR.profitPD >= 0 ? 'positive' : 'negative'">
                {{ formatBreakdownMoney(row.breakdown_LR.profitPD, row.breakdown_LR.valid) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('\u9700\u6c42\u5206')" width="110" align="center">
            <template #default="{ row }">
              {{ Format.number(row.demandScore, 1) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('\u9700\u6c42\u7b49\u7ea7\u6570')" width="110" align="center">
            <template #default="{ row }">
              {{ row.demandLevelCount }}
            </template>
          </el-table-column>
          <el-table-column :label="t('\u53cc\u8fb9\u7b49\u7ea7\u6570')" width="120" align="center">
            <template #default="{ row }">
              {{ row.twoWayLevelCount }}
            </template>
          </el-table-column>
          <el-table-column :label="t('\u5229\u6da6\u7387(\u5de6\u4e70\u5de6\u5356)')" width="140" align="right">
            <template #default="{ row }">
              <span :class="row.breakdown_LL.valid && row.breakdown_LL.profitRate >= 0 ? 'positive' : 'negative'">
                {{ formatBreakdownPercent(row.breakdown_LL.profitRate, row.breakdown_LL.valid) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('\u51c0\u4ea7\u51fa\u6458\u8981')" min-width="220">
            <template #default="{ row }">
              {{ summarizeTrainWorkflowItems(row.workflow.productList) || "-" }}
            </template>
          </el-table-column>
          <el-table-column :label="t('\u64cd\u4f5c')" width="200" align="center" fixed="right">
            <template #default="{ row }">
              <el-space>
                <el-button link type="primary" @click="openDetail(row)">
                  {{ t("\u8be6\u60c5") }}
                </el-button>
                <el-button link type="success" @click="copyJson(row)">
                  {{ t("\u590d\u5236 JSON") }}
                </el-button>
                <el-button link @click="loadWorkflow(row)">
                  {{ t("\u8f7d\u5165") }}
                </el-button>
              </el-space>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-space>

    <el-drawer v-model="detailVisible" :title="t('\u706b\u8f66\u5de5\u4f5c\u6d41\u8be6\u60c5')" size="88%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="control-label">{{ t("\u706b\u8f66\u94fe") }}</div>
                <div class="summary-value summary-name">{{ detailRow.name }}</div>
              </div>
              <div>
                <div class="control-label">{{ t("\u65e5\u5229(\u5de6\u4e70\u5de6\u5356)") }}</div>
                <div class="summary-value" :class="detailRow.breakdown_LL.valid && detailRow.breakdown_LL.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ formatBreakdownMoney(detailRow.breakdown_LL.profitPD, detailRow.breakdown_LL.valid) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("\u65e5\u5229(\u5de6\u4e70\u53f3\u5356)") }}</div>
                <div class="summary-value" :class="detailRow.breakdown_LR.valid && detailRow.breakdown_LR.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ formatBreakdownMoney(detailRow.breakdown_LR.profitPD, detailRow.breakdown_LR.valid) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("\u9700\u6c42\u5206") }}</div>
                <div class="summary-value">
                  {{ Format.number(detailRow.demandScore, 1) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("\u6700\u4f18\u9700\u6c42\u7b49\u7ea7") }}</div>
                <div class="summary-value">
                  +{{ detailRow.bestDemandTargetLevel }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("\u5229\u6da6\u7387(\u5de6\u4e70\u5de6\u5356)") }}</div>
                <div class="summary-value">
                  {{ formatBreakdownPercent(detailRow.breakdown_LL.profitRate, detailRow.breakdown_LL.valid) }}
                </div>
              </div>
              <div>
                <el-space>
                  <el-button type="success" @click="copyJson(detailRow)">
                    {{ t("\u590d\u5236 JSON") }}
                  </el-button>
                  <el-button type="primary" @click="loadWorkflow(detailRow)">
                    {{ t("\u8f7d\u5165\u590d\u5408\u5de5\u4f5c\u6d41") }}
                  </el-button>
                </el-space>
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">{{ t("\u8def\u5f84") }}</div>
            </template>
            <div class="path-text">
              {{ summarizeTrainPath(detailRow.stepLabels, detailRow.stepLabels.length) }}
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">{{ t("\u573a\u666f\u4f30\u503c") }}</div>
            </template>
            <el-table
              :data="[
                { label: t('\u5de6\u4e70\u5de6\u5356'), breakdown: detailRow.breakdown_LL },
                { label: t('\u5de6\u4e70\u53f3\u5356'), breakdown: detailRow.breakdown_LR },
                { label: t('\u53f3\u4e70\u53f3\u5356'), breakdown: detailRow.breakdown_RR },
                { label: t('\u53f3\u4e70\u5de6\u5356'), breakdown: detailRow.breakdown_RL }
              ]"
              size="small"
            >
              <el-table-column prop="label" :label="t('\u573a\u666f')" width="120" />
              <el-table-column :label="t('\u51c0\u6210\u672c / h')" align="right">
                <template #default="{ row }">
                  {{ formatBreakdownMoney(row.breakdown.costPH, row.breakdown.valid) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('\u51c0\u6536\u5165 / h')" align="right">
                <template #default="{ row }">
                  {{ formatBreakdownMoney(row.breakdown.incomePH, row.breakdown.valid) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('\u65e5\u5229')" align="right">
                <template #default="{ row }">
                  <span :class="row.breakdown.valid && row.breakdown.profitPD >= 0 ? 'positive' : 'negative'">
                    {{ formatBreakdownMoney(row.breakdown.profitPD, row.breakdown.valid) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column :label="t('\u5229\u6da6\u7387')" align="right">
                <template #default="{ row }">
                  {{ formatBreakdownPercent(row.breakdown.profitRate, row.breakdown.valid) }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">{{ t("\u5e02\u573a\u9700\u6c42") }}</div>
            </template>
            <div class="detail-summary">
              <div>
                <div class="control-label">{{ t("\u9700\u6c42\u5206") }}</div>
                <div class="summary-value">{{ Format.number(detailRow.demandScore, 1) }}</div>
              </div>
              <div>
                <div class="control-label">{{ t("\u6709\u9700\u6c42\u7b49\u7ea7\u6570") }}</div>
                <div class="summary-value">{{ detailRow.demandLevelCount }}</div>
              </div>
              <div>
                <div class="control-label">{{ t("\u53cc\u8fb9\u6709\u4ef7\u7b49\u7ea7\u6570") }}</div>
                <div class="summary-value">{{ detailRow.twoWayLevelCount }}</div>
              </div>
              <div>
                <div class="control-label">{{ t("\u6700\u4f18\u76ee\u6807\u7b49\u7ea7") }}</div>
                <div class="summary-value">+{{ detailRow.bestDemandTargetLevel }}</div>
              </div>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">{{ t("\u51c0\u6d88\u8017") }}</div>
                </template>
                <el-table :data="detailRow.workflow.ingredientList" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u7269\u54c1')" min-width="160">
                    <template #default="{ row }">
                      {{ t(getItemDetailOf(row.hrid).name) }}
                      <template v-if="row.level">
                        +{{ row.level }}
                      </template>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u6570\u91cf / h')" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.countPH, 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u5de6\u4ef7')" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.money(getAskPrice(row)) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u53f3\u4ef7')" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.money(getBidPrice(row)) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>

            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">{{ t("\u51c0\u4ea7\u51fa") }}</div>
                </template>
                <el-table :data="detailRow.workflow.productList" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u7269\u54c1')" min-width="160">
                    <template #default="{ row }">
                      {{ t(getItemDetailOf(row.hrid).name) }}
                      <template v-if="row.level">
                        +{{ row.level }}
                      </template>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u6570\u91cf / h')" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.countPH, 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u5de6\u4ef7')" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.money(getAskPrice(row)) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('\u53f3\u4ef7')" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.money(getBidPrice(row)) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
          </el-row>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">{{ t("\u6b65\u9aa4") }}</div>
            </template>
            <div class="step-list">
              <el-tag
                v-for="step in detailRow.workflow.steps"
                :key="step.key"
                effect="plain"
                type="info"
                size="large"
              >
                {{ step.label }} {{ Format.percent(step.share) }}
              </el-tag>
            </div>
          </el-card>
        </el-space>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.train-workflow-page {
  --page-card-overlay: color-mix(in srgb, var(--el-bg-color-overlay) 88%, transparent);
  --page-card-border: var(--el-border-color-light);
  --page-text-secondary: var(--el-text-color-regular);
  --page-hero-radial: rgba(212, 97, 25, 0.16);
  --page-hero-linear-start: color-mix(in srgb, var(--el-bg-color) 92%, #fffaf4);
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
  .stats-text,
  .chain-meta,
  .control-label {
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

  .chain-name {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .detail-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    align-items: center;
  }

  .summary-value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
  }

  .summary-name {
    font-size: 18px;
  }

  .path-text {
    font-size: 14px;
    line-height: 1.8;
  }

  .step-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .positive {
    color: #67c23a;
  }

  .negative {
    color: #f56c6c;
  }
}

:global(html.dark-blue) .train-workflow-page {
  --page-card-overlay: color-mix(in srgb, var(--el-bg-color-overlay) 92%, transparent);
  --page-hero-radial: rgba(255, 140, 70, 0.14);
  --page-hero-linear-start: color-mix(in srgb, var(--el-bg-color) 88%, #24140b);
  --page-hero-linear-end: color-mix(in srgb, var(--el-bg-color) 96%, #140b05);
}
</style>
