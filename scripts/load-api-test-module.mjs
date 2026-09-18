import { readFileSync } from 'node:fs'
import ts from 'typescript'

export function compileTestModule(source) {
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString('base64')
}

export const groupingModuleUrl = compileTestModule(readFileSync(new URL('../src/api/angiographyGrouping.ts', import.meta.url), 'utf8'))
export const xcaModuleUrl = compileTestModule(readFileSync(new URL('../src/api/xcaAnalysis.ts', import.meta.url), 'utf8'))
export const xcaDetailsModuleUrl = compileTestModule(readFileSync(new URL('../src/api/xcaDetails.ts', import.meta.url), 'utf8').replace("'./xcaAnalysis'", JSON.stringify(xcaModuleUrl)))
export const xcaReportModuleUrl = compileTestModule(readFileSync(new URL('../src/api/xcaReport.ts', import.meta.url), 'utf8'))

export async function loadApiTestModule(environment = { VITE_API_BASE_URL: '' }) {
  const source = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
    .replace(/import\.meta\.env/g, `(${JSON.stringify(environment)})`)
    .replace("'./angiographyGrouping'", JSON.stringify(groupingModuleUrl))
    .replace("'./xcaAnalysis'", JSON.stringify(xcaModuleUrl))
    .replace("'./xcaDetails'", JSON.stringify(xcaDetailsModuleUrl))
    .replace("'./xcaReport'", JSON.stringify(xcaReportModuleUrl))
  return import(compileTestModule(source))
}
