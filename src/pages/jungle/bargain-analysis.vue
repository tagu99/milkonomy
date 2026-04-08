<script lang="ts" setup>
import type { FormInstance, Sort } from "element-plus"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { Edit, Search } from "@element-plus/icons-vue"
import { ElMessageBox } from "element-plus"
import { cloneDeep, debounce } from "lodash-es"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import * as Format from "@/common/utils/format"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import { getBargainAnalysisDataApi, type BargainAnalysisRow } from "@/common/apis/jungle/bargain-analysis"
import ActionDetail from "../dashboard/components/ActionDetail.vue"
import ActionPrice from "../dashboard/components/ActionPrice.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

type SearchFormData = {
  name: string
  minLevel: number
  maxLevel: number
  minItemLevel: number
  minGapMillion: number
  minGapPercent: number
  minDemandScore: number
  minNeighborDemand: number
  onlyPositiveBargain: boolean
  onlyTwoWay: boolean
  banJewelry: boolean
}

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "bargain-analysis-pagination")
const tableData = ref<BargainAnalysisRow[]>([])
const loading = ref(false)
const searchFormRef = ref<FormInstance | null>(null)
const sortState: Ref<Sort | undefined> = ref()

const searchData = useMemory("bargain-analysis-search-data", {
  name: "",
  minLevel: 0,
  maxLevel: 20,
  minItemLevel: 0,
  minGapMillion: 0,
  minGapPercent: 0,
  minDemandScore: 0,
  minNeighborDemand: 0,
  onlyPositiveBargain: true,
  onlyTwoWay: false,
  banJewelry: false
}) as Ref<SearchFormData>

function buildQueryParams() {
  return {
    currentPage: paginationData.currentPage,
    size: paginationData.pageSize,
    name: searchData.value.name,
    minLevel: searchData.value.minLevel,
    maxLevel: searchData.value.maxLevel,
    minItemLevel: searchData.value.minItemLevel,
    minGap: (Number(searchData.value.minGapMillion) || 0) * 1e6,
    minGapRate: (Number(searchData.value.minGapPercent) || 0) / 100,
    minDemandScore: Number(searchData.value.minDemandScore) || 0,
    minNeighborDemand: Number(searchData.value.minNeighborDemand) || 0,
    onlyPositiveBargain: searchData.value.onlyPositiveBargain,
    onlyTwoWay: searchData.value.onlyTwoWay,
    banJewelry: searchData.value.banJewelry,
    sort: sortState.value
  }
}

const getTableData = debounce(() => {
  loading.value = true
  getBargainAnalysisDataApi(buildQueryParams()).then((data) => {
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
  if (paginationData.currentPage === 1) {
    getTableData()
    return
  }
  paginationData.currentPage = 1
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
  () => gameStore.marketData,
  () => gameStore.buyStatus,
  () => gameStore.sellStatus,
  () => playerStore.config
], () => {
  gameStore.clearRecoveryFloorCache()
  gameStore.clearDemandHeatCache()
  gameStore.clearBargainAnalysisCache()
  gameStore.clearMarketWarningCache()
  getTableData()
}, { deep: true })

watch(() => priceStore.$state, () => {
  gameStore.clearRecoveryFloorCache()
  gameStore.clearDemandHeatCache()
  gameStore.clearBargainAnalysisCache()
  gameStore.clearMarketWarningCache()
  getTableData()
}, { deep: true })

const detailVisible = ref(false)
const detailRow = ref<BargainAnalysisRow>()

function showDetail(row: BargainAnalysisRow) {
  detailRow.value = cloneDeep(row)
  detailVisible.value = true
}

const actionDetailVisible = ref(false)
const actionDetailData = computed(() => detailRow.value?.recovery.calculator)

function openActionDetail(row?: BargainAnalysisRow) {
  if (row) {
    detailRow.value = cloneDeep(row)
  }
  actionDetailVisible.value = true
}

const priceVisible = ref(false)
const currentPriceRow = ref<any>()

function setPrice(row: BargainAnalysisRow) {
  if (!priceStore.activated) {
    ElMessageBox.confirm("是否先开启自定义价格？", "需要先开启自定义价格", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      closeOnClickModal: true
    }).then(() => {
      priceStore.setActivated(true)
    }).catch(() => {})
    return
  }
  currentPriceRow.value = cloneDeep(row.recovery.calculator)
  priceVisible.value = true
}

function formatMoneyOrDash(value: number) {
  if (!Number.isFinite(value) || value < 0) {
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

const onPriceStatusChange = usePriceStatus("bargain-analysis-price-status")
</script>

<template>
  <div class="app-container bargain-analysis-page">
    <div class="game-info">
      <GameInfo />
      <PriceStatusSelect @change="onPriceStatusChange" />
    </div>

    <el-card shadow="never" class="hero-card">
      <template #header>
        <div class="hero-header">
          <div>
            <div class="hero-title">捡漏分析</div>
            <div class="hero-subtitle">
              把“回收底价”和“需求热度”合并成机会列表。重点不是理论最大收益，而是当前市场上哪些东西收了以后更像一个稳定机会。
            </div>
          </div>
          <div class="hero-meta">
            候选条目 {{ paginationData.total }}
          </div>
        </div>
      </template>

      <el-form ref="searchFormRef" :inline="true" :model="searchData" class="filter-form">
        <el-form-item label="物品">
          <el-input v-model="searchData.name" style="width: 140px" clearable placeholder="输入名称" @input="handleSearch" />
        </el-form-item>

        <el-form-item label="强化等级">
          <el-input-number v-model="searchData.minLevel" :min="0" :max="20" controls-position="right" @change="handleSearch" />
          <span class="range-sep">到</span>
          <el-input-number v-model="searchData.maxLevel" :min="0" :max="20" controls-position="right" @change="handleSearch" />
        </el-form-item>

        <el-form-item label="最低物品等级">
          <el-input-number v-model="searchData.minItemLevel" :min="0" :max="999" :controls="false" @change="handleSearch" />
        </el-form-item>

        <el-form-item label="最低左价差">
          <el-input-number v-model="searchData.minGapMillion" :min="0" :max="999999" :controls="false" @change="handleSearch" />
          <span class="unit-suffix">M</span>
        </el-form-item>

        <el-form-item label="最低左价差比例">
          <el-input-number v-model="searchData.minGapPercent" :min="0" :max="999999" :controls="false" @change="handleSearch" />
          <span class="unit-suffix">%</span>
        </el-form-item>

        <el-form-item label="最低需求分">
          <el-input-number v-model="searchData.minDemandScore" :min="0" :max="999999" :controls="false" @change="handleSearch" />
        </el-form-item>

        <el-form-item label="最低邻近需求">
          <el-input-number v-model="searchData.minNeighborDemand" :min="0" :max="10" @change="handleSearch" />
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="searchData.onlyPositiveBargain" @change="handleSearch">
            只看正向捡漏
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="searchData.onlyTwoWay" @change="handleSearch">
            只看双边有价
          </el-checkbox>
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
          <div class="hero-title">机会列表</div>
          <div class="hero-subtitle">
            默认按综合机会分排序。你可以把它理解为“收价空间”和“后续处理稳定性”的折中。
          </div>
        </div>
      </template>

      <el-table :data="tableData" v-loading="loading" @sort-change="handleSort">
        <el-table-column width="54">
          <template #default="{ row }">
            <ItemIcon :hrid="row.itemHrid" />
          </template>
        </el-table-column>

        <el-table-column label="物品" min-width="160">
          <template #default="{ row }">
            {{ row.name }} +{{ row.targetLevel }}
          </template>
        </el-table-column>

        <el-table-column label="建议方向" min-width="150">
          <template #default="{ row }">
            <el-tag
              :type="row.recommendation.includes('分解') ? 'warning' : row.recommendation.includes('转卖') ? 'success' : 'info'"
              effect="plain"
            >
              {{ row.recommendation }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="当前市场" min-width="140" align="right">
          <template #default="{ row }">
            <div>左 {{ formatMoneyOrDash(row.currentAskUnit) }}</div>
            <div>右 {{ formatMoneyOrDash(row.currentBidUnit) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="回收底价" min-width="120" align="right" sortable="custom" prop="recoveryFloorUnit">
          <template #default="{ row }">
            {{ Format.money(row.recoveryFloorUnit) }}
          </template>
        </el-table-column>

        <el-table-column label="左价差" min-width="120" align="right" sortable="custom" prop="gapToAskUnit">
          <template #default="{ row }">
            <span :class="row.gapToAskUnit >= 0 ? 'positive' : 'negative'">
              {{ formatMoneyOrDash(row.gapToAskUnit) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="左价差比例" min-width="120" align="center" sortable="custom" prop="gapRateToAsk">
          <template #default="{ row }">
            <span :class="row.gapRateToAsk >= 0 ? 'positive' : 'negative'">
              {{ formatPercentOrDash(row.gapRateToAsk) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="需求分" min-width="100" align="center" sortable="custom" prop="demandScore">
          <template #default="{ row }">
            {{ Format.number(row.demandScore, 1) }}
          </template>
        </el-table-column>

        <el-table-column label="邻近需求" min-width="100" align="center" sortable="custom" prop="targetNeighborDemandCount">
          <template #default="{ row }">
            {{ row.targetNeighborDemandCount }}
          </template>
        </el-table-column>

        <el-table-column label="双边" min-width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isTwoWay ? 'success' : 'info'" effect="plain">
              {{ row.isTwoWay ? "是" : "否" }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="综合分" min-width="100" align="center" sortable="custom" prop="opportunityScore">
          <template #default="{ row }">
            {{ Format.number(row.opportunityScore, 1) }}
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

    <el-drawer v-model="detailVisible" title="捡漏分析详情" size="72%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="label">物品</div>
                <div class="value">{{ detailRow.name }} +{{ detailRow.targetLevel }}</div>
              </div>
              <div>
                <div class="label">建议方向</div>
                <div class="value">{{ detailRow.recommendation }}</div>
              </div>
              <div>
                <div class="label">当前左价</div>
                <div class="value">{{ formatMoneyOrDash(detailRow.currentAskUnit) }}</div>
              </div>
              <div>
                <div class="label">回收底价</div>
                <div class="value">{{ Format.money(detailRow.recoveryFloorUnit) }}</div>
              </div>
              <div>
                <div class="label">左价差</div>
                <div class="value" :class="detailRow.gapToAskUnit >= 0 ? 'positive' : 'negative'">
                  {{ formatMoneyOrDash(detailRow.gapToAskUnit) }}
                </div>
              </div>
              <div>
                <div class="label">需求分</div>
                <div class="value">{{ Format.number(detailRow.demandScore, 1) }}</div>
              </div>
              <div>
                <div class="label">邻近需求</div>
                <div class="value">{{ detailRow.targetNeighborDemandCount }}</div>
              </div>
              <div>
                <div class="label">双边有价</div>
                <div class="value">{{ detailRow.isTwoWay ? "是" : "否" }}</div>
              </div>
              <div>
                <div class="label">按左价分解利润 / 次</div>
                <div class="value" :class="detailRow.currentProfitPP >= 0 ? 'positive' : 'negative'">
                  {{ formatMoneyOrDash(detailRow.currentProfitPP) }}
                </div>
              </div>
              <div>
                <div class="label">按左价分解利润 / h</div>
                <div class="value" :class="detailRow.currentProfitPH >= 0 ? 'positive' : 'negative'">
                  {{ formatMoneyOrDash(detailRow.currentProfitPH) }}
                </div>
              </div>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">回收面</div>
                </template>
                <div class="metric-list">
                  <div>当前右价：{{ formatMoneyOrDash(detailRow.currentBidUnit) }}</div>
                  <div>回收底价：{{ Format.money(detailRow.recoveryFloorUnit) }}</div>
                  <div>左价差比例：{{ formatPercentOrDash(detailRow.gapRateToAsk) }}</div>
                  <div>分解利润率：{{ formatPercentOrDash(detailRow.currentProfitRate) }}</div>
                </div>
              </el-card>
            </el-col>

            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">需求面</div>
                </template>
                <div class="metric-list">
                  <div>需求等级数：{{ detailRow.demandLevelCount }}</div>
                  <div>需求覆盖：{{ Format.percent(detailRow.demandCoverage, 1) }}</div>
                  <div>双边等级数：{{ detailRow.twoWayLevelCount }}</div>
                  <div>邻近需求：{{ detailRow.targetNeighborDemandCount }}</div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">说明</div>
            </template>
            <div class="metric-list">
              <div>“优先分解”说明当前左价相对回收底价有明显空间，但未必适合稳定转卖。</div>
              <div>“偏向转卖”说明需求连续且双边较完整，即使回收空间不大，也更像一个能稳定出货的等级。</div>
              <div>“可收后择机卖或分解”说明两边都不错，适合根据你当时的资金与出货节奏灵活处理。</div>
            </div>
            <el-space>
              <el-button type="primary" @click="openActionDetail()">
                分解动作详情
              </el-button>
              <el-button @click="setPrice(detailRow)">
                自定义价格
              </el-button>
            </el-space>
          </el-card>
        </el-space>
      </template>
    </el-drawer>

    <ActionDetail v-model="actionDetailVisible" :data="actionDetailData" />
    <ActionPrice v-model="priceVisible" :data="currentPriceRow" />
  </div>
</template>

<style lang="scss" scoped>
.bargain-analysis-page {
  .game-info {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: center;
    margin-bottom: 20px;
  }

  .hero-card,
  .result-card {
    margin-bottom: 20px;
    border-radius: 16px;
    border: 1px solid var(--el-border-color-light);
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--el-color-danger) 9%, transparent), transparent 35%),
      var(--el-bg-color);
  }

  .hero-header,
  .result-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .hero-title,
  .section-title {
    font-size: 18px;
    font-weight: 700;
  }

  .hero-subtitle {
    color: var(--el-text-color-regular);
    font-size: 13px;
    line-height: 1.7;
  }

  .hero-meta {
    padding: 8px 12px;
    border-radius: 999px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    white-space: nowrap;
  }

  .filter-form {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
  }

  .range-sep,
  .unit-suffix {
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
    margin-bottom: 6px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .value {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
    word-break: break-word;
  }

  .metric-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    line-height: 1.7;
    color: var(--el-text-color-regular);
  }

  .positive {
    color: var(--el-color-success);
  }

  .negative {
    color: var(--el-color-danger);
  }
}
</style>
