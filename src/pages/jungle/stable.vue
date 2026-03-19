<script lang="ts" setup>
import type { Sort } from "element-plus"
import type { FormInstance } from "element-plus"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { Edit, Search } from "@element-plus/icons-vue"
import { ElMessageBox } from "element-plus"
import { cloneDeep, debounce } from "lodash-es"
import { getStableEnhanceDataApi, type StableEnhanceRow } from "@/common/apis/jungle/stable"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import * as Format from "@/common/utils/format"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionConfig from "../dashboard/components/ActionConfig.vue"
import ActionDetail from "../dashboard/components/ActionDetail.vue"
import ActionPrice from "../dashboard/components/ActionPrice.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import ManualPriceCard from "../dashboard/components/ManualPriceCard.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

const { t } = useI18n()

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "stable-enhance-pagination")
const tableData = ref<StableEnhanceRow[]>([])
const loading = ref(false)
const searchFormRef = ref<FormInstance | null>(null)

const searchData = useMemory("stable-enhance-search-data", {
  name: "",
  minLevel: 1,
  maxLevel: 20,
  minItemLevel: 0,
  minDemandLevels: 1,
  minDemandCoveragePercent: 0,
  minNeighborDemand: 0,
  maxLossPHMillion: 9999,
  maxHoursPerTarget: 999,
  minProfitPHMillion: -9999,
  allowNegativeProfit: true,
  originLevelMode: "zero_only",
  banJewelry: false
})

const sortState: Ref<Sort | undefined> = ref()

const getTableData = debounce(() => {
  loading.value = true
  getStableEnhanceDataApi({
    currentPage: paginationData.currentPage,
    size: paginationData.pageSize,
    name: searchData.value.name,
    minLevel: searchData.value.minLevel,
    maxLevel: searchData.value.maxLevel,
    minItemLevel: searchData.value.minItemLevel,
    minDemandLevels: searchData.value.minDemandLevels,
    minDemandCoverage: (Number(searchData.value.minDemandCoveragePercent) || 0) / 100,
    minNeighborDemand: searchData.value.minNeighborDemand,
    maxLossPH: (Number(searchData.value.maxLossPHMillion) || 0) * 1e6,
    maxHoursPerTarget: searchData.value.maxHoursPerTarget,
    minProfitPH: (Number(searchData.value.minProfitPHMillion) || 0) * 1e6,
    allowNegativeProfit: searchData.value.allowNegativeProfit,
    originLevelMode: searchData.value.originLevelMode,
    banJewelry: searchData.value.banJewelry,
    sort: sortState.value
  }).then((data) => {
    paginationData.total = data.total
    tableData.value = data.list
  }).catch((error) => {
    console.error(error)
    tableData.value = []
  }).finally(() => {
    loading.value = false
  })
}, 300)

function handleSearch() {
  paginationData.currentPage === 1 ? getTableData() : (paginationData.currentPage = 1)
}

function handleSort(sort: Sort) {
  sortState.value = sort
  getTableData()
}

watch([
  () => paginationData.currentPage,
  () => paginationData.pageSize
], getTableData, { immediate: true })

watch([
  () => useGameStore().marketData,
  () => useGameStore().buyStatus,
  () => useGameStore().sellStatus,
  () => usePlayerStore().config
], () => {
  useGameStore().clearStableEnhanceCache()
  getTableData()
}, { deep: true })

watch(() => usePriceStore(), () => {
  useGameStore().clearStableEnhanceCache()
  getTableData()
}, { deep: true })

const detailVisible = ref(false)
const detailRow = ref<StableEnhanceRow>()

function showDetail(row: StableEnhanceRow) {
  detailRow.value = cloneDeep(row)
  detailVisible.value = true
}

const actionDetailVisible = ref(false)
const actionDetailData = computed(() => detailRow.value?.calculator)

function openActionDetail(row?: StableEnhanceRow) {
  if (row) {
    detailRow.value = cloneDeep(row)
  }
  actionDetailVisible.value = true
}

const priceVisible = ref(false)
const currentPriceRow = ref<any>()

function setPrice(row: StableEnhanceRow) {
  const activated = usePriceStore().activated
  if (!activated) {
    ElMessageBox.confirm("是否确定开启自定义价格？", "需先开启自定义价格", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      closeOnClickModal: true
    }).then(() => {
      usePriceStore().setActivated(true)
    })
    return
  }
  currentPriceRow.value = cloneDeep(row.calculator)
  priceVisible.value = true
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-"
  }
  return `${Format.number(value, 3)} h`
}

function formatRatio(value: number) {
  if (!Number.isFinite(value)) {
    return value > 0 ? "∞" : "-"
  }
  return Format.number(value, 2)
}

function formatLevelList(levels: number[]) {
  return levels.map(level => `+${level}`).join(" / ")
}

const onPriceStatusChange = usePriceStatus("stable-enhance-price-status")
</script>

<template>
  <div class="app-container stable-enhance-page">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['enhancing']" :equipments="['off_hand', 'hands', 'neck', 'earrings', 'ring', 'pouch']" />
      </div>
      <PriceStatusSelect @change="onPriceStatusChange" />
    </div>

    <el-row :gutter="20" class="row">
      <el-col :xs="24" :xl="17">
        <el-card shadow="never" class="hero-card">
          <template #header>
            <div class="hero-header">
              <div>
                <div class="hero-title">稳定强化</div>
                <div class="hero-subtitle">
                  先按市场上哪些强化等级持续有价筛出需求，再对每个目标等级计算更适合重复执行的强化路线。
                </div>
              </div>
            </div>
          </template>

          <el-form ref="searchFormRef" :inline="true" :model="searchData" class="rank-card">
            <el-form-item label="物品">
              <el-input v-model="searchData.name" clearable style="width: 120px" placeholder="请输入" @input="handleSearch" />
            </el-form-item>

            <el-form-item label="目标等级">
              <el-input-number v-model="searchData.minLevel" :min="1" :max="20" controls-position="right" @change="handleSearch" />
              <span class="range-sep">到</span>
              <el-input-number v-model="searchData.maxLevel" :min="1" :max="20" controls-position="right" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="最低物品等级">
              <el-input-number v-model="searchData.minItemLevel" :min="0" :max="999" :controls="false" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="最低需求等级数">
              <el-input-number v-model="searchData.minDemandLevels" :min="1" :max="21" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="最低需求覆盖%">
              <el-input-number v-model="searchData.minDemandCoveragePercent" :min="0" :max="100" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="邻近需求数">
              <el-input-number v-model="searchData.minNeighborDemand" :min="0" :max="5" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="最大损耗/h">
              <el-input-number v-model="searchData.maxLossPHMillion" :min="0" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="最大耗时/件">
              <el-input-number v-model="searchData.maxHoursPerTarget" :min="0" :max="9999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">h</span>
            </el-form-item>

            <el-form-item label="最低利润/h">
              <el-input-number v-model="searchData.minProfitPHMillion" :min="-999999" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="起始等级">
              <el-select v-model="searchData.originLevelMode" style="width: 130px" @change="handleSearch">
                <el-option label="只看 +0 起手" value="zero_only" />
                <el-option label="允许半成品起手" value="all" />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-switch v-model="searchData.allowNegativeProfit" @change="handleSearch" />
              <span class="switch-label">允许负利润</span>
            </el-form-item>

            <el-form-item>
              <el-checkbox v-model="searchData.banJewelry" @change="handleSearch">
                排除首饰
              </el-checkbox>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="result-card">
          <template #header>
            <div class="result-header">
              <div class="hero-title">候选路线</div>
              <div class="hero-subtitle">结果数：{{ paginationData.total }}</div>
            </div>
          </template>

          <el-table :data="tableData" v-loading="loading" @sort-change="handleSort">
            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.itemHrid" />
              </template>
            </el-table-column>
            <el-table-column label="物品" min-width="150">
              <template #default="{ row }">
                {{ row.name }}
              </template>
            </el-table-column>
            <el-table-column label="路径" min-width="120">
              <template #default="{ row }">
                +{{ row.originLevel }} → +{{ row.targetLevel }}
              </template>
            </el-table-column>
            <el-table-column label="保护" width="80" align="center">
              <template #default="{ row }">
                +{{ row.protectLevel }}
              </template>
            </el-table-column>
            <el-table-column label="逃逸" width="80" align="center">
              <template #default="{ row }">
                {{ row.escapeLevel >= 0 ? `+${row.escapeLevel}` : "不逃逸" }}
              </template>
            </el-table-column>
            <el-table-column label="需求" min-width="140" sortable="custom" prop="demandLevelCount">
              <template #default="{ row }">
                {{ row.demandLevelCount }} 档 / {{ Format.percent(row.demandCoverage, 1) }}
              </template>
            </el-table-column>
            <el-table-column label="邻近需求" width="100" align="center" sortable="custom" prop="targetNeighborDemandCount">
              <template #default="{ row }">
                {{ row.targetNeighborDemandCount }}
              </template>
            </el-table-column>
            <el-table-column label="利润 / h" min-width="120" align="center" sortable="custom" prop="profitPH">
              <template #default="{ row }">
                <span :class="row.profitPH >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(row.profitPH) }}
                </span>
                <el-link type="primary" :icon="Edit" @click="setPrice(row)">
                  改价
                </el-link>
              </template>
            </el-table-column>
            <el-table-column label="损耗 / h" min-width="120" align="center" sortable="custom" prop="expectedLossPH">
              <template #default="{ row }">
                {{ Format.money(row.expectedLossPH) }}
              </template>
            </el-table-column>
            <el-table-column label="经验 / h" width="110" align="center" sortable="custom" prop="expPH">
              <template #default="{ row }">
                {{ Format.money(row.expPH) }}
              </template>
            </el-table-column>
            <el-table-column label="利润率" width="100" align="center" sortable="custom" prop="profitRate">
              <template #default="{ row }">
                <span :class="row.profitRate >= 0 ? 'positive' : 'negative'">
                  {{ Format.percent(row.profitRate) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="收益/损耗" width="110" align="center" sortable="custom" prop="profitToLossRatio">
              <template #default="{ row }">
                <span :class="row.profitToLossRatio >= 0 ? 'positive' : 'negative'">
                  {{ formatRatio(row.profitToLossRatio) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="耗时 / 件" width="110" align="center" sortable="custom" prop="hoursPerTarget">
              <template #default="{ row }">
                {{ formatHours(row.hoursPerTarget) }}
              </template>
            </el-table-column>
            <el-table-column label="详情" width="90" align="center">
              <template #default="{ row }">
                <el-link type="primary" :icon="Search" @click="showDetail(row)">
                  查看
                </el-link>
              </template>
            </el-table-column>
          </el-table>

          <template #footer>
            <div class="pager-wrapper">
              <el-pagination
                background
                :layout="paginationData.layout"
                :page-sizes="paginationData.pageSizes"
                :total="paginationData.total"
                :page-size="paginationData.pageSize"
                :current-page="paginationData.currentPage"
                @size-change="handleSizeChange"
                @current-change="handleCurrentChange"
              />
            </div>
          </template>
        </el-card>
      </el-col>

      <el-col :xs="24" :xl="7">
        <ManualPriceCard memory-key="stable-enhance" />
      </el-col>
    </el-row>

    <el-drawer v-model="detailVisible" title="稳定强化详情" size="72%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="label">路线</div>
                <div class="value">{{ detailRow.name }} | +{{ detailRow.originLevel }} → +{{ detailRow.targetLevel }}</div>
              </div>
              <div>
                <div class="label">保护 / 逃逸</div>
                <div class="value">+{{ detailRow.protectLevel }} / {{ detailRow.escapeLevel >= 0 ? `+${detailRow.escapeLevel}` : "不逃逸" }}</div>
              </div>
              <div>
                <div class="label">利润 / h</div>
                <div class="value" :class="detailRow.profitPH >= 0 ? 'positive' : 'negative'">{{ Format.money(detailRow.profitPH) }}</div>
              </div>
              <div>
                <div class="label">损耗 / h</div>
                <div class="value">{{ Format.money(detailRow.expectedLossPH) }}</div>
              </div>
              <div>
                <div class="label">利润率</div>
                <div class="value" :class="detailRow.profitRate >= 0 ? 'positive' : 'negative'">{{ Format.percent(detailRow.profitRate) }}</div>
              </div>
              <div>
                <div class="label">经验 / h</div>
                <div class="value">{{ Format.money(detailRow.expPH) }}</div>
              </div>
              <div>
                <div class="label">收益 / 损耗</div>
                <div class="value" :class="detailRow.profitToLossRatio >= 0 ? 'positive' : 'negative'">{{ formatRatio(detailRow.profitToLossRatio) }}</div>
              </div>
              <div>
                <div class="label">耗时 / 件</div>
                <div class="value">{{ formatHours(detailRow.hoursPerTarget) }}</div>
              </div>
              <div>
                <div class="label">平均动作数 / 件</div>
                <div class="value">{{ Format.number(detailRow.actionsPerTarget, 2) }}</div>
              </div>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">需求概览</div>
                </template>
                <div class="metric-list">
                  <div>有卖价等级数：{{ detailRow.demandLevelCount }}</div>
                  <div>双边有价等级数：{{ detailRow.twoWayLevelCount }}</div>
                  <div>需求覆盖度：{{ Format.percent(detailRow.demandCoverage, 1) }}</div>
                  <div>目标邻近需求：{{ detailRow.targetNeighborDemandCount }}</div>
                  <div>需求分：{{ Format.number(detailRow.demandScore, 1) }}</div>
                  <div>目标卖价：{{ Format.money(detailRow.targetPrice) }}</div>
                  <div>起始买价：{{ Format.money(detailRow.originPrice) }}</div>
                </div>
              </el-card>
            </el-col>

            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="hero-title">强化参数</div>
                </template>
                <div class="metric-list">
                  <div>总成功率：{{ Format.percent(detailRow.successRate) }}</div>
                  <div>目标成功率：{{ Format.percent(detailRow.targetRate) }}</div>
                  <div>跳级率：{{ Format.percent(detailRow.leapRate) }}</div>
                  <div>逃逸率：{{ Format.percent(detailRow.escapeRate) }}</div>
                </div>
                <el-space>
                  <el-button type="primary" @click="openActionDetail()">
                    动作详情
                  </el-button>
                  <el-button @click="setPrice(detailRow)">
                    自定义价格
                  </el-button>
                </el-space>
              </el-card>
            </el-col>
          </el-row>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">有卖价等级</div>
            </template>
            <div class="tag-list">
              <el-tag v-for="level in detailRow.demandLevels" :key="`sell-${level}`" effect="plain">
                +{{ level }}
              </el-tag>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">双边有价等级</div>
            </template>
            <div class="tag-list">
              <el-tag v-for="level in detailRow.twoWayLevels" :key="`tw-${level}`" type="success" effect="plain">
                +{{ level }}
              </el-tag>
              <span v-if="!detailRow.twoWayLevels.length">无</span>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="hero-title">说明</div>
            </template>
            <div class="metric-list">
              <div>该页面先按“哪些强化等级长期有价”判断需求，再对每个目标等级计算可执行路线。</div>
              <div>利润率 = 预期利润 / 总成本；收益/损耗 = 预期利润 / 预期损耗。</div>
              <div>耗时 / 件按获得 1 件目标强化装备的期望时间计算。</div>
            </div>
          </el-card>
        </el-space>
      </template>
    </el-drawer>

    <ActionDetail v-model="actionDetailVisible" :data="actionDetailData" />
    <ActionPrice v-model="priceVisible" :data="currentPriceRow" />
  </div>
</template>

<style lang="scss" scoped>
.stable-enhance-page {
  .game-info {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: center;
    margin-bottom: 20px;
  }

  .hero-card,
  .result-card {
    border-radius: 14px;
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

  .hero-subtitle {
    color: var(--el-text-color-regular);
    font-size: 13px;
    line-height: 1.6;
  }

  .rank-card {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
  }

  .range-sep,
  .unit-suffix,
  .switch-label {
    margin-left: 8px;
    color: var(--el-text-color-regular);
  }

  .pager-wrapper {
    display: flex;
    justify-content: center;
  }

  .detail-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 6px;
  }

  .value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
  }

  .metric-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    line-height: 1.6;
  }

  .tag-list {
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
</style>
