import type { Action } from "~/game"
import { ElMessage } from "element-plus"
import { ManufactureCalculator } from "@/calculator/manufacture"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { getGameDataApi } from "../game"
import { getUsedPriceOf } from "../price"

type SortLike = {
  prop?: string
  order?: "ascending" | "descending" | null
}

export interface InheritSavingRowsOptions {
  silent?: boolean
}

function sortRows(list: ManufactureCalculator[], sort?: SortLike) {
  const rows = list.slice()
  rows.sort((left, right) => right.result.profitPH - left.result.profitPH)

  if (!sort?.prop || !sort.order) {
    return rows
  }

  const path = sort.prop.split(".")
  const getValue = (row: ManufactureCalculator | Record<string, any>) => path.reduce<any>((value, key) => value?.[key], row)

  rows.sort((left, right) => {
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

  return rows
}

function paginateRows(list: ManufactureCalculator[], params: Record<string, any>) {
  const currentPage = Math.max(1, Number(params.currentPage) || 1)
  const size = Math.max(1, Number(params.size) || 20)
  return {
    list: list.slice((currentPage - 1) * size, currentPage * size),
    total: list.length
  }
}

function filterRows(list: ManufactureCalculator[], params: Record<string, any>) {
  let rows = list.slice()

  if (params.name) {
    const regex = new RegExp(params.name, "i")
    rows = rows.filter(row => row.result.name.match(regex))
  }

  if (params.project) {
    rows = rows.filter(row => row.project === params.project)
  }

  if (Number.isFinite(params.minLevel)) {
    rows = rows.filter(row => row.originLevel >= Number(params.minLevel))
  }
  if (Number.isFinite(params.maxLevel)) {
    rows = rows.filter(row => row.originLevel <= Number(params.maxLevel))
  }
  if (Number.isFinite(params.minTargetLevel)) {
    rows = rows.filter(row => row.targetLevel >= Number(params.minTargetLevel))
  }
  if (Number.isFinite(params.maxTargetLevel)) {
    rows = rows.filter(row => row.targetLevel <= Number(params.maxTargetLevel))
  }
  if (!params.allowNegativeProfit) {
    rows = rows.filter(row => row.result.profitPH >= 0)
  }
  if (Number.isFinite(params.minProfitPH)) {
    rows = rows.filter(row => row.result.profitPH >= Number(params.minProfitPH))
  }
  if (Number.isFinite(params.minExpPH)) {
    rows = rows.filter(row => (row.result.expPH || 0) >= Number(params.minExpPH))
  }

  return rows
}

function calcProfit() {
  const gameData = getGameDataApi()
  const list = Object.values(gameData.itemDetailMap)
  const profitList: ManufactureCalculator[] = []

  list.filter(item => item.enhancementCosts).forEach((item) => {
    for (let originLevel = 1; originLevel <= 20; originLevel++) {
      const projects: Array<[string, Action]> = [
        ["锻造", "cheesesmithing"],
        ["制造", "crafting"],
        ["裁缝", "tailoring"]
      ]

      for (const [project, action] of projects) {
        const calculator = new ManufactureCalculator({
          hrid: item.hrid,
          project,
          action,
          originLevel
        })
        const actionItem = calculator.actionItem
        if (!actionItem?.upgradeItemHrid || actionItem.upgradeItemHrid === "/items/philosophers_stone") {
          continue
        }
        if (getUsedPriceOf(actionItem.upgradeItemHrid, originLevel, "ask") === -1) {
          continue
        }
        if (getUsedPriceOf(item.hrid, Math.floor(calculator.targetLevel), "bid") === -1) {
          continue
        }
        if (!calculator.available) {
          continue
        }
        calculator.run()
        profitList.push(calculator)
      }
    }
  })

  return profitList
}

async function ensureInheritSavingRows(silent = false) {
  let rows = useGameStoreOutside().getInheritCache()
  if (!rows) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const startedAt = Date.now()
    try {
      rows = calcProfit()
    } catch (error) {
      console.error(error)
      rows = []
    }
    useGameStoreOutside().setInheritCache(rows)
    if (!silent) {
      ElMessage.success(`继承省钱计算完成，耗时${((Date.now() - startedAt) / 1000).toFixed(1)}秒`)
    }
  }

  return rows
}

export async function getInheritSavingRows(options: InheritSavingRowsOptions = {}) {
  return ensureInheritSavingRows(!!options.silent)
}

export async function getInheritSavingDataApi(params: Record<string, any>) {
  const rows = await ensureInheritSavingRows()
  const filteredRows = filterRows(rows, params)
  const sortedRows = sortRows(filteredRows, params.sort)
  return paginateRows(sortedRows, params)
}

export async function getDataApi(params: Record<string, any>) {
  return getInheritSavingDataApi(params)
}
