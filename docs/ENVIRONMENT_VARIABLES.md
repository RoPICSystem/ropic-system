# Environment Variables for Cron Configuration

## Required for Vercel Deployments API

Add these environment variables to your Vercel project settings:

### VERCEL_TOKEN
- **Description**: Vercel API token for triggering deployments
- **How to get**: Go to Vercel Dashboard → Settings → Tokens → Create Token
- **Scopes needed**: `deployments:write`
- **Example**: `vercel_token_abc123...`

### VERCEL_PROJECT_ID (Optional)
- **Description**: Your Vercel project ID 
- **Default**: `ropic-system`
- **How to get**: Vercel Dashboard → Project Settings → General → Project ID
- **Example**: `prj_abc123...`

### VERCEL_TEAM_ID (Optional)
- **Description**: Your Vercel team ID (only if using team account)
- **How to get**: Vercel Dashboard → Team Settings → General → Team ID
- **Example**: `team_abc123...`

### CRON_SECRET (Optional)
- **Description**: Secret token for additional cron security
- **Example**: `your-secret-key-here`

## Setting Environment Variables in Vercel

1. Go to your Vercel Dashboard
2. Select your project (ropic-system)
3. Go to Settings → Environment Variables
4. Add each variable for Production, Preview, and Development environments

## Git Environment Variables (Auto-populated by Vercel)

These are automatically set by Vercel during deployment:
- `VERCEL_GIT_COMMIT_REF`: Current git branch
- `VERCEL_GIT_REPO_ID`: GitHub repository ID

## Usage

Once configured, the cron configuration API will:
1. Update the local `vercel.json` file
2. Trigger a new Vercel deployment automatically
3. Apply the new cron schedule

## Testing

You can test the setup by:
1. Calling `/api/cron-config` to update the schedule
2. Checking `/api/test-cron` for cron execution logs
3. Monitoring `/api/health` for system status
