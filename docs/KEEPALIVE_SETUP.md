# Supabase Database Keepalive Solution

This solution prevents your Supabase free tier database from pausing due to inactivity by automatically triggering lightweight database operations every 10 minutes using Vercel Cron Jobs.

## Components

### 1. API Endpoints

#### `/api/keepalive` (Primary)
- Performs a simple query on the `profiles` table
- Returns success/failure status with timestamp
- Includes authorization check using `CRON_SECRET`

#### `/api/keepalive-alt` (Fallback)
- Uses a custom database function `keepalive_ping()`
- Falls back to system table queries if the function doesn't exist
- More reliable for different database configurations

### 2. Vercel Cron Job Configuration

The `vercel.json` file configures a cron job that runs every 10 minutes:
```json
{
  "crons": [
    {
      "path": "/api/keepalive",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

### 3. Database Function

The `keepalive_ping()` function in `supabase/keepalive_function.sql`:
- Performs minimal database operation
- Returns status information
- Accessible to both authenticated and anonymous users

## Setup Instructions

### 1. Deploy the Code
1. Commit and push your changes to your repository
2. Deploy to Vercel (cron jobs are automatically configured)

### 2. Environment Variables (Optional)
Add to your Vercel environment variables for additional security:
```
CRON_SECRET=your-secret-token-here
```

### 3. Database Setup
Run the SQL in `supabase/keepalive_function.sql` in your Supabase SQL editor:
```sql
CREATE OR REPLACE FUNCTION keepalive_ping()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'status', 'alive',
    'timestamp', now(),
    'version', version()
  );
$$;

GRANT EXECUTE ON FUNCTION keepalive_ping() TO authenticated;
GRANT EXECUTE ON FUNCTION keepalive_ping() TO anon;
```

### 4. Verify Setup
1. Test locally: `./scripts/test-keepalive.sh local`
2. Test production: `./scripts/test-keepalive.sh production`
3. Check Vercel Function logs for cron job execution

## How It Works

1. **Vercel Cron Job**: Runs every 10 minutes automatically
2. **API Endpoint**: Receives the cron request and performs database query
3. **Database Query**: Lightweight operation that keeps the connection active
4. **Logging**: Success/failure logged for monitoring

## Monitoring

### Vercel Dashboard
- Check the "Functions" tab for cron job execution logs
- Monitor for any failed executions

### Supabase Dashboard
- Monitor database activity in the "Reports" section
- Check for consistent activity every 10 minutes

### Manual Testing
```bash
# Test the endpoint manually
curl -X GET "https://your-app.vercel.app/api/keepalive"
```

## Troubleshooting

### Common Issues

1. **Cron job not running**
   - Ensure `vercel.json` is in the root directory
   - Redeploy after adding the configuration
   - Check Vercel dashboard for cron job registration

2. **Database query failures**
   - Verify Supabase environment variables are set
   - Check if the `profiles` table exists
   - Use the alternative endpoint `/api/keepalive-alt`

3. **Authorization errors**
   - Remove or correctly set the `CRON_SECRET` environment variable
   - Ensure the secret matches between Vercel and your code

### Fallback Options

If the main solution doesn't work:

1. **Use the alternative endpoint**: Change `vercel.json` to use `/api/keepalive-alt`
2. **Increase frequency**: Change schedule to `*/5 * * * *` (every 5 minutes)
3. **External monitoring**: Use services like UptimeRobot to ping your endpoint

## Cost Considerations

- **Vercel Free Plan**: Includes 100GB-hours of function execution time per month
- **Supabase Free Plan**: No additional cost for these lightweight queries
- **Frequency**: 10-minute intervals provide good balance between effectiveness and resource usage

## Notes

- The solution works entirely within the free tier limits of both platforms
- Database queries are minimal and won't significantly impact your usage quotas
- The system is designed to be resilient with fallback mechanisms
- All operations are logged for easy debugging and monitoring
