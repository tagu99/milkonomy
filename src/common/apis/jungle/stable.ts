import type { ItemDetail } from "~/game"
import { ElMessage } from "element-plus"
import { EnhanceCalculator } from "@/calculator/enhance"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi, getPriceOf } from "../game"

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
  expPerLossRatio: number
  expectedLossPH: number
  profitToLossRatio: number
  singleCapital: number
  expectedRecoveryPerTarget: number
  recoveryRate: number
  realEscapeLevel: number
  fallbackMode: string
  thinMarket: boolean
  thinMarketReasons: string[]
  hoursPerTarget: number
  actionsPerTarget: number
  successRate: number
  targetRate: number
  leapRate: number
  escapeRate: number
  calculator: EnhanceCalculator
}

export interface StableEnhanceRowsOptions {
  originLevelMode?: "zero_only" | "all"
  silent?: boolean
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
  targetNeighborDemandCount: number
) {
  return demandCoverage * 100 + demandLevelCount * 3 + twoWayLevelCount * 4 + targetNeighborDemandCount * 8
}

function getThinMarketReasons(
  demandLevelCount: number,
  twoWayLevelCount: number,
  targetNeighborDemandCount: number
) {
  const reasons: string[] = []
  if (demandLevelCount <= 2) {
    reasons.push("有收购价的等级过少")
  }
  if (twoWayLevelCount <= 1) {
    reasons.push("双边有价等级过少")
  }
  if (targetNeighborDemandCount <= 1) {
    reasons.push("目标等级附近需求稀薄")
  }
  return reasons
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
  return rows.filter((row, index) => !rows.some((other, otherIndex) => otherIndex !== index && dominates(other, row)))
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

  const path = sort.prop.split(".")
  const getValue = (row: StableEnhanceRow | Record<string, any>) => path.reduce<any>((value, key) => value?.[key], row)

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

function filterRows(rows: StableEnhanceRow[], params: Record<string, any>) {
  let list = rows.slice()

  if (params.name) {
    const nameRegex = new RegExp(params.name, "i")
    list = list.filter(row => row.name.match(nameRegex))
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
  if (Number.isFinite(params.maxLossPH)) {
    list = list.filter(row => row.expectedLossPH <= Number(params.maxLossPH))
  }
  if (Number.isFinite(params.maxSingleCapital)) {
    list = list.filter(row => row.singleCapital <= Number(params.maxSingleCapital))
  }
  if (Number.isFinite(params.maxHoursPerTarget)) {
    list = list.filter(row => row.hoursPerTarget <= Number(params.maxHoursPerTarget))
  }
  if (Number.isFinite(params.minProfitPH)) {
    list = list.filter(row => row.profitPH >= Number(params.minProfitPH))
  }
  if (Number.isFinite(params.minExpPH)) {
    list = list.filter(row => row.expPH >= Number(params.minExpPH))
  }
  if (Number.isFinite(params.minExpPerLossRatio)) {
    list = list.filter(row => row.expPerLossRatio >= Number(params.minExpPerLossRatio))
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
  if (!params.allowNegativeProfit) {
    list = list.filter(row => row.profitPH >= 0)
  }
  if (params.originLevelMode === "zero_only") {
    list = list.filter(row => row.originLevel === 0)
  }
  if (params.banJewelry) {
    list = list.filter(row => !["neck", "ring", "earrings"].includes(row.itemType))
  }
  if (params.excludeThinMarket) {
    list = list.filter(row => !row.thinMarket)
  }

  return list
}

function paginateRows(rows: StableEnhanceRow[], params: Record<string, any>) {
  const currentPage = Math.max(1, Number(params.currentPage) || 1)
  const size = Math.max(1, Number(params.size) || 20)
  return {
    list: rows.slice((currentPage - 1) * size, currentPage * size),
    total: rows.length
  }
}

function buildStableRows(params: Record<string, any>) {
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
      const demandScore = getDemandScore(
        demandCoverage,
        demandLevels.length,
        twoWayLevels.length,
        targetNeighborDemandCount
      )
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
              project: `+${originLevel} -> +${targetLevel}`
            })
            if (!calculator.available) continue

            calculator.run()

            const targetProduct = calculator.productListWithPrice[0]
            const targetCountPH = targetProduct?.countPH || 0
            if (!targetCountPH || !Number.isFinite(targetCountPH)) continue

            const successRate = calculator.result.successRate || 0
            const hoursPerTarget = targetCountPH > 0 ? 1 / targetCountPH : Number.POSITIVE_INFINITY
            const actionsPerTarget = targetProduct?.count > 0 ? 1 / targetProduct.count : Number.POSITIVE_INFINITY
            const expectedLossPH = Math.max(0, calculator.cost * calculator.consumePH - calculator.gainEscapePH)
            const profitPH = calculator.result.profitPH || 0
            const profitToLossRatio = expectedLossPH > 0
              ? profitPH / expectedLossPH
              : (profitPH >= 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
            const singleCapital = Number.isFinite(hoursPerTarget)
              ? Math.max(0, calculator.result.costPH * hoursPerTarget)
              : Number.POSITIVE_INFINITY
            const expectedRecoveryPerTarget = targetCountPH > 0 ? calculator.gainEscapePH / targetCountPH : 0
            const recoveryRate = singleCapital > 0 ? expectedRecoveryPerTarget / singleCapital : 0
            const expPH = calculator.result.expPH || 0
            const expPerLossRatio = expectedLossPH > 0
              ? expPH / expectedLossPH
              : (expPH > 0 ? Number.POSITIVE_INFINITY : 0)
            const enhancelate = calculator.enhancelate()
            const realEscapeLevel = calculator.realEscapeLevel
            const fallbackMode = realEscapeLevel < 0
              ? "不逃脱"
              : (realEscapeLevel === 0 ? "白板卖出" : `+${realEscapeLevel} 逃脱卖出`)
            const thinMarketReasons = getThinMarketReasons(
              demandLevels.length,
              twoWayLevels.length,
              targetNeighborDemandCount
            )

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
              expPH,
              expPerLossRatio,
              expectedLossPH,
              profitToLossRatio,
              singleCapital,
              expectedRecoveryPerTarget,
              recoveryRate,
              realEscapeLevel,
              fallbackMode,
              thinMarket: thinMarketReasons.length > 0,
              thinMarketReasons,
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

async function ensureStableEnhanceRows(originLevelMode: "zero_only" | "all" = "zero_only", silent = false) {
  const cacheKey = `stable-enhance:${originLevelMode}`
  let rows = useGameStoreOutside().getStableEnhanceCache(cacheKey)

  if (!rows) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startedAt = Date.now()
    try {
      rows = buildStableRows({ originLevelMode })
    } catch (error) {
      console.error(error)
      rows = []
    }
    useGameStoreOutside().setStableEnhanceCache(rows, cacheKey)
    if (!silent) {
      ElMessage.success(`稳定强化计算完成，耗时${((Date.now() - startedAt) / 1000).toFixed(1)}秒`)
    }
  }

  return rows
}

export async function getStableEnhanceRows(options: StableEnhanceRowsOptions = {}) {
  const originLevelMode = options.originLevelMode === "all" ? "all" : "zero_only"
  return ensureStableEnhanceRows(originLevelMode, !!options.silent)
}

export async function getStableEnhanceDataApi(params: Record<string, any>) {
  const originLevelMode = params.originLevelMode === "all" ? "all" : "zero_only"
  const rows = await ensureStableEnhanceRows(originLevelMode)
  const filteredRows = filterRows(rows, params)
  const sortedRows = sortRows(filteredRows, params.sort)
  return paginateRows(sortedRows, params)
}
