import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = fileURLToPath(new URL("../", import.meta.url))

// Exercise the real TypeScript modules with explicit HTTP/browser substitutes.
export function moduleLoader(overrides = {}) {
  const cache = new Map()
  function load(relativePath) {
    const filename = resolve(root, relativePath)
    if (Object.hasOwn(overrides, filename)) return overrides[filename]
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText
    const realRequire = createRequire(filename)
    const require = specifier => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier]
      if (specifier.startsWith(".")) return load(resolve(dirname(filename), `${specifier}.ts`))
      return realRequire(specifier)
    }
    new Function("require", "module", "exports", source)(require, module, module.exports)
    return module.exports
  }
  return load
}

export const sourcePath = path => resolve(root, path)
