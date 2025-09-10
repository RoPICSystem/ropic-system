import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Log all relevant headers for debugging
    const headers = {
      'user-agent': request.headers.get('user-agent'),
      'x-vercel-cron-secret': request.headers.get('x-vercel-cron-secret'),
      'authorization': request.headers.get('authorization'),
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'x-real-ip': request.headers.get('x-real-ip'),
    }
    
    const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron')
    const hasVercelCronSecret = !!request.headers.get('x-vercel-cron-secret')
    
    console.log('Test cron endpoint called:', {
      timestamp: new Date().toISOString(),
      headers,
      isVercelCron,
      hasVercelCronSecret,
      url: request.url
    })
    
    return NextResponse.json({
      success: true,
      message: 'Test cron endpoint working',
      timestamp: new Date().toISOString(),
      detection: {
        isVercelCron,
        hasVercelCronSecret,
        userAgent: request.headers.get('user-agent')
      },
      headers
    })
  } catch (error) {
    console.error('Test cron endpoint error:', error)
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
  return GET(request)
}
