import { execSync } from "node:child_process"
import fs from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getCommitCount(): number {
  try {
    const count = execSync("git rev-list --count HEAD").toString().trim()
    return Number.parseInt(count, 10) + 1
  } catch {
    // Allow running without a git repo (for example, zipped source).
    return -1
  }
}

function updateVersion() {
  const packagePath = resolve(__dirname, "../package.json")
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"))

  const baseVersion = pkg.version.split(".").slice(0, 2).join(".")
  const buildNumber = getCommitCount()
  if (buildNumber < 0) {
    return
  }

  pkg.version = `${baseVersion}.${buildNumber}`
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
}

updateVersion()
