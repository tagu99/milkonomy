import type { AlchemyDetail, ConsumableDetail, EquipmentDetail, GameData, ItemDetail } from "~/game"

const EMPTY_ALCHEMY_DETAIL: AlchemyDetail = {
  bulkMultiplier: 1,
  isCoinifiable: false,
  decomposeItems: [],
  transmuteSuccessRate: 0,
  transmuteDropTable: []
}

const EMPTY_CONSUMABLE_DETAIL: ConsumableDetail = {
  cooldownDuration: 0,
  usableInActionTypeMap: {} as ConsumableDetail["usableInActionTypeMap"],
  hitpointRestore: 0,
  manapointRestore: 0,
  recoveryDuration: 0,
  buffs: [],
  defaultCombatTriggers: []
}

function createItem(
  hrid: string,
  name: string,
  categoryHrid: string,
  itemLevel: number,
  sortIndex: number
): ItemDetail {
  return {
    hrid,
    name,
    categoryHrid,
    sellPrice: 0,
    isTradable: true,
    itemLevel,
    alchemyDetail: { ...EMPTY_ALCHEMY_DETAIL },
    consumableDetail: {
      ...EMPTY_CONSUMABLE_DETAIL,
      usableInActionTypeMap: {} as ConsumableDetail["usableInActionTypeMap"]
    },
    sortIndex
  }
}

function createFeetEquipment(
  hrid: string,
  name: string,
  itemLevel: number,
  sortIndex: number
): ItemDetail {
  return {
    ...createItem(hrid, name, "/item_categories/equipment", itemLevel, sortIndex),
    equipmentDetail: {
      type: "/equipment_types/feet",
      levelRequirements: [],
      combatStats: {},
      noncombatStats: {},
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: {}
    } as EquipmentDetail
  }
}

const SUPPLEMENTAL_ITEMS_LIST: ItemDetail[] = [
  createItem("/items/basic_beacon", "Basic Beacon", "/item_categories/resource", 110, 100000),
  createItem("/items/basic_coffee_crate", "Basic Coffee Crate", "/item_categories/resource", 110, 100001),
  createItem("/items/basic_food_crate", "Basic Food Crate", "/item_categories/resource", 110, 100002),
  createItem("/items/basic_shroud", "Basic Shroud", "/item_categories/resource", 110, 100003),
  createItem("/items/basic_tea_crate", "Basic Tea Crate", "/item_categories/resource", 110, 100004),
  createItem("/items/basic_torch", "Basic Torch", "/item_categories/resource", 110, 100005),
  createItem("/items/advanced_beacon", "Advanced Beacon", "/item_categories/resource", 120, 100006),
  createItem("/items/advanced_coffee_crate", "Advanced Coffee Crate", "/item_categories/resource", 120, 100007),
  createItem("/items/advanced_food_crate", "Advanced Food Crate", "/item_categories/resource", 120, 100008),
  createItem("/items/advanced_shroud", "Advanced Shroud", "/item_categories/resource", 120, 100009),
  createItem("/items/advanced_tea_crate", "Advanced Tea Crate", "/item_categories/resource", 120, 100010),
  createItem("/items/advanced_torch", "Advanced Torch", "/item_categories/resource", 120, 100011),
  createItem("/items/expert_beacon", "Expert Beacon", "/item_categories/resource", 130, 100012),
  createItem("/items/expert_coffee_crate", "Expert Coffee Crate", "/item_categories/resource", 130, 100013),
  createItem("/items/expert_food_crate", "Expert Food Crate", "/item_categories/resource", 130, 100014),
  createItem("/items/expert_shroud", "Expert Shroud", "/item_categories/resource", 130, 100015),
  createItem("/items/expert_tea_crate", "Expert Tea Crate", "/item_categories/resource", 130, 100016),
  createItem("/items/expert_torch", "Expert Torch", "/item_categories/resource", 130, 100017),
  createItem("/items/labyrinth_essence", "Labyrinth Essence", "/item_categories/resource", 130, 100018),
  (() => {
    // Match Pirate Refinement Shard behavior; output is Labyrinth Essence instead of Pirate Essence.
    const item = createItem("/items/labyrinth_refinement_shard", "Labyrinth Refinement Shard", "/item_categories/resource", 95, 100019)
    item.sellPrice = 200000
    item.alchemyDetail = {
      bulkMultiplier: 1,
      isCoinifiable: true,
      decomposeItems: [
        {
          itemHrid: "/items/labyrinth_essence",
          count: 2000
        }
      ],
      transmuteSuccessRate: 0,
      transmuteDropTable: []
    }
    return item
  })(),
  createFeetEquipment("/items/pathbreaker_boots", "Pathbreaker Boots", 130, 100020),
  createFeetEquipment("/items/pathbreaker_boots_refined", "Pathbreaker Boots (R)", 140, 100021),
  createItem("/items/pathbreaker_lodestone", "Pathbreaker Lodestone", "/item_categories/resource", 130, 100022),
  createFeetEquipment("/items/pathfinder_boots", "Pathfinder Boots", 130, 100023),
  createFeetEquipment("/items/pathfinder_boots_refined", "Pathfinder Boots (R)", 140, 100024),
  createItem("/items/pathfinder_lodestone", "Pathfinder Lodestone", "/item_categories/resource", 130, 100025),
  createFeetEquipment("/items/pathseeker_boots", "Pathseeker Boots", 130, 100026),
  createFeetEquipment("/items/pathseeker_boots_refined", "Pathseeker Boots (R)", 140, 100027),
  createItem("/items/pathseeker_lodestone", "Pathseeker Lodestone", "/item_categories/resource", 130, 100028),
  createItem("/items/philosophers_mirror", "Philosopher's Mirror", "/item_categories/resource", 135, 100029)
]

const SUPPLEMENTAL_ITEMS = Object.fromEntries(
  SUPPLEMENTAL_ITEMS_LIST.map(item => [item.hrid, item])
) as Record<string, ItemDetail>

export const SUPPLEMENTAL_ITEM_ICON_FALLBACKS: Record<string, string> = {
  "/items/basic_beacon": "watchful_relic",
  "/items/basic_coffee_crate": "small_artisans_crate",
  "/items/basic_food_crate": "small_artisans_crate",
  "/items/basic_shroud": "sinister_cape",
  "/items/basic_tea_crate": "small_artisans_crate",
  "/items/basic_torch": "flaming_cloth",
  "/items/advanced_beacon": "watchful_relic",
  "/items/advanced_coffee_crate": "medium_artisans_crate",
  "/items/advanced_food_crate": "medium_artisans_crate",
  "/items/advanced_shroud": "sinister_cape",
  "/items/advanced_tea_crate": "medium_artisans_crate",
  "/items/advanced_torch": "flaming_cloth",
  "/items/expert_beacon": "watchful_relic",
  "/items/expert_coffee_crate": "large_artisans_crate",
  "/items/expert_food_crate": "large_artisans_crate",
  "/items/expert_shroud": "sinister_cape",
  "/items/expert_tea_crate": "large_artisans_crate",
  "/items/expert_torch": "flaming_cloth",
  "/items/labyrinth_essence": "chimerical_essence",
  "/items/labyrinth_refinement_shard": "chimerical_refinement_shard",
  "/items/pathbreaker_boots": "collectors_boots",
  "/items/pathbreaker_boots_refined": "collectors_boots",
  "/items/pathbreaker_lodestone": "magnet",
  "/items/pathfinder_boots": "collectors_boots",
  "/items/pathfinder_boots_refined": "collectors_boots",
  "/items/pathfinder_lodestone": "magnet",
  "/items/pathseeker_boots": "collectors_boots",
  "/items/pathseeker_boots_refined": "collectors_boots",
  "/items/pathseeker_lodestone": "magnet",
  "/items/philosophers_mirror": "mirror_of_protection"
}

export function applySupplementalGameData(gameData: GameData | null) {
  if (!gameData) {
    return gameData
  }

  let nextItemDetailMap = gameData.itemDetailMap
  let changed = false

  for (const [hrid, item] of Object.entries(SUPPLEMENTAL_ITEMS)) {
    if (!nextItemDetailMap[hrid]) {
      if (!changed) {
        nextItemDetailMap = { ...gameData.itemDetailMap }
        changed = true
      }
      nextItemDetailMap[hrid] = item
    }
  }

  return changed
    ? {
        ...gameData,
        itemDetailMap: nextItemDetailMap
      }
    : gameData
}
