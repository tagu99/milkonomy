import { ElMessage } from "element-plus"
import { getDemandHeatRows, type DemandHeatRow } from "@/common/apis/jungle/demand-heat"
import { getRecoveryFloorRows, type RecoveryFloorRow } from "@/common/apis/jungle/recovery-floor"
import { useGameStoreOutside } from "@/pinia/stores/game"

type SortLike = {
  prop?: string
  order?: "ascending" | "descending" | null
}

export interface BargainAnalysisRow {
  signature: string
  itemHrid: string
  name: string
  itemLevel: number
  itemType: string
  targetLevel: number
  currentAskUnit: number
  currentBidUnit: number
  recoveryFloorUnit: number
  gapToAskUnit: number
  gapRateToAsk: number
  currentProfitPP: number
  currentProfitPH: number
  currentProfitRate: number
  demandScore: number
  demandLevelCount: number
  demandCoverage: number
  targetNeighborDemandCount: number
  twoWayLevelCount: number
  isTwoWay: boolean
  opportunityScore: number
  recommendation: string
  recovery: RecoveryFloorRow
  demand: DemandHeatRow
}

function buildOpportunityScore(recovery: RecoveryFloorRow, demand: DemandHeatRow) {
  const bargainPart = Math.max(0, recovery.gapRateToAsk) * 100 + Math.max(0, recovery.gapToAskUnit / 1e6)
  const liquidityPart = demand.demandScore + demand.targetNeighborDemandCount * 4 + (demand.isTwoWay ? 12 : 0)
  return bargainPart * 1.2 + liquidityPart
}

function getRecommendation(recovery: RecoveryFloorRow, demand: DemandHeatRow) {
  const hasPositiveBargain = recovery.gapToAskUnit > 0
  const strongDemand = demand.demandScore >= 45 || (demand.isTwoWay && demand.targetNeighborDemandCount >= 2)

  if (hasPositiveBargain && strongDemand && demand.isTwoWay) {
    return "可收后择机卖或分解"
  }
  if (hasPositiveBargain) {
    return "优先分解"
  }
  if (strongDemand && demand.isTwoWay) {
    return "偏向转卖"
  }
  return "仅观察"
}

function buildRows(recoveryRows: RecoveryFloorRow[], demandRows: DemandHeatRow[]) {
  const demandMap = new Map<string, DemandHeatRow>()
  demandRows.forEach((row) => {
    demandMap.set(row.signature, row)
  })

  return recoveryRows.map((recovery) => {
    const demand = demandMap.get(`${recovery.itemHrid}|${recovery.enhanceLevel}`)
    const fallbackDemand: DemandHeatRow = demand || {
      signature: `${recovery.itemHrid}|${recovery.enhanceLevel}`,
      itemHrid: recovery.itemHrid,
      name: recovery.name,
      itemLevel: recovery.itemLevel,
      itemType: recovery.itemType,
      targetLevel: recovery.enhanceLevel,
      bidPrice: recovery.currentBidUnit,
      askPrice: recovery.currentAskUnit,
      isTwoWay: recovery.currentAskUnit > 0 && recovery.currentBidUnit > 0,
      demandLevels: [],
      askLevels: [],
      twoWayLevels: [],
      demandLevelCount: 0,
      askLevelCount: 0,
      twoWayLevelCount: 0,
      demandCoverage: 0,
      targetNeighborDemandCount: 0,
      demandScore: 0
    }
    const opportunityScore = buildOpportunityScore(recovery, fallbackDemand)
    return {
      signature: recovery.signature,
      itemHrid: recovery.itemHrid,
      name: recovery.name,
      itemLevel: recovery.itemLevel,
      itemType: recovery.itemType,
      targetLevel: recovery.enhanceLevel,
      currentAskUnit: recovery.currentAskUnit,
      currentBidUnit: recovery.currentBidUnit,
      recoveryFloorUnit: recovery.recoveryFloorUnit,
      gapToAskUnit: recovery.gapToAskUnit,
      gapRateToAsk: recovery.gapRateToAsk,
      currentProfitPP: recovery.currentProfitPP,
      currentProfitPH: recovery.currentProfitPH,
      currentProfitRate: recovery.currentProfitRate,
      demandScore: fallbackDemand.demandScore,
      demandLevelCount: fallbackDemand.demandLevelCount,
      demandCoverage: fallbackDemand.demandCoverage,
      targetNeighborDemandCount: fallbackDemand.targetNeighborDemandCount,
      twoWayLevelCount: fallbackDemand.twoWayLevelCount,
      isTwoWay: fallbackDemand.isTwoWay,
      opportunityScore,
      recommendation: getRecommendation(recovery, fallbackDemand),
      recovery,
      demand: fallbackDemand
    } satisfies BargainAnalysisRow
  })
}

function filterRows(rows: BargainAnalysisRow[], params: Record<string, any>) {
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
  if (Number.isFinite(params.minGap)) {
    list = list.filter(row => row.gapToAskUnit >= Number(params.minGap))
  }
  if (Number.isFinite(params.minGapRate)) {
    list = list.filter(row => row.gapRateToAsk >= Number(params.minGapRate))
  }
  if (Number.isFinite(params.minDemandScore)) {
    list = list.filter(row => row.demandScore >= Number(params.minDemandScore))
  }
  if (Number.isFinite(params.minNeighborDemand)) {
    list = list.filter(row => row.targetNeighborDemandCount >= Number(params.minNeighborDemand))
  }
  if (params.onlyPositiveBargain) {
    list = list.filter(row => row.gapToAskUnit > 0)
  }
  if (params.onlyTwoWay) {
    list = list.filter(row => row.isTwoWay)
  }
  if (params.banJewelry) {
    list = list.filter(row => !["neck", "ring", "earrings"].includes(row.itemType))
  }

  return list
}

function sortRows(rows: BargainAnalysisRow[], sort?: SortLike) {
  const list = rows.slice()
  list.sort((left, right) => {
    if (right.opportunityScore !== left.opportunityScore) return right.opportunityScore - left.opportunityScore
    if (right.gapToAskUnit !== left.gapToAskUnit) return right.gapToAskUnit - left.gapToAskUnit
    if (right.demandScore !== left.demandScore) return right.demandScore - left.demandScore
    return left.name.localeCompare(right.name)
  })

  if (!sort?.prop || !sort.order) {
    return list
  }

  const path = sort.prop.split(".")
  const getValue = (row: BargainAnalysisRow | Record<string, any>) => path.reduce<any>((value, key) => value?.[key], row)

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

function paginateRows(rows: BargainAnalysisRow[], params: Record<string, any>) {
  const currentPage = Math.max(1, Number(params.currentPage) || 1)
  const size = Math.max(1, Number(params.size) || 20)
  return {
    list: rows.slice((currentPage - 1) * size, currentPage * size),
    total: rows.length
  }
}

async function ensureBargainAnalysisRows(silent = false) {
  const cacheKey = "bargain-analysis"
  let rows = useGameStoreOutside().getBargainAnalysisCache(cacheKey)
  if (!rows) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startedAt = Date.now()
    try {
      const [recoveryRows, demandRows] = await Promise.all([
        getRecoveryFloorRows({ silent: true }),
        getDemandHeatRows({ silent: true })
      ])
      rows = buildRows(recoveryRows, demandRows)
    } catch (error) {
      console.error(error)
      rows = []
    }
    useGameStoreOutside().setBargainAnalysisCache(rows, cacheKey)
    if (!silent) {
      ElMessage.success(`捡漏分析计算完成，耗时${((Date.now() - startedAt) / 1000).toFixed(1)}秒`)
    }
  }
  return rows
}

export async function getBargainAnalysisRows(options: { silent?: boolean } = {}) {
  return ensureBargainAnalysisRows(!!options.silent)
}

export async function getBargainAnalysisDataApi(params: Record<string, any>) {
  const rows = await ensureBargainAnalysisRows()
  const filteredRows = filterRows(rows, params)
  const sortedRows = sortRows(filteredRows, params.sort)
  return paginateRows(sortedRows, params)
}
