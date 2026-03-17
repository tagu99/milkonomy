import type Calculator from "@/calculator"
import type { IngredientWithPrice, ProductWithPrice } from "@/calculator"
import { DecomposeCalculator, TransmuteCalculator } from "@/calculator/alchemy"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { getTrans } from "@/locales"
import { COIN_HRID } from "@/pinia/stores/game"

const EPSILON = 1e-8

const ARCANE_LOG_HRID = "/items/arcane_log"
const HOLY_MILK_HRID = "/items/holy_milk"
const STAR_FRUIT_HRID = "/items/star_fruit"
const CATALYST_OF_COINIFICATION_HRID = "/items/catalyst_of_coinification"
const WOODCUTTING_ESSENCE_HRID = "/items/woodcutting_essence"
const MILKING_ESSENCE_HRID = "/items/milking_essence"
const FORAGING_ESSENCE_HRID = "/items/foraging_essence"

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

function sumCountPH(list: Array<IngredientWithPrice | ProductWithPrice>, hrid: string, level = 0) {
  return list.reduce((acc, item) => {
    if (item.hrid !== hrid || (item.level || 0) !== level) {
      return acc
    }
    return acc + (item.countPH || 0)
  }, 0)
}

function getNetCountPH(calculator: Calculator, hrid: string, level = 0) {
  return sumCountPH(calculator.productListWithPrice, hrid, level) - sumCountPH(calculator.ingredientListWithPrice, hrid, level)
}

function getSupplyPH(calculator: Calculator, hrid: string, level = 0) {
  return Math.max(0, getNetCountPH(calculator, hrid, level))
}

function getDemandPH(calculator: Calculator, hrid: string, level = 0) {
  return Math.max(0, -getNetCountPH(calculator, hrid, level))
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

function createCalculatorList() {
  const decomposeArcaneLog = new DecomposeCalculator({ hrid: ARCANE_LOG_HRID })
  const decomposeHolyMilk = new DecomposeCalculator({ hrid: HOLY_MILK_HRID })
  const decomposeStarFruit = new DecomposeCalculator({ hrid: STAR_FRUIT_HRID })
  const craftCoinCatalyst = new ManufactureCalculator({
    hrid: CATALYST_OF_COINIFICATION_HRID,
    action: "crafting",
    project: getTrans("crafting")
  })
  const transmuteCoinCatalyst = new TransmuteCalculator({ hrid: CATALYST_OF_COINIFICATION_HRID })

  const calculators = [
    decomposeArcaneLog,
    decomposeHolyMilk,
    decomposeStarFruit,
    craftCoinCatalyst,
    transmuteCoinCatalyst
  ]

  calculators.forEach((calculator) => {
    if (calculator.available) {
      calculator.run()
    }
  })

  return {
    decomposeArcaneLog,
    decomposeHolyMilk,
    decomposeStarFruit,
    craftCoinCatalyst,
    transmuteCoinCatalyst,
    calculators
  }
}

export function buildFixedCompositeWorkflow(): CompositeWorkflowResult {
  const {
    decomposeArcaneLog,
    decomposeHolyMilk,
    decomposeStarFruit,
    craftCoinCatalyst,
    transmuteCoinCatalyst,
    calculators
  } = createCalculatorList()

  if (calculators.some(calculator => !calculator.available)) {
    return {
      available: false,
      reason: "这条固定链路有步骤在当前数据下不可用。",
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

  const catalystDemandPH = getDemandPH(transmuteCoinCatalyst, CATALYST_OF_COINIFICATION_HRID)
  const catalystSupplyPH = getSupplyPH(craftCoinCatalyst, CATALYST_OF_COINIFICATION_HRID)
  const woodcuttingDemandPH = getDemandPH(craftCoinCatalyst, WOODCUTTING_ESSENCE_HRID)
  const woodcuttingSupplyPH = getSupplyPH(decomposeArcaneLog, WOODCUTTING_ESSENCE_HRID)
  const milkingDemandPH = getDemandPH(craftCoinCatalyst, MILKING_ESSENCE_HRID)
  const milkingSupplyPH = getSupplyPH(decomposeHolyMilk, MILKING_ESSENCE_HRID)
  const foragingDemandPH = getDemandPH(craftCoinCatalyst, FORAGING_ESSENCE_HRID)
  const foragingSupplyPH = getSupplyPH(decomposeStarFruit, FORAGING_ESSENCE_HRID)

  if (
    catalystDemandPH <= EPSILON
    || catalystSupplyPH <= EPSILON
    || woodcuttingDemandPH <= EPSILON
    || woodcuttingSupplyPH <= EPSILON
    || milkingDemandPH <= EPSILON
    || milkingSupplyPH <= EPSILON
    || foragingDemandPH <= EPSILON
    || foragingSupplyPH <= EPSILON
  ) {
    return {
      available: false,
      reason: "当前固定链路无法建立稳定的内部物料平衡。",
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

  const transmuteFactor = 1
  const craftFactor = catalystDemandPH / catalystSupplyPH
  const arcaneFactor = craftFactor * woodcuttingDemandPH / woodcuttingSupplyPH
  const holyFactor = craftFactor * milkingDemandPH / milkingSupplyPH
  const starFactor = craftFactor * foragingDemandPH / foragingSupplyPH
  const totalFactor = transmuteFactor + craftFactor + arcaneFactor + holyFactor + starFactor

  const steps: CompositeWorkflowStep[] = [
    {
      key: "decompose-arcane-log",
      label: "分解 神秘原木",
      calculator: decomposeArcaneLog,
      share: arcaneFactor / totalFactor
    },
    {
      key: "decompose-holy-milk",
      label: "分解 神圣牛奶",
      calculator: decomposeHolyMilk,
      share: holyFactor / totalFactor
    },
    {
      key: "decompose-star-fruit",
      label: "分解 杨桃",
      calculator: decomposeStarFruit,
      share: starFactor / totalFactor
    },
    {
      key: "craft-catalyst-of-coinification",
      label: "制作 点金催化剂",
      calculator: craftCoinCatalyst,
      share: craftFactor / totalFactor
    },
    {
      key: "transmute-catalyst-of-coinification",
      label: "转化 点金催化剂",
      calculator: transmuteCoinCatalyst,
      share: transmuteFactor / totalFactor
    }
  ]

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
