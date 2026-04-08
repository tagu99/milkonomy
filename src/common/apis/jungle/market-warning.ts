import { ElMessage } from "element-plus"
import { getBargainAnalysisRows, type BargainAnalysisRow } from "@/common/apis/jungle/bargain-analysis"
import { useGameStoreOutside } from "@/pinia/stores/game"

type SortLike = {
  prop?: string
  order?: "ascending" | "descending" | null
}

export interface MarketWarningRow {
  signature: string
  itemHrid: string
  name: string
  itemLevel: number
  itemType: string
  targetLevel: number
  currentAskUnit: number
  currentBidUnit: number
  recoveryFloorUnit: number
  demandScore: number
  demandCoverage: number
  targetNeighborDemandCount: number
  demandLevelCount: number
  twoWayLevelCount: number
  isTwoWay: boolean
  spreadRate: number
  premiumToFloor: number
  bargainGapRate: number
  riskScore: number
  severity: string
  reasons: string[]
  suggestion: string
  source: BargainAnalysisRow
}

function getSpreadRate(row: BargainAnalysisRow) {
  if (!(row.currentAskUnit > 0) || !(row.currentBidUnit > 0)) {
    return Number.POSITIVE_INFINITY
  }
  return (row.currentAskUnit - row.currentBidUnit) / row.currentBidUnit
}

function getPremiumToFloor(row: BargainAnalysisRow) {
  if (!(row.currentAskUnit > 0) || !(row.recoveryFloorUnit > 0)) {
    return Number.POSITIVE_INFINITY
  }
  return (row.currentAskUnit - row.recoveryFloorUnit) / row.recoveryFloorUnit
}

function getSeverity(score: number) {
  if (score >= 80) return "高风险"
  if (score >= 50) return "中风险"
  return "低风险"
}

function getSuggestion(score: number, row: BargainAnalysisRow) {
  if (score >= 80) {
    return row.gapToAskUnit > 0 ? "除非你明确按回收处理，否则建议观望" : "建议观望，不要把当前价格当成可靠锚点"
  }
  if (score >= 50) {
    return row.gapToAskUnit > 0 ? "可以按回收逻辑保守参与，不建议重仓押转卖" : "若参与，优先看长期需求而不是当前一口价"
  }
  return "风险相对可控，但仍建议结合需求热度与回收底价判断"
}

function analyzeRow(row: BargainAnalysisRow) {
  const reasons: string[] = []
  let riskScore = 0
  const spreadRate = getSpreadRate(row)
  const premiumToFloor = getPremiumToFloor(row)

  if (row.demandLevelCount <= 2) {
    riskScore += 18
    reasons.push("有收购价等级过少，市场很薄")
  }
  if (row.twoWayLevelCount <= 1) {
    riskScore += 18
    reasons.push("双边有价等级过少，挂单价格参考性弱")
  }
  if (row.targetNeighborDemandCount <= 1) {
    riskScore += 16
    reasons.push("目标等级附近需求断档，容易误判连续出货能力")
  }
  if (!row.isTwoWay) {
    riskScore += 18
    reasons.push("当前等级不是双边有价，单边价格更容易失真")
  }
  if (Number.isFinite(spreadRate) && spreadRate >= 0.5) {
    riskScore += Math.min(20, spreadRate * 18)
    reasons.push("左价和右价价差过大，盘口信号不稳定")
  } else if (!Number.isFinite(spreadRate)) {
    riskScore += 14
    reasons.push("缺少完整双边价格，无法确认真实成交区间")
  }
  if (Number.isFinite(premiumToFloor) && premiumToFloor >= 0.5) {
    riskScore += Math.min(18, premiumToFloor * 14)
    reasons.push("左价明显高于回收底价，可能存在虚高挂牌")
  }
  if (row.gapToAskUnit > 0 && row.demandScore < 25) {
    riskScore += 16
    reasons.push("看似低于回收底价，但需求偏弱，可能难以按预期周转")
  }
  if (row.currentBidUnit > 0 && row.currentBidUnit < row.recoveryFloorUnit * 0.65 && row.demandScore < 30) {
    riskScore += 10
    reasons.push("右价明显弱于回收底价，可能只是零散收单，不宜直接锚定")
  }

  return {
    ...row,
    spreadRate,
    premiumToFloor,
    bargainGapRate: row.gapRateToAsk,
    riskScore,
    severity: getSeverity(riskScore),
    reasons,
    suggestion: getSuggestion(riskScore, row),
    source: row
  } satisfies MarketWarningRow
}

function filterRows(rows: MarketWarningRow[], params: Record<string, any>) {
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
  if (Number.isFinite(params.minRiskScore)) {
    list = list.filter(row => row.riskScore >= Number(params.minRiskScore))
  }
  if (params.onlyHighRisk) {
    list = list.filter(row => row.riskScore >= 80)
  }
  if (params.onlySingleSided) {
    list = list.filter(row => !row.isTwoWay)
  }
  if (params.banJewelry) {
    list = list.filter(row => !["neck", "ring", "earrings"].includes(row.itemType))
  }

  return list
}

function sortRows(rows: MarketWarningRow[], sort?: SortLike) {
  const list = rows.slice()
  list.sort((left, right) => {
    if (right.riskScore !== left.riskScore) return right.riskScore - left.riskScore
    if (right.spreadRate !== left.spreadRate) return right.spreadRate - left.spreadRate
    if (right.demandScore !== left.demandScore) return left.demandScore - right.demandScore
    return left.name.localeCompare(right.name)
  })

  if (!sort?.prop || !sort.order) {
    return list
  }

  const path = sort.prop.split(".")
  const getValue = (row: MarketWarningRow | Record<string, any>) => path.reduce<any>((value, key) => value?.[key], row)

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

function paginateRows(rows: MarketWarningRow[], params: Record<string, any>) {
  const currentPage = Math.max(1, Number(params.currentPage) || 1)
  const size = Math.max(1, Number(params.size) || 20)
  return {
    list: rows.slice((currentPage - 1) * size, currentPage * size),
    total: rows.length
  }
}

async function ensureMarketWarningRows(silent = false) {
  const cacheKey = "market-warning"
  let rows = useGameStoreOutside().getMarketWarningCache(cacheKey)
  if (!rows) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startedAt = Date.now()
    try {
      const bargainRows = await getBargainAnalysisRows({ silent: true })
      rows = bargainRows.map(analyzeRow)
    } catch (error) {
      console.error(error)
      rows = []
    }
    useGameStoreOutside().setMarketWarningCache(rows, cacheKey)
    if (!silent) {
      ElMessage.success(`反操盘提醒计算完成，耗时${((Date.now() - startedAt) / 1000).toFixed(1)}秒`)
    }
  }
  return rows
}

export async function getMarketWarningRows(options: { silent?: boolean } = {}) {
  return ensureMarketWarningRows(!!options.silent)
}

export async function getMarketWarningDataApi(params: Record<string, any>) {
  const rows = await ensureMarketWarningRows()
  const filteredRows = filterRows(rows, params)
  const sortedRows = sortRows(filteredRows, params.sort)
  return paginateRows(sortedRows, params)
}
