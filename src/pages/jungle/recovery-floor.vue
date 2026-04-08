<script lang="ts" setup>
import type { FormInstance, Sort } from "element-plus"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import { usePagination } from "@@/composables/usePagination"
import { Edit, Search } from "@element-plus/icons-vue"
import { ElMessageBox } from "element-plus"
import { cloneDeep, debounce } from "lodash-es"
import { getItemDetailOf } from "@/common/apis/game"
import { COIN_HRID, useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import { getRecoveryFloorDataApi, getExpectedProductTotal, type RecoveryFloorRow } from "@/common/apis/jungle/recovery-floor"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import * as Format from "@/common/utils/format"
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
  minFloorMillion: number
  minGapMillion: number
  minGapPercent: number
  showOnlyBelowFloor: boolean
  excludeNoAsk: boolean
  banJewelry: boolean
}

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()
const { t } = useI18n()

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination({}, "recovery-floor-pagination")
const tableData = ref<RecoveryFloorRow[]>([])
const loading = ref(false)
const searchFormRef = ref<FormInstance | null>(null)
const sortState: Ref<Sort | undefined> = ref()

const searchData = useMemory("recovery-floor-search-data", {
  name: "",
  minLevel: 0,
  maxLevel: 20,
  minItemLevel: 0,
  minFloorMillion: 0,
  minGapMillion: 0,
  minGapPercent: 0,
  showOnlyBelowFloor: false,
  excludeNoAsk: false,
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
    minFloor: (Number(searchData.value.minFloorMillion) || 0) * 1e6,
    minGap: (Number(searchData.value.minGapMillion) || 0) * 1e6,
    minGapRate: (Number(searchData.value.minGapPercent) || 0) / 100,
    showOnlyBelowFloor: searchData.value.showOnlyBelowFloor,
    excludeNoAsk: searchData.value.excludeNoAsk,
    banJewelry: searchData.value.banJewelry,
    sort: sortState.value
  }
}

const getTableData = debounce(() => {
  loading.value = true
  getRecoveryFloorDataApi(buildQueryParams()).then((data) => {
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
  gameStore.clearBargainAnalysisCache()
  gameStore.clearMarketWarningCache()
  getTableData()
}, { deep: true })

watch(() => priceStore.$state, () => {
  gameStore.clearRecoveryFloorCache()
  gameStore.clearBargainAnalysisCache()
  gameStore.clearMarketWarningCache()
  getTableData()
}, { deep: true })

const detailVisible = ref(false)
const detailRow = ref<RecoveryFloorRow>()

function showDetail(row: RecoveryFloorRow) {
  detailRow.value = cloneDeep(row)
  detailVisible.value = true
}

const actionDetailVisible = ref(false)
const actionDetailData = computed(() => detailRow.value?.calculator)

function openActionDetail(row?: RecoveryFloorRow) {
  if (row) {
    detailRow.value = cloneDeep(row)
  }
  actionDetailVisible.value = true
}

const priceVisible = ref(false)
const currentPriceRow = ref<any>()

function setPrice(row: RecoveryFloorRow) {
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

function expectedOutputTotal(row: any) {
  return getExpectedProductTotal(row)
}

function itemName(hrid: string) {
  if (hrid === COIN_HRID) {
    return "金币"
  }
  const item = getItemDetailOf(hrid)
  return item?.name ? t(item.name) : (hrid.split("/").pop() || hrid)
}

const onPriceStatusChange = usePriceStatus("recovery-floor-price-status")
</script>

<template>
  <div class="app-container recovery-floor-page">
    <div class="game-info">
      <GameInfo />
      <div>
        <ActionConfig :actions="['alchemy']" :equipments="['hands', 'neck', 'earrings', 'ring', 'pouch']" />
      </div>
      <PriceStatusSelect @change="onPriceStatusChange" />
    </div>

    <el-row :gutter="20" class="row">
      <el-col :xs="24" :xl="17">
        <el-card shadow="never" class="hero-card">
          <template #header>
            <div class="hero-header">
              <div>
                <div class="hero-title">回收底价</div>
                <div class="hero-subtitle">
                  用分解的税后期望产出，反推出装备“理论不该低于多少”。如果市场左价低于这个底价，就属于可直接考虑的分解捡漏。
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

            <el-form-item label="最低底价">
              <el-input-number v-model="searchData.minFloorMillion" :min="0" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="最低左价差">
              <el-input-number v-model="searchData.minGapMillion" :min="0" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">M</span>
            </el-form-item>

            <el-form-item label="最低左价差比例">
              <el-input-number v-model="searchData.minGapPercent" :min="0" :max="999999" :controls="false" @change="handleSearch" />
              <span class="unit-suffix">%</span>
            </el-form-item>

            <el-form-item>
              <el-checkbox v-model="searchData.showOnlyBelowFloor" @change="handleSearch">
                只看左价低于底价
              </el-checkbox>
            </el-form-item>

            <el-form-item>
              <el-checkbox v-model="searchData.excludeNoAsk" @change="handleSearch">
                排除无左价
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
                “回收底价”不包含装备本体成本；“左价差” = 回收底价 - 当前左价。
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
                {{ row.name }} +{{ row.enhanceLevel }}
              </template>
            </el-table-column>

            <el-table-column label="催化剂" min-width="120">
              <template #default="{ row }">
                <div class="item-inline">
                  <ItemIcon v-if="row.catalystHrid" :hrid="row.catalystHrid" />
                  <span>{{ row.catalystHrid ? itemName(row.catalystHrid) : "无催化剂" }}</span>
                </div>
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

            <el-table-column label="左价差比例" min-width="110" align="center" sortable="custom" prop="gapRateToAsk">
              <template #default="{ row }">
                <span :class="row.gapRateToAsk >= 0 ? 'positive' : 'negative'">
                  {{ formatPercentOrDash(row.gapRateToAsk) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="按左价分解利润 / 次" min-width="150" align="right" sortable="custom" prop="currentProfitPP">
              <template #default="{ row }">
                <span :class="row.currentProfitPP >= 0 ? 'positive' : 'negative'">
                  {{ formatMoneyOrDash(row.currentProfitPP) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="按左价分解利润 / h" min-width="150" align="right" sortable="custom" prop="currentProfitPH">
              <template #default="{ row }">
                <span :class="row.currentProfitPH >= 0 ? 'positive' : 'negative'">
                  {{ formatMoneyOrDash(row.currentProfitPH) }}
                </span>
                <el-link type="primary" :icon="Edit" @click="setPrice(row)">
                  改价
                </el-link>
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
            <div>回收底价 = 分解税后期望产出 - 金币 / 催化剂 / 茶等固定成本，不包含装备本体。</div>
            <div>左价低于底价，意味着直接买来分解通常就有正期望；左价高于底价，则更适合作为卖家参考底线。</div>
            <div>当前右价如果也明显低于底价，往往意味着直接右卖非常吃亏。</div>
          </div>
        </el-card>

        <ManualPriceCard memory-key="recovery-floor" />
      </el-col>
    </el-row>

    <el-drawer v-model="detailVisible" title="回收底价详情" size="72%">
      <template v-if="detailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="label">物品</div>
                <div class="value">{{ detailRow.name }} +{{ detailRow.enhanceLevel }}</div>
              </div>
              <div>
                <div class="label">当前市场</div>
                <div class="value">左 {{ formatMoneyOrDash(detailRow.currentAskUnit) }} / 右 {{ formatMoneyOrDash(detailRow.currentBidUnit) }}</div>
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
              <div>
                <div class="label">固定成本</div>
                <div class="value">{{ Format.money(detailRow.fixedCostTotal) }}</div>
              </div>
              <div>
                <div class="label">税后产出</div>
                <div class="value">{{ Format.money(detailRow.outputValueTotal) }}</div>
              </div>
              <div>
                <div class="label">成功率</div>
                <div class="value">{{ Format.percent(detailRow.successRate) }}</div>
              </div>
              <div>
                <div class="label">经验 / h</div>
                <div class="value">{{ Format.number(detailRow.expPH, 2) }}</div>
              </div>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">固定成本</div>
                </template>
                <el-table :data="detailRow.calculator.ingredientListWithPrice.slice(1)" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column label="物品">
                    <template #default="{ row }">
                      {{ itemName(row.hrid) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="数量" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.count, 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="单价" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.price(row.price) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="成本" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.money(row.count * row.price) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>

            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">期望产出</div>
                </template>
                <el-table :data="detailRow.calculator.productListWithPrice" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column label="物品">
                    <template #default="{ row }">
                      {{ itemName(row.hrid) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="期望数量" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.count * (row.rate || 1), 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="单价" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.price(Math.max(0, row.price)) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="税后估值" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.money(expectedOutputTotal(row)) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
          </el-row>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">说明</div>
            </template>
            <div class="metric-list">
              <div>这页的核心数字是“回收底价 / 件”，即单件装备在分解口径下的理论最高收购价。</div>
              <div>期望产出里对不可定价产物按 0 估值，属于保守算法，因此更适合拿来做底线判断。</div>
              <div>如果你只是想核对动作本身的完整成本与产出，可继续打开“动作详情”或修改自定义价格。</div>
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
        </el-space>
      </template>
    </el-drawer>

    <ActionDetail v-model="actionDetailVisible" :data="actionDetailData" />
    <ActionPrice v-model="priceVisible" :data="currentPriceRow" />
  </div>
</template>

<style lang="scss" scoped>
.recovery-floor-page {
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
      radial-gradient(circle at top right, color-mix(in srgb, var(--el-color-warning) 10%, transparent), transparent 32%),
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
  .unit-suffix {
    margin-left: 8px;
    color: var(--el-text-color-regular);
  }

  .item-inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tip-list,
  .metric-list {
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

  .positive {
    color: var(--el-color-success);
  }

  .negative {
    color: var(--el-color-danger);
  }
}
</style>
