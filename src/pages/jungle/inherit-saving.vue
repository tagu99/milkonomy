<script lang="ts" setup>
import type { FormInstance, Sort } from "element-plus"
import type { ManufactureCalculator } from "@/calculator/manufacture"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { Edit, Search } from "@element-plus/icons-vue"
import { ElMessageBox } from "element-plus"
import { cloneDeep, debounce } from "lodash-es"
import { getItemDetailOf } from "@/common/apis/game"
import { getInheritSavingDataApi } from "@/common/apis/jungle/inherit"
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
  project: string
  minLevel: number
  maxLevel: number
  minTargetLevel: number
  maxTargetLevel: number
  minProfitPHMillion: number
  minExpPH: number
  allowNegativeProfit: boolean
}

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "inherit-saving-pagination")
const tableData = ref<ManufactureCalculator[]>([])
const loading = ref(false)
const searchFormRef = ref<FormInstance | null>(null)
const sortState: Ref<Sort | undefined> = ref()

const searchData = useMemory("inherit-saving-search-data", {
  name: "",
  project: "",
  minLevel: 1,
  maxLevel: 20,
  minTargetLevel: 0,
  maxTargetLevel: 20,
  minProfitPHMillion: -9999,
  minExpPH: 0,
  allowNegativeProfit: true
}) as Ref<SearchFormData>

function buildQueryParams() {
  return {
    currentPage: paginationData.currentPage,
    size: paginationData.pageSize,
    name: searchData.value.name,
    project: searchData.value.project,
    minLevel: searchData.value.minLevel,
    maxLevel: searchData.value.maxLevel,
    minTargetLevel: searchData.value.minTargetLevel,
    maxTargetLevel: searchData.value.maxTargetLevel,
    minProfitPH: (Number(searchData.value.minProfitPHMillion) || 0) * 1e6,
    minExpPH: Number(searchData.value.minExpPH) || 0,
    allowNegativeProfit: searchData.value.allowNegativeProfit,
    sort: sortState.value
  }
}

const getTableData = debounce(() => {
  loading.value = true
  getInheritSavingDataApi(buildQueryParams()).then((data) => {
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
  gameStore.clearInheritCache()
  getTableData()
}, { deep: true })

watch(() => priceStore.$state, () => {
  gameStore.clearInheritCache()
  getTableData()
}, { deep: true })

const detailVisible = ref(false)
const detailRow = ref<ManufactureCalculator>()

function showDetail(row: ManufactureCalculator) {
  detailRow.value = cloneDeep(row)
  detailVisible.value = true
}

const priceVisible = ref(false)
const currentPriceRow = ref<ManufactureCalculator>()

function setPrice(row: ManufactureCalculator) {
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
  currentPriceRow.value = cloneDeep(row)
  priceVisible.value = true
}

function sourceName(row: ManufactureCalculator) {
  return getItemDetailOf(row.actionItem.upgradeItemHrid).name
}

function targetLevelText(row: ManufactureCalculator) {
  if (row.targetLevel % 1 === 0) {
    return `+${Math.floor(row.targetLevel)}`
  }
  return `+${Math.floor(row.targetLevel)} / +${Math.ceil(row.targetLevel)}`
}

function targetPriceText(row: ManufactureCalculator) {
  if (row.targetLevel % 1 === 0) {
    return Format.price(row.productListWithPrice[0].price)
  }
  return row.productListWithPrice.map(item => Format.price(item.price)).join(" | ")
}

const onPriceStatusChange = usePriceStatus("inherit-saving-price-status")
</script>

<template>
  <div class="app-container inherit-saving-page">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['cheesesmithing', 'crafting', 'tailoring']" :equipments="['off_hand', 'hands', 'neck', 'earrings', 'ring', 'pouch']" />
      </div>
      <PriceStatusSelect @change="onPriceStatusChange" />
    </div>

    <el-row :gutter="20" class="row">
      <el-col :xs="24" :xl="17">
        <el-card shadow="never" class="hero-card">
          <template #header>
            <div class="hero-header">
              <div>
                <div class="hero-title">继承省钱</div>
                <div class="hero-subtitle">
                  寻找“先买低阶强化底子，再升级继承”的可行路线。适合判断哪些现成底子比自己从头做更省时间或更省钱。
                </div>
              </div>
              <div class="hero-meta">
                候选路线 {{ paginationData.total }}
              </div>
            </div>
          </template>

          <el-form ref="searchFormRef" :inline="true" :model="searchData" class="filter-form">
            <el-form-item label="目标物品">
              <el-input v-model="searchData.name" style="width: 140px" clearable placeholder="输入名称" @input="handleSearch" />
            </el-form-item>

            <el-form-item label="动作">
              <el-select v-model="searchData.project" style="width: 120px" clearable placeholder="全部" @change="handleSearch">
                <el-option label="锻造" value="锻造" />
                <el-option label="制造" value="制造" />
                <el-option label="裁缝" value="裁缝" />
              </el-select>
            </el-form-item>

            <el-form-item label="来源等级">
              <el-input-number v-model="searchData.minLevel" :min="1" :max="20" controls-position="right" @change="handleSearch" />
              <span class="range-sep">到</span>
              <el-input-number v-model="searchData.maxLevel" :min="1" :max="20" controls-position="right" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="目标等级">
              <el-input-number v-model="searchData.minTargetLevel" :min="0" :max="20" controls-position="right" @change="handleSearch" />
              <span class="range-sep">到</span>
              <el-input-number v-model="searchData.maxTargetLevel" :min="0" :max="20" controls-position="right" @change="handleSearch" />
            </el-form-item>

            <el-form-item label="最低利润 / h">
              <el-input-number v-model="searchData.minProfitPHMillion" :min="-999999" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="最低经验 / h">
              <el-input-number v-model="searchData.minExpPH" :min="0" :max="999999999" :controls="false" @change="handleSearch" />
            </el-form-item>

            <el-form-item>
              <el-switch v-model="searchData.allowNegativeProfit" @change="handleSearch" />
              <span class="switch-label">允许负利润</span>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="result-card">
          <template #header>
            <div class="result-header">
              <div class="hero-title">候选路线</div>
              <div class="hero-subtitle">
                先看利润 / h，再看利润 / 次和经验 / h，适合判断这条“继承底子”路线是否值得长期挂单补货。
              </div>
            </div>
          </template>

          <el-table :data="tableData" v-loading="loading" @sort-change="handleSort">
            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.actionItem.upgradeItemHrid" />
              </template>
            </el-table-column>

            <el-table-column label="来源" min-width="150">
              <template #default="{ row }">
                {{ sourceName(row) }} +{{ row.originLevel }}
              </template>
            </el-table-column>

            <el-table-column width="54">
              <template #default="{ row }">
                <ItemIcon :hrid="row.hrid" />
              </template>
            </el-table-column>

            <el-table-column label="目标" min-width="160">
              <template #default="{ row }">
                {{ row.result.name }} {{ targetLevelText(row) }}
              </template>
            </el-table-column>

            <el-table-column label="动作" width="90" align="center">
              <template #default="{ row }">
                {{ row.project }}
              </template>
            </el-table-column>

            <el-table-column label="利润 / h" min-width="130" align="center" sortable="custom" prop="result.profitPH">
              <template #default="{ row }">
                <span :class="row.result.profitPH >= 0 ? 'positive' : 'negative'">
                  {{ row.result.profitPHFormat }}
                </span>
                <el-link type="primary" :icon="Edit" @click="setPrice(row)">
                  改价
                </el-link>
              </template>
            </el-table-column>

            <el-table-column label="利润 / 次" min-width="120" align="center" sortable="custom" prop="result.profitPP">
              <template #default="{ row }">
                <span :class="row.result.profitPP >= 0 ? 'positive' : 'negative'">
                  {{ row.result.profitPPFormat }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="经验 / h" min-width="110" align="center" sortable="custom" prop="result.expPH">
              <template #default="{ row }">
                {{ row.result.expPHFormat }}
              </template>
            </el-table-column>

            <el-table-column label="来源买价" min-width="110" align="right">
              <template #default="{ row }">
                {{ Format.price(row.ingredientListWithPrice[0].price) }}
              </template>
            </el-table-column>

            <el-table-column label="目标卖价" min-width="150" align="right">
              <template #default="{ row }">
                {{ targetPriceText(row) }}
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
            <div>这类路线的核心不是终点卖多贵，而是“带等级底子”是否明显便宜于自己从头强化到同等起跑线。</div>
            <div>利润 / 次更适合判断挂一个底子值不值，利润 / h 更适合比较长期补货效率。</div>
            <div>若你是练级阶段，允许负利润后再配合经验 / h 看，往往更接近真实决策。</div>
          </div>
        </el-card>

        <ManualPriceCard memory-key="inherit-saving" />
      </el-col>
    </el-row>

    <ActionDetail v-model="detailVisible" :data="detailRow" />
    <ActionPrice v-model="priceVisible" :data="currentPriceRow" />
  </div>
</template>

<style lang="scss" scoped>
.inherit-saving-page {
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
      radial-gradient(circle at top right, color-mix(in srgb, var(--el-color-success) 10%, transparent), transparent 30%),
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
  .switch-label {
    margin-left: 8px;
    color: var(--el-text-color-regular);
  }

  .tip-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--el-text-color-regular);
    line-height: 1.7;
  }

  .pager-wrapper {
    display: flex;
    justify-content: center;
  }

  .positive {
    color: var(--el-color-success);
  }

  .negative {
    color: var(--el-color-danger);
  }
}
</style>
