<script lang="ts" setup>
import type { FormInstance, Sort } from "element-plus"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { Search } from "@element-plus/icons-vue"
import { cloneDeep, debounce } from "lodash-es"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import * as Format from "@/common/utils/format"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import { getDemandHeatDataApi, type DemandHeatRow } from "@/common/apis/jungle/demand-heat"
import GameInfo from "../dashboard/components/GameInfo.vue"
import PriceStatusSelect from "../dashboard/components/PriceStatusSelect.vue"

type SearchFormData = {
  name: string
  minLevel: number
  maxLevel: number
  minItemLevel: number
  minDemandLevels: number
  minDemandCoveragePercent: number
  minNeighborDemand: number
  onlyTwoWay: boolean
  banJewelry: boolean
}

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()
const { t } = useI18n()

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "demand-heat-pagination")
const tableData = ref<DemandHeatRow[]>([])
const loading = ref(false)
const searchFormRef = ref<FormInstance | null>(null)
const sortState: Ref<Sort | undefined> = ref()

const searchData = useMemory("demand-heat-search-data", {
  name: "",
  minLevel: 0,
  maxLevel: 20,
  minItemLevel: 0,
  minDemandLevels: 1,
  minDemandCoveragePercent: 0,
  minNeighborDemand: 0,
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
    minDemandLevels: searchData.value.minDemandLevels,
    minDemandCoverage: (Number(searchData.value.minDemandCoveragePercent) || 0) / 100,
    minNeighborDemand: searchData.value.minNeighborDemand,
    onlyTwoWay: searchData.value.onlyTwoWay,
    banJewelry: searchData.value.banJewelry,
    sort: sortState.value
  }
}

const getTableData = debounce(() => {
  loading.value = true
  getDemandHeatDataApi(buildQueryParams()).then((data) => {
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
  gameStore.clearDemandHeatCache()
  gameStore.clearBargainAnalysisCache()
  gameStore.clearMarketWarningCache()
  getTableData()
}, { deep: true })

watch(() => priceStore.$state, () => {
  gameStore.clearDemandHeatCache()
  gameStore.clearBargainAnalysisCache()
  gameStore.clearMarketWarningCache()
  getTableData()
}, { deep: true })

const detailVisible = ref(false)
const detailRow = ref<DemandHeatRow>()

function showDetail(row: DemandHeatRow) {
  detailRow.value = cloneDeep(row)
  detailVisible.value = true
}

const onPriceStatusChange = usePriceStatus("demand-heat-price-status")
</script>

<template>
  <div class="app-container demand-heat-page">
    <div class="game-info">
      <GameInfo />
      <PriceStatusSelect @change="onPriceStatusChange" />
    </div>

    <el-card shadow="never" class="hero-card">
      <template #header>
        <div class="hero-header">
          <div>
            <div class="hero-title">需求热度</div>
            <div class="hero-subtitle">
              只看市场本身，不算强化利润。用来判断哪些装备等级真的有人买、哪些等级附近形成了连续需求。
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

        <el-form-item label="目标等级">
          <el-input-number v-model="searchData.minLevel" :min="0" :max="20" controls-position="right" @change="handleSearch" />
          <span class="range-sep">到</span>
          <el-input-number v-model="searchData.maxLevel" :min="0" :max="20" controls-position="right" @change="handleSearch" />
        </el-form-item>

        <el-form-item label="最低物品等级">
          <el-input-number v-model="searchData.minItemLevel" :min="0" :max="999" :controls="false" @change="handleSearch" />
        </el-form-item>

        <el-form-item label="最低需求等级数">
          <el-input-number v-model="searchData.minDemandLevels" :min="1" :max="21" @change="handleSearch" />
        </el-form-item>

        <el-form-item label="最低需求覆盖">
          <el-input-number v-model="searchData.minDemandCoveragePercent" :min="0" :max="100" @change="handleSearch" />
          <span class="unit-suffix">%</span>
        </el-form-item>

        <el-form-item label="邻近需求数">
          <el-input-number v-model="searchData.minNeighborDemand" :min="0" :max="10" @change="handleSearch" />
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
          <div class="hero-title">候选条目</div>
          <div class="hero-subtitle">
            需求分越高，代表该物品等级的需求更连续、附近等级更活跃、双边市场也更完整。
          </div>
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
            {{ t(row.name) }} +{{ row.targetLevel }}
          </template>
        </el-table-column>

        <el-table-column label="市场状态" min-width="120" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isTwoWay" type="success" effect="plain">
              双边有价
            </el-tag>
            <el-tag v-else type="warning" effect="plain">
              单边收购
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="当前价格" min-width="140" align="right">
          <template #default="{ row }">
            <div>右 {{ Format.money(row.bidPrice) }}</div>
            <div>左 {{ row.askPrice > 0 ? Format.money(row.askPrice) : "-" }}</div>
          </template>
        </el-table-column>

        <el-table-column label="需求等级数" min-width="120" align="center" sortable="custom" prop="demandLevelCount">
          <template #default="{ row }">
            {{ row.demandLevelCount }}
          </template>
        </el-table-column>

        <el-table-column label="需求覆盖" min-width="110" align="center" sortable="custom" prop="demandCoverage">
          <template #default="{ row }">
            {{ Format.percent(row.demandCoverage, 1) }}
          </template>
        </el-table-column>

        <el-table-column label="邻近需求" min-width="110" align="center" sortable="custom" prop="targetNeighborDemandCount">
          <template #default="{ row }">
            {{ row.targetNeighborDemandCount }}
          </template>
        </el-table-column>

        <el-table-column label="双边等级数" min-width="120" align="center" sortable="custom" prop="twoWayLevelCount">
          <template #default="{ row }">
            {{ row.twoWayLevelCount }}
          </template>
        </el-table-column>

        <el-table-column label="需求分" min-width="110" align="center" sortable="custom" prop="demandScore">
          <template #default="{ row }">
            {{ Format.number(row.demandScore, 1) }}
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

    <el-drawer v-model="detailVisible" title="需求热度详情" size="60%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="label">物品</div>
                <div class="value">{{ t(detailRow.name) }} +{{ detailRow.targetLevel }}</div>
              </div>
              <div>
                <div class="label">市场状态</div>
                <div class="value">{{ detailRow.isTwoWay ? "双边有价" : "单边收购" }}</div>
              </div>
              <div>
                <div class="label">当前右价</div>
                <div class="value">{{ Format.money(detailRow.bidPrice) }}</div>
              </div>
              <div>
                <div class="label">当前左价</div>
                <div class="value">{{ detailRow.askPrice > 0 ? Format.money(detailRow.askPrice) : "-" }}</div>
              </div>
              <div>
                <div class="label">需求覆盖</div>
                <div class="value">{{ Format.percent(detailRow.demandCoverage, 1) }}</div>
              </div>
              <div>
                <div class="label">需求分</div>
                <div class="value">{{ Format.number(detailRow.demandScore, 1) }}</div>
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">需求分布</div>
            </template>
            <div class="metric-list">
              <div>有收购价等级数：{{ detailRow.demandLevelCount }}</div>
              <div>双边有价等级数：{{ detailRow.twoWayLevelCount }}</div>
              <div>目标等级附近需求数：{{ detailRow.targetNeighborDemandCount }}</div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">有收购价等级</div>
            </template>
            <div class="tag-list">
              <el-tag v-for="level in detailRow.demandLevels" :key="`d-${level}`" effect="plain">
                +{{ level }}
              </el-tag>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">双边有价等级</div>
            </template>
            <div class="tag-list">
              <el-tag v-for="level in detailRow.twoWayLevels" :key="`tw-${level}`" type="success" effect="plain">
                +{{ level }}
              </el-tag>
              <span v-if="!detailRow.twoWayLevels.length">无</span>
            </div>
          </el-card>
        </el-space>
      </template>
    </el-drawer>
  </div>
</template>

<style lang="scss" scoped>
.demand-heat-page {
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
      radial-gradient(circle at top right, color-mix(in srgb, var(--el-color-primary) 10%, transparent), transparent 32%),
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
  }

  .metric-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    line-height: 1.7;
    color: var(--el-text-color-regular);
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    line-height: 1.8;
  }
}
</style>
