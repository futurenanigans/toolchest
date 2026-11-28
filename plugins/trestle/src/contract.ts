import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { CheckCommandSpec } from './checks'
import { userHome } from './platform'
import { stateDir } from './state'

export interface AcceptanceCriterion {
  id: string
  description: string
  passed: boolean
  evidence?: string
}

export type BaselinePolicy = 'require-green' | 'no-new-failures' | 'skip'

export interface Contract {
  version: 1
  id: string
  title: string
  goal: string
  acceptanceCriteria: AcceptanceCriterion[]
  checks?: CheckCommandSpec[]
  includeMortise?: boolean
  mutationSessionId?: string
  baseline?: BaselinePolicy
  maxIterations?: number
  freshContextPerIteration: boolean
  createdAt: number
}

const CONTRACTS_DIR = 'contracts'

function contractsDir(repoRoot: string, homeDir = userHome()): string {
  return path.join(stateDir(repoRoot, homeDir), CONTRACTS_DIR)
}

function sanitizeContractId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '')
  if (!cleaned) throw new Error(`Invalid contract id: ${raw}`)
  return cleaned.slice(0, 48)
}

async function writeContractAtomic(repoRoot: string, contract: Contract, homeDir = userHome()): Promise<void> {
  const dir = contractsDir(repoRoot, homeDir)
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(dir, `${contract.id}.json`)
  const tmp = path.join(dir, `${contract.id}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`)
  await fs.writeFile(tmp, `${JSON.stringify(contract, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, target)
}

export async function contractCreate(
  repoRoot: string,
  params: {
    id: string
    title: string
    goal: string
    acceptanceCriteria: Array<{ id: string; description: string }>
    checks?: CheckCommandSpec[]
    includeMortise?: boolean
    mutationSessionId?: string
    baseline?: BaselinePolicy
    maxIterations?: number
    freshContextPerIteration?: boolean
  },
  homeDir = userHome(),
): Promise<Contract> {
  const id = sanitizeContractId(params.id)

  const contract: Contract = {
    version: 1,
    id,
    title: params.title,
    goal: params.goal,
    acceptanceCriteria: params.acceptanceCriteria.map(c => ({
      id: c.id,
      description: c.description,
      passed: false,
    })),
    checks: params.checks,
    ...(params.includeMortise !== undefined ? { includeMortise: params.includeMortise } : {}),
    ...(params.mutationSessionId !== undefined ? { mutationSessionId: params.mutationSessionId } : {}),
    ...(params.baseline !== undefined ? { baseline: params.baseline } : {}),
    ...(params.maxIterations !== undefined ? { maxIterations: params.maxIterations } : {}),
    freshContextPerIteration: params.freshContextPerIteration ?? true,
    createdAt: Date.now(),
  }

  await writeContractAtomic(repoRoot, contract, homeDir)
  return contract
}

export async function contractRead(repoRoot: string, rawId: string, homeDir = userHome()): Promise<Contract> {
  const id = sanitizeContractId(rawId)
  const raw = await fs.readFile(path.join(contractsDir(repoRoot, homeDir), `${id}.json`), 'utf8')
  return JSON.parse(raw) as Contract
}

export async function contractList(repoRoot: string, homeDir = userHome()): Promise<Contract[]> {
  const dir = contractsDir(repoRoot, homeDir)
  let files: string[]
  try {
    files = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const contracts: Contract[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8')
      contracts.push(JSON.parse(raw) as Contract)
    } catch {
    }
  }
  return contracts.sort((a, b) => b.createdAt - a.createdAt)
}

export async function contractUpdateCriterion(
  repoRoot: string,
  rawId: string,
  criterionId: string,
  passed: boolean,
  evidence?: string,
  homeDir = userHome(),
): Promise<Contract> {
  const contract = await contractRead(repoRoot, rawId, homeDir)
  const exists = contract.acceptanceCriteria.some(c => c.id === criterionId)
  if (!exists) {
    throw new Error(`Unknown acceptance criterion '${criterionId}' in contract '${contract.id}'`)
  }
  const updated: Contract = {
    ...contract,
    acceptanceCriteria: contract.acceptanceCriteria.map(c =>
      c.id === criterionId ? { ...c, passed, ...(evidence !== undefined ? { evidence } : {}) } : c,
    ),
  }
  await writeContractAtomic(repoRoot, updated, homeDir)
  return updated
}

export async function contractMarkAll(
  repoRoot: string,
  rawId: string,
  passed: boolean,
  evidence?: string,
  homeDir = userHome(),
): Promise<Contract> {
  const contract = await contractRead(repoRoot, rawId, homeDir)
  const updated: Contract = {
    ...contract,
    acceptanceCriteria: contract.acceptanceCriteria.map(c => ({
      ...c,
      passed,
      ...(evidence ? { evidence } : {}),
    })),
  }
  await writeContractAtomic(repoRoot, updated, homeDir)
  return updated
}
