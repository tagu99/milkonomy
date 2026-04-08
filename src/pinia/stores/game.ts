import type Calculator from "@/calculator"
import type { DecomposeCalculator } from "@/calculator/alchemy"
import type { EnhanceCalculator } from "@/calculator/enhance"
import type { BargainAnalysisRow } from "@/common/apis/jungle/bargain-analysis"
import type { ManufactureCalculator } from "@/calculator/manufacture"
import type { DemandHeatRow } from "@/common/apis/jungle/demand-heat"
import type { MarketWarningRow } from "@/common/apis/jungle/market-warning"
import type { WorkflowCalculator } from "@/calculator/workflow"
import type { RecoveryFloorRow } from "@/common/apis/jungle/recovery-floor"
import type { StableEnhanceRow } from "@/common/apis/jungle/stable"
import type { Action, GameData, NoncombatStatsKey } from "~/game"
import type { Market, MarketData, MarketDataPlain, MarketItemPrice } from "~/market"
import { defineStore } from "pinia"
import { applySupplementalGameData } from "@/common/config/supplemental-game-data"
import locales, { getTrans } from "@/locales"
import { pinia } from "@/pinia"

const { t } = locales.global

export const COIN_HRID = "/items/coin"

export const ACTION_LIST = [
  "milking",
  "foraging",
  "woodcutting",
  "cheesesmithing",
  "crafting",
  "tailoring",
  "cooking",
  "brewing",
  "alchemy",
  "enhancing"
] as const

export const EQUIPMENT_LIST = [
  "head",
  "body",
  "legs",
  "feet",
  "hands",
  "ring",
  "neck",
  "earrings",
  "back",
  "off_hand",
  "pouch",
  "charm"
] as const

export const COMMUNITY_BUFF_LIST = [
  "experience",
  "gathering_quantity",
  "production_efficiency",
  "enhancing_speed"
]

const DEFAULT_HOUSE = {
  Efficiency: 0.015,
  Experience: 0.0005,
  RareFind: 0.002
}

export const HOUSE_MAP: Record<Action, Partial<Record<NoncombatStatsKey, number>>> = {
  milking: { ...DEFAULT_HOUSE },
  foraging: { ...DEFAULT_HOUSE },
  woodcutting: { ...DEFAULT_HOUSE },
  cheesesmithing: { ...DEFAULT_HOUSE },
  crafting: { ...DEFAULT_HOUSE },
  tailoring: { ...DEFAULT_HOUSE },
  brewing: { ...DEFAULT_HOUSE },
  cooking: { ...DEFAULT_HOUSE },
  alchemy: { ...DEFAULT_HOUSE },
  enhancing: {
    Speed: 0.01,
    Success: 0.0005,
    Experience: 0.0005,
    RareFind: 0.002
  }
}

export enum PriceStatus {
  ASK = "ASK",
  BID = "BID",
  ASK_LOW = "ASK_LOW",
  BID_HIGH = "BID_HIGH"
}

export const PRICE_STATUS_LIST = [
  { value: PriceStatus.ASK, label: getTrans("左价") },
  { value: PriceStatus.ASK_LOW, label: `${getTrans("左价")}-` },
  { value: PriceStatus.BID, label: getTrans("右价") },
  { value: PriceStatus.BID_HIGH, label: `${getTrans("右价")}+` }
]

export interface TryFetchDataOptions {
  refreshGameData?: boolean
}

const DEFAULT_GAME_DATA_URLS = [
  "https://raw.githubusercontent.com/silent1b/MWIData/main/init_client_info.json",
  "https://cdn.jsdelivr.net/gh/silent1b/MWIData@main/init_client_info.json"
]

export const useGameStore = defineStore("game", {
  state: () => ({
    gameData: getGameData(),
    marketData: getMarketData(),
    leaderboardCache: {} as { [time: number]: Calculator[] },
    enhanposerCache: {} as { [time: number]: WorkflowCalculator[] },
    manualchemyCache: {} as { [time: number]: Calculator[] },
    jungleCache: {} as { [key: string]: WorkflowCalculator[] },
    junglestCache: {} as { [time: number]: EnhanceCalculator[] },
    stableEnhanceCache: {} as { [key: string]: StableEnhanceRow[] },
    recoveryFloorCache: {} as { [key: string]: RecoveryFloorRow[] },
    demandHeatCache: {} as { [key: string]: DemandHeatRow[] },
    bargainAnalysisCache: {} as { [key: string]: BargainAnalysisRow[] },
    marketWarningCache: {} as { [key: string]: MarketWarningRow[] },
    inheritCache: {} as { [time: number]: ManufactureCalculator[] },
    decomposeCache: {} as { [time: number]: DecomposeCalculator[] },
    secret: loadSecret(),
    buyStatus: loadBuyStatus(),
    sellStatus: loadSellStatus()
  }),
  actions: {
    async tryFetchData(options: TryFetchDataOptions = {}) {
      let retryCount = 5
      let fetchSucceeded = false
      while (retryCount--) {
        try {
          await this.fetchData(retryCount, options)
          fetchSucceeded = true
          break
        } catch (e) {
          console.error(`获取数据第${5 - retryCount}次失败`, e)
          ElMessage.error(t("获取数据第{0}次失败，正在重试...", [5 - retryCount]))
        }
      }

      if (fetchSucceeded) {
        return
      }
      if (this.gameData && this.marketData) {
        ElMessage.error(t("数据获取失败，直接使用缓存数据"))
        return
      }
      ElMessage.error(t("数据获取失败，请检查网络连接"))
      throw new Error("force crash")
    },

    async fetchData(offset: number, options: TryFetchDataOptions = {}) {
      const url = import.meta.env.MODE === "development" ? "/" : "./"
      const marketUrls = ["https://www.milkywayidle.com/game_data/marketplace.json"]
      const marketUrl = marketUrls[(4 - offset) % marketUrls.length]

      const localGameDataUrl = `${url}data/data.json`
      const gameDataUrls = [...DEFAULT_GAME_DATA_URLS, localGameDataUrl]
      const refreshGameData = options.refreshGameData ?? false
      const shouldRefreshGameData = refreshGameData || !this.gameData

      const [gameDataResult, marketRes] = await Promise.all([
        shouldRefreshGameData
          ? fetchJsonWithFallback<GameData>(gameDataUrls)
          : Promise.resolve({ data: this.gameData!, url: "localStorage" }),
        fetch(marketUrl)
      ])

      if (!marketRes.ok) {
        throw new Error("Market response not ok")
      }
      const newMarketData = await marketRes.json() as MarketDataPlain

      const prevGameVersion = this.gameData?.gameVersion
      const newGameData = applySupplementalGameData(gameDataResult.data)!
      if (shouldRefreshGameData) {
        this.gameData = newGameData
        setGameData(newGameData)
        if (prevGameVersion && newGameData.gameVersion !== prevGameVersion) {
          this.clearAllCaches()
        }
      }

      const gameDataForMarketUpdate = this.gameData || newGameData
      if (!gameDataForMarketUpdate) {
        throw new Error("Missing game data")
      }

      if (this.marketData?.timestamp && this.marketData.timestamp === newMarketData.timestamp) {
        return
      }

      this.marketData = updateMarketData(this.marketData, newMarketData, gameDataForMarketUpdate)
      this.clearAllCaches()
    },

    savePriceStatus() {
      this.clearAllCaches()
    },
    resetPriceStatus() {
      this.buyStatus = loadBuyStatus()
      this.sellStatus = loadSellStatus()
    },

    getLeaderboardCache() {
      return this.leaderboardCache[this.marketData!.timestamp]
    },
    setLeaderBoardCache(list: Calculator[]) {
      this.clearLeaderBoardCache()
      this.leaderboardCache[this.marketData!.timestamp] = list
    },
    clearLeaderBoardCache() {
      this.leaderboardCache = {}
    },

    getEnhanposerCache() {
      return this.enhanposerCache[this.marketData!.timestamp]
    },
    setEnhanposerCache(list: WorkflowCalculator[]) {
      this.clearEnhanposerCache()
      this.enhanposerCache[this.marketData!.timestamp] = list
    },
    clearEnhanposerCache() {
      this.enhanposerCache = {}
    },

    getManualchemyCache() {
      return this.manualchemyCache[this.marketData!.timestamp]
    },
    setManualchemyCache(list: Calculator[]) {
      this.clearManualchemyCache()
      this.manualchemyCache[this.marketData!.timestamp] = list
    },
    clearManualchemyCache() {
      this.manualchemyCache = {}
    },

    getJungleCache(key: string) {
      return this.jungleCache[key]
    },
    setJungleCache(list: WorkflowCalculator[], key: string) {
      this.jungleCache[key] = list
    },
    clearJungleCache(key?: string) {
      if (key) {
        delete this.jungleCache[key]
      } else {
        this.jungleCache = {}
      }
    },

    getJunglestCache() {
      return this.junglestCache[this.marketData!.timestamp]
    },
    setJunglestCache(list: EnhanceCalculator[]) {
      this.clearJunglestCache()
      this.junglestCache[this.marketData!.timestamp] = list
    },
    clearJunglestCache() {
      this.junglestCache = {}
    },

    getStableEnhanceCache(key: string = "default") {
      return this.stableEnhanceCache[key]
    },
    setStableEnhanceCache(list: StableEnhanceRow[], key: string = "default") {
      this.stableEnhanceCache[key] = list
    },
    clearStableEnhanceCache(key?: string) {
      if (key) {
        delete this.stableEnhanceCache[key]
      } else {
        this.stableEnhanceCache = {}
      }
    },

    getRecoveryFloorCache(key: string = "default") {
      return this.recoveryFloorCache[key]
    },
    setRecoveryFloorCache(list: RecoveryFloorRow[], key: string = "default") {
      this.recoveryFloorCache[key] = list
    },
    clearRecoveryFloorCache(key?: string) {
      if (key) {
        delete this.recoveryFloorCache[key]
      } else {
        this.recoveryFloorCache = {}
      }
    },

    getDemandHeatCache(key: string = "default") {
      return this.demandHeatCache[key]
    },
    setDemandHeatCache(list: DemandHeatRow[], key: string = "default") {
      this.demandHeatCache[key] = list
    },
    clearDemandHeatCache(key?: string) {
      if (key) {
        delete this.demandHeatCache[key]
      } else {
        this.demandHeatCache = {}
      }
    },

    getBargainAnalysisCache(key: string = "default") {
      return this.bargainAnalysisCache[key]
    },
    setBargainAnalysisCache(list: BargainAnalysisRow[], key: string = "default") {
      this.bargainAnalysisCache[key] = list
    },
    clearBargainAnalysisCache(key?: string) {
      if (key) {
        delete this.bargainAnalysisCache[key]
      } else {
        this.bargainAnalysisCache = {}
      }
    },

    getMarketWarningCache(key: string = "default") {
      return this.marketWarningCache[key]
    },
    setMarketWarningCache(list: MarketWarningRow[], key: string = "default") {
      this.marketWarningCache[key] = list
    },
    clearMarketWarningCache(key?: string) {
      if (key) {
        delete this.marketWarningCache[key]
      } else {
        this.marketWarningCache = {}
      }
    },

    getInheritCache() {
      return this.inheritCache[this.marketData!.timestamp]
    },
    setInheritCache(list: ManufactureCalculator[]) {
      this.clearInheritCache()
      this.inheritCache[this.marketData!.timestamp] = list
    },
    clearInheritCache() {
      this.inheritCache = {}
    },

    getDecomposeCache() {
      return this.decomposeCache[this.marketData!.timestamp]
    },
    setDecomposeCache(list: DecomposeCalculator[]) {
      this.clearDecomposeCache()
      this.decomposeCache[this.marketData!.timestamp] = list
    },
    clearDecomposeCache() {
      this.decomposeCache = {}
    },

    setSecret(value: string) {
      this.secret = value
      saveSecret(value)
    },
    checkSecret() {
      return true
    },

    clearAllCaches() {
      this.clearLeaderBoardCache()
      this.clearManualchemyCache()
      this.clearInheritCache()
      this.clearDecomposeCache()
      this.clearEnhanposerCache()
      this.clearJungleCache()
      this.clearJunglestCache()
      this.clearStableEnhanceCache()
      this.clearRecoveryFloorCache()
      this.clearDemandHeatCache()
      this.clearBargainAnalysisCache()
      this.clearMarketWarningCache()
    }
  }
})

async function fetchJsonWithFallback<T>(urls: string[]): Promise<{ url: string, data: T }> {
  let lastError: unknown
  for (const url of urls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(url, { cache: "no-store", signal: controller.signal })
      clearTimeout(timeoutId)
      if (!res.ok) {
        lastError = new Error(`Response not ok: ${res.status} ${res.statusText} (${url})`)
        continue
      }
      const data = await res.json() as T
      return { url, data }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to fetch JSON")
}

function updateMarketData(oldData: MarketData | null, newData: MarketDataPlain, newGameData: GameData): MarketData {
  const oldMarket = oldData?.marketData || {}
  const newMarket: Market = {}

  for (const hrid in newData.marketData) {
    if (newData.marketData[hrid]) {
      newMarket[hrid] = {}
    }
    for (const level in newData.marketData[hrid]) {
      newMarket[hrid][level] = {
        ask: newData.marketData[hrid][level].a,
        bid: newData.marketData[hrid][level].b
      }
    }
  }

  const itemDetailMap = newGameData.itemDetailMap
  const isEquipmentMap: Record<string, boolean> = {}
  for (const key in itemDetailMap) {
    const item = itemDetailMap[key]
    isEquipmentMap[item.hrid] = item.categoryHrid === "/item_categories/equipment"
  }

  for (const hrid in newMarket) {
    if (isEquipmentMap[hrid] || !oldMarket[hrid]) {
      continue
    }
    for (const level in newMarket[hrid]) {
      const price = newMarket[hrid][level]
      if (price.ask === -1) {
        price.ask = (oldMarket[hrid]?.[level] as MarketItemPrice)?.ask ?? -1
      }
      if (price.bid === -1) {
        price.bid = (oldMarket[hrid]?.[level] as MarketItemPrice)?.bid ?? -1
      }
    }
  }

  const result = {
    timestamp: newData.timestamp,
    marketData: newMarket
  }
  setMarketData(result)
  return result
}

const KEY_PREFIX = "game-"

function getMarketData() {
  return JSON.parse(localStorage.getItem(`${KEY_PREFIX}market-data`) || "null") as MarketData | null
}
function setMarketData(value: MarketData) {
  localStorage.setItem(`${KEY_PREFIX}market-data`, JSON.stringify(value))
}

function getGameData() {
  return applySupplementalGameData(JSON.parse(localStorage.getItem(`${KEY_PREFIX}game-data`) || "null") as GameData | null)
}
function setGameData(value: GameData) {
  localStorage.setItem(`${KEY_PREFIX}game-data`, JSON.stringify(applySupplementalGameData(value)))
}

function loadSecret() {
  return localStorage.getItem(`${KEY_PREFIX}secrete`) || ""
}
function saveSecret(value: string) {
  localStorage.setItem(`${KEY_PREFIX}secrete`, value)
}

function loadBuyStatus() {
  return PriceStatus.ASK
}
function loadSellStatus() {
  return PriceStatus.BID
}

export function useGameStoreOutside() {
  return useGameStore(pinia)
}
