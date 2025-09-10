import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // For Vercel cron jobs, check the cron-secret header instead of authorization
    const cronSecret = request.headers.get('x-vercel-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '')
    const expectedToken = process.env.CRON_SECRET
    
    // Allow requests from Vercel cron (which sends x-vercel-cron-secret) or with proper auth
    const isValidCron = request.headers.get('user-agent')?.includes('vercel-cron') || 
                       (expectedToken && cronSecret === expectedToken)
    
    if (expectedToken && !isValidCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    
    // Alternative approach: Use a simple SQL query that works on any PostgreSQL database
    const { data, error } = await supabase.rpc('keepalive_ping')

    if (error) {
      // If the function doesn't exist, try a basic query
      const { data: fallbackData, error: fallbackError } = await supabase
        .rpc('version')

      if (fallbackError) {
        console.error('Database keepalive error:', fallbackError)
        return NextResponse.json(
          { 
            error: 'Database query failed', 
            details: fallbackError.message,
            timestamp: new Date().toISOString()
          }, 
          { status: 500 }
        )
      }
    }

    // Log successful keepalive
    console.log(`Database keepalive (alternative) successful at ${new Date().toISOString()}`)
    
    return NextResponse.json({
      success: true,
      message: 'Database keepalive successful (alternative method)',
      timestamp: new Date().toISOString(),
      method: error ? 'fallback' : 'rpc'
    })

  } catch (error) {
    console.error('Alternative keepalive endpoint error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}
