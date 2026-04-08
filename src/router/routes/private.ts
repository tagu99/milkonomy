import type { RouteRecordRaw } from "vue-router"

const Layouts = () => import("@/layouts/index.vue")

export const privateRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    component: Layouts,
    redirect: "/enhancest",
    children: [
      {
        path: "enhancest",
        component: () => import("@/pages/enhancest/index.vue"),
        name: "Enhancest",
        meta: {
          title: "超级强化计算",
          elIcon: "MagicStick",
          affix: false
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/jungle",
    meta: {
      title: "打野工具",
      elIcon: "Compass"
    },
    children: [
      {
        path: "jungle",
        component: () => import("@/pages/jungle/index.vue"),
        name: "Jungle",
        meta: {
          title: "打野工具",
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "junglest",
        component: () => import("@/pages/junglest/index.vue"),
        name: "junglest",
        meta: {
          title: "超级打野工具",
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "junglerit",
        component: () => import("@/pages/junglest/inherit.vue"),
        name: "junglerit",
        meta: {
          title: "继承打野工具",
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "inherit",
        component: () => import("@/pages/inherit/index.vue"),
        name: "inherit",
        meta: {
          title: "继承",
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "decompose",
        component: () => import("@/pages/decompose/index.vue"),
        name: "decompose",
        meta: {
          title: "分解",
          affix: false,
          elIcon: "Compass"
        }
      },
      {
        path: "pickout",
        component: () => import("@/pages/jungle/pickout.vue"),
        name: "Pickout",
        meta: {
          title: "捡漏工具",
          affix: false,
          elIcon: "Compass"
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/strategy-overview",
    meta: {
      title: "强化策略",
      elIcon: "MagicStick"
    },
    children: [
      {
        path: "strategy-overview",
        component: () => import("@/pages/jungle/strategy-overview.vue"),
        name: "StrategyOverview",
        meta: {
          title: "策略总览",
          affix: false,
          elIcon: "MagicStick"
        }
      },
      {
        path: "stable-enhance",
        component: () => import("@/pages/jungle/stable.vue"),
        name: "StableEnhance",
        meta: {
          title: "稳定强化",
          affix: false,
          elIcon: "MagicStick"
        }
      },
      {
        path: "inherit-saving",
        component: () => import("@/pages/jungle/inherit-saving.vue"),
        name: "InheritSaving",
        meta: {
          title: "继承省钱",
          affix: false,
          elIcon: "MagicStick"
        }
      },
      {
        path: "recovery-floor",
        component: () => import("@/pages/jungle/recovery-floor.vue"),
        name: "RecoveryFloor",
        meta: {
          title: "回收底价",
          affix: false,
          elIcon: "MagicStick"
        }
      },
      {
        path: "demand-heat",
        component: () => import("@/pages/jungle/demand-heat.vue"),
        name: "DemandHeat",
        meta: {
          title: "需求热度",
          affix: false,
          elIcon: "MagicStick"
        }
      },
      {
        path: "bargain-analysis",
        component: () => import("@/pages/jungle/bargain-analysis.vue"),
        name: "BargainAnalysis",
        meta: {
          title: "捡漏分析",
          affix: false,
          elIcon: "MagicStick"
        }
      },
      {
        path: "market-warning",
        component: () => import("@/pages/jungle/market-warning.vue"),
        name: "MarketWarning",
        meta: {
          title: "反操盘提醒",
          affix: false,
          elIcon: "MagicStick"
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/manualchemy",
    children: [
      {
        path: "manualchemy",
        component: () => import("@/pages/manualchemy/index.vue"),
        name: "Manualchemy",
        meta: {
          title: "制作炼金",
          svgIcon: "dashboard"
        }
      }
    ]
  },
  {
    path: "/",
    component: Layouts,
    redirect: "/enhanposest",
    children: [
      {
        path: "enhanposest",
        component: () => import("@/pages/enhanposer/enhanposest.vue"),
        name: "Enhanposest",
        meta: {
          title: "超级强化分解",
          affix: false,
          svgIcon: "dashboard"
        }
      }
    ]
  },
  {
    path: "/demo",
    component: Layouts,
    redirect: "/demo/unocss",
    name: "Demo",
    meta: {
      title: "示例集合",
      elIcon: "DataBoard",
      hidden: true
    },
    children: [
      {
        path: "unocss",
        component: () => import("@/pages/demo/unocss/index.vue"),
        name: "UnoCSS",
        meta: {
          title: "UnoCSS"
        }
      },
      {
        path: "level2",
        component: () => import("@/pages/demo/level2/index.vue"),
        redirect: "/demo/level2/level3",
        name: "Level2",
        meta: {
          title: "二级路由",
          alwaysShow: true
        },
        children: [
          {
            path: "level3",
            component: () => import("@/pages/demo/level2/level3/index.vue"),
            name: "Level3",
            meta: {
              title: "三级路由",
              keepAlive: true
            }
          }
        ]
      },
      {
        path: "composable-demo",
        redirect: "/demo/composable-demo/use-fetch-select",
        name: "ComposableDemo",
        meta: {
          title: "组合式函数"
        },
        children: [
          {
            path: "use-fetch-select",
            component: () => import("@/pages/demo/composable-demo/use-fetch-select.vue"),
            name: "UseFetchSelect",
            meta: {
              title: "useFetchSelect"
            }
          },
          {
            path: "use-fullscreen-loading",
            component: () => import("@/pages/demo/composable-demo/use-fullscreen-loading.vue"),
            name: "UseFullscreenLoading",
            meta: {
              title: "useFullscreenLoading"
            }
          },
          {
            path: "use-watermark",
            component: () => import("@/pages/demo/composable-demo/use-watermark.vue"),
            name: "UseWatermark",
            meta: {
              title: "useWatermark"
            }
          }
        ]
      }
    ]
  }
]
