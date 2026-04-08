import type { RouteRecordRaw } from "vue-router"
import locale from "@/locales"

const Layouts = () => import("@/layouts/index.vue")
const { t } = locale.global

/**
 * Public routes.
 * These routes are included in the public build.
 */
export const publicRoutes: RouteRecordRaw[] = [
  {
    path: "/redirect",
    component: Layouts,
    meta: { hidden: true },
    children: [
      { path: ":path(.*)", component: () => import("@/pages/redirect/index.vue") }
    ]
  },
  { path: "/403", component: () => import("@/pages/error/403.vue"), meta: { hidden: true } },
  { path: "/404", component: () => import("@/pages/error/404.vue"), meta: { hidden: true }, alias: "/:pathMatch(.*)*" },
  {
    path: "/",
    component: Layouts,
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        component: () => import("@/pages/dashboard/index.vue"),
        name: "Dashboard",
        meta: { title: t("\u9996\u9875"), svgIcon: "dashboard", affix: true }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/composite-workflow",
    meta: { title: t("\u590d\u5408\u5de5\u4f5c\u6d41"), elIcon: "Connection" },
    children: [
      {
        path: "composite-workflow",
        component: () => import("@/pages/composite-workflow/index.vue"),
        name: "CompositeWorkflow",
        meta: { title: t("\u590d\u5408\u5de5\u4f5c\u6d41"), elIcon: "Connection", affix: false }
      },
      {
        path: "workflow-designer",
        component: () => import("@/pages/composite-workflow/designer.vue"),
        name: "WorkflowDesigner",
        meta: { title: t("\u5de5\u4f5c\u6d41\u8bbe\u8ba1"), elIcon: "Connection", affix: false }
      },
      {
        path: "cycle-workflow",
        component: () => import("@/pages/composite-workflow/cycle.vue"),
        name: "CycleWorkflow",
        meta: { title: t("\u5faa\u73af\u5de5\u4f5c\u6d41"), elIcon: "Connection", affix: false }
      },
      {
        path: "train-workflow",
        component: () => import("@/pages/composite-workflow/train.vue"),
        name: "TrainWorkflow",
        meta: { title: t("\u706b\u8f66\u5de5\u4f5c\u6d41"), elIcon: "Connection", affix: false }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/enhancer",
    children: [
      {
        path: "enhancer",
        component: () => import("@/pages/enhancer/index.vue"),
        name: "Enhancer",
        meta: { title: t("\u5f3a\u5316\u8ba1\u7b97"), elIcon: "MagicStick", affix: true }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/enhanposer",
    children: [
      {
        path: "enhanposer",
        component: () => import("@/pages/enhanposer/index.vue"),
        name: "Enhanposer",
        meta: { title: t("\u5f3a\u5316\u5206\u89e3"), affix: false, svgIcon: "dashboard" }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/valhalla",
    children: [
      {
        path: "valhalla",
        component: () => import("@/pages/valhalla/index.vue"),
        name: "Valhalla",
        meta: { title: t("\u82f1\u7075\u6bbf"), elIcon: "User", affix: false }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/burial",
    children: [
      {
        path: "burial",
        component: () => import("@/pages/burial/index.vue"),
        name: "Burial",
        meta: { title: t("\u57cb\u9aa8\u5730"), elIcon: "User", affix: false }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/sponsor",
    children: [
      {
        path: "sponsor",
        component: () => import("@/pages/sponsor/index.vue"),
        name: "Sponsor",
        meta: { title: t("\u6253\u8d4f"), elIcon: "Coin", affix: true }
      }
    ]
  },
  {
    path: "/link",
    meta: { title: t("\u76f8\u5173\u94fe\u63a5"), elIcon: "Link" },
    children: [
      { path: "https://github.com/luyh7/milkonomy", component: () => {}, name: "Link0", meta: { title: "Milkonomy Source Code" } },
      { path: "https://www.milkywayidle.com/", component: () => {}, name: "Link1", meta: { title: "Milky Way Idle" } },
      { path: "https://test-ctmd6jnzo6t9.feishu.cn/docx/KG9ddER6Eo2uPoxJFkicsvbEnCe", component: () => {}, name: "Link2", meta: { title: "\u725b\u725b\u624b\u518c(\u653b\u7565/\u63d2\u4ef6)" } },
      { path: "https://github.com/holychikenz/MWIApi", component: () => {}, name: "Link3", meta: { title: "MWI Api" } },
      { path: "https://docs.google.com/spreadsheets/d/13yBy3oQkH5N4y7UJ0Pkux2A8O5xM1ZsVTNAg6qgLEcM/edit?gid=2017655058#gid=2017655058", component: () => {}, name: "Link4", meta: { title: "MWI Data" } }
    ]
  }
]
