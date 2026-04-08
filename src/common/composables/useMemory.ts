import { debounce } from "lodash-es"
import { ref } from "vue"

function mergeWithDefault(defaultValue: any, storedValue: any) {
  if (
    defaultValue
    && typeof defaultValue === "object"
    && !Array.isArray(defaultValue)
    && storedValue
    && typeof storedValue === "object"
    && !Array.isArray(storedValue)
  ) {
    return {
      ...defaultValue,
      ...storedValue
    }
  }
  return storedValue
}

export function useMemory(key: string, defaultValue: any, delay: number = 500) {
  const initialValue = () => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? mergeWithDefault(defaultValue, JSON.parse(stored)) : defaultValue
    } catch {
      return defaultValue
    }
  }

  const value = ref(initialValue())
  const saveDebounced = debounce((val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch (e) {
      console.error("LocalStorage 保存失败:", e)
    }
  }, delay)

  watch(value, saveDebounced, { deep: true })

  return value
}
