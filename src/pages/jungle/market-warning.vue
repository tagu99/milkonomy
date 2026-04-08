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
import { getMarketWarningDataApi, type MarketWarningRow } from "@/common/apis/jungle/market-warning"
import ActionDetail from "../dashboard/components/ActionDetail.vue"
import ActionPrice from "../dashboard/components/ActionPrice.vue"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

type SearchFormData = {
  name: string
  minLevel: number
  maxLevel: number
  minItemLevel: number
  minRiskScore: number
  onlyHighRisk: boolean
  onlySingleSided: boolean
  banJewelry: boolean
}

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "market-warning-pagination")
const tableData = ref<MarketWarningRow[]>([])
const loading = ref(false)
const searchFormRef = ref<FormInstance | null>(null)
const sortState: Ref<Sort | undefined> = ref()

const searchData = useMemory("market-warning-search-data", {
  name: "",
  minLevel: 0,
  maxLevel: 20,
  minItemLevel: 0,
  minRiskScore: 0,
  onlyHighRisk: false,
  onlySingleSided: false,
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
    minRiskScore: Number(searchData.value.minRiskScore) || 0,
    onlyHighRisk: searchData.value.onlyHighRisk,
    onlySingleSided: searchData.value.onlySingleSided,
    banJewelry: searchData.value.banJewelry,
    sort: sortState.value
  }
}

const getTableData = debounce(() => {
  loading.value = true
  getMarketWarningDataApi(buildQueryParams()).then((data) => {
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
const detailRow = ref<MarketWarningRow>()

function showDetail(row: MarketWarningRow) {
  detailRow.value = cloneDeep(row)
  detailVisible.value = true
}

const actionDetailVisible = ref(false)
const actionDetailData = computed(() => detailRow.value?.source.recovery.calculator)

function openActionDetail(row?: MarketWarningRow) {
  if (row) {
    detailRow.value = cloneDeep(row)
  }
  actionDetailVisible.value = true
}

const priceVisible = ref(false)
const currentPriceRow = ref<any>()

function setPrice(row: MarketWarningRow) {
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
  currentPriceRow.value = cloneDeep(row.source.recovery.calculator)
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

function riskTagType(severity: string) {
  if (severity === "高风险") return "danger"
  if (severity === "中风险") return "warning"
  return "info"
}

const onPriceStatusChange = usePriceStatus("market-warning-price-status")
</script>

<template>
  <div class="app-container market-warning-page">
    <div class="game-info">
      <GameInfo />
      <PriceStatusSelect @change="onPriceStatusChange" />
    </div>

    <el-card shadow="never" class="hero-card">
      <template #header>
        <div class="hero-header">
          <div>
            <div class="hero-title">反操盘提醒</div>
            <div class="hero-subtitle">
              这页只提醒“当前价格信号不可靠”的地方。风险高不代表一定有人操盘，但代表普通玩家更容易被盘口和挂价误导。
            </div>
          </div>
          <div class="hero-meta">
            风险条目 {{ paginationData.total }}
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

        <el-form-item label="最低风险分">
          <el-input-number v-model="searchData.minRiskScore" :min="0" :max="999" :controls="false" @change="handleSearch" />
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="searchData.onlyHighRisk" @change="handleSearch">
            只看高风险
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="searchData.onlySingleSided" @change="handleSearch">
            只看单边市场
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
          <div class="hero-title">风险列表</div>
          <div class="hero-subtitle">
            默认按风险分排序。你可以把它当成“不应该轻信当前价格”的清单。
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

        <el-table-column label="风险等级" min-width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="riskTagType(row.severity)" effect="plain">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="当前市场" min-width="140" align="right">
          <template #default="{ row }">
            <div>左 {{ formatMoneyOrDash(row.currentAskUnit) }}</div>
            <div>右 {{ formatMoneyOrDash(row.currentBidUnit) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="价差率" min-width="100" align="center" sortable="custom" prop="spreadRate">
          <template #default="{ row }">
            {{ formatPercentOrDash(row.spreadRate) }}
          </template>
        </el-table-column>

        <el-table-column label="左价高于回收底价" min-width="150" align="center" sortable="custom" prop="premiumToFloor">
          <template #default="{ row }">
            {{ formatPercentOrDash(row.premiumToFloor) }}
          </template>
        </el-table-column>

        <el-table-column label="需求分" min-width="100" align="center" sortable="custom" prop="demandScore">
          <template #default="{ row }">
            {{ Format.number(row.demandScore, 1) }}
          </template>
        </el-table-column>

        <el-table-column label="风险分" min-width="100" align="center" sortable="custom" prop="riskScore">
          <template #default="{ row }">
            {{ Format.number(row.riskScore, 1) }}
          </template>
        </el-table-column>

        <el-table-column label="提示" min-width="220">
          <template #default="{ row }">
            {{ row.reasons[0] || row.suggestion }}
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

    <el-drawer v-model="detailVisible" title="反操盘提醒详情" size="72%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="label">物品</div>
                <div class="value">{{ detailRow.name }} +{{ detailRow.targetLevel }}</div>
              </div>
              <div>
                <div class="label">风险等级</div>
                <div class="value">{{ detailRow.severity }}</div>
              </div>
              <div>
                <div class="label">风险分</div>
                <div class="value">{{ Format.number(detailRow.riskScore, 1) }}</div>
              </div>
              <div>
                <div class="label">当前左价</div>
                <div class="value">{{ formatMoneyOrDash(detailRow.currentAskUnit) }}</div>
              </div>
              <div>
                <div class="label">当前右价</div>
                <div class="value">{{ formatMoneyOrDash(detailRow.currentBidUnit) }}</div>
              </div>
              <div>
                <div class="label">回收底价</div>
                <div class="value">{{ Format.money(detailRow.recoveryFloorUnit) }}</div>
              </div>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">风险原因</div>
                </template>
                <div class="reason-list">
                  <el-tag
                    v-for="reason in detailRow.reasons"
                    :key="reason"
                    type="warning"
                    effect="plain"
                  >
                    {{ reason }}
                  </el-tag>
                  <span v-if="!detailRow.reasons.length">当前无明显异常信号</span>
                </div>
              </el-card>
            </el-col>

            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">建议</div>
                </template>
                <div class="metric-list">
                  <div>{{ detailRow.suggestion }}</div>
                  <div>需求分：{{ Format.number(detailRow.demandScore, 1) }}</div>
                  <div>邻近需求：{{ detailRow.targetNeighborDemandCount }}</div>
                  <div>双边等级数：{{ detailRow.twoWayLevelCount }}</div>
                  <div>价差率：{{ formatPercentOrDash(detailRow.spreadRate) }}</div>
                  <div>左价高于回收底价：{{ formatPercentOrDash(detailRow.premiumToFloor) }}</div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">说明</div>
            </template>
            <div class="metric-list">
              <div>高风险不等于一定有人抬价或打压，而是说明你不该把当前盘口当成稳定价格锚点。</div>
              <div>如果你仍想参与，最好结合“回收底价”和“需求热度”单独核对，不要只看一口价。</div>
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
.market-warning-page {
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
      radial-gradient(circle at top right, color-mix(in srgb, var(--el-color-warning) 12%, transparent), transparent 35%),
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

  .range-sep {
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

  .reason-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    line-height: 1.8;
  }
}
</style>
