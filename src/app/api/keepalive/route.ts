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
    
    // Perform a lightweight database operation
    // This query checks if the database is responsive without creating unnecessary load
    const { data, error } = await supabase
      .from('profiles') // Using profiles table as it's likely to exist in your system
      .select('uuid')
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is fine
      console.error('Database keepalive error:', error)
      return NextResponse.json(
        { 
          error: 'Database query failed', 
          details: error.message,
          timestamp: new Date().toISOString()
        }, 
        { status: 500 }
      )
    }

    // Log successful keepalive
    console.log(`Database keepalive successful at ${new Date().toISOString()}`)
    
    return NextResponse.json({
      success: true,
      message: 'Database keepalive successful',
      timestamp: new Date().toISOString(),
      hasData: !!data
    })

  } catch (error) {
    console.error('Keepalive endpoint error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Allow POST requests as well for flexibility
  return GET(request)
}
