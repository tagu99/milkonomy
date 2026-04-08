import type { ItemDetail } from "~/game"
import { ElMessage } from "element-plus"
import { getPriceOf } from "@/common/apis/game"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useGameStoreOutside } from "@/pinia/stores/game"

const LEVEL_COUNT = 21
const DEMAND_WINDOW_RADIUS = 2

export interface DemandHeatRow {
  signature: string
  itemHrid: string
  name: string
  itemLevel: number
  itemType: string
  targetLevel: number
  bidPrice: number
  askPrice: number
  isTwoWay: boolean
  demandLevels: number[]
  askLevels: number[]
  twoWayLevels: number[]
  demandLevelCount: number
  askLevelCount: number
  twoWayLevelCount: number
  demandCoverage: number
  targetNeighborDemandCount: number
  demandScore: number
}

type SortLike = {
  prop?: string
  order?: "ascending" | "descending" | null
}

function hasPrice(value: number) {
  return Number.isFinite(value) && value > 0
}

function getPricedLevels(item: ItemDetail, side: "ask" | "bid") {
  const levels: number[] = []
  for (let level = 0; level < LEVEL_COUNT; level++) {
    if (hasPrice(getPriceOf(item.hrid, level)[side])) {
      levels.push(level)
    }
  }
  return levels
}

function getTargetNeighborDemandCount(demandLevels: number[], targetLevel: number) {
  return demandLevels.filter(level => Math.abs(level - targetLevel) <= DEMAND_WINDOW_RADIUS).length
}

function getDemandScore(
  demandCoverage: number,
  demandLevelCount: number,
  twoWayLevelCount: number,
  targetNeighborDemandCount: number,
  isTwoWay: boolean
) {
  return demandCoverage * 100 + demandLevelCount * 3 + twoWayLevelCount * 4 + targetNeighborDemandCount * 8 + (isTwoWay ? 10 : 0)
}

function buildRows() {
  const gameData = useGameStoreOutside().gameData
  const rows: DemandHeatRow[] = []
  if (!gameData) {
    return rows
  }

  for (const item of Object.values(gameData.itemDetailMap)) {
    if (!item.enhancementCosts) {
      continue
    }

    const demandLevels = getPricedLevels(item, "bid")
    if (!demandLevels.length) {
      continue
    }
    const askLevels = getPricedLevels(item, "ask")
    const askLevelSet = new Set(askLevels)
    const twoWayLevels = demandLevels.filter(level => askLevelSet.has(level))
    const twoWaySet = new Set(twoWayLevels)
    const demandCoverage = demandLevels.length / LEVEL_COUNT
    const itemType = getEquipmentTypeOf(item)

    for (const targetLevel of demandLevels) {
      const isTwoWay = twoWaySet.has(targetLevel)
      const targetNeighborDemandCount = getTargetNeighborDemandCount(demandLevels, targetLevel)
      rows.push({
        signature: `${item.hrid}|${targetLevel}`,
        itemHrid: item.hrid,
        name: item.name,
        itemLevel: item.itemLevel || 0,
        itemType,
        targetLevel,
        bidPrice: getPriceOf(item.hrid, targetLevel).bid,
        askPrice: getPriceOf(item.hrid, targetLevel).ask,
        isTwoWay,
        demandLevels,
        askLevels,
        twoWayLevels,
        demandLevelCount: demandLevels.length,
        askLevelCount: askLevels.length,
        twoWayLevelCount: twoWayLevels.length,
        demandCoverage,
        targetNeighborDemandCount,
        demandScore: getDemandScore(
          demandCoverage,
          demandLevels.length,
          twoWayLevels.length,
          targetNeighborDemandCount,
          isTwoWay
        )
      })
    }
  }

  return rows
}

function filterRows(rows: DemandHeatRow[], params: Record<string, any>) {
  let list = rows.slice()

  if (params.name) {
    const regex = new RegExp(params.name, "i")
    list = list.filter(row => row.name.match(regex))
  }
  if (Number.isFinite(params.minLevel)) {
    list = list.filter(row => row.targetLevel >= Number(params.minLevel))
  }
  if (Number.isFinite(params.maxLevel)) {
    list = list.filter(row => row.targetLevel <= Number(params.maxLevel))
  }
  if (Number.isFinite(params.minItemLevel)) {
    list = list.filter(row => row.itemLevel >= Number(params.minItemLevel))
  }
  if (Number.isFinite(params.minDemandLevels)) {
    list = list.filter(row => row.demandLevelCount >= Number(params.minDemandLevels))
  }
  if (Number.isFinite(params.minDemandCoverage)) {
    list = list.filter(row => row.demandCoverage >= Number(params.minDemandCoverage))
  }
  if (Number.isFinite(params.minNeighborDemand)) {
    list = list.filter(row => row.targetNeighborDemandCount >= Number(params.minNeighborDemand))
  }
  if (params.onlyTwoWay) {
    list = list.filter(row => row.isTwoWay)
  }
  if (params.banJewelry) {
    list = list.filter(row => !["neck", "ring", "earrings"].includes(row.itemType))
  }

  return list
}

function sortRows(rows: DemandHeatRow[], sort?: SortLike) {
  const list = rows.slice()
  list.sort((left, right) => {
    if (right.demandScore !== left.demandScore) return right.demandScore - left.demandScore
    if (right.targetNeighborDemandCount !== left.targetNeighborDemandCount) return right.targetNeighborDemandCount - left.targetNeighborDemandCount
    if (right.bidPrice !== left.bidPrice) return right.bidPrice - left.bidPrice
    return left.name.localeCompare(right.name)
  })

  if (!sort?.prop || !sort.order) {
    return list
  }

  const path = sort.prop.split(".")
  const getValue = (row: DemandHeatRow | Record<string, any>) => path.reduce<any>((value, key) => value?.[key], row)

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

function paginateRows(rows: DemandHeatRow[], params: Record<string, any>) {
  const currentPage = Math.max(1, Number(params.currentPage) || 1)
  const size = Math.max(1, Number(params.size) || 20)
  return {
    list: rows.slice((currentPage - 1) * size, currentPage * size),
    total: rows.length
  }
}

async function ensureDemandHeatRows(silent = false) {
  const cacheKey = "demand-heat"
  let rows = useGameStoreOutside().getDemandHeatCache(cacheKey)
  if (!rows) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startedAt = Date.now()
    try {
      rows = buildRows()
    } catch (error) {
      console.error(error)
      rows = []
    }
    useGameStoreOutside().setDemandHeatCache(rows, cacheKey)
    if (!silent) {
      ElMessage.success(`需求热度计算完成，耗时${((Date.now() - startedAt) / 1000).toFixed(1)}秒`)
    }
  }
  return rows
}

export async function getDemandHeatRows(options: { silent?: boolean } = {}) {
  return ensureDemandHeatRows(!!options.silent)
}

export async function getDemandHeatDataApi(params: Record<string, any>) {
  const rows = await ensureDemandHeatRows()
  const filteredRows = filterRows(rows, params)
  const sortedRows = sortRows(filteredRows, params.sort)
  return paginateRows(sortedRows, params)
}
