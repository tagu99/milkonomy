import type { ItemDetail } from "~/game"
import { EnhanceCalculator } from "@/calculator/enhance"
import locales from "@/locales"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { getGameDataApi, getPriceOf } from "../game"

const { t } = locales.global

const LEVEL_COUNT = 21
const DEMAND_WINDOW_RADIUS = 2
const DEFAULT_ESCAPE_LEVELS = [-1, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

export interface StableEnhanceRow {
  signature: string
  itemHrid: string
  name: string
  itemLevel: number
  itemType: string
  originLevel: number
  targetLevel: number
  protectLevel: number
  escapeLevel: number
  project: string
  demandLevels: number[]
  askLevels: number[]
  twoWayLevels: number[]
  demandLevelCount: number
  askLevelCount: number
  twoWayLevelCount: number
  demandCoverage: number
  targetNeighborDemandCount: number
  demandScore: number
  originPrice: number
  targetPrice: number
  profitPH: number
  profitPP: number
  profitRate: number
  expPH: number
  expectedLossPH: number
  profitToLossRatio: number
  hoursPerTarget: number
  actionsPerTarget: number
  successRate: number
  targetRate: number
  leapRate: number
  escapeRate: number
  calculator: EnhanceCalculator
}

function hasPrice(value: number) {
  return Number.isFinite(value) && value > 0
}

function getPricedLevels(item: ItemDetail, side: "ask" | "bid") {
  const result: number[] = []
  for (let level = 0; level < LEVEL_COUNT; level++) {
    if (hasPrice(getPriceOf(item.hrid, level)[side])) {
      result.push(level)
    }
  }
  return result
}

function getTargetNeighborDemandCount(demandLevels: number[], targetLevel: number) {
  return demandLevels.filter(level => Math.abs(level - targetLevel) <= DEMAND_WINDOW_RADIUS).length
}

function getDemandScore(
  demandCoverage: number,
  demandLevelCount: number,
  twoWayLevelCount: number,
  targetNeighborDemandCount: number
) {
  return demandCoverage * 100 + demandLevelCount * 3 + twoWayLevelCount * 4 + targetNeighborDemandCount * 8
}

function dominates(left: StableEnhanceRow, right: StableEnhanceRow) {
  const notWorse = left.profitPH >= right.profitPH
    && left.expectedLossPH <= right.expectedLossPH
    && left.hoursPerTarget <= right.hoursPerTarget
  const strictlyBetter = left.profitPH > right.profitPH
    || left.expectedLossPH < right.expectedLossPH
    || left.hoursPerTarget < right.hoursPerTarget
  return notWorse && strictlyBetter
}

function pruneNonDominated(rows: StableEnhanceRow[]) {
  return rows.filter((row, index) => {
    return !rows.some((other, otherIndex) => otherIndex !== index && dominates(other, row))
  })
}

function sortRows(rows: StableEnhanceRow[], sort?: { prop?: string, order?: string }) {
  const list = rows.slice()
  list.sort((left, right) => {
    if (right.profitPH !== left.profitPH) return right.profitPH - left.profitPH
    if (right.profitToLossRatio !== left.profitToLossRatio) return right.profitToLossRatio - left.profitToLossRatio
    if (left.hoursPerTarget !== right.hoursPerTarget) return left.hoursPerTarget - right.hoursPerTarget
    if (right.demandScore !== left.demandScore) return right.demandScore - left.demandScore
    return left.name.localeCompare(right.name)
  })

  if (!sort?.prop || !sort.order) {
    return list
  }

  const props = sort.prop.split(".")
  const getValue = (row: any) => props.reduce((value, key) => value?.[key], row)
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

function filterRows(rows: StableEnhanceRow[], params: any) {
  let list = rows.slice()

  if (params.name) {
    const nameRegex = new RegExp(params.name, "i")
    list = list.filter(row => row.name.match(nameRegex))
  }

  if (params.minLevel) {
    list = list.filter(row => row.targetLevel >= params.minLevel)
  }
  if (params.maxLevel) {
    list = list.filter(row => row.targetLevel <= params.maxLevel)
  }
  if (params.minItemLevel) {
    list = list.filter(row => row.itemLevel >= params.minItemLevel)
  }
  if (params.maxLossPH) {
    list = list.filter(row => row.expectedLossPH <= params.maxLossPH)
  }
  if (params.maxHoursPerTarget) {
    list = list.filter(row => row.hoursPerTarget <= params.maxHoursPerTarget)
  }
  if (params.minDemandLevels) {
    list = list.filter(row => row.demandLevelCount >= params.minDemandLevels)
  }
  if (params.minDemandCoverage) {
    list = list.filter(row => row.demandCoverage >= params.minDemandCoverage)
  }
  if (params.minNeighborDemand) {
    list = list.filter(row => row.targetNeighborDemandCount >= params.minNeighborDemand)
  }
  if (!params.allowNegativeProfit) {
    list = list.filter(row => row.profitPH >= 0)
  }
  if (typeof params.minProfitPH === "number") {
    list = list.filter(row => row.profitPH >= params.minProfitPH)
  }
  if (params.originLevelMode === "zero_only") {
    list = list.filter(row => row.originLevel === 0)
  }
  if (params.banJewelry) {
    list = list.filter((row) => {
      return row.itemType !== "neck" && row.itemType !== "ring" && row.itemType !== "earrings"
    })
  }

  return list
}

function paginateRows(rows: StableEnhanceRow[], params: any) {
  const currentPage = Math.max(1, Number(params.currentPage) || 1)
  const size = Math.max(1, Number(params.size) || 20)
  return {
    list: rows.slice((currentPage - 1) * size, currentPage * size),
    total: rows.length
  }
}

function buildStableRows(params: any) {
  const gameData = getGameDataApi()
  const items = Object.values(gameData.itemDetailMap).filter(item => item.enhancementCosts)
  const rows: StableEnhanceRow[] = []
  const originLevelMode = params.originLevelMode === "all" ? "all" : "zero_only"

  for (const item of items) {
    const demandLevels = getPricedLevels(item, "bid")
    if (!demandLevels.length) continue

    const askLevels = getPricedLevels(item, "ask")
    const askLevelSet = new Set(askLevels)
    const twoWayLevels = demandLevels.filter(level => askLevelSet.has(level))
    const demandCoverage = demandLevels.length / LEVEL_COUNT
    const itemType = getEquipmentTypeOf(item)

    for (const targetLevel of demandLevels.filter(level => level > 0)) {
      const targetPrice = getPriceOf(item.hrid, targetLevel).bid
      if (!hasPrice(targetPrice)) continue

      const targetNeighborDemandCount = getTargetNeighborDemandCount(demandLevels, targetLevel)
      const demandScore = getDemandScore(demandCoverage, demandLevels.length, twoWayLevels.length, targetNeighborDemandCount)
      const candidates: StableEnhanceRow[] = []
      const originLevels = originLevelMode === "zero_only"
        ? [0]
        : Array.from({ length: targetLevel }, (_, index) => index)

      for (const originLevel of originLevels) {
        const originPrice = getPriceOf(item.hrid, originLevel).ask
        if (!hasPrice(originPrice)) continue

        for (const escapeLevel of DEFAULT_ESCAPE_LEVELS) {
          if (escapeLevel >= originLevel) continue
          const minProtectLevel = Math.max(targetLevel > 2 ? 2 : targetLevel, escapeLevel + 1)
          for (let protectLevel = minProtectLevel; protectLevel <= targetLevel; protectLevel++) {
            const calculator = new EnhanceCalculator({
              hrid: item.hrid,
              originLevel,
              enhanceLevel: targetLevel,
              protectLevel,
              escapeLevel,
              project: `+${originLevel} → +${targetLevel}`
            })
            if (!calculator.available) continue

            calculator.run()
            const targetProduct = calculator.productListWithPrice[0]
            const targetCountPH = targetProduct?.countPH || 0
            if (!targetCountPH || !Number.isFinite(targetCountPH)) continue

            const successRate = calculator.result.successRate || 0
            const hoursPerTarget = targetCountPH > 0 ? 1 / targetCountPH : Number.POSITIVE_INFINITY
            const actionsPerTarget = targetProduct.count > 0 ? 1 / targetProduct.count : Number.POSITIVE_INFINITY
            const expectedLossPH = Math.max(0, calculator.cost * calculator.consumePH - calculator.gainEscapePH)
            const profitPH = calculator.result.profitPH || 0
            const profitToLossRatio = expectedLossPH > 0 ? profitPH / expectedLossPH : (profitPH >= 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
            const enhancelate = calculator.enhancelate()

            candidates.push({
              signature: `${item.hrid}|${originLevel}|${targetLevel}|${protectLevel}|${escapeLevel}`,
              itemHrid: item.hrid,
              name: calculator.result.name,
              itemLevel: item.itemLevel || 0,
              itemType,
              originLevel,
              targetLevel,
              protectLevel,
              escapeLevel,
              project: calculator.project,
              demandLevels,
              askLevels,
              twoWayLevels,
              demandLevelCount: demandLevels.length,
              askLevelCount: askLevels.length,
              twoWayLevelCount: twoWayLevels.length,
              demandCoverage,
              targetNeighborDemandCount,
              demandScore,
              originPrice,
              targetPrice,
              profitPH,
              profitPP: calculator.result.profitPP || 0,
              profitRate: calculator.result.profitRate || 0,
              expPH: calculator.result.expPH || 0,
              expectedLossPH,
              profitToLossRatio,
              hoursPerTarget,
              actionsPerTarget,
              successRate,
              targetRate: enhancelate.targetRate,
              leapRate: enhancelate.leapRate,
              escapeRate: enhancelate.escapeRate,
              calculator
            })
          }
        }
      }

      pruneNonDominated(candidates)
        .sort((left, right) => {
          if (right.profitPH !== left.profitPH) return right.profitPH - left.profitPH
          if (right.profitToLossRatio !== left.profitToLossRatio) return right.profitToLossRatio - left.profitToLossRatio
          return left.hoursPerTarget - right.hoursPerTarget
        })
        .slice(0, 3)
        .forEach(row => rows.push(row))
    }
  }

  return rows
}

export async function getStableEnhanceDataApi(params: any) {
  const cacheKey = `stable-enhance:${params.originLevelMode === "all" ? "all" : "zero_only"}`
  let rows = useGameStoreOutside().getStableEnhanceCache(cacheKey)
  if (!rows) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startTime = Date.now()
    try {
      rows = buildStableRows(params)
    } catch (error) {
      console.error(error)
      rows = []
    }
    useGameStoreOutside().setStableEnhanceCache(rows, cacheKey)
    ElMessage.success(t("计算完成，耗时{0}秒", [((Date.now() - startTime) / 1000).toFixed(1)]))
  }

  const filteredRows = filterRows(rows, params)
  const sortedRows = sortRows(filteredRows, params.sort)
  return paginateRows(sortedRows, params)
}
