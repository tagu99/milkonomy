import type { Action, ActionDetail, ItemDetail } from "~/game"
import type { CompositeWorkflowBuilderStep, CompositeWorkflowItem, CompositeWorkflowResult } from "./builder"

import { getGameDataApi, getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getDemandHeatRows, type DemandHeatRow } from "@/common/apis/jungle/demand-heat"
import { getManualPriceOf } from "@/common/apis/price"
import { getTrans } from "@/locales"
import { COIN_HRID, PriceStatus } from "@/pinia/stores/game"
import { autoBalanceCompositeWorkflowWeights, buildCompositeWorkflowFromBuilderSteps } from "./builder"

type PriceSide = "L" | "R"

export interface WorkflowScenarioBreakdown {
  costPH: number
  incomePH: number
  profitPH: number
  profitPD: number
  profitRate: number
  valid: boolean
}

export interface TrainWorkflowOptions {
  actions: Action[]
  includeSpecialMaterials: boolean
  equipmentOnly: boolean
  exactSteps: number
  resultLimit: number
}

export interface TrainWorkflowSnapshot {
  steps: CompositeWorkflowBuilderStep[]
  target: { hrid: string, level: number }
  targetPriority: number
}

export interface TrainWorkflowRow {
  signature: string
  name: string
  action: Action
  actionName: string
  finalHrid: string
  finalName: string
  materialSummary: string
  stepCount: number
  demandScore: number
  demandLevelCount: number
  twoWayLevelCount: number
  bestDemandTargetLevel: number
  stepLabels: string[]
  workflow: CompositeWorkflowResult
  snapshot: TrainWorkflowSnapshot
  exportJson: string
  breakdown_LL: WorkflowScenarioBreakdown
  breakdown_RL: WorkflowScenarioBreakdown
  breakdown_LR: WorkflowScenarioBreakdown
  breakdown_RR: WorkflowScenarioBreakdown
}

export interface TrainWorkflowStats {
  upgradeActionCount: number
  chainCount: number
  evaluatedCount: number
}

export interface TrainWorkflowResult {
  rows: TrainWorkflowRow[]
  stats: TrainWorkflowStats
}

interface TrainNode {
  id: string
  action: Action
  actionKey: string
  detail: ActionDetail
  outputHrid: string
  outputName: string
  upgradeItemHrid: string
  extraInputs: string[]
  isEquipment: boolean
  isProcessing: boolean
}

interface TrainDemandSummary {
  demandScore: number
  demandLevelCount: number
  twoWayLevelCount: number
  targetNeighborDemandCount: number
  bestTargetLevel: number
}

const SIMPLE_MATERIAL_MATCHERS: Record<string, RegExp[]> = {
  crafting: [/(^|_)lumber$/],
  cheesesmithing: [/(^|_)(cheese|log)$/],
  tailoring: [/(^|_)(fabric|leather)$/]
}

function basename(hrid: string) {
  return hrid.split("/").pop() || ""
}

function keyOf(item: { hrid: string, level?: number }) {
  return `${item.hrid}-${item.level || 0}`
}

function isEquipmentItem(item: ItemDetail | undefined) {
  return !!item?.equipmentDetail
}

function isRefinedLike(hrid: string) {
  return /_refined$/.test(basename(hrid))
}

function getScenarioPrice(hrid: string, level: number | undefined, side: PriceSide) {
  const type = side === "L" ? "ask" : "bid"
  const manual = getManualPriceOf(hrid, level || 0)?.[type]
  const value = manual?.manual
    ? manual.manualPrice
    : getPriceOf(hrid, level || 0, PriceStatus.ASK, PriceStatus.BID)[type]
  return typeof value === "number" && Number.isFinite(value) ? value : -1
}

function getScenarioItemPrice(item: { hrid: string, level?: number, price: number }, side: PriceSide) {
  if (item.hrid === COIN_HRID) {
    return item.price
  }
  return getScenarioPrice(item.hrid, item.level, side)
}

export function computeWorkflowBreakdownBySide(
  workflow: CompositeWorkflowResult,
  costSide: PriceSide,
  incomeSide: PriceSide
): WorkflowScenarioBreakdown {
  if (!workflow.available) {
    return {
      costPH: -1,
      incomePH: -1,
      profitPH: -1,
      profitPD: -1,
      profitRate: -1,
      valid: false
    }
  }

  for (const item of workflow.ingredientList) {
    if (getScenarioItemPrice(item, costSide) < 0) {
      return {
        costPH: -1,
        incomePH: -1,
        profitPH: -1,
        profitPD: -1,
        profitRate: -1,
        valid: false
      }
    }
  }

  for (const item of workflow.productList) {
    if (getScenarioItemPrice(item, incomeSide) < 0) {
      return {
        costPH: -1,
        incomePH: -1,
        profitPH: -1,
        profitPD: -1,
        profitRate: -1,
        valid: false
      }
    }
  }

  const costPH = workflow.ingredientList.reduce((sum, item) => {
    return sum + item.countPH * getScenarioItemPrice(item, costSide)
  }, 0)

  let incomePH = 0
  for (const item of workflow.productList) {
    const price = getScenarioItemPrice(item, incomeSide)
    const coinRate = item.hrid === COIN_HRID ? 0.98 : 1
    incomePH += item.countPH * price / coinRate
  }
  incomePH *= 0.98

  const profitPH = incomePH - costPH
  return {
    costPH,
    incomePH,
    profitPH,
    profitPD: profitPH * 24,
    profitRate: costPH > 0 ? profitPH / costPH : (profitPH >= 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY),
    valid: true
  }
}

function isSimpleMaterialHrid(hrid: string, action: Action) {
  if (hrid === COIN_HRID) return true
  const matchers = SIMPLE_MATERIAL_MATCHERS[action] || []
  return matchers.some(matcher => matcher.test(basename(hrid)))
}

function compareNodes(left: TrainNode, right: TrainNode) {
  if (left.detail.levelRequirement.level !== right.detail.levelRequirement.level) {
    return left.detail.levelRequirement.level - right.detail.levelRequirement.level
  }
  return left.outputHrid.localeCompare(right.outputHrid)
}

function buildTrainNodes(options: TrainWorkflowOptions) {
  const nodes: TrainNode[] = []
  const data = getGameDataApi()

  for (const [actionKey, detail] of Object.entries(data.actionDetailMap)) {
    const action = options.actions.find(candidate => actionKey.startsWith(`/actions/${candidate}/`))
    if (!action) continue
    if (detail.outputItems.length !== 1) continue

    const outputHrid = detail.outputItems[0]?.itemHrid || ""
    if (!outputHrid || isRefinedLike(outputHrid) || isRefinedLike(actionKey)) continue

    const isEquipment = isEquipmentItem(getItemDetailOf(outputHrid))
    const extraInputs = detail.inputItems.map(item => item.itemHrid)
    const isProcessing = !isEquipment && !detail.upgradeItemHrid && extraInputs.length === 1

    if (options.equipmentOnly && !isEquipment && !isProcessing) continue
    if (extraInputs.some(hrid => isEquipmentItem(getItemDetailOf(hrid)))) continue
    if (isProcessing && !isSimpleMaterialHrid(outputHrid, action)) continue
    if (!isEquipment && !isProcessing) continue
    if (!options.includeSpecialMaterials && extraInputs.some(hrid => !isSimpleMaterialHrid(hrid, action))) continue

    nodes.push({
      id: `${action}:${outputHrid}`,
      action,
      actionKey,
      detail,
      outputHrid,
      outputName: getTrans(getItemDetailOf(outputHrid).name),
      upgradeItemHrid: detail.upgradeItemHrid || "",
      extraInputs,
      isEquipment,
      isProcessing
    })
  }

  return nodes.sort(compareNodes)
}

function buildTrainGraph(nodes: TrainNode[]) {
  const nodeByOutput = new Map(nodes.map(node => [node.outputHrid, node]))
  const nextById = new Map<string, TrainNode[]>()
  const previousCountById = new Map<string, number>()

  nodes.forEach((node) => {
    nextById.set(node.id, [])
    previousCountById.set(node.id, 0)
  })

  nodes.forEach((node) => {
    const parents: TrainNode[] = []

    if (node.upgradeItemHrid) {
      const parent = nodeByOutput.get(node.upgradeItemHrid)
      if (parent && parent.action === node.action) {
        parents.push(parent)
      }
    }

    if (!node.upgradeItemHrid) {
      node.extraInputs.forEach((inputHrid) => {
        const parent = nodeByOutput.get(inputHrid)
        if (parent && parent.action === node.action && parent.isProcessing) {
          parents.push(parent)
        }
      })
    }

    parents.forEach((parent) => {
      const list = nextById.get(parent.id) || []
      list.push(node)
      nextById.set(parent.id, list)
      previousCountById.set(node.id, (previousCountById.get(node.id) || 0) + 1)
    })
  })

  nextById.forEach((list, key) => {
    nextById.set(key, list.slice().sort(compareNodes))
  })

  return { nodeByOutput, nextById, previousCountById }
}

function enumerateTrainPaths(nodes: TrainNode[], exactSteps: number) {
  const { nextById, previousCountById } = buildTrainGraph(nodes)
  const starts = nodes.filter(node => node.isProcessing || !node.upgradeItemHrid || (previousCountById.get(node.id) || 0) === 0)
  const paths: TrainNode[][] = []

  const visit = (path: TrainNode[]) => {
    if (path.length === exactSteps) {
      if (path[path.length - 1].isEquipment) {
        paths.push(path)
      }
      return
    }

    const current = path[path.length - 1]
    const children = (nextById.get(current.id) || [])
      .filter(child => !path.some(node => node.id === child.id))

    if (!children.length) {
      return
    }

    for (const child of children) {
      visit(path.concat(child))
    }
  }

  starts.forEach((root) => visit([root]))
  return paths
}

async function getDemandSummaryMap() {
  const rows = await getDemandHeatRows({ silent: true })
  const map = new Map<string, TrainDemandSummary>()

  for (const row of rows) {
    const current = map.get(row.itemHrid)
    if (!current || compareDemandRow(row, current) < 0) {
      map.set(row.itemHrid, {
        demandScore: row.demandScore,
        demandLevelCount: row.demandLevelCount,
        twoWayLevelCount: row.twoWayLevelCount,
        targetNeighborDemandCount: row.targetNeighborDemandCount,
        bestTargetLevel: row.targetLevel
      })
    }
  }

  return map
}

function compareDemandRow(row: DemandHeatRow, current: TrainDemandSummary) {
  if (row.demandScore !== current.demandScore) {
    return current.demandScore - row.demandScore
  }
  if (row.targetNeighborDemandCount !== current.targetNeighborDemandCount) {
    return current.targetNeighborDemandCount - row.targetNeighborDemandCount
  }
  return current.bestTargetLevel - row.targetLevel
}

function createBuilderStep(node: TrainNode, index: number): CompositeWorkflowBuilderStep {
  return {
    key: `train-${index}-${basename(node.outputHrid)}`,
    className: "ManufactureCalculator",
    hrid: node.outputHrid,
    action: node.action,
    weight: 1,
    originLevel: 0
  }
}

function summarizeHrids(hrids: string[], maxCount = 4) {
  return hrids
    .slice(0, maxCount)
    .map((hrid) => getTrans(getItemDetailOf(hrid).name))
    .join(" / ")
}

function buildTrainRow(path: TrainNode[], demandSummaryMap: Map<string, TrainDemandSummary>) {
  const rawSteps = path.map(createBuilderStep)
  const finalNode = path[path.length - 1]
  const target = { hrid: finalNode.outputHrid, level: 0 }
  const balance = autoBalanceCompositeWorkflowWeights(rawSteps, { target, targetPriority: 2 })
  if (!balance.ok || !balance.shares) return null

  const steps = rawSteps.map((step, index) => ({
    ...step,
    weight: Number((balance.shares![index] * 100).toFixed(6))
  }))

  const workflow = buildCompositeWorkflowFromBuilderSteps(steps)
  if (!workflow.available) return null

  const stepLabels = workflow.steps.map((step) => step.label)
  const materialHrids = Array.from(new Set(path.flatMap(node => node.extraInputs.filter(hrid => hrid !== COIN_HRID))))
  const demand = demandSummaryMap.get(finalNode.outputHrid) || {
    demandScore: 0,
    demandLevelCount: 0,
    twoWayLevelCount: 0,
    targetNeighborDemandCount: 0,
    bestTargetLevel: 0
  }
  const snapshot: TrainWorkflowSnapshot = {
    steps,
    target,
    targetPriority: 2
  }

  return {
    signature: path.map(node => node.outputHrid).join("|"),
    name: `${path[0].outputName} -> ${finalNode.outputName}`,
    action: finalNode.action,
    actionName: getTrans(finalNode.action),
    finalHrid: finalNode.outputHrid,
    finalName: finalNode.outputName,
    materialSummary: summarizeHrids(materialHrids),
    stepCount: path.length,
    demandScore: demand.demandScore,
    demandLevelCount: demand.demandLevelCount,
    twoWayLevelCount: demand.twoWayLevelCount,
    bestDemandTargetLevel: demand.bestTargetLevel,
    stepLabels,
    workflow,
    snapshot,
    exportJson: JSON.stringify(snapshot),
    breakdown_LL: computeWorkflowBreakdownBySide(workflow, "L", "L"),
    breakdown_RL: computeWorkflowBreakdownBySide(workflow, "R", "L"),
    breakdown_LR: computeWorkflowBreakdownBySide(workflow, "L", "R"),
    breakdown_RR: computeWorkflowBreakdownBySide(workflow, "R", "R")
  } satisfies TrainWorkflowRow
}

function compareBreakdownProfit(left: WorkflowScenarioBreakdown, right: WorkflowScenarioBreakdown) {
  const leftProfit = left.valid ? left.profitPD : Number.NEGATIVE_INFINITY
  const rightProfit = right.valid ? right.profitPD : Number.NEGATIVE_INFINITY
  return rightProfit - leftProfit
}

export async function discoverTrainWorkflowRows(options: TrainWorkflowOptions): Promise<TrainWorkflowResult> {
  const nodes = buildTrainNodes(options)
  const exactPaths = enumerateTrainPaths(nodes, options.exactSteps)
  const demandSummaryMap = await getDemandSummaryMap()
  const signatures = new Set<string>()
  const rows: TrainWorkflowRow[] = []

  for (const path of exactPaths) {
    const signature = path.map(node => node.outputHrid).join("|")
    if (signatures.has(signature)) continue
    signatures.add(signature)

    const row = buildTrainRow(path, demandSummaryMap)
    if (row) {
      rows.push(row)
    }
  }

  rows.sort((left, right) => {
    if (right.demandScore !== left.demandScore) return right.demandScore - left.demandScore
    if (right.demandLevelCount !== left.demandLevelCount) return right.demandLevelCount - left.demandLevelCount
    if (right.twoWayLevelCount !== left.twoWayLevelCount) return right.twoWayLevelCount - left.twoWayLevelCount
    const byLL = compareBreakdownProfit(left.breakdown_LL, right.breakdown_LL)
    if (byLL !== 0) return byLL
    const byLR = compareBreakdownProfit(left.breakdown_LR, right.breakdown_LR)
    if (byLR !== 0) return byLR
    if (right.stepCount !== left.stepCount) return right.stepCount - left.stepCount
    return left.name.localeCompare(right.name)
  })

  return {
    rows: rows.slice(0, options.resultLimit),
    stats: {
      upgradeActionCount: nodes.filter(node => !!node.upgradeItemHrid).length,
      chainCount: exactPaths.length,
      evaluatedCount: rows.length
    }
  }
}

export function summarizeTrainWorkflowItems(list: CompositeWorkflowItem[], maxCount = 4) {
  return list
    .slice(0, maxCount)
    .map((item) => `${getTrans(getItemDetailOf(item.hrid).name)} x${Math.round(item.countPH * 100) / 100}`)
    .join(" / ")
}

export function summarizeTrainPath(stepLabels: string[], maxCount = 4) {
  return stepLabels.slice(0, maxCount).join(" -> ")
}

export function getTrainScenarioUnitPrice(item: { hrid: string, level?: number }, side: PriceSide) {
  return getScenarioPrice(item.hrid, item.level, side)
}
