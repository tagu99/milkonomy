<script setup lang="ts">
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@/common/utils/format"
import { getItemDetailOf } from "@/common/apis/game"
import { getActionConfigOf } from "@/common/apis/player"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionDetailCard from "./ActionDetailCard.vue"
import { buildFixedCompositeWorkflow } from "./composite-workflow"

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()
const workflow = shallowRef(buildFixedCompositeWorkflow())
const { t } = useI18n()

const helpOpen = ref(true)
const helpActive = computed<string>({
  get() {
    return helpOpen.value ? "help" : ""
  },
  set(value) {
    helpOpen.value = value === "help"
  }
})

watch([
  () => gameStore.marketData,
  () => gameStore.buyStatus,
  () => gameStore.sellStatus,
  () => playerStore.config,
  () => Array.from(priceStore.map.values()),
  () => priceStore.activated
], () => {
  workflow.value = buildFixedCompositeWorkflow()
}, { immediate: true, deep: true })
</script>

<template>
  <div class="app-container composite-workflow">
    <el-space direction="vertical" fill :size="14" style="width: 100%">
      <el-card shadow="never" class="hero">
        <template #header>
          <div class="hero-header">
            <div class="hero-title">复合工作流</div>
            <el-switch v-model="helpOpen" inline-prompt active-text="说明" inactive-text="说明" />
          </div>
        </template>

        <div class="hero-subtitle">
          固定链路试跑版，后续会扩展成可配置的工作流构建器。
        </div>
        <el-collapse v-model="helpActive" class="help" accordion>
          <el-collapse-item name="help">
            <template #title>
              <span>计算说明</span>
            </template>
            <div class="help-text">
              当前链路：分解神秘原木、分解神圣牛奶、分解杨桃、制作点金催化剂、转化点金催化剂。
            </div>
            <div class="help-text">
              收益按“内部中间材料互相抵消后的净外部流量”计算，不按每一步的市场买卖差价直接累加。
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>

      <template v-if="workflow.available">
        <el-alert
          v-if="!workflow.valid"
          title="存在未定价物品，当前收益结果仅供参考。"
          type="error"
          :closable="false"
        />

        <el-row :gutter="12" class="summary-row">
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">净成本 / h</div>
              <div class="summary-value">{{ Format.money(workflow.costPH) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">净收入 / h</div>
              <div class="summary-value">{{ Format.money(workflow.incomePH) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">净收益 / h</div>
              <div class="summary-value">
                <el-tag :type="workflow.profitPH >= 0 ? 'success' : 'danger'" effect="light" size="large">
                  {{ Format.money(workflow.profitPH) }}
                </el-tag>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">净收益 / 天</div>
              <div class="summary-value">
                <el-tag :type="workflow.profitPD >= 0 ? 'success' : 'danger'" effect="light" size="large">
                  {{ Format.money(workflow.profitPD) }}
                </el-tag>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">利润率</div>
              <div class="summary-value">{{ Format.percent(workflow.profitRate) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">总经验 / h</div>
              <div class="summary-value">{{ Format.money(workflow.expPH) }}</div>
            </el-card>
          </el-col>
        </el-row>

        <el-card shadow="never" class="panel">
          <template #header>
            <div class="section-title">步骤分配</div>
          </template>
          <el-table :data="workflow.steps">
            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.calculator.hrid" />
              </template>
            </el-table-column>
            <el-table-column label="物品">
              <template #default="{ row }">
                {{ t(row.calculator.item.name) }}
              </template>
            </el-table-column>
            <el-table-column prop="calculator.project" label="动作" />
            <el-table-column label="要求等级" align="center">
              <template #default="{ row }">
                <div :class="row.calculator.actionLevel > getActionConfigOf(row.calculator.action).playerLevel ? 'negative' : ''">
                  {{ row.calculator.actionLevel }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="时间占比" align="center">
              <template #default="{ row }">
                <div class="share-cell">
                  <el-progress
                    :percentage="Math.round(row.share * 10000) / 100"
                    :stroke-width="10"
                    :show-text="false"
                  />
                  <div class="share-text">{{ Format.percent(row.share) }}</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="经验 / h" align="center">
              <template #default="{ row }">
                {{ Format.money(row.calculator.result.expPH * row.share) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-row :gutter="12">
          <el-col :xs="24" :lg="12">
            <el-card shadow="never" class="panel">
              <template #header>
                <div class="section-title">净消耗</div>
              </template>
              <el-table :data="workflow.ingredientList">
                <el-table-column width="54">
                  <template #default="{ row }">
                    <ItemIcon :hrid="row.hrid" />
                  </template>
                </el-table-column>
                <el-table-column label="物品">
                  <template #default="{ row }">
                    {{ t(getItemDetailOf(row.hrid).name) }}
                    <template v-if="row.level">
                      +{{ row.level }}
                    </template>
                  </template>
                </el-table-column>
                <el-table-column label="数量 / h" align="right" width="120">
                  <template #default="{ row }">
                    {{ Format.number(row.countPH, 3) }}
                  </template>
                </el-table-column>
                <el-table-column label="单价" align="right" width="110">
                  <template #default="{ row }">
                    {{ Format.price(row.price) }}
                  </template>
                </el-table-column>
                <el-table-column label="估值 / h" align="right" width="130">
                  <template #default="{ row }">
                    {{ Format.money(row.totalPH) }}
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-card shadow="never" class="panel">
              <template #header>
                <div class="section-title">净产出</div>
              </template>
              <el-table :data="workflow.productList">
                <el-table-column width="54">
                  <template #default="{ row }">
                    <ItemIcon :hrid="row.hrid" />
                  </template>
                </el-table-column>
                <el-table-column label="物品">
                  <template #default="{ row }">
                    {{ t(getItemDetailOf(row.hrid).name) }}
                    <template v-if="row.level">
                      +{{ row.level }}
                    </template>
                  </template>
                </el-table-column>
                <el-table-column label="数量 / h" align="right" width="120">
                  <template #default="{ row }">
                    {{ Format.number(row.countPH, 3) }}
                  </template>
                </el-table-column>
                <el-table-column label="单价" align="right" width="110">
                  <template #default="{ row }">
                    {{ Format.price(row.price) }}
                  </template>
                </el-table-column>
                <el-table-column label="估值 / h" align="right" width="130">
                  <template #default="{ row }">
                    {{ Format.money(row.totalPH) }}
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>

        <el-card
          v-for="step in workflow.steps"
          :key="step.key"
          shadow="never"
          class="panel step-panel"
        >
          <template #header>
            <div class="step-header">
              <span>{{ step.label }}</span>
              <span>{{ Format.percent(step.share) }}</span>
            </div>
          </template>
          <el-row :gutter="12" align="middle">
            <el-col :xs="24" :lg="10">
              <ActionDetailCard :data="step.calculator" type="ingredient" :work-multiplier="step.share" />
            </el-col>
            <el-col :xs="24" :lg="4">
              <div class="step-meta">
                <div>{{ step.calculator.project }}</div>
                <div>要求等级: {{ step.calculator.actionLevel }}</div>
                <div>时间占比: {{ Format.percent(step.share) }}</div>
                <div>经验 / h: {{ Format.money(step.calculator.result.expPH * step.share) }}</div>
              </div>
            </el-col>
            <el-col :xs="24" :lg="10">
              <ActionDetailCard :data="step.calculator" type="product" :work-multiplier="step.share" />
            </el-col>
          </el-row>
        </el-card>
      </template>

      <el-empty v-else :description="workflow.reason || '当前无法计算这条固定链路'" />
    </el-space>
  </div>
</template>

<style lang="scss" scoped>
.composite-workflow {
  .hero {
    border-radius: 14px;
    background: radial-gradient(1200px 360px at 15% 0%, #f3f7ff 0%, #ffffff 60%);
    border: 1px solid #ebeef5;
  }

  .hero-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .hero-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .hero-subtitle {
    color: #606266;
    margin-bottom: 10px;
  }

  .help {
    :deep(.el-collapse-item__header) {
      font-weight: 600;
    }
  }

  .help-text {
    color: #606266;
    line-height: 1.6;
    margin-bottom: 8px;
  }

  .summary-row {
    margin: 0;
  }

  .summary-card {
    height: 100%;
    border-radius: 14px;
  }

  .summary-label {
    color: #606266;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .summary-value {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
  }

  .section-title {
    font-weight: 600;
  }

  .panel {
    border-radius: 14px;
  }

  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-weight: 600;
  }

  .step-meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: #606266;
    text-align: center;
  }

  .share-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 160px;
  }

  .share-text {
    min-width: 56px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #606266;
  }

  .step-panel {
    :deep(.el-card__header) {
      padding: 12px 16px;
    }
  }
}
</style>
