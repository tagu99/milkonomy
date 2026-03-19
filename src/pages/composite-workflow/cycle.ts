import { TransmuteCalculator } from "@/calculator/alchemy"
import { getGameDataApi, getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getTrans } from "@/locales"
import type { ItemDetail } from "~/game"

const EPSILON = 1e-8
const MAX_VALUE_ITERS = 600
const MAX_LINEAR_ITERS = 600
const VALUE_TOLERANCE = 1e-9

export interface CycleWorkflowOptions {
  includeEquipment: boolean
  catalystRank: number
  includeTeaCost: boolean
  includeBonusDrops: boolean
  minGroupSize: number
  resultLimit: number
}

export interface CycleWorkflowItemRow {
  hrid: string
  name: string
  itemLevel: number
  buyPrice: number
  sellPrice: number
  keepValue: number
  transmuteValue: number
  resolvedValue: number
  profitPerItem: number
  hoursPerItem: number
  actionsPerItem: number
  profitPH: number
  profitPD: number
  shouldTransmute: boolean
}

export interface CycleWorkflowRow {
  signature: string
  name: string
  itemHrids: string[]
  summaryHrids: string[]
  keepHrids: string[]
  continueHrids: string[]
  bestStartHrid: string
  bestStartName: string
  bestAction: "transmute" | "keep"
  bestProfitPerItem: number
  bestProfitPH: number
  bestProfitPD: number
  bestResolvedValue: number
  bestHoursPerItem: number
  details: CycleWorkflowItemRow[]
}

export interface CycleWorkflowStats {
  transmutableItemCount: number
  cycleGroupCount: number
  analyzedGroupCount: number
}

export interface CycleWorkflowResult {
  rows: CycleWorkflowRow[]
  stats: CycleWorkflowStats
}

interface TransmuteEdge {
  hrid: string
  expectedUnits: number
}

interface CycleNode {
  hrid: string
  name: string
  batchSize: number
  buyPrice: number
  sellPrice: number
  keepValue: number
  actionHours: number
  extraCostPerBatch: number
  outsideValuePerBatch: number
  bonusValuePerBatch: number
  insideOutputs: TransmuteEdge[]
}

function getItemName(hrid: string) {
  return getTrans(getItemDetailOf(hrid).name)
}

function isEquipmentItem(item: ItemDetail | undefined) {
  return !!item?.equipmentDetail
}

function isTransmutableItem(item: ItemDetail | undefined) {
  return !!item && Array.isArray(item.alchemyDetail?.transmuteDropTable) && item.alchemyDetail.transmuteDropTable.length > 0
}

function isDrinkItem(hrid: string) {
  return getItemDetailOf(hrid)?.categoryHrid === "/item_categories/drink"
}

function hasValidPrice(value: number) {
  return Number.isFinite(value) && value >= 0
}

function getFallbackPrice(hrid: string) {
  const item = getItemDetailOf(hrid)
  if (!item) return -1
  return item.sellPrice > 0 ? item.sellPrice : -1
}

function getResolvedPrice(hrid: string, side: "ask" | "bid") {
  const price = getPriceOf(hrid)[side]
  if (hasValidPrice(price)) return price

  const fallback = getFallbackPrice(hrid)
  if (hasValidPrice(fallback)) return fallback

  const opposite = getPriceOf(hrid)[side === "ask" ? "bid" : "ask"]
  if (hasValidPrice(opposite)) return opposite

  return -1
}

function getTransmutableHrids(includeEquipment: boolean) {
  return Object.values(getGameDataApi().itemDetailMap)
    .filter((item) => {
      if (!isTransmutableItem(item)) return false
      if (!includeEquipment && isEquipmentItem(item)) return false
      return true
    })
    .map(item => item.hrid)
}

function buildTransmuteGraph(hrids: string[]) {
  const nodeSet = new Set(hrids)
  const graph = new Map<string, string[]>()

  hrids.forEach((hrid) => {
    const item = getItemDetailOf(hrid)
    const outputs = (item.alchemyDetail?.transmuteDropTable || [])
      .map(drop => drop.itemHrid)
      .filter(outputHrid => nodeSet.has(outputHrid))
    graph.set(hrid, Array.from(new Set(outputs)))
  })

  return graph
}

function tarjanScc(graph: Map<string, string[]>) {
  let index = 0
  const stack: string[] = []
  const onStack = new Set<string>()
  const indices = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const components: string[][] = []

  const strongConnect = (node: string) => {
    indices.set(node, index)
    lowlink.set(node, index)
    index += 1
    stack.push(node)
    onStack.add(node)

    for (const next of graph.get(node) || []) {
      if (!indices.has(next)) {
        strongConnect(next)
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!))
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, indices.get(next)!))
      }
    }

    if (lowlink.get(node) === indices.get(node)) {
      const component: string[] = []
      let popped = ""
      do {
        popped = stack.pop()!
        onStack.delete(popped)
        component.push(popped)
      } while (popped !== node)
      components.push(component)
    }
  }

  Array.from(graph.keys()).forEach((node) => {
    if (!indices.has(node)) {
      strongConnect(node)
    }
  })

  return components
}

function getCycleGroups(options: CycleWorkflowOptions) {
  const transmutableHrids = getTransmutableHrids(options.includeEquipment)
  const graph = buildTransmuteGraph(transmutableHrids)
  const components = tarjanScc(graph)
    .map(component => component.sort())
    .filter((component) => {
      if (component.length >= Math.max(2, options.minGroupSize)) return true
      if (component.length !== 1) return false
      const hrid = component[0]
      return (graph.get(hrid) || []).includes(hrid) && options.minGroupSize <= 1
    })

  return {
    transmutableItemCount: transmutableHrids.length,
    groups: components
  }
}

function buildCycleNodeMap(group: string[], options: CycleWorkflowOptions) {
  const groupSet = new Set(group)
  const nodeMap = new Map<string, CycleNode>()

  for (const hrid of group) {
    const item = getItemDetailOf(hrid)
    const calculator = new TransmuteCalculator({
      hrid,
      catalystRank: options.catalystRank || undefined
    })
    calculator.run()

    const batchSize = item.alchemyDetail?.bulkMultiplier || 1
    const buyPrice = getResolvedPrice(hrid, "ask")
    const sellPrice = getResolvedPrice(hrid, "bid")
    if (!hasValidPrice(buyPrice) || !hasValidPrice(sellPrice)) {
      return null
    }

    let extraCostPerBatch = 0
    for (const ingredient of calculator.ingredientListWithPrice) {
      if (ingredient.hrid === hrid) continue
      if (!options.includeTeaCost && isDrinkItem(ingredient.hrid)) continue
      const ingredientPrice = hasValidPrice(ingredient.price)
        ? ingredient.price
        : getResolvedPrice(ingredient.hrid, "ask")
      if (!hasValidPrice(ingredientPrice)) {
        return null
      }
      extraCostPerBatch += ingredient.count * ingredientPrice
    }

    const insideOutputs: TransmuteEdge[] = []
    let outsideValuePerBatch = 0
    for (const drop of item.alchemyDetail?.transmuteDropTable || []) {
      const expectedUnits = (drop.dropRate || 0) * drop.maxCount * batchSize * calculator.successRate
      if (expectedUnits <= EPSILON) continue
      if (groupSet.has(drop.itemHrid)) {
        insideOutputs.push({ hrid: drop.itemHrid, expectedUnits })
      } else {
        const price = getResolvedPrice(drop.itemHrid, "bid")
        if (!hasValidPrice(price)) {
          return null
        }
        outsideValuePerBatch += expectedUnits * price
      }
    }

    let bonusValuePerBatch = 0
    if (options.includeBonusDrops) {
      const structuralOutputs = new Set((item.alchemyDetail?.transmuteDropTable || []).map(drop => drop.itemHrid))
      for (const product of calculator.productListWithPrice) {
        if (structuralOutputs.has(product.hrid)) continue
        const productPrice = hasValidPrice(product.price)
          ? product.price
          : getResolvedPrice(product.hrid, "bid")
        if (!hasValidPrice(productPrice)) {
          return null
        }
        const expectedUnits = (product.countPH || 0) / calculator.actionsPH
        bonusValuePerBatch += expectedUnits * productPrice
      }
    }

    nodeMap.set(hrid, {
      hrid,
      name: getItemName(hrid),
      batchSize,
      buyPrice,
      sellPrice,
      keepValue: sellPrice,
      actionHours: 1 / calculator.actionsPH,
      extraCostPerBatch,
      outsideValuePerBatch,
      bonusValuePerBatch,
      insideOutputs
    })
  }

  return nodeMap
}

function computeTransmuteValuePerUnit(node: CycleNode, values: Map<string, number>) {
  let total = -node.extraCostPerBatch + node.outsideValuePerBatch + node.bonusValuePerBatch
  for (const output of node.insideOutputs) {
    total += output.expectedUnits * (values.get(output.hrid) || 0)
  }
  return total / node.batchSize
}

function solveBestValues(group: string[], nodeMap: Map<string, CycleNode>) {
  const values = new Map<string, number>()
  group.forEach((hrid) => {
    values.set(hrid, nodeMap.get(hrid)!.keepValue)
  })

  for (let iter = 0; iter < MAX_VALUE_ITERS; iter++) {
    let maxDiff = 0
    const next = new Map<string, number>()
    for (const hrid of group) {
      const node = nodeMap.get(hrid)!
      const transmuteValue = computeTransmuteValuePerUnit(node, values)
      const resolvedValue = Math.max(node.keepValue, transmuteValue)
      if (!Number.isFinite(resolvedValue) || resolvedValue > 1e15) {
        return null
      }
      next.set(hrid, resolvedValue)
      maxDiff = Math.max(maxDiff, Math.abs(resolvedValue - (values.get(hrid) || 0)))
    }
    values.clear()
    next.forEach((value, hrid) => values.set(hrid, value))
    if (maxDiff <= VALUE_TOLERANCE) {
      break
    }
  }

  return values
}

function solveLinearPerUnit(
  group: string[],
  nodeMap: Map<string, CycleNode>,
  shouldTransmute: Map<string, boolean>,
  getBase: (node: CycleNode) => number
) {
  const values = new Map<string, number>()
  group.forEach((hrid) => values.set(hrid, 0))

  for (let iter = 0; iter < MAX_LINEAR_ITERS; iter++) {
    let maxDiff = 0
    const next = new Map<string, number>()
    for (const hrid of group) {
      const node = nodeMap.get(hrid)!
      if (!shouldTransmute.get(hrid)) {
        next.set(hrid, 0)
        continue
      }
      let total = getBase(node)
      for (const output of node.insideOutputs) {
        total += output.expectedUnits * (values.get(output.hrid) || 0)
      }
      const perUnit = total / node.batchSize
      if (!Number.isFinite(perUnit) || perUnit > 1e12) {
        return null
      }
      next.set(hrid, perUnit)
      maxDiff = Math.max(maxDiff, Math.abs(perUnit - (values.get(hrid) || 0)))
    }
    values.clear()
    next.forEach((value, hrid) => values.set(hrid, value))
    if (maxDiff <= VALUE_TOLERANCE) {
      break
    }
  }

  return values
}

function analyzeCycleGroup(group: string[], options: CycleWorkflowOptions): CycleWorkflowRow | null {
  const nodeMap = buildCycleNodeMap(group, options)
  if (!nodeMap) return null

  const resolvedValues = solveBestValues(group, nodeMap)
  if (!resolvedValues) return null
  const shouldTransmute = new Map<string, boolean>()
  const transmuteValues = new Map<string, number>()

  group.forEach((hrid) => {
    const node = nodeMap.get(hrid)!
    const transmuteValue = computeTransmuteValuePerUnit(node, resolvedValues)
    transmuteValues.set(hrid, transmuteValue)
    shouldTransmute.set(hrid, transmuteValue > node.keepValue + 1e-7)
  })

  const hoursPerItem = solveLinearPerUnit(group, nodeMap, shouldTransmute, node => node.actionHours)
  const actionsPerItem = solveLinearPerUnit(group, nodeMap, shouldTransmute, () => 1)
  if (!hoursPerItem || !actionsPerItem) return null

  const details: CycleWorkflowItemRow[] = group.map((hrid) => {
    const node = nodeMap.get(hrid)!
    const resolvedValue = resolvedValues.get(hrid) || 0
    const hours = hoursPerItem.get(hrid) || 0
    const profitPerItem = resolvedValue - node.buyPrice
    const profitPH = shouldTransmute.get(hrid) && hours > EPSILON ? profitPerItem / hours : Number.NEGATIVE_INFINITY
    const profitPD = Number.isFinite(profitPH) ? profitPH * 24 : Number.NEGATIVE_INFINITY

    return {
      hrid,
      name: node.name,
      itemLevel: getItemDetailOf(hrid).itemLevel || 0,
      buyPrice: node.buyPrice,
      sellPrice: node.sellPrice,
      keepValue: node.keepValue,
      transmuteValue: transmuteValues.get(hrid) || node.keepValue,
      resolvedValue,
      profitPerItem,
      hoursPerItem: hours,
      actionsPerItem: actionsPerItem.get(hrid) || 0,
      profitPH,
      profitPD,
      shouldTransmute: !!shouldTransmute.get(hrid)
    }
  })
    .sort((left, right) => {
      const leftProfit = Number.isFinite(left.profitPD) ? left.profitPD : Number.NEGATIVE_INFINITY
      const rightProfit = Number.isFinite(right.profitPD) ? right.profitPD : Number.NEGATIVE_INFINITY
      if (rightProfit !== leftProfit) return rightProfit - leftProfit
      return left.name.localeCompare(right.name)
    })

  const transmuteStarters = details.filter(item => item.shouldTransmute && Number.isFinite(item.profitPD))
  const best = transmuteStarters[0] || details
    .slice()
    .sort((left, right) => {
      if (right.profitPerItem !== left.profitPerItem) return right.profitPerItem - left.profitPerItem
      return left.name.localeCompare(right.name)
    })[0]
  if (!best) return null

  const name = details.map(item => item.name).slice(0, 4).join(" / ")
    + (details.length > 4 ? ` +${details.length - 4}` : "")

  const summaryHrids = details
    .slice()
    .sort((left, right) => {
      if (right.resolvedValue !== left.resolvedValue) return right.resolvedValue - left.resolvedValue
      if (right.itemLevel !== left.itemLevel) return right.itemLevel - left.itemLevel
      if (right.sellPrice !== left.sellPrice) return right.sellPrice - left.sellPrice
      return left.name.localeCompare(right.name)
    })
    .map(item => item.hrid)

  const keepHrids = details
    .filter(item => !item.shouldTransmute)
    .sort((left, right) => {
      if (right.resolvedValue !== left.resolvedValue) return right.resolvedValue - left.resolvedValue
      return left.name.localeCompare(right.name)
    })
    .map(item => item.hrid)

  const continueHrids = details
    .filter(item => item.shouldTransmute)
    .sort((left, right) => {
      const leftProfit = Number.isFinite(left.profitPD) ? left.profitPD : Number.NEGATIVE_INFINITY
      const rightProfit = Number.isFinite(right.profitPD) ? right.profitPD : Number.NEGATIVE_INFINITY
      if (rightProfit !== leftProfit) return rightProfit - leftProfit
      if (right.resolvedValue !== left.resolvedValue) return right.resolvedValue - left.resolvedValue
      return left.name.localeCompare(right.name)
    })
    .map(item => item.hrid)

  return {
    signature: group.slice().sort().join("|"),
    name,
    itemHrids: group.slice().sort(),
    summaryHrids,
    keepHrids,
    continueHrids,
    bestStartHrid: best.hrid,
    bestStartName: best.name,
    bestAction: best.shouldTransmute ? "transmute" : "keep",
    bestProfitPerItem: best.profitPerItem,
    bestProfitPH: best.profitPH,
    bestProfitPD: best.profitPD,
    bestResolvedValue: best.resolvedValue,
    bestHoursPerItem: best.hoursPerItem,
    details
  }
}

export async function discoverCycleWorkflowRows(options: CycleWorkflowOptions): Promise<CycleWorkflowResult> {
  const { transmutableItemCount, groups } = getCycleGroups(options)
  const rows: CycleWorkflowRow[] = []

  for (const group of groups) {
    const row = analyzeCycleGroup(group, options)
    if (row) {
      rows.push(row)
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  rows.sort((left, right) => {
    if (right.bestProfitPD !== left.bestProfitPD) return right.bestProfitPD - left.bestProfitPD
    return left.name.localeCompare(right.name)
  })

  return {
    rows,
    stats: {
      transmutableItemCount,
      cycleGroupCount: groups.length,
      analyzedGroupCount: rows.length
    }
  }
}

export function summarizeCycleItems(hrids: string[], maxCount = 4) {
  return hrids
    .slice(0, maxCount)
    .map(getItemName)
    .join(" / ")
}
