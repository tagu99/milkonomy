import type { Action, ItemDetail } from "~/game"
import { getGameDataApi, getItemDetailOf } from "@/common/apis/game"
import { getTrans } from "@/locales"
import { COIN_HRID } from "@/pinia/stores/game"
import {
  autoBalanceCompositeWorkflowWeights,
  buildCompositeWorkflowFromBuilderSteps,
  type CompositeWorkflowBuilderStep,
  type CompositeWorkflowItem,
  type CompositeWorkflowResult
} from "./builder"

const EXCLUDED_CONNECTOR_CATEGORIES = new Set([
  "/item_categories/currency",
  "/item_categories/loot",
  "/item_categories/drink"
])
const EXCLUDED_COMPLEXITY_CATEGORIES = new Set([
  "/item_categories/drink"
])
const DEFAULT_MAX_EVALUATIONS = 20000
const YIELD_INTERVAL = 40
const RESIDUAL_TOLERANCE = 0.35

export type WorkflowDiscoverySearchIntensity = "standard" | "deep"

export interface WorkflowDiscoveryOptions {
  includeEquipment: boolean
  maxSteps: number
  maxExternalProducts: number
  maxExternalIngredients: number
  minProfitPD: number
  resultLimit: number
  allowedManufactureActions: Action[]
  searchIntensity?: WorkflowDiscoverySearchIntensity
}

export interface WorkflowDiscoverySnapshot {
  steps: CompositeWorkflowBuilderStep[]
  target: { hrid: string, level: number }
  targetPriority: number
}

export interface DiscoveredWorkflowRow {
  signature: string
  name: string
  profitPD: number
  profitPH: number
  profitRate: number
  stepLabels: string[]
  workflow: CompositeWorkflowResult
  snapshot: WorkflowDiscoverySnapshot
  exportJson: string
}

export interface WorkflowDiscoveryStats {
  actionCount: number
  generatedCount: number
  evaluatedCount: number
  truncated: boolean
}

export interface WorkflowDiscoveryResult {
  rows: DiscoveredWorkflowRow[]
  stats: WorkflowDiscoveryStats
}

interface ActionCandidate {
  id: string
  step: CompositeWorkflowBuilderStep
  label: string
  consumeKeys: Set<string>
  produceKeys: Set<string>
  consumeAmounts: Map<string, number>
  produceAmounts: Map<string, number>
  standaloneProfitPD: number
}

interface SearchTuning {
  perItemProducerLimit: number
  perItemConsumerLimit: number
  fanInChoices: number
  chainChoices: number
  beamWidth: number
  expansionChoices: number
  maxEvaluations: number
}

let cachedBonusDropItems: Set<string> | undefined

function cloneStep(step: CompositeWorkflowBuilderStep, suffix = ""): CompositeWorkflowBuilderStep {
  return {
    ...step,
    key: suffix ? `${step.key}-${suffix}` : step.key
  }
}

function isEquipmentItem(item: ItemDetail | undefined) {
  return !!item?.equipmentDetail
}

function isConnectorItem(hrid: string, includeEquipment: boolean) {
  if (!hrid || hrid === COIN_HRID) return false
  const item = getItemDetailOf(hrid)
  if (!item) return false
  if (!includeEquipment && isEquipmentItem(item)) return false
  if (isNonStructuralBonusItem(hrid)) return false
  return !EXCLUDED_CONNECTOR_CATEGORIES.has(item.categoryHrid)
}

function isComplexityItem(hrid: string, includeEquipment: boolean) {
  if (!hrid || hrid === COIN_HRID) return false
  const item = getItemDetailOf(hrid)
  if (!item) return false
  if (!includeEquipment && isEquipmentItem(item)) return false
  if (isNonStructuralBonusItem(hrid)) return false
  return !EXCLUDED_COMPLEXITY_CATEGORIES.has(item.categoryHrid)
}

function getBonusDropItems() {
  if (cachedBonusDropItems) return cachedBonusDropItems
  const set = new Set<string>()
  const data = getGameDataApi()
  Object.values(data.actionDetailMap).forEach((detail) => {
    detail.essenceDropTable?.forEach(item => set.add(item.itemHrid))
    detail.rareDropTable?.forEach(item => set.add(item.itemHrid))
  })
  set.add("/items/alchemy_essence")
  set.add("/items/small_artisans_crate")
  set.add("/items/medium_artisans_crate")
  set.add("/items/large_artisans_crate")
  cachedBonusDropItems = set
  return set
}

function isNonStructuralBonusItem(hrid: string) {
  return getBonusDropItems().has(hrid)
}

function getCoreFlowMaps(step: CompositeWorkflowBuilderStep, options: WorkflowDiscoveryOptions) {
  const consume = new Map<string, number>()
  const produce = new Map<string, number>()
  const add = (map: Map<string, number>, hrid: string, count: number) => {
    if (!isConnectorItem(hrid, options.includeEquipment)) return
    map.set(hrid, (map.get(hrid) || 0) + count)
  }

  if (step.className === "ManufactureCalculator") {
    if (!step.action) return { consume, produce }
    const detail = getGameDataApi().actionDetailMap[`/actions/${step.action}/${actionKeyOfHrid(step.hrid)}`]
    if (!detail) return { consume, produce }
    if (detail.upgradeItemHrid) {
      add(consume, detail.upgradeItemHrid, 1)
    }
    detail.inputItems.forEach(item => add(consume, item.itemHrid, item.count))
    detail.outputItems.forEach(item => add(produce, item.itemHrid, item.count))
    return { consume, produce }
  }

  const item = getItemDetailOf(step.hrid)
  if (!item) return { consume, produce }

  if (step.className === "DecomposeCalculator") {
    add(consume, step.hrid, item.alchemyDetail?.bulkMultiplier || 1)
    item.alchemyDetail?.decomposeItems?.forEach(drop => add(produce, drop.itemHrid, drop.count))
    return { consume, produce }
  }

  if (step.className === "TransmuteCalculator") {
    add(consume, step.hrid, item.alchemyDetail?.bulkMultiplier || 1)
    item.alchemyDetail?.transmuteDropTable?.forEach(drop => add(produce, drop.itemHrid, drop.maxCount))
  }

  return { consume, produce }
}

function toAmountMap(list: CompositeWorkflowItem[], options: WorkflowDiscoveryOptions) {
  const map = new Map<string, number>()
  list.forEach((item) => {
    if (!isConnectorItem(item.hrid, options.includeEquipment)) return
    map.set(item.hrid, (map.get(item.hrid) || 0) + item.countPH)
  })
  return map
}

function actionKeyOfHrid(hrid: string) {
  return hrid ? hrid.substring(hrid.lastIndexOf("/") + 1) : ""
}

function getManufactureSteps(options: WorkflowDiscoveryOptions) {
  const steps: CompositeWorkflowBuilderStep[] = []
  const seen = new Set<string>()
  const data = getGameDataApi()
  for (const [actionKey, detail] of Object.entries(data.actionDetailMap)) {
    const action = options.allowedManufactureActions.find(a => actionKey.startsWith(`/actions/${a}/`))
    if (!action) continue
    if (detail.upgradeItemHrid) continue
    const hrid = detail.outputItems[0]?.itemHrid
    if (!hrid) continue
    if (seen.has(`${action}:${hrid}`)) continue
    if (!options.includeEquipment && hasEquipmentRelation(detail, hrid)) continue
    seen.add(`${action}:${hrid}`)
    steps.push({
      key: `discover-manufacture-${action}-${actionKeyOfHrid(hrid)}`,
      className: "ManufactureCalculator",
      hrid,
      action,
      weight: 1,
      originLevel: 0
    })
  }
  return steps
}

function getAlchemySteps(options: WorkflowDiscoveryOptions) {
  const steps: CompositeWorkflowBuilderStep[] = []
  const data = getGameDataApi()
  for (const item of Object.values(data.itemDetailMap)) {
    if (!options.includeEquipment && isEquipmentItem(item)) continue

    if (item.alchemyDetail?.decomposeItems != null) {
      steps.push({
        key: `discover-decompose-${actionKeyOfHrid(item.hrid)}`,
        className: "DecomposeCalculator",
        hrid: item.hrid,
        weight: 1
      })
    }
    if (Array.isArray(item.alchemyDetail?.transmuteDropTable) && item.alchemyDetail.transmuteDropTable.length > 0) {
      steps.push({
        key: `discover-transmute-${actionKeyOfHrid(item.hrid)}`,
        className: "TransmuteCalculator",
        hrid: item.hrid,
        weight: 1
      })
    }
  }
  return steps
}

function hasEquipmentRelation(detail: { inputItems: { itemHrid: string }[], outputItems: { itemHrid: string }[], upgradeItemHrid?: string }, hrid: string) {
  if (isEquipmentItem(getItemDetailOf(hrid))) return true
  if (detail.upgradeItemHrid && isEquipmentItem(getItemDetailOf(detail.upgradeItemHrid))) return true
  if (detail.inputItems.some(item => isEquipmentItem(getItemDetailOf(item.itemHrid)))) return true
  if (detail.outputItems.some(item => isEquipmentItem(getItemDetailOf(item.itemHrid)))) return true
  return false
}

function createActionCandidate(step: CompositeWorkflowBuilderStep, options: WorkflowDiscoveryOptions) {
  const workflow = buildCompositeWorkflowFromBuilderSteps([cloneStep(step, "seed")])
  if (!workflow.available || !workflow.steps.length) return null

  if (!options.includeEquipment) {
    const hasEquipment = workflow.ingredientList.some(item => isEquipmentItem(getItemDetailOf(item.hrid)))
      || workflow.productList.some(item => isEquipmentItem(getItemDetailOf(item.hrid)))
    if (hasEquipment) return null
  }

  const core = getCoreFlowMaps(step, options)
  const consumeKeys = new Set(core.consume.keys())
  const produceKeys = new Set(core.produce.keys())
  if (!consumeKeys.size && !produceKeys.size) return null

  return {
    id: `${step.className}:${step.action || ""}:${step.hrid}`,
    step,
    label: workflow.steps[0].label,
    consumeKeys,
    produceKeys,
    consumeAmounts: core.consume,
    produceAmounts: core.produce,
    standaloneProfitPD: workflow.valid ? workflow.profitPD : Number.NEGATIVE_INFINITY
  } satisfies ActionCandidate
}

function getActionCandidates(options: WorkflowDiscoveryOptions) {
  const rawSteps = [
    ...getManufactureSteps(options),
    ...getAlchemySteps(options)
  ]
  const candidates: ActionCandidate[] = []
  const seen = new Set<string>()

  for (const step of rawSteps) {
    const candidate = createActionCandidate(step, options)
    if (!candidate) continue
    if (seen.has(candidate.id)) continue
    seen.add(candidate.id)
    candidates.push(candidate)
  }
  return candidates
}

function hasFlowConnection(left: ActionCandidate, right: ActionCandidate) {
  for (const item of left.produceKeys) {
    if (right.consumeKeys.has(item)) return true
  }
  for (const item of right.produceKeys) {
    if (left.consumeKeys.has(item)) return true
  }
  return false
}

function getComplexityCount(list: CompositeWorkflowItem[], includeEquipment: boolean) {
  const keys = new Set(
    list
      .filter(item => isComplexityItem(item.hrid, includeEquipment))
      .map(item => `${item.hrid}-${item.level || 0}`)
  )
  return keys.size
}

function buildDiscoveryRow(candidates: ActionCandidate[], options: WorkflowDiscoveryOptions) {
  const balance = autoBalanceCompositeWorkflowWeights(candidates.map(candidate => cloneStep(candidate.step)))
  if (!balance.ok || !balance.shares || balance.residual == null) return null
  if (balance.residual > RESIDUAL_TOLERANCE) return null

  const weightedSteps = candidates.map((candidate, index) => ({
    ...cloneStep(candidate.step),
    weight: Number((balance.shares![index] * 100).toFixed(6))
  }))
  const workflow = buildCompositeWorkflowFromBuilderSteps(weightedSteps)
  if (!workflow.available || !workflow.valid) return null
  if (workflow.profitPD < options.minProfitPD) return null

  const externalProductCount = getComplexityCount(workflow.productList, options.includeEquipment)
  const externalIngredientCount = getComplexityCount(workflow.ingredientList, options.includeEquipment)
  if (externalProductCount > options.maxExternalProducts) return null
  if (externalIngredientCount > options.maxExternalIngredients) return null

  const orderedSteps = workflow.steps
    .map((step, index) => ({ step, builder: weightedSteps[index] }))
    .sort((a, b) => b.step.share - a.step.share)
    .map((row, index) => ({
      ...row.builder,
      key: `discover-export-${index}-${actionKeyOfHrid(row.builder.hrid)}`
    }))
  const snapshot: WorkflowDiscoverySnapshot = {
    steps: orderedSteps,
    target: { hrid: "", level: 0 },
    targetPriority: 1
  }
  const stepLabels = workflow.steps
    .slice()
    .sort((a, b) => b.share - a.share)
    .map(step => `${step.label} ${Math.round(step.share * 1000) / 10}%`)

  return {
    signature: orderedSteps
      .map(step => `${step.className}:${step.action || ""}:${step.hrid}`)
      .sort()
      .join("|"),
    name: stepLabels.join(" -> "),
    profitPD: workflow.profitPD,
    profitPH: workflow.profitPH,
    profitRate: workflow.profitRate,
    stepLabels,
    workflow,
    snapshot,
    exportJson: JSON.stringify(snapshot)
  } satisfies DiscoveredWorkflowRow
}

function compareCandidatePriority(left: ActionCandidate, right: ActionCandidate) {
  if (right.produceKeys.size !== left.produceKeys.size) return right.produceKeys.size - left.produceKeys.size
  if (right.consumeKeys.size !== left.consumeKeys.size) return right.consumeKeys.size - left.consumeKeys.size
  if (right.standaloneProfitPD !== left.standaloneProfitPD) return right.standaloneProfitPD - left.standaloneProfitPD
  return left.id.localeCompare(right.id)
}

function compareProducerForItem(item: string, left: ActionCandidate, right: ActionCandidate) {
  const leftAmount = left.produceAmounts.get(item) || 0
  const rightAmount = right.produceAmounts.get(item) || 0
  if (rightAmount !== leftAmount) return rightAmount - leftAmount
  return compareCandidatePriority(left, right)
}

function compareConsumerForItem(item: string, left: ActionCandidate, right: ActionCandidate) {
  const leftAmount = left.consumeAmounts.get(item) || 0
  const rightAmount = right.consumeAmounts.get(item) || 0
  if (rightAmount !== leftAmount) return rightAmount - leftAmount
  return compareCandidatePriority(left, right)
}

function getSearchTuning(options: WorkflowDiscoveryOptions): SearchTuning {
  const deep = options.searchIntensity === "deep"
  const baseMaxEvaluations =
    options.maxSteps >= 5 ? (deep ? 80000 : 60000)
      : options.maxSteps >= 4 ? (deep ? 60000 : 40000)
        : (deep ? 35000 : DEFAULT_MAX_EVALUATIONS)

  return {
    perItemProducerLimit: deep ? 12 : 8,
    perItemConsumerLimit: deep ? 12 : 8,
    fanInChoices: deep ? 6 : 4,
    chainChoices: deep ? 6 : 4,
    beamWidth: deep ? 5000 : 2500,
    expansionChoices: deep ? 12 : 7,
    maxEvaluations: Math.min(120000, Math.max(baseMaxEvaluations, options.resultLimit * (deep ? 3500 : 2500)))
  }
}

function comboScore(ids: string[], candidateById: Map<string, ActionCandidate>) {
  const combo = ids.map(id => candidateById.get(id)).filter(Boolean) as ActionCandidate[]
  const consumeMap = new Map<string, number>()
  const produceMap = new Map<string, number>()
  let pairwiseConnections = 0

  combo.forEach((candidate) => {
    candidate.consumeKeys.forEach((item) => consumeMap.set(item, (consumeMap.get(item) || 0) + 1))
    candidate.produceKeys.forEach((item) => produceMap.set(item, (produceMap.get(item) || 0) + 1))
  })

  for (let i = 0; i < combo.length; i++) {
    for (let j = i + 1; j < combo.length; j++) {
      if (hasFlowConnection(combo[i], combo[j])) {
        pairwiseConnections += 1
      }
    }
  }

  let internalBridgeCount = 0
  let externalIngredientCount = 0
  let externalProductCount = 0
  for (const item of new Set([...consumeMap.keys(), ...produceMap.keys()])) {
    const consumeCount = consumeMap.get(item) || 0
    const produceCount = produceMap.get(item) || 0
    if (consumeCount > 0 && produceCount > 0) {
      internalBridgeCount += 1
    } else if (consumeCount > 0) {
      externalIngredientCount += 1
    } else if (produceCount > 0) {
      externalProductCount += 1
    }
  }

  const standaloneScore = combo.reduce((acc, candidate) => {
    return acc + Math.max(-50000000, candidate.standaloneProfitPD)
  }, 0)

  return standaloneScore
    + internalBridgeCount * 12000000
    + pairwiseConnections * 4000000
    - externalIngredientCount * 5000000
    - externalProductCount * 2000000
    + combo.length * 1000
}

async function yieldControl(counter: number) {
  if (counter % YIELD_INTERVAL === 0) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function getConnectionGain(
  candidate: ActionCandidate,
  comboConsumeMap: Map<string, number>,
  comboProduceMap: Map<string, number>
) {
  let upstreamMatches = 0
  let downstreamMatches = 0
  let bridgeMatches = 0

  candidate.produceKeys.forEach((item) => {
    if (comboConsumeMap.has(item)) upstreamMatches += 1
    if (comboProduceMap.has(item)) bridgeMatches += 1
  })
  candidate.consumeKeys.forEach((item) => {
    if (comboProduceMap.has(item)) downstreamMatches += 1
    if (comboConsumeMap.has(item)) bridgeMatches += 1
  })

  return upstreamMatches * 6
    + downstreamMatches * 6
    + bridgeMatches * 2
    + (upstreamMatches > 0 && downstreamMatches > 0 ? 5 : 0)
}

function getExpansionCandidates(
  comboIds: string[],
  candidateById: Map<string, ActionCandidate>,
  producersByItem: Map<string, ActionCandidate[]>,
  consumersByItem: Map<string, ActionCandidate[]>,
  tuning: SearchTuning
) {
  const combo = comboIds.map(id => candidateById.get(id)).filter(Boolean) as ActionCandidate[]
  const comboIdSet = new Set(comboIds)
  const comboConsumeMap = new Map<string, number>()
  const comboProduceMap = new Map<string, number>()
  const ranked = new Map<string, { candidate: ActionCandidate, gain: number }>()

  combo.forEach((candidate) => {
    candidate.consumeKeys.forEach((item) => {
      comboConsumeMap.set(item, (comboConsumeMap.get(item) || 0) + 1)
    })
    candidate.produceKeys.forEach((item) => {
      comboProduceMap.set(item, (comboProduceMap.get(item) || 0) + 1)
    })
  })

  const consider = (candidate: ActionCandidate, bias: number) => {
    if (comboIdSet.has(candidate.id)) return
    const gain = getConnectionGain(candidate, comboConsumeMap, comboProduceMap) + bias
    if (gain <= 0) return
    const prev = ranked.get(candidate.id)
    if (!prev || gain > prev.gain) {
      ranked.set(candidate.id, { candidate, gain })
    }
  }

  comboProduceMap.forEach((_, item) => {
    (consumersByItem.get(item) || []).forEach(candidate => consider(candidate, 2))
    ;(producersByItem.get(item) || []).forEach((candidate) => consider(candidate, 1))
  })
  comboConsumeMap.forEach((_, item) => {
    (producersByItem.get(item) || []).forEach(candidate => consider(candidate, 2))
    ;(consumersByItem.get(item) || []).forEach((candidate) => consider(candidate, 1))
  })

  return Array.from(ranked.values())
    .sort((left, right) => {
      if (right.gain !== left.gain) return right.gain - left.gain
      return compareCandidatePriority(left.candidate, right.candidate)
    })
    .slice(0, tuning.expansionChoices)
    .map(row => row.candidate)
}

function addBeamExpandedCombos(
  comboMap: Map<string, string[]>,
  candidateById: Map<string, ActionCandidate>,
  producersByItem: Map<string, ActionCandidate[]>,
  consumersByItem: Map<string, ActionCandidate[]>,
  options: WorkflowDiscoveryOptions,
  tuning: SearchTuning
) {
  for (let stepCount = 2; stepCount < options.maxSteps; stepCount++) {
    const frontier = Array.from(comboMap.values())
      .filter(ids => ids.length === stepCount)
      .sort((a, b) => comboScore(b, candidateById) - comboScore(a, candidateById))
      .slice(0, tuning.beamWidth)

    for (const comboIds of frontier) {
      const expansionCandidates = getExpansionCandidates(
        comboIds,
        candidateById,
        producersByItem,
        consumersByItem,
        tuning
      )
      for (const candidate of expansionCandidates) {
        const next = Array.from(new Set([...comboIds, candidate.id])).sort()
        if (next.length !== comboIds.length + 1) continue
        const signature = next.join("|")
        if (!comboMap.has(signature)) {
          comboMap.set(signature, next)
        }
      }
    }
  }
}

export async function discoverWorkflowRows(options: WorkflowDiscoveryOptions): Promise<WorkflowDiscoveryResult> {
  const tuning = getSearchTuning(options)
  const candidates = getActionCandidates(options)
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]))
  const producersByItem = new Map<string, ActionCandidate[]>()
  const consumersByItem = new Map<string, ActionCandidate[]>()

  candidates.forEach((candidate) => {
    candidate.produceKeys.forEach((item) => {
      const list = producersByItem.get(item) || []
      list.push(candidate)
      producersByItem.set(item, list)
    })
    candidate.consumeKeys.forEach((item) => {
      const list = consumersByItem.get(item) || []
      list.push(candidate)
      consumersByItem.set(item, list)
    })
  })

  producersByItem.forEach((list, item) => {
    list.sort((a, b) => compareProducerForItem(item, a, b))
    producersByItem.set(item, list.slice(0, tuning.perItemProducerLimit))
  })
  consumersByItem.forEach((list, item) => {
    list.sort((a, b) => compareConsumerForItem(item, a, b))
    consumersByItem.set(item, list.slice(0, tuning.perItemConsumerLimit))
  })

  const rows: DiscoveredWorkflowRow[] = []
  const seenRows = new Set<string>()
  const comboMap = new Map<string, string[]>()
  let evaluatedCount = 0
  let truncated = false

  const addCombo = (ids: string[]) => {
    if (ids.length < 2 || ids.length > options.maxSteps) return
    const uniq = Array.from(new Set(ids)).sort()
    if (uniq.length !== ids.length) return
    const signature = uniq.join("|")
    if (!comboMap.has(signature)) {
      comboMap.set(signature, uniq)
    }
  }

  for (const [item, producers] of producersByItem.entries()) {
    const consumers = consumersByItem.get(item) || []
    for (const producer of producers) {
      for (const consumer of consumers) {
        if (producer.id === consumer.id) continue
        addCombo([producer.id, consumer.id])
      }
    }
  }

  for (const consumer of candidates) {
    const inputItems = Array.from(consumer.consumeKeys)
    if (inputItems.length >= 2 && options.maxSteps >= 3) {
      for (let i = 0; i < inputItems.length; i++) {
        for (let j = i + 1; j < inputItems.length; j++) {
          const leftProducers = (producersByItem.get(inputItems[i]) || []).slice(0, tuning.fanInChoices)
          const rightProducers = (producersByItem.get(inputItems[j]) || []).slice(0, tuning.fanInChoices)
          for (const left of leftProducers) {
            for (const right of rightProducers) {
              if (left.id === right.id || left.id === consumer.id || right.id === consumer.id) continue
              addCombo([left.id, right.id, consumer.id])
            }
          }
        }
      }
    }
  }

  if (options.maxSteps >= 3) {
    for (const middle of candidates) {
      for (const inItem of middle.consumeKeys) {
        const upstreamList = (producersByItem.get(inItem) || []).slice(0, tuning.chainChoices)
        for (const outItem of middle.produceKeys) {
          const downstreamList = (consumersByItem.get(outItem) || []).slice(0, tuning.chainChoices)
          for (const upstream of upstreamList) {
            for (const downstream of downstreamList) {
              if (upstream.id === middle.id || downstream.id === middle.id || upstream.id === downstream.id) continue
              addCombo([upstream.id, middle.id, downstream.id])
            }
          }
        }
      }
    }
  }

  if (options.maxSteps >= 4) {
    for (const middle of candidates) {
      const inputItems = Array.from(middle.consumeKeys)
      if (inputItems.length < 2) continue
      for (let i = 0; i < inputItems.length; i++) {
        for (let j = i + 1; j < inputItems.length; j++) {
          const leftProducers = (producersByItem.get(inputItems[i]) || []).slice(0, tuning.fanInChoices)
          const rightProducers = (producersByItem.get(inputItems[j]) || []).slice(0, tuning.fanInChoices)
          for (const outItem of middle.produceKeys) {
            const downstreamList = (consumersByItem.get(outItem) || []).slice(0, tuning.chainChoices)
            for (const left of leftProducers) {
              for (const right of rightProducers) {
                if (left.id === right.id || left.id === middle.id || right.id === middle.id) continue
                for (const downstream of downstreamList) {
                  if (downstream.id === left.id || downstream.id === right.id || downstream.id === middle.id) continue
                  addCombo([left.id, right.id, middle.id, downstream.id])
                }
              }
            }
          }
        }
      }
    }
  }

  if (options.maxSteps >= 4) {
    for (const middle1 of candidates) {
      for (const inItem of middle1.consumeKeys) {
        const upstreamList = (producersByItem.get(inItem) || []).slice(0, tuning.chainChoices)
        for (const outItem1 of middle1.produceKeys) {
          const middle2List = (consumersByItem.get(outItem1) || []).slice(0, tuning.chainChoices)
          for (const upstream of upstreamList) {
            for (const middle2 of middle2List) {
              if (upstream.id === middle1.id || upstream.id === middle2.id || middle1.id === middle2.id) continue
              for (const outItem2 of middle2.produceKeys) {
                const downstreamList = (consumersByItem.get(outItem2) || []).slice(0, tuning.chainChoices)
                for (const downstream of downstreamList) {
                  if (downstream.id === upstream.id || downstream.id === middle1.id || downstream.id === middle2.id) continue
                  addCombo([upstream.id, middle1.id, middle2.id, downstream.id])
                }
              }
            }
          }
        }
      }
    }
  }

  if (options.maxSteps >= 5) {
    for (const middle1 of candidates) {
      const inputItems = Array.from(middle1.consumeKeys)
      if (inputItems.length < 2) continue
      for (let i = 0; i < inputItems.length; i++) {
        for (let j = i + 1; j < inputItems.length; j++) {
          const leftProducers = (producersByItem.get(inputItems[i]) || []).slice(0, tuning.fanInChoices)
          const rightProducers = (producersByItem.get(inputItems[j]) || []).slice(0, tuning.fanInChoices)
          for (const outItem1 of middle1.produceKeys) {
            const middle2List = (consumersByItem.get(outItem1) || []).slice(0, tuning.chainChoices)
            for (const left of leftProducers) {
              for (const right of rightProducers) {
                if (left.id === right.id || left.id === middle1.id || right.id === middle1.id) continue
                for (const middle2 of middle2List) {
                  if (middle2.id === left.id || middle2.id === right.id || middle2.id === middle1.id) continue
                  for (const outItem2 of middle2.produceKeys) {
                    const downstreamList = (consumersByItem.get(outItem2) || []).slice(0, tuning.chainChoices)
                    for (const downstream of downstreamList) {
                      if (
                        downstream.id === left.id
                        || downstream.id === right.id
                        || downstream.id === middle1.id
                        || downstream.id === middle2.id
                      ) continue
                      addCombo([left.id, right.id, middle1.id, middle2.id, downstream.id])
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  addBeamExpandedCombos(comboMap, candidateById, producersByItem, consumersByItem, options, tuning)

  const comboList = Array.from(comboMap.values())
    .sort((a, b) => comboScore(b, candidateById) - comboScore(a, candidateById))

  const evaluateCombo = async (comboIds: string[]) => {
    if (evaluatedCount >= tuning.maxEvaluations) {
      truncated = true
      return
    }
    evaluatedCount += 1
    await yieldControl(evaluatedCount)

    const combo = comboIds.map(id => candidateById.get(id)).filter(Boolean) as ActionCandidate[]
    const row = buildDiscoveryRow(combo, options)
    if (!row || seenRows.has(row.signature)) return
    seenRows.add(row.signature)
    rows.push(row)
  }

  for (const comboIds of comboList) {
    await evaluateCombo(comboIds)
    if (truncated) break
  }

  rows.sort((a, b) => {
    if (b.profitPD !== a.profitPD) return b.profitPD - a.profitPD
    return a.name.localeCompare(b.name)
  })

  return {
    rows: rows.slice(0, options.resultLimit),
    stats: {
      actionCount: candidates.length,
      generatedCount: comboList.length,
      evaluatedCount,
      truncated
    }
  }
}

export function summarizeWorkflowItems(list: CompositeWorkflowItem[], maxCount = 3) {
  return list
    .filter(item => isComplexityItem(item.hrid, false))
    .slice(0, maxCount)
    .map((item) => {
      const name = getTrans(getItemDetailOf(item.hrid).name)
      return `${name} x${Math.round(item.countPH * 100) / 100}`
    })
    .join(" / ")
}
