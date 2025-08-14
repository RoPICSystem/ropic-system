import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const startTime = Date.now()
    const supabase = await createClient()
    
    // Test database connection
    const { data: dbTest, error: dbError } = await supabase
      .from('profiles')
      .select('uuid')
      .limit(1)

    const dbLatency = Date.now() - startTime

    // Check if database is responsive
    const dbStatus = dbError && dbError.code !== 'PGRST116' ? 'error' : 'healthy'
    
    // Environment information
    const environment = {
      nodeEnv: process.env.NODE_ENV,
      region: process.env.VERCEL_REGION || 'unknown',
      deployment: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local'
    }

    // System status
    const systemStatus = {
      status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: {
          status: dbStatus,
          latency: `${dbLatency}ms`,
          provider: 'supabase'
        },
        api: {
          status: 'healthy',
          endpoint: '/api/health'
        },
        keepalive: {
          status: 'active',
          schedule: '*/10 * * * *',
          endpoint: '/api/keepalive'
        }
      },
      environment
    }

    return NextResponse.json(systemStatus, {
      status: systemStatus.status === 'healthy' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

  } catch (error) {
    console.error('Health check failed:', error)
    
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  }
}
