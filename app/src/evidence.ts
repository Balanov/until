export interface Summary {
  label: string
  suite: string
  system: 'until' | 'direct'
  accepted: number
  total: number
  medianWallMs: number
  minWallMs: number
  maxWallMs: number
  medianModelCalls: number
  medianTotalTokens: number
  providerChargesPerAccepted: number | null
}

export interface Trial {
  label: string
  suite: string
  case: string
  iteration: number
  system: 'until' | 'direct'
  accepted: boolean
  rejectionReasons: string[]
  wallMs: number
  modelCalls: number
  attempts: number
  inputTokens: number
  outputTokens: number
  providerCharges: number
  trace: string
  rawResponsesSha256: string
}

export interface Comparison {
  generatedAt: string
  model: string
  sourceHash: string
  summaries: Summary[]
  trials: Trial[]
  directSpeedAdvantage: number
  directCallAdvantage: number
}

export interface Trace {
  accepted: boolean
  opportunity?: { statement: string; evidence_ids: string[] }
  artifact?: { id: string; hash: string; status: string; content: string }
  verdict?: { passed: number; checks: { type: string; passed: boolean }[] }
  release?: { id: string; status: string; receipt?: { hash: string } }
  audit?: { valid: boolean; count: number }
  checks?: { passed: boolean; results: { type: string; passed: boolean }[] }
}

export const summaryOf = (data: Comparison | null, label: string, system: 'until' | 'direct') =>
  data?.summaries.find((item) => item.label === label && item.suite === 'heldout' && item.system === system) ?? null

export const competitors = [
  { id: 'until', name: 'UNTIL', url: 'https://github.com/Balanov/until' },
  { id: 'factory', name: 'Factory 2.0', url: 'https://factory.com/product/software-factory' },
  { id: 'fabro', name: 'Fabro', url: 'https://github.com/fabro-sh/fabro' },
  { id: 'machinist', name: 'Machinist', url: 'https://github.com/owainlewis/machinist' },
  { id: 'spark', name: 'Productboard Spark', url: 'https://www.productboard.com/product/spark/' },
] as const

export type Competitor = typeof competitors[number]['id']
export type CapabilityState = 'yes' | 'partial' | 'no' | 'unknown'

export const capabilities: { id: 'open' | 'continuous' | 'evidence' | 'acceptance' | 'outcome' | 'delivery' | 'sandbox' | 'discovery'; values: Record<Competitor, CapabilityState> }[] = [
  { id: 'open', values: { until: 'yes', factory: 'no', fabro: 'yes', machinist: 'yes', spark: 'no' } },
  { id: 'continuous', values: { until: 'yes', factory: 'yes', fabro: 'unknown', machinist: 'unknown', spark: 'partial' } },
  { id: 'evidence', values: { until: 'yes', factory: 'unknown', fabro: 'unknown', machinist: 'unknown', spark: 'unknown' } },
  { id: 'acceptance', values: { until: 'yes', factory: 'yes', fabro: 'yes', machinist: 'yes', spark: 'partial' } },
  { id: 'outcome', values: { until: 'yes', factory: 'yes', fabro: 'unknown', machinist: 'partial', spark: 'yes' } },
  { id: 'delivery', values: { until: 'no', factory: 'yes', fabro: 'yes', machinist: 'yes', spark: 'partial' } },
  { id: 'sandbox', values: { until: 'partial', factory: 'yes', fabro: 'yes', machinist: 'yes', spark: 'unknown' } },
  { id: 'discovery', values: { until: 'partial', factory: 'partial', fabro: 'no', machinist: 'no', spark: 'yes' } },
]
