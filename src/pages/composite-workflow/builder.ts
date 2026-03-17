import type Calculator from "@/calculator"
import type { IngredientWithPrice, ProductWithPrice } from "@/calculator"
import type { StorageCalculatorItem } from "@/pinia/stores/favorite"
import type { Action } from "~/game"

import { calculatorConstructable, getCalculatorInstance } from "@/calculator/utils"
import { getTrans } from "@/locales"
import { COIN_HRID } from "@/pinia/stores/game"

const EPSILON = 1e-8
const DEFAULT_MAX_ITERS = 800
const DEFAULT_TOLERANCE = 1e-14

export type BuilderCalculatorClassName =
  | "DecomposeCalculator"
  | "TransmuteCalculator"
  | "CoinifyCalculator"
  | "ManufactureCalculator"

export interface CompositeWorkflowBuilderStep {
  key: string
  className: BuilderCalculatorClassName
  hrid: string
  /** 0~100，作为权重，最终会归一化到总计 1h */
  weight: number

  // manufacture
  action?: Action
  // common optional params used by calculators
  catalystRank?: number
  enhanceLevel?: number
  originLevel?: number
}

export interface CompositeWorkflowItem {
  hrid: string
  level?: number
  countPH: number
  price: number
  marketPrice: number
  totalPH: number
}

export interface CompositeWorkflowStep {
  key: string
  label: string
  calculator: Calculator
  share: number
}

export interface CompositeWorkflowResult {
  available: boolean
  reason?: string
  valid: boolean
  steps: CompositeWorkflowStep[]
  ingredientList: CompositeWorkflowItem[]
  productList: CompositeWorkflowItem[]
  costPH: number
  incomePH: number
  profitPH: number
  profitPD: number
  profitRate: number
  expPH: number
}

function keyOf(item: { hrid: string, level?: number }) {
  return `${item.hrid}-${item.level || 0}`
}

function mergeWorkflowItems(list: CompositeWorkflowItem[]) {
  const map = new Map<string, CompositeWorkflowItem>()
  list.forEach((item) => {
    const key = keyOf(item)
    const current = map.get(key)
    if (current) {
      current.countPH += item.countPH
      current.totalPH += item.totalPH
      return
    }
    map.set(key, { ...item })
  })
  return Array.from(map.values())
}

function cancelItems(ingredientList: CompositeWorkflowItem[], productList: CompositeWorkflowItem[]) {
  const ingredientMap = new Map(ingredientList.map(item => [keyOf(item), { ...item }]))
  const productMap = new Map(productList.map(item => [keyOf(item), { ...item }]))
  const keys = new Set<string>([
    ...ingredientMap.keys(),
    ...productMap.keys()
  ])

  keys.forEach((key) => {
    const ingredient = ingredientMap.get(key)
    const product = productMap.get(key)
    if (!ingredient || !product) {
      return
    }
    const counter = Math.min(ingredient.countPH, product.countPH)
    ingredient.countPH -= counter
    ingredient.totalPH = ingredient.countPH * ingredient.price
    product.countPH -= counter
    product.totalPH = product.countPH * product.price
  })

  return {
    ingredientList: Array.from(ingredientMap.values())
      .filter(item => item.countPH > EPSILON)
      .sort((a, b) => b.totalPH - a.totalPH),
    productList: Array.from(productMap.values())
      .filter(item => item.countPH > EPSILON)
      .sort((a, b) => b.totalPH - a.totalPH)
  }
}

function getScaledItems(list: Array<IngredientWithPrice | ProductWithPrice>, share: number) {
  return list.map(item => ({
    hrid: item.hrid,
    level: item.level,
    countPH: (item.countPH || 0) * share,
    price: item.price,
    marketPrice: item.marketPrice,
    totalPH: (item.countPH || 0) * share * item.price
  }))
}

function getIncomePH(productList: CompositeWorkflowItem[]) {
  let total = 0
  for (const product of productList) {
    const coinRate = product.hrid === COIN_HRID ? 0.98 : 1
    total += product.countPH * product.price / coinRate
  }
  return total * 0.98
}

function projectToSimplex(v: number[]) {
  if (!v.length) return v
  const u = [...v].sort((a, b) => b - a)
  let cssv = 0
  let rho = -1
  for (let i = 0; i < u.length; i++) {
    cssv += u[i]
    const t = (cssv - 1) / (i + 1)
    if (u[i] - t > 0) {
      rho = i
    }
  }
  if (rho < 0) {
    const out = new Array(v.length).fill(0)
    out[0] = 1
    return out
  }
  const sumRho = u.slice(0, rho + 1).reduce((a, b) => a + b, 0)
  const theta = (sumRho - 1) / (rho + 1)
  return v.map(x => Math.max(0, x - theta))
}

function matVec(A: number[][], x: number[]) {
  const y = new Array(A.length).fill(0)
  for (let i = 0; i < A.length; i++) {
    let sum = 0
    const row = A[i]
    for (let j = 0; j < x.length; j++) {
      sum += row[j] * x[j]
    }
    y[i] = sum
  }
  return y
}

function transposeMatVec(A: number[][], y: number[]) {
  if (!A.length) return []
  const n = A[0].length
  const out = new Array(n).fill(0)
  for (let i = 0; i < A.length; i++) {
    const row = A[i]
    const yi = y[i]
    for (let j = 0; j < n; j++) {
      out[j] += row[j] * yi
    }
  }
  return out
}

function squaredNorm(v: number[]) {
  return v.reduce((acc, x) => acc + x * x, 0)
}

function frobeniusNormSquared(A: number[][]) {
  let sum = 0
  for (const row of A) {
    for (const x of row) sum += x * x
  }
  return sum
}

function getProjectAndAction(className: BuilderCalculatorClassName, step: CompositeWorkflowBuilderStep) {
  if (className === "ManufactureCalculator") {
    const action = step.action
    if (!action) {
      return null
    }
    return { action, project: getTrans(action) }
  }
  if (className === "TransmuteCalculator") {
    return { action: "alchemy" as const, project: getTrans("转化") }
  }
  if (className === "DecomposeCalculator") {
    return { action: "alchemy" as const, project: getTrans("分解") }
  }
  if (className === "CoinifyCalculator") {
    return { action: "alchemy" as const, project: getTrans("点金") }
  }
  return null
}

function toStorageCalculatorItem(step: CompositeWorkflowBuilderStep): StorageCalculatorItem | null {
  if (!step.hrid) {
    return null
  }
  if (!calculatorConstructable(step.className)) {
    return null
  }
  const pa = getProjectAndAction(step.className, step)
  if (!pa) {
    return null
  }

  const project = pa.project
  const action = pa.action
  const id = `${step.hrid}-${project}-${action}` as const

  return {
    id,
    className: step.className,
    hrid: step.hrid,
    project,
    action,
    catalystRank: step.catalystRank || undefined,
    enhanceLevel: step.enhanceLevel,
    originLevel: step.originLevel,
  } as unknown as StorageCalculatorItem
}

function normalizeWeights(steps: CompositeWorkflowBuilderStep[]) {
  const weights = steps.map(s => (Number.isFinite(s.weight) ? Math.max(0, s.weight) : 0))
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= EPSILON) {
    const share = steps.length ? 1 / steps.length : 0
    return steps.map(() => share)
  }
  return weights.map(w => w / sum)
}

export interface AutoBalanceResult {
  ok: boolean
  reason?: string
  /** sum=1, >=0 */
  shares?: number[]
  /** internal residual L2 */
  residual?: number
  /** internal keys used for balancing */
  internalKeys?: string[]
}

/**
 * 自动配平时间占比：使“同时被产出&消耗”的中间物料在整体上尽量净为 0。
 * - 目标：min ||A*s||^2
 * - 约束：s>=0, sum(s)=1
 */
export function autoBalanceCompositeWorkflowWeights(
  builderSteps: CompositeWorkflowBuilderStep[],
  options?: {
    maxIters?: number
    tolerance?: number
    target?: { hrid: string, level?: number }
    /** 越大越偏向提高最终产物净产出 */
    targetPriority?: number
  }
): AutoBalanceResult {
  if (builderSteps.some((s) => !s)) {
    return { ok: false, reason: "步骤数据异常（存在空步骤）。请删除后重试。" }
  }
  if (!builderSteps.length) {
    return { ok: false, reason: "请先添加步骤。" }
  }

  const calculators: Calculator[] = []
  for (const builder of builderSteps) {
    const config = toStorageCalculatorItem(builder)
    if (!config) return { ok: false, reason: "步骤配置不完整。" }
    const calculator = getCalculatorInstance(config)
    if (!calculator.available) return { ok: false, reason: `步骤不可用：${calculator.className} ${calculator.hrid}` }
    calculator.run()
    calculators.push(calculator)
  }

  const totalIn = new Map<string, number>()
  const totalOut = new Map<string, number>()
  const stepNetMaps: Array<Map<string, number>> = calculators.map((cal) => {
    const net = new Map<string, number>()
    cal.productListWithPrice.forEach((p) => {
      const key = keyOf(p)
      const prev = net.get(key) || 0
      net.set(key, prev + (p.countPH || 0))
      totalOut.set(key, (totalOut.get(key) || 0) + (p.countPH || 0))
    })
    cal.ingredientListWithPrice.forEach((ing) => {
      const key = keyOf(ing)
      const prev = net.get(key) || 0
      net.set(key, prev - (ing.countPH || 0))
      totalIn.set(key, (totalIn.get(key) || 0) + (ing.countPH || 0))
    })
    return net
  })

  const internalKeys = new Set<string>()
  for (const key of new Set([...totalIn.keys(), ...totalOut.keys()])) {
    if (key.startsWith(`${COIN_HRID}-`)) continue
    if ((totalIn.get(key) || 0) > EPSILON && (totalOut.get(key) || 0) > EPSILON) {
      internalKeys.add(key)
    }
  }

  const keys = Array.from(internalKeys)
  if (!keys.length) {
    return { ok: false, reason: "没有可配平的中间物料（没有物品同时被产出与消耗）。" }
  }

  // Row-normalize to avoid scale issues (counts can be huge).
  const A: number[][] = keys.map((k) => {
    const row = new Array(builderSteps.length).fill(0)
    for (let i = 0; i < builderSteps.length; i++) {
      row[i] = stepNetMaps[i].get(k) || 0
    }
    const maxAbs = row.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
    for (let i = 0; i < row.length; i++) row[i] /= maxAbs
    return row
  })

  const maxIters = options?.maxIters ?? DEFAULT_MAX_ITERS
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE

  let s = normalizeWeights(builderSteps)
  s = projectToSimplex(s)

  const L = 2 * Math.max(frobeniusNormSquared(A), EPSILON)
  const alpha = 1 / L

  let b: number[] | undefined
  let targetPriority = options?.targetPriority ?? 1
  if (options?.target?.hrid) {
    const targetKey = keyOf({ hrid: options.target.hrid, level: options.target.level || 0 })
    b = new Array(builderSteps.length).fill(0).map((_, i) => stepNetMaps[i].get(targetKey) || 0)
    const maxAbsB = b.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    if (!maxAbsB || maxAbsB <= EPSILON) {
      return { ok: false, reason: "选定的最终产物在当前步骤中没有净产出/净消耗。" }
    }
    b = b.map(v => v / maxAbsB)
    targetPriority = Math.max(0, targetPriority)
  }

  let last = Infinity
  for (let iter = 0; iter < maxIters; iter++) {
    const y = matVec(A, s)
    const f = squaredNorm(y)
    if (f <= tolerance) {
      return { ok: true, shares: s, residual: Math.sqrt(f), internalKeys: keys }
    }
    if (Math.abs(last - f) <= tolerance * 0.1) {
      return { ok: true, shares: s, residual: Math.sqrt(f), internalKeys: keys }
    }
    last = f

    const grad = transposeMatVec(A, y).map(v => 2 * v)
    if (b && targetPriority > 0) {
      // objective: ||A*s||^2 - mu*(b·s) + gamma*min(0, b·s)^2
      const mu = targetPriority
      const gamma = 10 * targetPriority
      const prod = b.reduce((acc, bi, i) => acc + bi * s[i], 0)
      const neg = Math.min(0, prod)
      for (let i = 0; i < grad.length; i++) {
        grad[i] -= mu * b[i]
        if (neg < 0) {
          grad[i] += 2 * gamma * neg * b[i]
        }
      }
    }
    const next = projectToSimplex(s.map((val, i) => val - alpha * grad[i]))
    s = next
  }

  const residual = Math.sqrt(squaredNorm(matVec(A, s)))
  return { ok: true, shares: s, residual, internalKeys: keys }
}

export function buildCompositeWorkflowFromBuilderSteps(builderSteps: CompositeWorkflowBuilderStep[]): CompositeWorkflowResult {
  if (builderSteps.some((s) => !s)) {
    return {
      available: false,
      reason: "步骤数据异常（存在空步骤）。请删除后重试。",
      valid: false,
      steps: [],
      ingredientList: [],
      productList: [],
      costPH: 0,
      incomePH: 0,
      profitPH: 0,
      profitPD: 0,
      profitRate: 0,
      expPH: 0
    }
  }
  if (!builderSteps.length) {
    return {
      available: false,
      reason: "请先添加步骤。",
      valid: false,
      steps: [],
      ingredientList: [],
      productList: [],
      costPH: 0,
      incomePH: 0,
      profitPH: 0,
      profitPD: 0,
      profitRate: 0,
      expPH: 0
    }
  }

  const shares = normalizeWeights(builderSteps)
  const steps: CompositeWorkflowStep[] = []

  for (let i = 0; i < builderSteps.length; i++) {
    const builder = builderSteps[i]
    const config = toStorageCalculatorItem(builder)
    if (!config) {
      return {
        available: false,
        reason: "步骤配置不完整。",
        valid: false,
        steps: [],
        ingredientList: [],
        productList: [],
        costPH: 0,
        incomePH: 0,
        profitPH: 0,
        profitPD: 0,
        profitRate: 0,
        expPH: 0
      }
    }

    const calculator = getCalculatorInstance(config)
    if (!calculator.available) {
      return {
        available: false,
        reason: `步骤不可用：${calculator.className} ${calculator.hrid}`,
        valid: false,
        steps: [],
        ingredientList: [],
        productList: [],
        costPH: 0,
        incomePH: 0,
        profitPH: 0,
        profitPD: 0,
        profitRate: 0,
        expPH: 0
      }
    }

    calculator.run()
    const label = `${calculator.project} ${calculator.result.name}`

    steps.push({
      key: builder.key,
      label,
      calculator,
      share: shares[i]
    })
  }

  const mergedIngredientList = mergeWorkflowItems(steps.flatMap(step => getScaledItems(step.calculator.ingredientListWithPrice, step.share)))
  const mergedProductList = mergeWorkflowItems(steps.flatMap(step => getScaledItems(step.calculator.productListWithPrice, step.share)))
  const { ingredientList, productList } = cancelItems(mergedIngredientList, mergedProductList)

  const costPH = ingredientList.reduce((acc, item) => acc + item.totalPH, 0)
  const incomePH = getIncomePH(productList)
  const valid = ingredientList.every(item => item.price !== -1) && productList.every(item => item.price !== -1)
  const profitPH = valid ? incomePH - costPH : -1 / 24
  const profitRate = valid && costPH ? profitPH / costPH : (valid ? 0 : -1)
  const expPH = steps.reduce((acc, step) => acc + step.calculator.result.expPH * step.share, 0)

  return {
    available: true,
    valid,
    steps,
    ingredientList,
    productList,
    costPH,
    incomePH,
    profitPH,
    profitPD: profitPH * 24,
    profitRate,
    expPH
  }
}

export function getFixedChainPreset(): CompositeWorkflowBuilderStep[] {
  return [
    { key: "decompose-arcane-log", className: "DecomposeCalculator", hrid: "/items/arcane_log", weight: 1 },
    { key: "decompose-holy-milk", className: "DecomposeCalculator", hrid: "/items/holy_milk", weight: 1 },
    { key: "decompose-star-fruit", className: "DecomposeCalculator", hrid: "/items/star_fruit", weight: 1 },
    { key: "craft-catalyst-of-coinification", className: "ManufactureCalculator", hrid: "/items/catalyst_of_coinification", action: "crafting", weight: 1 },
    { key: "transmute-catalyst-of-coinification", className: "TransmuteCalculator", hrid: "/items/catalyst_of_coinification", weight: 1 }
  ]
}
