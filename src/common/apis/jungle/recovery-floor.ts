import { DecomposeCalculator } from "@/calculator/alchemy"
import { getItemDetailOf } from "@/common/apis/game"
import { getUsedPriceOf } from "@/common/apis/price"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useGameStoreOutside, COIN_HRID } from "@/pinia/stores/game"
import { ElMessage } from "element-plus"

type SortLike = {
  prop?: string
  order?: "ascending" | "descending" | null
}

export interface RecoveryFloorRow {
  signature: string
  itemHrid: string
  name: string
  itemLevel: number
  itemType: string
  enhanceLevel: number
  bulkMultiplier: number
  catalystRank: number
  catalystHrid: string
  catalystName: string
  successRate: number
  currentAskUnit: number
  currentBidUnit: number
  currentAskTotal: number
  currentBidTotal: number
  outputValueTotal: number
  fixedCostTotal: number
  recoveryFloorTotal: number
  recoveryFloorUnit: number
  gapToAskTotal: number
  gapToAskUnit: number
  gapRateToAsk: number
  currentProfitPP: number
  currentProfitPH: number
  currentProfitRate: number
  expPH: number
  calculator: DecomposeCalculator
}

function hasValidPrice(value: number) {
  return Number.isFinite(value) && value >= 0
}

function getCautiousProductPriceConfigList(calculator: DecomposeCalculator) {
  return calculator.productListWithPrice.map((item) => {
    if (item.price >= 0) {
      return { hrid: item.hrid }
    }
    return {
      hrid: item.hrid,
      immutable: true,
      price: 0
    }
  })
}

function buildFloorCalculator(base: DecomposeCalculator) {
  const ingredientPriceConfigList = base.ingredientList.map((item, index) => {
    if (index === 0) {
      return {
        hrid: item.hrid,
        immutable: true,
        price: 0
      }
    }
    return { hrid: item.hrid }
  })

  const floorCalculator = new DecomposeCalculator({
    hrid: base.hrid,
    enhanceLevel: base.enhanceLevel,
    catalystRank: base.catalystRank,
    ingredientPriceConfigList,
    productPriceConfigList: getCautiousProductPriceConfigList(base)
  })
  floorCalculator.run()
  return floorCalculator
}

function buildMarketCalculator(base: DecomposeCalculator) {
  const marketCalculator = new DecomposeCalculator({
    hrid: base.hrid,
    enhanceLevel: base.enhanceLevel,
    catalystRank: base.catalystRank,
    productPriceConfigList: getCautiousProductPriceConfigList(base)
  })
  marketCalculator.run()
  return marketCalculator
}

function createRow(itemHrid: string, enhanceLevel: number, catalystRank: number) {
  const base = new DecomposeCalculator({
    hrid: itemHrid,
    enhanceLevel,
    catalystRank
  })
  if (!base.available) {
    return undefined
  }

  const floorCalculator = buildFloorCalculator(base)
  const marketCalculator = buildMarketCalculator(base)
  const item = getItemDetailOf(itemHrid)
  const bulkMultiplier = item.alchemyDetail?.bulkMultiplier || 1
  const catalystHrid = base.catalyst ? `/items/${base.catalyst}` : ""
  const currentAskUnit = getUsedPriceOf(itemHrid, enhanceLevel, "ask") ?? -1
  const currentBidUnit = getUsedPriceOf(itemHrid, enhanceLevel, "bid") ?? -1
  const currentAskTotal = hasValidPrice(currentAskUnit) ? currentAskUnit * bulkMultiplier : -1
  const currentBidTotal = hasValidPrice(currentBidUnit) ? currentBidUnit * bulkMultiplier * 0.98 : -1
  const outputValueTotal = floorCalculator.income
  const fixedCostTotal = floorCalculator.cost
  const recoveryFloorTotal = floorCalculator.result.profitPP
  const recoveryFloorUnit = bulkMultiplier > 0 ? recoveryFloorTotal / bulkMultiplier : recoveryFloorTotal
  const currentProfitPP = hasValidPrice(currentAskTotal) ? recoveryFloorTotal - currentAskTotal : Number.NEGATIVE_INFINITY
  const gapToAskTotal = currentProfitPP
  const gapToAskUnit = hasValidPrice(currentAskTotal) ? currentProfitPP / bulkMultiplier : Number.NEGATIVE_INFINITY
  const gapRateToAsk = currentAskTotal > 0 ? currentProfitPP / currentAskTotal : Number.NEGATIVE_INFINITY
  const currentProfitPH = hasValidPrice(currentAskTotal) ? marketCalculator.result.profitPH : Number.NEGATIVE_INFINITY
  const currentProfitRate = hasValidPrice(currentAskTotal) ? marketCalculator.result.profitRate : Number.NEGATIVE_INFINITY

  return {
    signature: `${itemHrid}|${enhanceLevel}|${catalystRank}`,
    itemHrid,
    name: marketCalculator.result.name,
    itemLevel: item.itemLevel || 0,
    itemType: getEquipmentTypeOf(item),
    enhanceLevel,
    bulkMultiplier,
    catalystRank,
    catalystHrid,
    catalystName: catalystHrid ? getItemDetailOf(catalystHrid).name : "无催化剂",
    successRate: marketCalculator.successRate || 0,
    currentAskUnit,
    currentBidUnit,
    currentAskTotal,
    currentBidTotal,
    outputValueTotal,
    fixedCostTotal,
    recoveryFloorTotal,
    recoveryFloorUnit,
    gapToAskTotal,
    gapToAskUnit,
    gapRateToAsk,
    currentProfitPP,
    currentProfitPH,
    currentProfitRate,
    expPH: marketCalculator.result.expPH || 0,
    calculator: marketCalculator
  } satisfies RecoveryFloorRow
}

function buildRecoveryFloorRows() {
  const gameData = useGameStoreOutside().gameData
  const rows: RecoveryFloorRow[] = []
  if (!gameData) {
    return rows
  }

  for (const item of Object.values(gameData.itemDetailMap)) {
    if (!item.enhancementCosts || !item.alchemyDetail?.decomposeItems) {
      continue
    }

    for (let enhanceLevel = 0; enhanceLevel <= 20; enhanceLevel++) {
      let bestRow: RecoveryFloorRow | undefined
      for (let catalystRank = 0; catalystRank <= 2; catalystRank++) {
        const row = createRow(item.hrid, enhanceLevel, catalystRank)
        if (!row) continue
        if (!bestRow || row.recoveryFloorTotal > bestRow.recoveryFloorTotal) {
          bestRow = row
        }
      }
      if (bestRow) {
        rows.push(bestRow)
      }
    }
  }

  return rows
}

function filterRows(rows: RecoveryFloorRow[], params: Record<string, any>) {
  let list = rows.slice()

  if (params.name) {
    const regex = new RegExp(params.name, "i")
    list = list.filter(row => row.name.match(regex))
  }
  if (Number.isFinite(params.minLevel)) {
    list = list.filter(row => row.enhanceLevel >= Number(params.minLevel))
  }
  if (Number.isFinite(params.maxLevel)) {
    list = list.filter(row => row.enhanceLevel <= Number(params.maxLevel))
  }
  if (Number.isFinite(params.minItemLevel)) {
    list = list.filter(row => row.itemLevel >= Number(params.minItemLevel))
  }
  if (Number.isFinite(params.minFloor)) {
    list = list.filter(row => row.recoveryFloorUnit >= Number(params.minFloor))
  }
  if (Number.isFinite(params.minGap)) {
    list = list.filter(row => row.gapToAskUnit >= Number(params.minGap))
  }
  if (Number.isFinite(params.minGapRate)) {
    list = list.filter(row => row.gapRateToAsk >= Number(params.minGapRate))
  }
  if (params.showOnlyBelowFloor) {
    list = list.filter(row => row.gapToAskUnit > 0)
  }
  if (params.excludeNoAsk) {
    list = list.filter(row => row.currentAskUnit >= 0)
  }
  if (params.banJewelry) {
    list = list.filter(row => !["neck", "ring", "earrings"].includes(row.itemType))
  }

  return list
}

function sortRows(rows: RecoveryFloorRow[], sort?: SortLike) {
  const list = rows.slice()
  list.sort((left, right) => {
    if (right.gapToAskTotal !== left.gapToAskTotal) return right.gapToAskTotal - left.gapToAskTotal
    if (right.recoveryFloorTotal !== left.recoveryFloorTotal) return right.recoveryFloorTotal - left.recoveryFloorTotal
    if (right.currentProfitPH !== left.currentProfitPH) return right.currentProfitPH - left.currentProfitPH
    return left.name.localeCompare(right.name)
  })

  if (!sort?.prop || !sort.order) {
    return list
  }

  const path = sort.prop.split(".")
  const getValue = (row: RecoveryFloorRow | Record<string, any>) => path.reduce<any>((value, key) => value?.[key], row)

  list.sort((left, right) => {
    const leftValue = getValue(left)
    const rightValue = getValue(right)
    if (typeof leftValue === "string" || typeof rightValue === "string") {
      const result = String(leftValue || "").localeCompare(String(rightValue || ""))
      return sort.order === "descending" ? -result : result
    }
    return sort.order === "descending"
      ? Number(rightValue) - Number(leftValue)
      : Number(leftValue) - Number(rightValue)
  })

  return list
}

function paginateRows(rows: RecoveryFloorRow[], params: Record<string, any>) {
  const currentPage = Math.max(1, Number(params.currentPage) || 1)
  const size = Math.max(1, Number(params.size) || 20)
  return {
    list: rows.slice((currentPage - 1) * size, currentPage * size),
    total: rows.length
  }
}

export function getExpectedProductTotal(item: { hrid: string, count: number, rate?: number, price: number }) {
  const expected = item.count * (item.rate || 1) * Math.max(0, item.price)
  if (item.hrid === COIN_HRID) {
    return expected
  }
  return expected * 0.98
}

async function ensureRecoveryFloorRows(silent = false) {
  const cacheKey = "recovery-floor"
  let rows = useGameStoreOutside().getRecoveryFloorCache(cacheKey)
  if (!rows) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startedAt = Date.now()
    try {
      rows = buildRecoveryFloorRows()
    } catch (error) {
      console.error(error)
      rows = []
    }
    useGameStoreOutside().setRecoveryFloorCache(rows, cacheKey)
    if (!silent) {
      ElMessage.success(`回收底价计算完成，耗时${((Date.now() - startedAt) / 1000).toFixed(1)}秒`)
    }
  }
  return rows
}

export async function getRecoveryFloorRows(options: { silent?: boolean } = {}) {
  return ensureRecoveryFloorRows(!!options.silent)
}

export async function getRecoveryFloorDataApi(params: Record<string, any>) {
  const rows = await ensureRecoveryFloorRows()
  const filteredRows = filterRows(rows, params)
  const sortedRows = sortRows(filteredRows, params.sort)
  return paginateRows(sortedRows, params)
}
