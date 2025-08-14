import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from a cron job or authorized source
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
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
