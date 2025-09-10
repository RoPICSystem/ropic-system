import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// File paths
const PROJECT_ROOT = process.cwd()
const VERCEL_JSON = path.join(PROJECT_ROOT, 'vercel.json')
const DATA_DIR = path.join(PROJECT_ROOT, 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'cron-config.json')

// Helpers
async function ensureDirExists(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {}
}

async function readJson<T = any>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

async function writeJson(filePath: string, data: any) {
  await ensureDirExists(path.dirname(filePath))
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

function mapScheduleToIntervalDays(schedule?: string): number {
  switch (schedule) {
    case '0 12 * * *':
      return 1
    case '0 12 * * 0': // weekly Sunday
      return 7
    case '0 12 1,15 * *': // twice a month ~ bi-weekly
      return 14
    case '0 12 1 * *': // monthly
      return 30
    default:
      return 1
  }
}

function computeScheduleFromInterval(intervalDays: number): { schedule: string; label: string; approximated: boolean } {
  if (intervalDays <= 1) return { schedule: '0 12 * * *', label: 'daily', approximated: false }
  if (intervalDays === 7) return { schedule: '0 12 * * 0', label: 'weekly', approximated: false }
  if (intervalDays === 14) return { schedule: '0 12 1,15 * *', label: 'bi-weekly (1st & 15th)', approximated: true }
  if (intervalDays >= 28) return { schedule: '0 12 1 * *', label: 'monthly', approximated: false }
  // For unsupported exact intervals, fall back to daily and mark approximated
  return { schedule: '0 12 * * *', label: `every ${intervalDays} days (approximated as daily)`, approximated: true }
}

function nextRunFromDailyAtNoonUTC(intervalDays = 1): Date {
  const now = new Date()
  const next = new Date(now)
  next.setUTCHours(12, 0, 0, 0)
  if (now.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + intervalDays)
  }
  return next
}

function nextRunFromWeeklyAtNoonUTC(targetDow = 0 /* Sunday */): Date {
  const now = new Date()
  const next = new Date(now)
  next.setUTCHours(12, 0, 0, 0)
  const currentDow = next.getUTCDay()
  let delta = (targetDow - currentDow + 7) % 7
  if (delta === 0 && now.getTime() >= next.getTime()) delta = 7
  next.setUTCDate(next.getUTCDate() + delta)
  return next
}

function nextRunFromSemiMonthlyAtNoonUTC(): Date {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0))
  const day = now.getUTCDate()
  if (day < 1 || (day === 1 && now.getUTCHours() < 12)) {
    next.setUTCDate(1)
  } else if (day < 15 || (day === 15 && now.getUTCHours() < 12)) {
    next.setUTCDate(15)
  } else {
    // move to 1st of next month
    next.setUTCMonth(next.getUTCMonth() + 1, 1)
  }
  return next
}

function nextRunFromMonthlyAtNoonUTC(): Date {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12, 0, 0, 0))
  if (now.getUTCDate() > 1 || (now.getUTCDate() === 1 && now.getUTCHours() >= 12)) {
    next.setUTCMonth(next.getUTCMonth() + 1, 1)
  }
  return next
}

function computeNextRunISO(schedule: string, intervalDays: number): string {
  switch (schedule) {
    case '0 12 * * *':
      return nextRunFromDailyAtNoonUTC(intervalDays).toISOString()
    case '0 12 * * 0':
      return nextRunFromWeeklyAtNoonUTC(0).toISOString()
    case '0 12 1,15 * *':
      return nextRunFromSemiMonthlyAtNoonUTC().toISOString()
    case '0 12 1 * *':
      return nextRunFromMonthlyAtNoonUTC().toISOString()
    default:
      return nextRunFromDailyAtNoonUTC(1).toISOString()
  }
}

async function loadCurrentConfig() {
  // Prefer local config file if present
  const stored = await readJson<any>(CONFIG_FILE)
  if (stored?.schedule) {
    const intervalDays = typeof stored.intervalDays === 'number' ? stored.intervalDays : mapScheduleToIntervalDays(stored.schedule)
    return {
      schedule: stored.schedule as string,
      intervalDays,
      updatedAt: stored.updatedAt ?? null,
      nextRunUTC: computeNextRunISO(stored.schedule, intervalDays),
      source: 'file'
    }
  }

  // Fallback to vercel.json
  const vercel = await readJson<any>(VERCEL_JSON)
  const cron = vercel?.crons?.find?.((c: any) => c?.path === '/api/keepalive')
  const schedule: string = cron?.schedule || '0 12 * * *'
  const intervalDays = mapScheduleToIntervalDays(schedule)
  return {
    schedule,
    intervalDays,
    updatedAt: null,
    nextRunUTC: computeNextRunISO(schedule, intervalDays),
    source: 'vercel.json'
  }
}

async function updateVercelJsonSchedule(newSchedule: string): Promise<{ updated: boolean; error?: string }> {
  const vercel = (await readJson<any>(VERCEL_JSON)) || {}
  const crons: any[] = Array.isArray(vercel.crons) ? vercel.crons : []
  const idx = crons.findIndex((c: any) => c?.path === '/api/keepalive')
  if (idx >= 0) {
    crons[idx] = { ...crons[idx], schedule: newSchedule }
  } else {
    crons.push({ path: '/api/keepalive', schedule: newSchedule })
  }
  vercel.crons = crons
  try {
    await writeJson(VERCEL_JSON, vercel)
    return { updated: true }
  } catch (e: any) {
    return { updated: false, error: e?.message || 'Failed to write vercel.json' }
  }
}

async function triggerVercelDeployment(): Promise<{ deployed: boolean; deploymentUrl?: string; error?: string }> {
  const vercelToken = process.env.VERCEL_TOKEN
  const vercelTeamId = process.env.VERCEL_TEAM_ID
  const vercelProjectId = process.env.VERCEL_PROJECT_ID || 'ropic-system'
  
  if (!vercelToken) {
    return { deployed: false, error: 'VERCEL_TOKEN environment variable not set' }
  }
  
  try {
    const deploymentPayload: any = {
      name: vercelProjectId,
      gitSource: {
        type: 'github',
        ref: process.env.VERCEL_GIT_COMMIT_REF || 'main',
        repoId: process.env.VERCEL_GIT_REPO_ID
      }
    }
    
    if (vercelTeamId) {
      deploymentPayload.teamId = vercelTeamId
    }
    
    const response = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deploymentPayload)
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      return { 
        deployed: false, 
        error: `Deployment failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}` 
      }
    }
    
    const deployment = await response.json()
    return { 
      deployed: true, 
      deploymentUrl: deployment.url 
    }
  } catch (e: any) {
    return { deployed: false, error: e?.message || 'Failed to trigger deployment' }
  }
}

export async function GET() {
  try {
    const cfg = await loadCurrentConfig()
    return NextResponse.json({
      status: 'success',
      config: {
        schedule: cfg.schedule,
        intervalDays: cfg.intervalDays,
        nextRunUTC: cfg.nextRunUTC,
        source: cfg.source
      },
      message: 'Current cron configuration retrieved'
    })
  } catch (error) {
    console.error('Error getting cron config:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to retrieve cron configuration'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const intervalDays = Number(body?.intervalDays)

    if (!Number.isFinite(intervalDays) || intervalDays < 1 || intervalDays > 30) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid interval. Must be a number between 1 and 30.'
        },
        { status: 400 }
      )
    }

    const { schedule, label, approximated } = computeScheduleFromInterval(intervalDays)

    // Update vercel.json (best-effort)
    const vercelResult = await updateVercelJsonSchedule(schedule)

    // Persist our chosen interval so UI can reflect the true intent even if schedule is approximated
    const updatedAt = new Date().toISOString()
    await writeJson(CONFIG_FILE, { intervalDays, schedule, updatedAt })

    // Trigger a new deployment to apply the cron changes
    const deploymentResult = await triggerVercelDeployment()

    const nextRunUTC = computeNextRunISO(schedule, intervalDays)

    const message = `Cron schedule updated to run ${label}. ${approximated ? 'Note: exact interval approximated by cron expression.' : ''}${vercelResult.updated ? '' : ' (vercel.json not updated: ' + (vercelResult.error || 'unknown error') + ')'}${deploymentResult.deployed ? ` Deployment triggered: ${deploymentResult.deploymentUrl}` : ` Deployment failed: ${deploymentResult.error}`}`

    return NextResponse.json({
      status: deploymentResult.deployed ? 'success' : 'partial',
      config: {
        schedule,
        intervalDays,
        nextRunUTC,
        updatedAt,
      },
      deployment: {
        triggered: deploymentResult.deployed,
        url: deploymentResult.deploymentUrl,
        error: deploymentResult.error
      },
      message,
    })
  } catch (error) {
    console.error('Error updating cron config:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update cron configuration'
      },
      { status: 500 }
    )
  }
}
