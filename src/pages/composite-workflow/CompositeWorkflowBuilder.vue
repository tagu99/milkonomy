<script setup lang="ts">
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@/common/utils/format"
import { getActionDetailOf, getGameDataApi, getItemDetailOf, getPriceOf } from "@/common/apis/game"
import { getManualPriceOf } from "@/common/apis/price"
import { useMemory } from "@/common/composables/useMemory"
import { usePriceStatus } from "@/common/composables/usePriceStatus"
import { getTrans } from "@/locales"
import { COIN_HRID, PriceStatus } from "@/pinia/stores/game"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"
import { usePriceStore } from "@/pinia/stores/price"
import ActionDetailCard from "@/pages/dashboard/components/ActionDetailCard.vue"
import ActionConfig from "@/pages/dashboard/components/ActionConfig.vue"
import GameInfo from "@/pages/dashboard/components/GameInfo.vue"
import PriceStatusSelect from "@/pages/dashboard/components/PriceStatusSelect.vue"
import { ArrowDown, ArrowUp, Delete, Plus, RefreshRight } from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox } from "element-plus"
import { debounce } from "lodash-es"
import type { Action } from "~/game"

import {
  autoBalanceCompositeWorkflowWeights,
  buildCompositeWorkflowFromBuilderSteps,
  getFixedChainPreset,
  type CompositeWorkflowResult,
  type BuilderCalculatorClassName,
  type CompositeWorkflowBuilderStep
} from "./builder"
import { summarizeWorkflowItems } from "./discovery"

const { t } = useI18n()

const state = useMemory("composite-workflow-builder", {
  steps: [] as CompositeWorkflowBuilderStep[],
  target: {
    hrid: "",
    level: 0
  },
  targetPriority: 1
})

type WorkflowPresetSnapshot = {
  steps: CompositeWorkflowBuilderStep[]
  target: { hrid: string, level: number }
  targetPriority: number
}

type WorkflowPreset = { id: string, name: string, snapshot: WorkflowPresetSnapshot }
const presets = useMemory("composite-workflow-builder-presets", {
  list: [] as WorkflowPreset[],
  activeId: ""
})
const presetName = ref("")
const stepDetailVisible = ref(false)
const presetRankVisible = ref(false)
const presetRankLoading = ref(false)
const presetRankDetailVisible = ref(false)

type PriceSide = "L" | "R"
type WorkflowScenarioBreakdown = {
  costPH: number
  incomePH: number
  profitPD: number
  valid: boolean
}

type WorkflowPresetRankRow = {
  id: string
  name: string
  snapshot: WorkflowPresetSnapshot
  workflow: CompositeWorkflowResult
  breakdown_LL: WorkflowScenarioBreakdown
  breakdown_RL: WorkflowScenarioBreakdown
  breakdown_LR: WorkflowScenarioBreakdown
  breakdown_RR: WorkflowScenarioBreakdown
  available: boolean
  valid: boolean
  reason?: string
}

const presetRankData = ref<WorkflowPresetRankRow[]>([])
const presetRankDetailRow = shallowRef<WorkflowPresetRankRow>()

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const priceStore = usePriceStore()

const onPriceStatusChange = usePriceStatus("composite-workflow-price-status")

// migrate localStorage payloads from older versions
if (!Array.isArray(state.value.steps)) {
  state.value.steps = []
} else {
  state.value.steps = state.value.steps.filter((s: any) => s && typeof s === "object")
}
const ALLOWED_CLASS_NAMES = new Set([
  "DecomposeCalculator",
  "TransmuteCalculator",
  "CoinifyCalculator",
  "ManufactureCalculator"
])
state.value.steps = state.value.steps.filter((s: any) => ALLOWED_CLASS_NAMES.has(s.className))
if (!state.value.target || typeof state.value.target !== "object") {
  state.value.target = { hrid: "", level: 0 }
} else {
  state.value.target.hrid ||= ""
  state.value.target.level ||= 0
}
if (typeof state.value.targetPriority !== "number" || !Number.isFinite(state.value.targetPriority)) {
  state.value.targetPriority = 1
}
if (!presets.value || typeof presets.value !== "object") {
  presets.value = { list: [], activeId: "" }
}
if (!Array.isArray(presets.value.list)) {
  presets.value.list = []
}
if (typeof presets.value.activeId !== "string") {
  presets.value.activeId = ""
}

function normalizeSnapshot(input: any): WorkflowPresetSnapshot {
  const safeTarget = (target: any) => ({
    hrid: typeof target?.hrid === "string" ? target.hrid : "",
    level: Number.isFinite(target?.level) ? Math.max(0, Number(target.level)) : 0
  })

  const allowedClasses = new Set([
    "DecomposeCalculator",
    "TransmuteCalculator",
    "CoinifyCalculator",
    "ManufactureCalculator"
  ])
  const allowedActions = new Set<Action>(["crafting", "cheesesmithing", "tailoring", "cooking", "brewing"])

  const steps: CompositeWorkflowBuilderStep[] = Array.isArray(input?.steps)
    ? input.steps
        .filter((s: any) => s && typeof s === "object")
        .map((s: any) => {
          const className = allowedClasses.has(s.className) ? s.className : "ManufactureCalculator"
          const key = typeof s.key === "string" ? s.key : `step_${Date.now()}_${Math.random().toString(16).slice(2)}`
          const hrid = typeof s.hrid === "string" ? s.hrid : ""
          const weight = Number.isFinite(s.weight) ? Math.max(0, Number(s.weight)) : 1
          const action = allowedActions.has(s.action) ? s.action : "crafting"
          const catalystRank = Number.isFinite(s.catalystRank) ? Number(s.catalystRank) : 0
          const enhanceLevel = Number.isFinite(s.enhanceLevel) ? Number(s.enhanceLevel) : 0
          const originLevel = Number.isFinite(s.originLevel) ? Number(s.originLevel) : 0

          return {
            key,
            className,
            hrid,
            weight,
            action: className === "ManufactureCalculator" ? action : undefined,
            catalystRank: className !== "ManufactureCalculator" ? catalystRank : undefined,
            enhanceLevel: className === "DecomposeCalculator" ? enhanceLevel : undefined,
            originLevel: className === "ManufactureCalculator" ? originLevel : undefined
          } satisfies CompositeWorkflowBuilderStep
        })
    : []

  return {
    steps,
    target: safeTarget(input?.target),
    targetPriority: Number.isFinite(input?.targetPriority) ? Math.max(0, Number(input.targetPriority)) : 1
  }
}

presets.value.list = presets.value.list
  .filter((p: any) => p && typeof p === "object" && typeof p.id === "string" && typeof p.name === "string")
  .map((p: any) => ({ id: p.id, name: p.name, snapshot: normalizeSnapshot(p.snapshot) })) as WorkflowPreset[]

// de-duplicate by name (keep the first one)
{
  const seen = new Set<string>()
  presets.value.list = presets.value.list.filter((p: WorkflowPreset) => {
    if (seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })
}

function snapshotCurrent(): WorkflowPresetSnapshot {
  return normalizeSnapshot({
    steps: state.value.steps.map((s: CompositeWorkflowBuilderStep) => toRaw(s)),
    target: toRaw(state.value.target),
    targetPriority: state.value.targetPriority
  })
}

function applySnapshot(snapshot: WorkflowPresetSnapshot) {
  const normalized = normalizeSnapshot(snapshot)
  state.value.steps = normalized.steps
  state.value.target = normalized.target
  state.value.targetPriority = normalized.targetPriority ?? 1
}

function newPresetId() {
  return `preset_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function getActivePreset() {
  return presets.value.list.find((p: WorkflowPreset) => p.id === presets.value.activeId)
}

function findPresetByName(name: string) {
  return presets.value.list.find((p: WorkflowPreset) => p.name === name)
}

function suggestPresetName() {
  const index = presets.value.list.length + 1
  return t("{0}新预设", [index])
}

function savePreset() {
  const name = (presetName.value || "").trim() || suggestPresetName()
  const existing = findPresetByName(name)
  if (existing) {
    existing.snapshot = snapshotCurrent()
    presets.value.activeId = existing.id
    presets.value.list = [...presets.value.list]
    presetName.value = existing.name
    ElMessage.success(t("已保存预设"))
    return
  }
  const preset: WorkflowPreset = { id: newPresetId(), name, snapshot: snapshotCurrent() }
  presets.value.list.unshift(preset)
  presets.value.activeId = preset.id
  presetName.value = preset.name
  ElMessage.success(t("已保存预设"))
}

function deleteActivePreset() {
  const active = getActivePreset()
  if (!active) return
  ElMessageBox.confirm(t("确定删除该预设吗？"), t("预设"), {
    confirmButtonText: t("确定"),
    cancelButtonText: t("取消"),
    type: "warning"
  }).then(() => {
    presets.value.list = presets.value.list.filter((p: WorkflowPreset) => p.id !== active.id)
    if (presets.value.activeId === active.id) {
      presets.value.activeId = ""
    }
    if (!presets.value.activeId) {
      presetName.value = ""
    }
    ElMessage.success(t("已删除"))
  }).catch(() => {
    // canceled
  })
}

watch(() => presets.value.activeId, (id) => {
  const active = presets.value.list.find((p: WorkflowPreset) => p.id === id)
  if (!active) {
    presetName.value = ""
    return
  }
  presetName.value = active.name
  try {
    applySnapshot(active.snapshot)
  } catch (e) {
    console.error(e)
    ElMessage.error(t("无效的预设配置"))
  }
}, { immediate: true })

function openStepDetail() {
  stepDetailVisible.value = true
}

function newKey() {
  return `step_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function addStep() {
  state.value.steps.push({
    key: newKey(),
    className: "ManufactureCalculator",
    hrid: "",
    action: "crafting",
    weight: 1
  })
}

function deleteStep(index: number) {
  state.value.steps.splice(index, 1)
}

function moveStep(index: number, offset: -1 | 1) {
  const next = index + offset
  if (next < 0 || next >= state.value.steps.length) return
  const temp = state.value.steps[index]
  state.value.steps[index] = state.value.steps[next]
  state.value.steps[next] = temp
}

function loadFixedPreset() {
  state.value.steps = getFixedChainPreset().map((s: CompositeWorkflowBuilderStep) => ({ ...s, key: newKey() }))
}

function resetWeightsEvenly() {
  if (!state.value.steps.length) return
  state.value.steps.forEach((s: CompositeWorkflowBuilderStep) => { s.weight = 1 })
}

function autoBalance() {
  const target = state.value.target?.hrid
    ? { hrid: state.value.target.hrid, level: state.value.target.level || 0 }
    : undefined
  const res = autoBalanceCompositeWorkflowWeights(state.value.steps, { target, targetPriority: state.value.targetPriority })
  if (!res.ok || !res.shares) {
    ElMessage.warning(res.reason || t("无法配平"))
    return
  }
  res.shares.forEach((share, i) => {
    state.value.steps[i].weight = Number((share * 100).toFixed(6))
  })
  const residual = res.residual || 0
  const internalCount = res.internalKeys?.length || 0
  const msg = `${t("已自动配平")} (residual=${residual.toExponential(2)}, internal=${internalCount})`
  if (residual > 1e-6) {
    ElMessage.info(msg)
  } else {
    ElMessage.success(msg)
  }
}

function exportPreset() {
  const json = JSON.stringify(snapshotCurrent())
  navigator.clipboard.writeText(json).then(() => {
    ElMessage.success(t("已复制到剪贴板"))
  }).catch(() => {
    ElMessage.error(t("复制失败，请检查浏览器权限设置"))
  })
}

function importPreset() {
  ElMessageBox.prompt(t("请粘贴导出的预设 JSON"), t("导入"), {
    confirmButtonText: t("确定"),
    cancelButtonText: t("取消"),
    inputPattern: /^\s*\{.*\}\s*$/,
    inputErrorMessage: t("请输入正确的 JSON 格式")
  }).then(({ value }) => {
    const obj = JSON.parse(value)
    if (!obj || !Array.isArray(obj.steps)) {
      throw new Error("invalid")
    }
    applySnapshot({
      steps: obj.steps,
      target: obj.target || { hrid: "", level: 0 },
      targetPriority: typeof obj.targetPriority === "number" ? obj.targetPriority : 1
    })
    ElMessage.success(t("导入成功"))
  }).catch((e) => {
    if (e?.message === "invalid") {
      ElMessage.error(t("无效的预设配置"))
    }
  })
}

const CLASS_OPTIONS: Array<{ label: string, value: BuilderCalculatorClassName }> = [
  { label: t("分解"), value: "DecomposeCalculator" },
  { label: t("转化"), value: "TransmuteCalculator" },
  { label: t("点金"), value: "CoinifyCalculator" },
  { label: t("制作"), value: "ManufactureCalculator" }
]

const ACTION_OPTIONS: Array<{ label: string, value: Action }> = [
  { label: getTrans("crafting"), value: "crafting" },
  { label: getTrans("cheesesmithing"), value: "cheesesmithing" },
  { label: getTrans("tailoring"), value: "tailoring" },
  { label: getTrans("cooking"), value: "cooking" },
  { label: getTrans("brewing"), value: "brewing" }
]

function actionKeyOfHrid(hrid: string) {
  return hrid ? hrid.substring(hrid.lastIndexOf("/") + 1) : ""
}

function getManufactureActionDetail(step: CompositeWorkflowBuilderStep) {
  if (step.className !== "ManufactureCalculator") return undefined
  if (!step.hrid || !step.action) return undefined
  const key = actionKeyOfHrid(step.hrid)
  if (!key) return undefined
  return getActionDetailOf(`/actions/${step.action}/${key}`)
}

function detectManufactureAction(step: CompositeWorkflowBuilderStep) {
  if (step.className !== "ManufactureCalculator") return
  if (!step.hrid) return
  const key = actionKeyOfHrid(step.hrid)
  if (!key) return
  for (const opt of ACTION_OPTIONS) {
    const detail = getActionDetailOf(`/actions/${opt.value}/${key}`)
    if (detail) {
      step.action = opt.value
      return
    }
  }
}

function getAvailableManufactureActions(hrid: string) {
  const key = actionKeyOfHrid(hrid)
  if (!key) return []
  return ACTION_OPTIONS
    .filter(opt => !!getActionDetailOf(`/actions/${opt.value}/${key}`))
    .map(opt => opt.value)
}

function needsManufactureOriginLevel(step: CompositeWorkflowBuilderStep) {
  const detail = getManufactureActionDetail(step)
  return !!detail?.upgradeItemHrid
}

const itemLoading = ref(false)
const itemOptions = ref<Array<{ hrid: string, label: string }>>([])

type ItemIndexRow = { hrid: string, nameLower: string, hridLower: string, label: string }
const itemIndex = shallowRef<ItemIndexRow[]>([])
watch(() => gameStore.gameData, () => {
  try {
    const data = getGameDataApi()
    const rows: ItemIndexRow[] = []
    for (const hrid of Object.keys(data.itemDetailMap)) {
      const name = t(getItemDetailOf(hrid).name)
      rows.push({
        hrid,
        nameLower: name.toLowerCase(),
        hridLower: hrid.toLowerCase(),
        label: `${name} (${hrid})`
      })
    }
    itemIndex.value = rows
  } catch {
    itemIndex.value = []
  }
}, { immediate: true })

const searchItems = debounce((query: string) => {
  const q = (query || "").trim().toLowerCase()
  if (!q) {
    itemOptions.value = []
    return
  }
  itemLoading.value = true
  try {
    const list: Array<{ hrid: string, label: string }> = []
    for (const row of itemIndex.value) {
      if (row.nameLower.includes(q) || row.hridLower.includes(q)) {
        list.push({ hrid: row.hrid, label: row.label })
        if (list.length >= 200) break
      }
    }
    itemOptions.value = list
  } finally {
    itemLoading.value = false
  }
}, 120)

const workflow = shallowRef(buildCompositeWorkflowFromBuilderSteps(state.value.steps))
watch([
  () => state.value.steps,
  () => gameStore.marketData,
  () => gameStore.buyStatus,
  () => gameStore.sellStatus,
  () => playerStore.config,
  () => Array.from(priceStore.map.values()),
  () => priceStore.activated
], () => {
  workflow.value = buildCompositeWorkflowFromBuilderSteps(state.value.steps)
}, { immediate: true, deep: true })

function priceOfSide(hrid: string, level: number | undefined, side: PriceSide) {
  const type = side === "L" ? "ask" : "bid"
  const manual = getManualPriceOf(hrid, level || 0)?.[type]
  const v = manual?.manual
    ? manual.manualPrice
    : getPriceOf(hrid, level || 0, PriceStatus.ASK, PriceStatus.BID)[type]
  return typeof v === "number" && Number.isFinite(v) ? v : -1
}

function priceOfScenarioItem(item: { hrid: string, level?: number, price: number }, side: PriceSide) {
  // Workflow coin rows represent action fee/reward, not marketplace 1:1 coin pricing.
  if (item.hrid === COIN_HRID) {
    return item.price
  }
  return priceOfSide(item.hrid, item.level, side)
}

function computeWorkflowBreakdownBySide(
  res: ReturnType<typeof buildCompositeWorkflowFromBuilderSteps>,
  costSide: PriceSide,
  incomeSide: PriceSide
): WorkflowScenarioBreakdown {
  if (!res.available) {
    return {
      costPH: -1,
      incomePH: -1,
      profitPD: -1,
      valid: false
    }
  }

  // A scenario is considered invalid if any required price is missing under that side.
  for (const item of res.ingredientList) {
    if (priceOfScenarioItem(item, costSide) < 0) {
      return {
        costPH: -1,
        incomePH: -1,
        profitPD: -1,
        valid: false
      }
    }
  }
  for (const item of res.productList) {
    if (priceOfScenarioItem(item, incomeSide) < 0) {
      return {
        costPH: -1,
        incomePH: -1,
        profitPD: -1,
        valid: false
      }
    }
  }

  const costPH = res.ingredientList.reduce((acc, item) => acc + item.countPH * priceOfScenarioItem(item, costSide), 0)

  let incomePH = 0
  for (const product of res.productList) {
    const price = priceOfScenarioItem(product, incomeSide)
    const coinRate = product.hrid === COIN_HRID ? 0.98 : 1
    incomePH += product.countPH * price / coinRate
  }
  incomePH *= 0.98

  return {
    costPH,
    incomePH,
    profitPD: (incomePH - costPH) * 24,
    valid: true
  }
}

async function computePresetRank() {
  presetRankLoading.value = true
  try {
    const rows: WorkflowPresetRankRow[] = presets.value.list.map((p: WorkflowPreset) => {
      try {
        const snapshot = normalizeSnapshot(p.snapshot)
        const res = buildCompositeWorkflowFromBuilderSteps(snapshot.steps)
        const invalid = !res.available
        return {
          id: p.id,
          name: p.name,
          snapshot,
          workflow: res,
          breakdown_LL: invalid ? { costPH: -1, incomePH: -1, profitPD: -1, valid: false } : computeWorkflowBreakdownBySide(res, "L", "L"),
          breakdown_RL: invalid ? { costPH: -1, incomePH: -1, profitPD: -1, valid: false } : computeWorkflowBreakdownBySide(res, "R", "L"),
          breakdown_LR: invalid ? { costPH: -1, incomePH: -1, profitPD: -1, valid: false } : computeWorkflowBreakdownBySide(res, "L", "R"),
          breakdown_RR: invalid ? { costPH: -1, incomePH: -1, profitPD: -1, valid: false } : computeWorkflowBreakdownBySide(res, "R", "R"),
          available: res.available,
          valid: res.valid,
          reason: invalid || !res.valid ? res.reason : undefined
        }
      } catch (e: any) {
        return {
          id: p.id,
          name: p.name,
          snapshot: normalizeSnapshot(undefined),
          workflow: buildCompositeWorkflowFromBuilderSteps([]),
          breakdown_LL: { costPH: -1, incomePH: -1, profitPD: -1, valid: false },
          breakdown_RL: { costPH: -1, incomePH: -1, profitPD: -1, valid: false },
          breakdown_LR: { costPH: -1, incomePH: -1, profitPD: -1, valid: false },
          breakdown_RR: { costPH: -1, incomePH: -1, profitPD: -1, valid: false },
          available: false,
          valid: false,
          reason: e?.message || "error"
        }
      }
    })
    rows.sort((a, b) => {
      // Default sort by the conservative/common scenario: buy at left(ask) and sell at right(bid).
      if (b.breakdown_LR.profitPD !== a.breakdown_LR.profitPD) return b.breakdown_LR.profitPD - a.breakdown_LR.profitPD
      return a.name.localeCompare(b.name)
    })
    presetRankData.value = rows
  } finally {
    presetRankLoading.value = false
  }
}

async function openPresetRank() {
  presetRankVisible.value = true
  await computePresetRank()
}

function copyPresetSnapshot(snapshot: WorkflowPresetSnapshot) {
  const json = JSON.stringify(snapshot)
  navigator.clipboard.writeText(json).then(() => {
    ElMessage.success(t("已复制到剪贴板"))
  }).catch(() => {
    ElMessage.error(t("复制失败，请检查浏览器剪贴板权限"))
  })
}

function openPresetRankDetail(row: WorkflowPresetRankRow) {
  presetRankDetailRow.value = row
  presetRankDetailVisible.value = true
}

function loadPresetFromRank(row: WorkflowPresetRankRow) {
  gameStore.buyStatus = PriceStatus.ASK
  gameStore.sellStatus = PriceStatus.BID
  onPriceStatusChange()
  presets.value.activeId = row.id
  applySnapshot(row.snapshot)
  workflow.value = buildCompositeWorkflowFromBuilderSteps(row.snapshot.steps)
  presetName.value = row.name
  presetRankDetailVisible.value = false
  presetRankVisible.value = false
}

const currentWorkflowLRBreakdown = computed(() => computeWorkflowBreakdownBySide(workflow.value, "L", "R"))

function currentMatchesPreset(row: WorkflowPresetRankRow) {
  return JSON.stringify(snapshotCurrent()) === JSON.stringify(normalizeSnapshot(row.snapshot))
}
</script>

<template>
  <div class="app-container composite-workflow-builder">
    <el-space direction="vertical" fill :size="16" style="width: 100%">
      <div class="game-info">
        <GameInfo />
        <div>
          <ActionConfig />
        </div>
        <PriceStatusSelect @change="onPriceStatusChange" />
      </div>

      <el-alert
        :title="t('可在前端自由组合步骤，并按你设置的时间占比计算净消耗、净产出与收益。')"
        type="info"
        :closable="false"
      />

      <el-card shadow="never">
        <template #header>
          <div class="builder-header">
            <div class="section-title">
              {{ t("控制") }}
            </div>
          </div>
        </template>

        <el-space wrap :size="10">
          <div class="target-row">
            <div class="target-label">{{ t("预设") }}</div>
            <el-select
              v-model="presets.activeId"
              clearable
              filterable
              style="width: 220px"
              :placeholder="t('预设')"
            >
              <el-option v-for="p in presets.list" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <el-input v-model="presetName" style="width: 200px" :placeholder="t('预设名称')" />
            <el-button @click="savePreset">
              {{ t("保存") }}
            </el-button>
            <el-button type="danger" :disabled="!presets.activeId" @click="deleteActivePreset">
              {{ t("删除") }}
            </el-button>
            <el-button @click="exportPreset">
              {{ t("导出") }}
            </el-button>
            <el-button @click="importPreset">
              {{ t("导入") }}
            </el-button>
          </div>

          <div class="target-row">
            <div class="target-label">{{ t("最终产物") }}</div>
            <el-select
              v-model="state.target.hrid"
              filterable
              remote
              clearable
              :remote-method="searchItems"
              :loading="itemLoading"
              style="width: 320px"
              :placeholder="t('输入名称或 hrid 搜索')"
            >
              <el-option
                v-for="opt in itemOptions"
                :key="opt.hrid"
                :label="opt.label"
                :value="opt.hrid"
              />
            </el-select>
            <el-tooltip placement="top" effect="light">
              <template #content>
                {{ t("目标物品等级（+N）。用于自动配平时区分同一物品的不同等级。") }}
              </template>
              <el-input-number v-model="state.target.level" :min="0" :max="20" :controls="false" style="width: 90px" />
            </el-tooltip>
            <el-tooltip placement="top" effect="light">
              <template #content>
                {{ t("最终产物优先级：越大越偏向提升最终产物净产出，可能牺牲部分内部配平。设为 0 则只配平中间物料。") }}
              </template>
              <el-input-number v-model="state.targetPriority" :min="0" :max="5" :step="0.5" :controls="false" style="width: 90px" />
            </el-tooltip>
            <el-button type="success" @click="autoBalance">
              {{ t("自动配平") }}
            </el-button>
            <el-button :icon="RefreshRight" @click="resetWeightsEvenly">
              {{ t("平均分配") }}
            </el-button>
            <el-button @click="loadFixedPreset">
              {{ t("加载固定链路") }}
            </el-button>
            <el-button @click="openStepDetail">
              {{ t("步骤详情") }}
            </el-button>
            <el-button @click="openPresetRank">
              {{ t("预设排行") }}
            </el-button>
          </div>
        </el-space>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="builder-header">
            <div class="section-title">
              {{ t("步骤配置") }}
            </div>
            <div class="builder-actions">
              <el-button :icon="Plus" type="primary" @click="addStep">
                {{ t("添加步骤") }}
              </el-button>
            </div>
          </div>
        </template>

        <el-table :data="state.steps" size="small" style="width: 100%">
          <el-table-column width="70" :label="t('顺序')" align="center">
            <template #default="{ $index }">
              <el-button-group>
                <el-button :icon="ArrowUp" text @click="moveStep($index, -1)" />
                <el-button :icon="ArrowDown" text @click="moveStep($index, 1)" />
              </el-button-group>
            </template>
          </el-table-column>

          <el-table-column width="160" :label="t('类型')">
            <template #default="{ row }">
              <el-select v-model="row.className" style="width: 140px">
                <el-option v-for="opt in CLASS_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
            </template>
          </el-table-column>

          <el-table-column min-width="320" :label="t('物品')">
            <template #default="{ row }">
              <div class="item-cell">
                <ItemIcon v-if="row.hrid" :hrid="row.hrid" />
                <el-select
                  v-model="row.hrid"
                  filterable
                  remote
                  :remote-method="searchItems"
                  :loading="itemLoading"
                  style="width: 100%"
                  @change="() => row.className === 'ManufactureCalculator' && detectManufactureAction(row)"
                  :placeholder="t('输入名称或 hrid 搜索')"
                >
                  <el-option
                    v-for="opt in itemOptions"
                    :key="opt.hrid"
                    :label="opt.label"
                    :value="opt.hrid"
                  />
                </el-select>
              </div>
            </template>
          </el-table-column>

          <el-table-column min-width="260" :label="t('参数')">
            <template #default="{ row }">
              <el-space wrap :size="8">
                <template v-if="row.className === 'ManufactureCalculator'">
                  <el-select v-model="row.action" style="width: 150px" :disabled="row.hrid && getAvailableManufactureActions(row.hrid).length <= 1">
                    <el-option
                      v-for="opt in ACTION_OPTIONS"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                      :disabled="row.hrid && !getAvailableManufactureActions(row.hrid).includes(opt.value)"
                    />
                  </el-select>
                  <el-tooltip v-if="needsManufactureOriginLevel(row)" placement="top" effect="light">
                    <template #content>
                      {{ t("当该制作是继承/升级链路时，表示输入物品的等级（影响成本与产出等级）；非继承制作可忽略。") }}
                    </template>
                    <el-input-number v-model="row.originLevel" :min="0" :max="20" :controls="false" style="width: 100px" />
                  </el-tooltip>
                </template>

                <template v-else>
                  <el-select v-model="row.catalystRank" clearable style="width: 130px" :placeholder="t('催化剂')">
                    <el-option :label="t('无')" :value="0" />
                    <el-option :label="t('普通')" :value="1" />
                    <el-option :label="t('主要')" :value="2" />
                  </el-select>
                  <el-input-number
                    v-if="row.className === 'DecomposeCalculator'"
                    v-model="row.enhanceLevel"
                    :min="0"
                    :max="20"
                    :controls="false"
                    style="width: 100px"
                  />
                </template>
              </el-space>
            </template>
          </el-table-column>

          <el-table-column width="140" :label="t('占比(权重)')" align="center">
            <template #default="{ row }">
              <el-input-number v-model="row.weight" :min="0" :max="1000" :controls="false" style="width: 110px" />
            </template>
          </el-table-column>

          <el-table-column width="70" :label="t('操作')" align="center">
            <template #default="{ $index }">
              <el-button :icon="Delete" text type="danger" @click="deleteStep($index)" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <template v-if="workflow.available">
        <el-alert
          v-if="!workflow.valid"
          :title="t('存在未定价物品，当前收益结果仅供参考。')"
          type="error"
          :closable="false"
        />

        <el-row :gutter="16" class="summary-row">
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">{{ t("净成本 / h") }}</div>
              <div class="summary-value">{{ Format.money(workflow.costPH) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">{{ t("净收入 / h") }}</div>
              <div class="summary-value">{{ Format.money(workflow.incomePH) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">{{ t("净收益 / h") }}</div>
              <div class="summary-value" :class="workflow.profitPH >= 0 ? 'positive' : 'negative'">
                {{ Format.money(workflow.profitPH) }}
              </div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">{{ t("净收益 / 天") }}</div>
              <div class="summary-value" :class="workflow.profitPD >= 0 ? 'positive' : 'negative'">
                {{ Format.money(workflow.profitPD) }}
              </div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">{{ t("利润率") }}</div>
              <div class="summary-value">{{ Format.percent(workflow.profitRate) }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="8" :lg="4">
            <el-card shadow="hover" class="summary-card">
              <div class="summary-label">{{ t("总经验 / h") }}</div>
              <div class="summary-value">{{ Format.money(workflow.expPH) }}</div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :lg="12">
            <el-card shadow="never" class="net-card">
              <template #header>
                <div class="section-title">{{ t("净消耗") }}</div>
              </template>
              <el-table :data="workflow.ingredientList" size="small">
                <el-table-column width="54">
                  <template #default="{ row }">
                    <ItemIcon :hrid="row.hrid" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('物品')">
                  <template #default="{ row }">
                    {{ t(getItemDetailOf(row.hrid).name) }}
                    <template v-if="row.level">
                      +{{ row.level }}
                    </template>
                  </template>
                </el-table-column>
                <el-table-column :label="t('数量 / h')" align="right">
                  <template #default="{ row }">
                    {{ Format.number(row.countPH, 3) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('单价/等效单价')" align="right">
                  <template #default="{ row }">
                    {{ Format.price(row.price) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('估值 / h')" align="right">
                  <template #default="{ row }">
                    {{ Format.money(row.totalPH) }}
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-card shadow="never" class="net-card">
              <template #header>
                <div class="section-title">{{ t("净产出") }}</div>
              </template>
              <el-table :data="workflow.productList" size="small">
                <el-table-column width="54">
                  <template #default="{ row }">
                    <ItemIcon :hrid="row.hrid" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('物品')">
                  <template #default="{ row }">
                    {{ t(getItemDetailOf(row.hrid).name) }}
                    <template v-if="row.level">
                      +{{ row.level }}
                    </template>
                  </template>
                </el-table-column>
                <el-table-column :label="t('数量 / h')" align="right">
                  <template #default="{ row }">
                    {{ Format.number(row.countPH, 3) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('单价/等效单价')" align="right">
                  <template #default="{ row }">
                    {{ Format.price(row.price) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('估值 / h')" align="right">
                  <template #default="{ row }">
                    {{ Format.money(row.totalPH) }}
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>

      </template>

      <el-empty v-else :description="workflow.reason || t('当前无法计算')" />
    </el-space>

    <el-drawer v-model="stepDetailVisible" :title="t('步骤详情')" size="80%">
      <el-space direction="vertical" fill :size="12" style="width: 100%">
        <el-card
          v-for="step in workflow.steps"
          :key="step.key"
          shadow="never"
          class="step-card"
        >
          <template #header>
            <div class="step-header">
              <span>{{ step.label }}</span>
              <span>{{ Format.percent(step.share) }}</span>
            </div>
          </template>
          <el-row :gutter="12" align="middle">
            <el-col :xs="24" :lg="10">
              <ActionDetailCard :data="step.calculator" type="ingredient" :work-multiplier="step.share" />
            </el-col>
            <el-col :xs="24" :lg="4">
              <div class="step-meta">
                <div>{{ step.calculator.project }}</div>
                <div>{{ t("要求等级") }}: {{ step.calculator.actionLevel }}</div>
                <div>{{ t("时间占比") }}: {{ Format.percent(step.share) }}</div>
                <div>{{ t("经验 / h") }}: {{ Format.money(step.calculator.result.expPH * step.share) }}</div>
              </div>
            </el-col>
            <el-col :xs="24" :lg="10">
              <ActionDetailCard :data="step.calculator" type="product" :work-multiplier="step.share" />
            </el-col>
          </el-row>
        </el-card>
        <el-empty v-if="!workflow.steps.length" :description="t('暂无步骤')" />
      </el-space>
    </el-drawer>

    <el-drawer v-model="presetRankVisible" :title="t('预设排行')" size="70%">
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
        <el-button :loading="presetRankLoading" @click="computePresetRank">
          {{ t("刷新") }}
        </el-button>
        <div style="color: #909399; font-size: 13px;">
          {{ t("失效预设利润视为 -1") }} · {{ t("左价=Ask，右价=Bid") }}
        </div>
      </div>
      <el-table :data="presetRankData" v-loading="presetRankLoading" size="small" style="width: 100%">
        <el-table-column type="index" width="54" />
        <el-table-column prop="name" :label="t('预设')" min-width="180" />
        <el-table-column :label="t('净产出摘要')" min-width="220">
          <template #default="{ row }">
            {{ summarizeWorkflowItems(row.workflow.productList) || "-" }}
          </template>
        </el-table-column>
        <el-table-column :label="t('净消耗摘要')" min-width="220">
          <template #default="{ row }">
            {{ summarizeWorkflowItems(row.workflow.ingredientList) || "-" }}
          </template>
        </el-table-column>
        <el-table-column :label="t('日利(左买左卖)')" width="160" align="right">
          <template #default="{ row }">
            <span :class="row.breakdown_LL.profitPD < 0 ? 'negative' : 'positive'">
              {{ row.breakdown_LL.profitPD < 0 ? -1 : Format.money(row.breakdown_LL.profitPD) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('日利(左买右卖)')" width="160" align="right">
          <template #default="{ row }">
            <span :class="row.breakdown_LR.profitPD < 0 ? 'negative' : 'positive'">
              {{ row.breakdown_LR.profitPD < 0 ? -1 : Format.money(row.breakdown_LR.profitPD) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('日利(右买右卖)')" width="160" align="right">
          <template #default="{ row }">
            <span :class="row.breakdown_RR.profitPD < 0 ? 'negative' : 'positive'">
              {{ row.breakdown_RR.profitPD < 0 ? -1 : Format.money(row.breakdown_RR.profitPD) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('日利(右买左卖)')" width="160" align="right">
          <template #default="{ row }">
            <span :class="row.breakdown_RL.profitPD < 0 ? 'negative' : 'positive'">
              {{ row.breakdown_RL.profitPD < 0 ? -1 : Format.money(row.breakdown_RL.profitPD) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" :label="t('原因')" min-width="220" />
        <el-table-column :label="t('操作')" width="150" align="center">
          <template #default="{ row }">
            <el-space>
              <el-button link type="primary" @click="openPresetRankDetail(row)">
                {{ t("详情") }}
              </el-button>
              <el-button link type="success" @click="loadPresetFromRank(row)">
                {{ t("加载") }}
              </el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <el-drawer v-model="presetRankDetailVisible" :title="t('预设详情')" size="80%">
      <template v-if="presetRankDetailRow">
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <el-card shadow="never">
            <div class="detail-summary">
              <div>
                <div class="control-label">{{ t("当前净收益 / 天") }}</div>
                <div class="summary-value" :class="presetRankDetailRow.workflow.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(presetRankDetailRow.workflow.profitPD) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("左买右卖 / 天") }}</div>
                <div class="summary-value" :class="presetRankDetailRow.breakdown_LR.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(presetRankDetailRow.breakdown_LR.profitPD) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("净收益 / h") }}</div>
                <div class="summary-value" :class="presetRankDetailRow.workflow.profitPH >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(presetRankDetailRow.workflow.profitPH) }}
                </div>
              </div>
              <div>
                <el-space>
                  <el-button type="primary" @click="loadPresetFromRank(presetRankDetailRow)">
                    {{ t("加载") }}
                  </el-button>
                  <el-button type="success" @click="copyPresetSnapshot(presetRankDetailRow.snapshot)">
                    {{ t("复制 JSON") }}
                  </el-button>
                </el-space>
              </div>
            </div>
          </el-card>

          <el-card v-if="currentMatchesPreset(presetRankDetailRow)" shadow="never">
            <template #header>
              <div class="section-title">{{ t("当前对照") }}</div>
            </template>
            <div class="detail-summary">
              <div>
                <div class="control-label">{{ t("预设排行(左买右卖)") }}</div>
                <div class="summary-value" :class="presetRankDetailRow.breakdown_LR.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(presetRankDetailRow.breakdown_LR.profitPD) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("当前面板(左买右卖)") }}</div>
                <div class="summary-value" :class="currentWorkflowLRBreakdown.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(currentWorkflowLRBreakdown.profitPD) }}
                </div>
              </div>
              <div>
                <div class="control-label">{{ t("差值") }}</div>
                <div class="summary-value" :class="currentWorkflowLRBreakdown.profitPD - presetRankDetailRow.breakdown_LR.profitPD >= 0 ? 'positive' : 'negative'">
                  {{ Format.money(currentWorkflowLRBreakdown.profitPD - presetRankDetailRow.breakdown_LR.profitPD) }}
                </div>
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">{{ t("场景估值") }}</div>
            </template>
            <el-table
              :data="[
                { label: t('左买左卖'), breakdown: presetRankDetailRow.breakdown_LL },
                { label: t('左买右卖'), breakdown: presetRankDetailRow.breakdown_LR },
                { label: t('右买右卖'), breakdown: presetRankDetailRow.breakdown_RR },
                { label: t('右买左卖'), breakdown: presetRankDetailRow.breakdown_RL }
              ]"
              size="small"
            >
              <el-table-column prop="label" :label="t('场景')" width="120" />
              <el-table-column :label="t('净成本 / h')" align="right">
                <template #default="{ row }">
                  {{ row.breakdown.valid ? Format.money(row.breakdown.costPH) : -1 }}
                </template>
              </el-table-column>
              <el-table-column :label="t('净收入 / h')" align="right">
                <template #default="{ row }">
                  {{ row.breakdown.valid ? Format.money(row.breakdown.incomePH) : -1 }}
                </template>
              </el-table-column>
              <el-table-column :label="t('净收益 / 天')" align="right">
                <template #default="{ row }">
                  <span :class="row.breakdown.profitPD < 0 ? 'negative' : 'positive'">
                    {{ row.breakdown.valid ? Format.money(row.breakdown.profitPD) : -1 }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="section-title">{{ t("步骤") }}</div>
            </template>
            <div class="step-list">
              <el-tag
                v-for="step in presetRankDetailRow.workflow.steps"
                :key="step.key"
                effect="plain"
                type="info"
                size="large"
              >
                {{ step.label }} 路 {{ Format.percent(step.share) }}
              </el-tag>
            </div>
          </el-card>

          <el-row :gutter="12">
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">{{ t("净消耗") }}</div>
                </template>
                <el-table :data="presetRankDetailRow.workflow.ingredientList" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('物品')">
                    <template #default="{ row }">
                      {{ t(getItemDetailOf(row.hrid).name) }}
                      <template v-if="row.level">
                        +{{ row.level }}
                      </template>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('数量 / h')" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.countPH, 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('单价/等效单价')" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.price(row.price) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('估值 / h')" width="130" align="right">
                    <template #default="{ row }">
                      {{ Format.money(row.totalPH) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-card shadow="never">
                <template #header>
                  <div class="section-title">{{ t("净产出") }}</div>
                </template>
                <el-table :data="presetRankDetailRow.workflow.productList" size="small">
                  <el-table-column width="54">
                    <template #default="{ row }">
                      <ItemIcon :hrid="row.hrid" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('物品')">
                    <template #default="{ row }">
                      {{ t(getItemDetailOf(row.hrid).name) }}
                      <template v-if="row.level">
                        +{{ row.level }}
                      </template>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('数量 / h')" width="120" align="right">
                    <template #default="{ row }">
                      {{ Format.number(row.countPH, 3) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('单价/等效单价')" width="110" align="right">
                    <template #default="{ row }">
                      {{ Format.price(row.price) }}
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('估值 / h')" width="130" align="right">
                    <template #default="{ row }">
                      {{ Format.money(row.totalPH) }}
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
          </el-row>
        </el-space>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.composite-workflow-builder {
  .game-info {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: center;
  }

  .builder-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .builder-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .target-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-right: 8px;
  }

  .target-label {
    color: #606266;
    font-size: 13px;
    white-space: nowrap;
  }

  .item-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .summary-row {
    margin: 0;
  }

  .summary-card {
    height: 100%;
  }

  .summary-label {
    color: #606266;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .summary-value {
    font-size: 18px;
    font-weight: 600;
  }

  .positive {
    color: #67c23a;
  }

  .negative {
    color: #f56c6c;
  }

  .section-title {
    font-weight: 600;
  }

  .step-header {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
  }

  .step-meta {
    color: #606266;
    font-size: 13px;
    line-height: 1.6;
  }
}
</style>




