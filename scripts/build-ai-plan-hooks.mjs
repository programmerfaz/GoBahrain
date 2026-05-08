import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractBindingNames, prefixScoped } from './ai-plan-bindings.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ai = path.join(__dirname, '../src/screens/aiPlan')

const hookImports = fs.readFileSync(path.join(ai, 'AIPlanScreenMainImports.js'), 'utf8')

const inner = fs.readFileSync(path.join(ai, 'hookInner.txt'), 'utf8')
const middle = fs.readFileSync(path.join(ai, 'hookMiddle.txt'), 'utf8')
const outer = fs.readFileSync(path.join(ai, 'hookOuter.txt'), 'utf8')

const innerNames = extractBindingNames(inner)

const middleLines = middle.split('\n')
const middlePartASplit = 391
const middlePartA = middleLines.slice(0, middlePartASplit).join('\n')
const middlePartB = middleLines.slice(middlePartASplit).join('\n')

const partANames = extractBindingNames(middlePartA).filter((n) => !innerNames.includes(n))
const partBNames = extractBindingNames(middlePartB).filter(
  (n) => !innerNames.includes(n) && !partANames.includes(n),
)

const mergedMidKeys = [...new Set([...innerNames, ...partANames, ...partBNames])]

const outerNames = extractBindingNames(outer).filter((n) => !mergedMidKeys.includes(n))

const innerFile = `${hookImports}

export function useAIPlanScreenInner() {
${inner}
  return { ${innerNames.join(', ')} }
}
`

const middlePartAFile = `${hookImports}

export function useAIPlanScreenMiddlePartA(inner) {
${prefixScoped(middlePartA, innerNames, 'inner')}
  return { ...inner, ${partANames.join(', ')} }
}
`

const midAKeys = [...new Set([...innerNames, ...partANames])]
const middlePartBFile = `${hookImports}

export function useAIPlanScreenMiddlePartB(midA) {
${prefixScoped(middlePartB, midAKeys, 'midA')}
  return { ...midA, ${partBNames.join(', ')} }
}
`

const middleOrchestratorFile = `import { useAIPlanScreenInner } from './useAIPlanScreenInner'
import { useAIPlanScreenMiddlePartA } from './useAIPlanScreenMiddlePartA'
import { useAIPlanScreenMiddlePartB } from './useAIPlanScreenMiddlePartB'

export function useAIPlanScreenMiddle() {
  const inner = useAIPlanScreenInner()
  const midA = useAIPlanScreenMiddlePartA(inner)
  return useAIPlanScreenMiddlePartB(midA)
}
`

const outerFile = `${hookImports}
import { useAIPlanScreenMiddle } from './useAIPlanScreenMiddle'

export function useAIPlanScreenOuter() {
  const mid = useAIPlanScreenMiddle()
${prefixScoped(outer, mergedMidKeys, 'mid')}
  return { ...mid, ${outerNames.join(', ')} }
}
`

fs.writeFileSync(path.join(ai, 'useAIPlanScreenInner.js'), innerFile)
fs.writeFileSync(path.join(ai, 'useAIPlanScreenMiddlePartA.js'), middlePartAFile)
fs.writeFileSync(path.join(ai, 'useAIPlanScreenMiddlePartB.js'), middlePartBFile)
fs.writeFileSync(path.join(ai, 'useAIPlanScreenMiddle.js'), middleOrchestratorFile)
fs.writeFileSync(path.join(ai, 'useAIPlanScreenOuter.js'), outerFile)

console.log(
  'inner',
  innerNames.length,
  'partA+',
  partANames.length,
  'partB+',
  partBNames.length,
  'outer+',
  outerNames.length,
)
