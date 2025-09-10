# Supabase Keepalive Deployment Checklist

Use this checklist to ensure your database keepalive solution is properly deployed and configured.

## Pre-Deployment

- [ ] **Verify environment variables are set**
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `CRON_SECRET` (optional, for security)
  - [ ] `VERCEL_TOKEN` (required for automatic deployments)
  - [ ] `VERCEL_PROJECT_ID` (optional, defaults to 'ropic-system')
  - [ ] `VERCEL_TEAM_ID` (optional, only if using team account)

- [ ] **Test locally**
  ```bash
  npm run dev
  curl http://localhost:3000/api/keepalive
  curl http://localhost:3000/api/health
  curl http://localhost:3000/api/test-cron
  curl http://localhost:3000/api/cron-config
  ```

- [ ] **Verify files are in place**
  - [ ] `vercel.json` (cron configuration)
  - [ ] `src/app/api/keepalive/route.ts`
  - [ ] `src/app/api/keepalive-alt/route.ts`
  - [ ] `src/app/api/health/route.ts`
  - [ ] `src/app/api/test-cron/route.ts` (for testing)
  - [ ] `src/app/api/cron-config/route.ts` (for configuration)
  - [ ] `supabase/keepalive_function.sql`
  - [ ] `docs/ENVIRONMENT_VARIABLES.md`

## Supabase Setup

- [ ] **Run SQL function in Supabase SQL Editor**
  ```sql
  -- Copy and paste content from supabase/keepalive_function.sql
  CREATE OR REPLACE FUNCTION keepalive_ping()...
  ```

- [ ] **Test function in SQL Editor**
  ```sql
  SELECT keepalive_ping();
  ```

- [ ] **Verify permissions**
  - [ ] Function is accessible to `authenticated` role
  - [ ] Function is accessible to `anon` role

## Vercel Deployment

- [ ] **Deploy to Vercel**
  ```bash
  git add .
  git commit -m "Add database keepalive solution"
  git push origin main
  ```

- [ ] **Verify deployment succeeded**
  - [ ] No build errors
  - [ ] All environment variables copied to Vercel
  - [ ] Functions deployed successfully

- [ ] **Check cron job registration**
  - [ ] Go to Vercel Dashboard → Functions
  - [ ] Verify cron job appears in the list
  - [ ] Schedule shows as `*/10 * * * *`

## Post-Deployment Testing

- [ ] **Test production endpoints**
  ```bash
  curl https://your-app.vercel.app/api/keepalive
  curl https://your-app.vercel.app/api/health
  ```

- [ ] **Verify responses**
  - [ ] `/api/keepalive` returns `{"success": true, ...}`
  - [ ] `/api/health` returns `{"status": "healthy", ...}`
  - [ ] No error messages in response

- [ ] **Check Vercel Function logs**
  - [ ] Go to Vercel Dashboard → Functions → View Function Details
  - [ ] Look for successful executions every 10 minutes
  - [ ] No error logs present

## Monitoring Setup

- [ ] **Set up monitoring (optional)**
  - [ ] Access the integrated monitoring dashboard via Settings → System Monitoring
  - [ ] Configure external monitoring (UptimeRobot, etc.)
  - [ ] Set up alerts for failed executions

- [ ] **Verify automatic execution**
  - [ ] Wait 10-15 minutes after deployment
  - [ ] Check Vercel function logs for automatic execution
  - [ ] Verify logs show successful database connections

## Security Checklist

- [ ] **Review security settings**
  - [ ] `CRON_SECRET` is set (if using authorization)
  - [ ] No sensitive data in function logs
  - [ ] Supabase RLS policies are correctly configured

- [ ] **Test authorization (if enabled)**
  ```bash
  # Should fail without proper authorization
  curl https://your-app.vercel.app/api/keepalive
  
  # Should succeed with proper authorization
  curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/keepalive
  ```

## Troubleshooting

### Common Issues

- [ ] **Cron job not running**
  - [ ] Verify `vercel.json` is in project root
  - [ ] Redeploy after adding cron configuration
  - [ ] Check Vercel dashboard for cron job registration

- [ ] **Database connection errors**
  - [ ] Verify Supabase environment variables
  - [ ] Check Supabase project is not paused
  - [ ] Test database connection manually

- [ ] **Function timeout errors**
  - [ ] Check function duration in Vercel logs
  - [ ] Verify `maxDuration` setting in `vercel.json`
  - [ ] Optimize database queries if needed

### Testing Commands

```bash
# Local testing
./scripts/test-keepalive.sh local

# Production testing  
./scripts/test-keepalive.sh production

# Manual health check
curl https://your-app.vercel.app/api/health | jq '.'

# Check specific endpoint
curl -v https://your-app.vercel.app/api/keepalive
```

## Success Criteria

Your keepalive solution is working correctly when:

- [ ] ✅ Cron job executes every 10 minutes automatically
- [ ] ✅ Function logs show successful database connections
- [ ] ✅ Health endpoint returns "healthy" status
- [ ] ✅ Supabase database remains active (no auto-pause)
- [ ] ✅ No error messages in Vercel function logs
- [ ] ✅ System continues working after 7+ days

## Maintenance

- [ ] **Regular monitoring**
  - [ ] Check Vercel function logs weekly
  - [ ] Monitor Supabase database activity
  - [ ] Verify no errors or failures

- [ ] **Monthly review**
  - [ ] Review function execution times
  - [ ] Check for any failed executions
  - [ ] Update dependencies if needed

---

🎉 **Congratulations!** Your Supabase database keepalive solution is now active and will prevent your database from auto-pausing due to inactivity.
