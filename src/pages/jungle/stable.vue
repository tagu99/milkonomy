<script lang="ts" setup>
import type { FormInstance, Sort } from "element-plus"
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

type SearchFormData = {
  name: string
  minLevel: number
  maxLevel: number
  minItemLevel: number
  minDemandLevels: number
  minDemandCoveragePercent: number
  minNeighborDemand: number
  maxLossPHMillion: number
  maxSingleCapitalMillion: number
  maxHoursPerTarget: number
  minProfitPHMillion: number
  minExpPH: number
  minExpPerLossRatio: number
  allowNegativeProfit: boolean
  originLevelMode: "zero_only" | "all"
  banJewelry: boolean
  excludeThinMarket: boolean
}

const DEFAULT_SEARCH_DATA: SearchFormData = {
  name: "",
  minLevel: 1,
  maxLevel: 20,
  minItemLevel: 0,
  minDemandLevels: 1,
  minDemandCoveragePercent: 0,
  minNeighborDemand: 0,
  maxLossPHMillion: 9999,
  maxSingleCapitalMillion: 9999,
  maxHoursPerTarget: 999,
  minProfitPHMillion: -9999,
  minExpPH: 0,
  minExpPerLossRatio: 0,
  allowNegativeProfit: true,
  originLevelMode: "zero_only",
  banJewelry: false,
  excludeThinMarket: false
}

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "stable-enhance-pagination")
const tableData = ref<StableEnhanceRow[]>([])
const loading = ref(false)
const searchFormRef = ref<FormInstance | null>(null)
const sortState: Ref<Sort | undefined> = ref()

const searchData = useMemory("stable-enhance-search-data", DEFAULT_SEARCH_DATA) as Ref<SearchFormData>

function toFiniteNumber(value: unknown, fallback: number) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSearchData(data: Partial<SearchFormData>): SearchFormData {
  const minLevel = clamp(toFiniteNumber(data.minLevel, DEFAULT_SEARCH_DATA.minLevel), 1, 20)
  const maxLevel = clamp(toFiniteNumber(data.maxLevel, DEFAULT_SEARCH_DATA.maxLevel), minLevel, 20)
  return {
    name: typeof data.name === "string" ? data.name : DEFAULT_SEARCH_DATA.name,
    minLevel,
    maxLevel,
    minItemLevel: Math.max(0, toFiniteNumber(data.minItemLevel, DEFAULT_SEARCH_DATA.minItemLevel)),
    minDemandLevels: clamp(toFiniteNumber(data.minDemandLevels, DEFAULT_SEARCH_DATA.minDemandLevels), 1, 21),
    minDemandCoveragePercent: clamp(toFiniteNumber(data.minDemandCoveragePercent, DEFAULT_SEARCH_DATA.minDemandCoveragePercent), 0, 100),
    minNeighborDemand: clamp(toFiniteNumber(data.minNeighborDemand, DEFAULT_SEARCH_DATA.minNeighborDemand), 0, 10),
    maxLossPHMillion: Math.max(0, toFiniteNumber(data.maxLossPHMillion, DEFAULT_SEARCH_DATA.maxLossPHMillion)),
    maxSingleCapitalMillion: Math.max(0, toFiniteNumber(data.maxSingleCapitalMillion, DEFAULT_SEARCH_DATA.maxSingleCapitalMillion)),
    maxHoursPerTarget: Math.max(0, toFiniteNumber(data.maxHoursPerTarget, DEFAULT_SEARCH_DATA.maxHoursPerTarget)),
    minProfitPHMillion: toFiniteNumber(data.minProfitPHMillion, DEFAULT_SEARCH_DATA.minProfitPHMillion),
    minExpPH: Math.max(0, toFiniteNumber(data.minExpPH, DEFAULT_SEARCH_DATA.minExpPH)),
    minExpPerLossRatio: Math.max(0, toFiniteNumber(data.minExpPerLossRatio, DEFAULT_SEARCH_DATA.minExpPerLossRatio)),
    allowNegativeProfit: typeof data.allowNegativeProfit === "boolean" ? data.allowNegativeProfit : DEFAULT_SEARCH_DATA.allowNegativeProfit,
    originLevelMode: data.originLevelMode === "all" ? "all" : DEFAULT_SEARCH_DATA.originLevelMode,
    banJewelry: typeof data.banJewelry === "boolean" ? data.banJewelry : DEFAULT_SEARCH_DATA.banJewelry,
    excludeThinMarket: typeof data.excludeThinMarket === "boolean" ? data.excludeThinMarket : DEFAULT_SEARCH_DATA.excludeThinMarket
  }
}

searchData.value = normalizeSearchData(searchData.value)

function buildQueryParams() {
  return {
    currentPage: paginationData.currentPage,
    size: paginationData.pageSize,
    name: searchData.value.name,
    minLevel: searchData.value.minLevel,
    maxLevel: searchData.value.maxLevel,
    minItemLevel: searchData.value.minItemLevel,
    minDemandLevels: searchData.value.minDemandLevels,
    minDemandCoverage: searchData.value.minDemandCoveragePercent / 100,
    minNeighborDemand: searchData.value.minNeighborDemand,
    maxLossPH: searchData.value.maxLossPHMillion * 1e6,
    maxSingleCapital: searchData.value.maxSingleCapitalMillion * 1e6,
    maxHoursPerTarget: searchData.value.maxHoursPerTarget,
    minProfitPH: searchData.value.minProfitPHMillion * 1e6,
    minExpPH: searchData.value.minExpPH,
    minExpPerLossRatio: searchData.value.minExpPerLossRatio,
    allowNegativeProfit: searchData.value.allowNegativeProfit,
    originLevelMode: searchData.value.originLevelMode,
    banJewelry: searchData.value.banJewelry,
    excludeThinMarket: searchData.value.excludeThinMarket,
    sort: sortState.value
  }
}

const getTableData = debounce(() => {
  loading.value = true
  getStableEnhanceDataApi(buildQueryParams()).then((data) => {
    paginationData.total = data.total
    if (data.total > 0 && data.list.length === 0 && paginationData.currentPage > 1) {
      paginationData.currentPage = 1
      return
    }
    tableData.value = data.list
  }).catch((error) => {
    console.error(error)
    tableData.value = []
  }).finally(() => {
    loading.value = false
  })
}, 300)

function handleSearch() {
  searchData.value = normalizeSearchData(searchData.value)
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
  gameStore.clearStableEnhanceCache()
  getTableData()
}, { deep: true })

watch(() => priceStore.$state, () => {
  gameStore.clearStableEnhanceCache()
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
    return value > 0 ? "INF" : "-INF"
  }
  return Format.number(value, 2)
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

function formatLevelList(levels: number[]) {
  if (!levels.length) {
    return "无"
  }
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
                  先看哪些强化等级长期有真实需求，再为每个目标等级挑出更适合重复执行的强化路线。
                </div>
              </div>
              <div class="hero-meta">
                候选路线 {{ paginationData.total }}
              </div>
            </div>
          </template>

          <el-form ref="searchFormRef" :inline="true" :model="searchData" class="filter-form">
            <el-form-item label="物品">
              <el-input v-model="searchData.name" style="width: 140px" clearable placeholder="输入名称" @input="handleSearch" />
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

            <el-form-item label="最低需求覆盖">
              <el-input-number v-model="searchData.minDemandCoveragePercent" :min="0" :max="100" @change="handleSearch" />
              <span class="unit-suffix">%</span>
            </el-form-item>

            <el-form-item label="邻近需求数">
              <el-input-number v-model="searchData.minNeighborDemand" :min="0" :max="10" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="最大损耗 / h">
              <el-input-number v-model="searchData.maxLossPHMillion" :min="0" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="最大单件本金">
              <el-input-number v-model="searchData.maxSingleCapitalMillion" :min="0" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="最大单件耗时">
              <el-input-number v-model="searchData.maxHoursPerTarget" :min="0" :max="9999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">h</span>
            </el-form-item>

            <el-form-item label="最低利润 / h">
              <el-input-number v-model="searchData.minProfitPHMillion" :min="-999999" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="最低经验 / h">
              <el-input-number v-model="searchData.minExpPH" :min="0" :max="999999999" :controls="false" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="最低经验 / 损耗">
              <el-input-number v-model="searchData.minExpPerLossRatio" :min="0" :max="999999" :controls="false" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="起始等级">
              <el-select v-model="searchData.originLevelMode" style="width: 150px" @change="handleSearch">
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

            <el-form-item>
              <el-checkbox v-model="searchData.excludeThinMarket" @change="handleSearch">
                排除薄市场
              </el-checkbox>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="result-card">
          <template #header>
            <div class="result-header">
              <div class="hero-title">候选路线</div>
              <div class="hero-subtitle">
                默认按利润 / h、经验 / 损耗、预期单件耗时综合排序，也可以点击表头改排序。
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
                {{ row.name }}
              </template>
            </el-table-column>

            <el-table-column label="路径 / 保护" min-width="170">
              <template #default="{ row }">
                <div>+{{ row.originLevel }} -> +{{ row.targetLevel }}</div>
                <div class="table-subtext">保护 +{{ row.protectLevel }}</div>
              </template>
            </el-table-column>

            <el-table-column label="退出方式" min-width="110">
              <template #default="{ row }">
                {{ row.fallbackMode }}
              </template>
            </el-table-column>

            <el-table-column label="需求" min-width="140" sortable="custom" prop="demandLevelCount">
              <template #default="{ row }">
                {{ row.demandLevelCount }} 档 / {{ Format.percent(row.demandCoverage, 1) }}
              </template>
            </el-table-column>

            <el-table-column label="市场" min-width="120" align="center">
              <template #default="{ row }">
                <el-tooltip v-if="row.thinMarket" :content="row.thinMarketReasons.join(' / ')" placement="top">
                  <el-tag type="warning" effect="plain">薄市场</el-tag>
                </el-tooltip>
                <el-tag v-else type="success" effect="plain">正常</el-tag>
              </template>
            </el-table-column>

            <el-table-column label="单件本金" min-width="120" align="right" sortable="custom" prop="singleCapital">
              <template #default="{ row }">
                {{ Format.money(row.singleCapital) }}
              </template>
            </el-table-column>

            <el-table-column label="利润 / h" min-width="130" align="center" sortable="custom" prop="profitPH">
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
                {{ Format.number(row.expPH, 2) }}
              </template>
            </el-table-column>

            <el-table-column label="经验 / 损耗" width="120" align="center" sortable="custom" prop="expPerLossRatio">
              <template #default="{ row }">
                {{ formatExpLossRatio(row.expPerLossRatio) }}
              </template>
            </el-table-column>

            <el-table-column label="预期单件耗时" width="120" align="center" sortable="custom" prop="hoursPerTarget">
              <template #default="{ row }">
                {{ formatHours(row.hoursPerTarget) }}
              </template>
            </el-table-column>

            <el-table-column label="利润率" width="100" align="center" sortable="custom" prop="profitRate">
              <template #default="{ row }">
                <span :class="row.profitRate >= 0 ? 'positive' : 'negative'">
                  {{ Format.percent(row.profitRate) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="收益 / 损耗" width="110" align="center" sortable="custom" prop="profitToLossRatio">
              <template #default="{ row }">
                <span :class="row.profitToLossRatio >= 0 ? 'positive' : 'negative'">
                  {{ formatRatio(row.profitToLossRatio) }}
                </span>
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
        <el-card shadow="never" class="side-card">
          <template #header>
            <div class="side-title">使用建议</div>
          </template>
          <div class="tip-list">
            <div>先用“只看 +0 起手”找真正能长期重复的路线，再放开半成品起手看补货方案。</div>
            <div>“单件本金”和“损耗 / h”更适合控制资金压力，“经验 / 损耗”更适合找亏钱练级路线。</div>
            <div>“预期单件耗时”更适合判断是否适合日常持续挂单和补货。</div>
            <div>“薄市场”不是绝对不能做，只是说明该等级成交深度更弱，实际出货稳定性更差。</div>
          </div>
        </el-card>

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
                <div class="value">{{ detailRow.name }} | +{{ detailRow.originLevel }} -> +{{ detailRow.targetLevel }}</div>
              </div>
              <div>
                <div class="label">保护 / 退出</div>
                <div class="value">+{{ detailRow.protectLevel }} / {{ detailRow.fallbackMode }}</div>
              </div>
              <div>
                <div class="label">利润 / h</div>
                <div class="value" :class="detailRow.profitPH >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(detailRow.profitPH) }}
                </div>
              </div>
              <div>
                <div class="label">损耗 / h</div>
                <div class="value">{{ Format.money(detailRow.expectedLossPH) }}</div>
              </div>
              <div>
                <div class="label">单件本金</div>
                <div class="value">{{ Format.money(detailRow.singleCapital) }}</div>
              </div>
              <div>
                <div class="label">经验 / h</div>
                <div class="value">{{ Format.number(detailRow.expPH, 2) }}</div>
              </div>
              <div>
                <div class="label">经验 / 损耗</div>
                <div class="value">{{ formatExpLossRatio(detailRow.expPerLossRatio) }}</div>
              </div>
              <div>
                <div class="label">回收率</div>
                <div class="value">{{ Format.percent(detailRow.recoveryRate) }}</div>
              </div>
              <div>
                <div class="label">预期单件耗时</div>
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
                  <div class="section-title">需求概览</div>
                </template>
                <div class="metric-list">
                  <div>有收购价等级数：{{ detailRow.demandLevelCount }}</div>
                  <div>双边有价等级数：{{ detailRow.twoWayLevelCount }}</div>
                  <div>需求覆盖度：{{ Format.percent(detailRow.demandCoverage, 1) }}</div>
                  <div>目标附近需求：{{ detailRow.targetNeighborDemandCount }}</div>
                  <div>需求分：{{ Format.number(detailRow.demandScore, 1) }}</div>
                  <div>目标卖价：{{ Format.money(detailRow.targetPrice) }}</div>
                  <div>起始买价：{{ Format.money(detailRow.originPrice) }}</div>
                  <div>薄市场：{{ detailRow.thinMarket ? "是" : "否" }}</div>
                  <div v-if="detailRow.thinMarketReasons.length">
                    薄市场原因：{{ detailRow.thinMarketReasons.join(" / ") }}
                  </div>
                </div>
              </el-card>
            </el-col>

            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">强化参数</div>
                </template>
                <div class="metric-list">
                  <div>总成功率：{{ Format.percent(detailRow.successRate) }}</div>
                  <div>目标成功率：{{ Format.percent(detailRow.targetRate) }}</div>
                  <div>跳级率：{{ Format.percent(detailRow.leapRate) }}</div>
                  <div>逃脱率：{{ Format.percent(detailRow.escapeRate) }}</div>
                  <div>预期回收 / 件：{{ Format.money(detailRow.expectedRecoveryPerTarget) }}</div>
                  <div>收益 / 损耗：{{ formatRatio(detailRow.profitToLossRatio) }}</div>
                  <div>利润率：{{ Format.percent(detailRow.profitRate) }}</div>
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
              <div class="section-title">需求等级</div>
            </template>
            <div class="tag-list">
              <el-tag v-for="level in detailRow.demandLevels" :key="`sell-${level}`" effect="plain">
                +{{ level }}
              </el-tag>
              <span v-if="!detailRow.demandLevels.length">无</span>
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

          <el-card shadow="never">
            <template #header>
              <div class="section-title">说明</div>
            </template>
            <div class="metric-list">
              <div>当前有收购价等级：{{ formatLevelList(detailRow.demandLevels) }}</div>
              <div>当前双边有价等级：{{ formatLevelList(detailRow.twoWayLevels) }}</div>
              <div>利润率 = 预期利润 / 总成本；收益 / 损耗 = 预期利润 / 预期损耗。</div>
              <div>预期单件耗时按获得 1 件目标强化装备的期望时间计算，单件本金用于粗略估算资金占用。</div>
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

  .row {
    .el-col {
      margin-bottom: 20px;
    }
  }

  .hero-card,
  .result-card,
  .side-card {
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
  .section-title,
  .side-title {
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
  .unit-suffix,
  .switch-label,
  .table-subtext {
    color: var(--el-text-color-regular);
  }

  .range-sep,
  .unit-suffix,
  .switch-label {
    margin-left: 8px;
  }

  .table-subtext {
    font-size: 12px;
    line-height: 1.5;
  }

  .pager-wrapper {
    display: flex;
    justify-content: center;
  }

  .tip-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--el-text-color-regular);
    line-height: 1.7;
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

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    line-height: 1.8;
  }

  .positive {
    color: var(--el-color-success);
  }

  .negative {
    color: var(--el-color-danger);
  }
}
</style>
