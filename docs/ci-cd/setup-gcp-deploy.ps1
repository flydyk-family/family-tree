#Requires -Version 7.0
<#
.SYNOPSIS
    One-time owner setup for deploying the family-tree API to Google Cloud Run
    (+ Artifact Registry + Workload Identity Federation) and wiring GitHub Actions.

.DESCRIPTION
    Sequential, idempotent companion to docs/ci-cd/deploy.md. Safe to re-run:
    existing resources are detected and skipped (it never re-seeds a Cloud Run
    service that already exists). Automates the Google Cloud and GitHub steps.

    The Cloudflare Pages `API_ORIGIN` environment variable is NOT set here
    (Cloudflare project env vars are not reliably settable from the CLI) — the
    script captures the Cloud Run URL and prints exactly what to paste.

    Prerequisites:
      * gcloud CLI, authenticated:  gcloud auth login
      * gh CLI, authenticated:      gh auth login        (unless -SkipGitHub)
      * billing enabled on the project (pass -BillingAccountId to link it, or do
        it in the console) — Cloud Run will not deploy without it.

.EXAMPLE
    ./setup-gcp-deploy.ps1 -ProjectId my-fam-tree -GitHubRepo flydyk-family/family-tree

.EXAMPLE
    ./setup-gcp-deploy.ps1 -ProjectId my-fam-tree -Region europe-west1 `
        -BillingAccountId 0X0X0X-0X0X0X-0X0X0X `
        -MediatRLicenseKey (Read-Host 'MediatR key' -AsSecureString | ConvertFrom-SecureString -AsPlainText) `
        -CloudflareAccountId <acct> -CloudflareApiToken <token>
#>
[CmdletBinding()]
param(
    # --- Google Cloud ---
    [Parameter(Mandatory)][string]$ProjectId,
    [string]$Region                 = 'europe-west1',
    [string]$GarRepository          = 'familytree',
    [string]$CloudRunService        = 'familytree-api',
    [string]$DeployerSaName         = 'github-deployer',
    [string]$WifPoolId              = 'github',
    [string]$WifProviderId          = 'github',
    [string]$BillingAccountId       = '',   # link billing if given (e.g. 0X0X0X-0X0X0X-0X0X0X)
    [string]$MediatRLicenseKey      = '',   # optional; the secret step is skipped if empty

    # --- GitHub ---
    [string]$GitHubRepo             = '',   # 'owner/repo'; auto-detected via gh if empty
    [switch]$SkipGitHub,

    # --- Cloudflare (mostly manual; values flow into GitHub if provided) ---
    [string]$CloudflarePagesProject = 'family-tree',
    [string]$CloudflareAccountId    = '',
    [string]$CloudflareApiToken     = '',
    [switch]$CreateCloudflareProject,       # uses npx wrangler if set
    [switch]$SkipCloudflare,

    [switch]$Force                          # skip the confirmation prompt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- helpers ----
function Write-Step { param([string]$Msg) Write-Host "`n=== $Msg ===" -ForegroundColor Green }
function Write-Note { param([string]$Msg) Write-Host "  - $Msg" -ForegroundColor Yellow }

function Invoke-Exe {
    param([Parameter(Mandatory, Position = 0)][string]$Exe,
          [Parameter(Mandatory, Position = 1)][string[]]$ExeArgs)
    Write-Host "  > $Exe $($ExeArgs -join ' ')" -ForegroundColor DarkCyan
    & $Exe @ExeArgs
    if ($LASTEXITCODE -ne 0) { throw "$Exe exited with code $LASTEXITCODE" }
}
function Get-ExeValue {
    param([Parameter(Mandatory, Position = 0)][string]$Exe,
          [Parameter(Mandatory, Position = 1)][string[]]$ExeArgs)
    $out = & $Exe @ExeArgs
    if ($LASTEXITCODE -ne 0) { throw "$Exe exited with code $LASTEXITCODE" }
    return (($out | Out-String).Trim())
}
function Test-Exe {
    param([Parameter(Mandatory, Position = 0)][string]$Exe,
          [Parameter(Mandatory, Position = 1)][string[]]$ExeArgs)
    & $Exe @ExeArgs *> $null
    return ($LASTEXITCODE -eq 0)
}
function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}
function Set-GhSecret {
    param([string]$Name, [string]$Value)
    Invoke-Exe gh @('secret', 'set', $Name, '--repo', $GitHubRepo, '--body', $Value)
}
function Set-GhVar {
    param([string]$Name, [string]$Value)
    Invoke-Exe gh @('variable', 'set', $Name, '--repo', $GitHubRepo, '--body', $Value)
}

# ------------------------------------------------------------- preflight -----
Assert-Command gcloud
if (-not $SkipGitHub) { Assert-Command gh }

if ([string]::IsNullOrWhiteSpace($GitHubRepo)) {
    try   { $GitHubRepo = Get-ExeValue gh @('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner') }
    catch { throw "Could not auto-detect the GitHub repo. Pass -GitHubRepo 'owner/repo'." }
}

$saEmail          = "$DeployerSaName@$ProjectId.iam.gserviceaccount.com"

Write-Host @"

Family-tree deploy setup
------------------------
  Project ........... $ProjectId
  Region ............ $Region
  Artifact Registry . $GarRepository
  Cloud Run service . $CloudRunService
  Deployer SA ....... $saEmail
  WIF pool/provider . $WifPoolId / $WifProviderId
  GitHub repo ....... $GitHubRepo
  MediatR secret .... $(if ($MediatRLicenseKey) { 'yes' } else { 'skip' })
  GitHub wiring ..... $(if ($SkipGitHub) { 'skip' } else { 'yes' })
  Cloudflare ........ $(if ($SkipCloudflare) { 'skip' } elseif ($CreateCloudflareProject) { "create '$CloudflarePagesProject'" } else { 'manual env var only' })
"@ -ForegroundColor White

if (-not $Force) {
    if ((Read-Host 'Proceed? (y/N)') -ne 'y') { Write-Host 'Aborted.'; return }
}

# --------------------------------------------------------- 1. billing --------
Write-Step '1/8  Billing'
if ($BillingAccountId) {
    Invoke-Exe gcloud @('billing', 'projects', 'link', $ProjectId, '--billing-account', $BillingAccountId)
} else {
    try {
        $enabled = Get-ExeValue gcloud @('billing', 'projects', 'describe', $ProjectId, '--format=value(billingEnabled)')
        if ($enabled -eq 'True') { Write-Note 'Billing already enabled.' }
        else { Write-Warning "Billing is NOT enabled on '$ProjectId'. Cloud Run deploys will fail until you link a billing account (-BillingAccountId or the console)." }
    } catch {
        Write-Warning "Could not read billing status ($($_.Exception.Message)). Ensure billing is enabled before releasing."
    }
}

# --------------------------------------------------------- 2. APIs -----------
Write-Step '2/8  Enable APIs'
Invoke-Exe gcloud @('services', 'enable',
    'run.googleapis.com', 'artifactregistry.googleapis.com',
    'iamcredentials.googleapis.com', 'sts.googleapis.com',
    '--project', $ProjectId)

# ----------------------------------------------- 3. Artifact Registry --------
Write-Step '3/8  Artifact Registry repository'
if (Test-Exe gcloud @('artifacts', 'repositories', 'describe', $GarRepository, '--location', $Region, '--project', $ProjectId)) {
    Write-Note "Repository '$GarRepository' already exists."
} else {
    Invoke-Exe gcloud @('artifacts', 'repositories', 'create', $GarRepository,
        '--repository-format=docker', '--location', $Region, '--project', $ProjectId)
}

# ----------------------------------------------- 4. Cloud Run service --------
Write-Step '4/8  Cloud Run service (seed + capture URL)'
if (Test-Exe gcloud @('run', 'services', 'describe', $CloudRunService, '--region', $Region, '--project', $ProjectId)) {
    Write-Note "Service '$CloudRunService' already exists - not re-seeding."
} else {
    Invoke-Exe gcloud @('run', 'deploy', $CloudRunService, '--project', $ProjectId, '--region', $Region,
        '--image', 'us-docker.pkg.dev/cloudrun/container/hello',
        '--allow-unauthenticated', '--port', '8080', '--min-instances', '0')
}
$cloudRunUrl = Get-ExeValue gcloud @('run', 'services', 'describe', $CloudRunService,
    '--region', $Region, '--project', $ProjectId, '--format=value(status.url)')
Write-Host "  Cloud Run URL: $cloudRunUrl" -ForegroundColor Cyan

# ------------------------------------- 5. Deployer SA + IAM roles ------------
Write-Step '5/8  Deployer service account + roles'
if (Test-Exe gcloud @('iam', 'service-accounts', 'describe', $saEmail, '--project', $ProjectId)) {
    Write-Note "Service account '$saEmail' already exists."
} else {
    Invoke-Exe gcloud @('iam', 'service-accounts', 'create', $DeployerSaName, '--project', $ProjectId,
        '--display-name', 'GitHub Actions deployer (family-tree)')
}
foreach ($role in @('roles/run.admin', 'roles/artifactregistry.writer', 'roles/iam.serviceAccountUser')) {
    Invoke-Exe gcloud @('projects', 'add-iam-policy-binding', $ProjectId,
        '--member', "serviceAccount:$saEmail", '--role', $role, '--condition=None')
}

# ------------------------------- 6. Workload Identity Federation -------------
Write-Step '6/8  Workload Identity Federation'
if (Test-Exe gcloud @('iam', 'workload-identity-pools', 'describe', $WifPoolId, '--location', 'global', '--project', $ProjectId)) {
    Write-Note "Pool '$WifPoolId' already exists."
} else {
    Invoke-Exe gcloud @('iam', 'workload-identity-pools', 'create', $WifPoolId,
        '--location', 'global', '--project', $ProjectId, '--display-name', 'GitHub Actions')
}
if (Test-Exe gcloud @('iam', 'workload-identity-pools', 'providers', 'describe', $WifProviderId, '--location', 'global', '--workload-identity-pool', $WifPoolId, '--project', $ProjectId)) {
    Write-Note "Provider '$WifProviderId' already exists."
} else {
    Invoke-Exe gcloud @('iam', 'workload-identity-pools', 'providers', 'create-oidc', $WifProviderId,
        '--location', 'global', '--workload-identity-pool', $WifPoolId, '--project', $ProjectId,
        '--issuer-uri', 'https://token.actions.githubusercontent.com',
        '--attribute-mapping', 'google.subject=assertion.sub,attribute.repository=assertion.repository',
        '--attribute-condition', "assertion.repository=='$GitHubRepo'")
}
$pnum = Get-ExeValue gcloud @('projects', 'describe', $ProjectId, '--format=value(projectNumber)')
# Stable subject matching the workflow's `environment: production`.
$member = "principal://iam.googleapis.com/projects/$pnum/locations/global/workloadIdentityPools/$WifPoolId/subject/repo:${GitHubRepo}:environment:production"
Invoke-Exe gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $saEmail, '--project', $ProjectId,
    '--role', 'roles/iam.workloadIdentityUser', '--member', $member, '--condition=None')
$providerResource = "projects/$pnum/locations/global/workloadIdentityPools/$WifPoolId/providers/$WifProviderId"

# ----------------------------------- 7. MediatR licence (optional) ----------
Write-Step '7/8  MediatR licence key (optional)'
if ($MediatRLicenseKey) {
    Invoke-Exe gcloud @('services', 'enable', 'secretmanager.googleapis.com', '--project', $ProjectId)
    $tmp = New-TemporaryFile
    try {
        [System.IO.File]::WriteAllText($tmp.FullName, $MediatRLicenseKey)   # no trailing newline
        if (Test-Exe gcloud @('secrets', 'describe', 'mediatr-license-key', '--project', $ProjectId)) {
            Write-Note 'Secret exists - adding a new version.'
            Invoke-Exe gcloud @('secrets', 'versions', 'add', 'mediatr-license-key', '--data-file', $tmp.FullName, '--project', $ProjectId)
        } else {
            Invoke-Exe gcloud @('secrets', 'create', 'mediatr-license-key', '--data-file', $tmp.FullName, '--project', $ProjectId)
        }
    } finally {
        Remove-Item $tmp.FullName -Force
    }
    # Default Cloud Run runtime identity is the Compute Engine default SA.
    Invoke-Exe gcloud @('secrets', 'add-iam-policy-binding', 'mediatr-license-key', '--project', $ProjectId,
        '--role', 'roles/secretmanager.secretAccessor',
        '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com", '--condition=None')
    Invoke-Exe gcloud @('run', 'services', 'update', $CloudRunService, '--project', $ProjectId, '--region', $Region,
        '--update-secrets', 'MediatR__LicenseKey=mediatr-license-key:latest')
} else {
    Write-Note 'No -MediatRLicenseKey provided - skipping (the API runs unlicensed with a warning).'
}

# --------------------------------------- 8. GitHub secrets/vars/env ----------
Write-Step '8/8  GitHub secrets, variables, environment'
if ($SkipGitHub) {
    Write-Note 'Skipped (-SkipGitHub).'
} else {
    # production environment (best-effort: needs repo admin; auto-created on first run otherwise)
    try {
        & gh api -X PUT "repos/$GitHubRepo/environments/production" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
        Write-Note "Environment 'production' ensured."
    } catch {
        Write-Warning "Could not create the 'production' environment ($($_.Exception.Message)). The workflow auto-creates it on first run where environments are available."
    }

    Set-GhSecret 'GCP_WORKLOAD_IDENTITY_PROVIDER' $providerResource
    Set-GhSecret 'GCP_SERVICE_ACCOUNT'            $saEmail
    if ($CloudflareApiToken)  { Set-GhSecret 'CLOUDFLARE_API_TOKEN'  $CloudflareApiToken }  else { Write-Note 'CLOUDFLARE_API_TOKEN not provided - set it later.' }
    if ($CloudflareAccountId) { Set-GhSecret 'CLOUDFLARE_ACCOUNT_ID' $CloudflareAccountId } else { Write-Note 'CLOUDFLARE_ACCOUNT_ID not provided - set it later.' }

    Set-GhVar 'GCP_PROJECT_ID'           $ProjectId
    Set-GhVar 'GCP_REGION'               $Region
    Set-GhVar 'GAR_REPOSITORY'           $GarRepository
    Set-GhVar 'CLOUD_RUN_SERVICE'        $CloudRunService
    Set-GhVar 'CLOUDFLARE_PAGES_PROJECT' $CloudflarePagesProject
}

# ------------------------------------------- Cloudflare (mostly manual) ------
Write-Step 'Cloudflare Pages'
if (-not $SkipCloudflare -and $CreateCloudflareProject) {
    if (-not $CloudflareApiToken -or -not $CloudflareAccountId) {
        Write-Warning '-CreateCloudflareProject needs -CloudflareApiToken and -CloudflareAccountId; skipping project creation.'
    } else {
        Assert-Command npx
        $env:CLOUDFLARE_API_TOKEN  = $CloudflareApiToken
        $env:CLOUDFLARE_ACCOUNT_ID = $CloudflareAccountId
        Write-Host "  > npx wrangler pages project create $CloudflarePagesProject --production-branch main" -ForegroundColor DarkCyan
        & npx wrangler pages project create $CloudflarePagesProject --production-branch main
        if ($LASTEXITCODE -ne 0) { Write-Warning 'wrangler project create failed (it may already exist).' }
    }
}
Write-Host '  ACTION REQUIRED - set the Pages environment variable so the proxy can reach the API:' -ForegroundColor Magenta
Write-Host "      API_ORIGIN = $cloudRunUrl" -ForegroundColor Magenta
Write-Host "  (Cloudflare dashboard -> Workers & Pages -> $CloudflarePagesProject -> Settings -> Variables, then redeploy.)"

# ------------------------------------------------------------- summary -------
Write-Step 'Summary'
Write-Host @"
  Cloud Run URL ................. $cloudRunUrl
  WIF provider (GH secret) ...... $providerResource
  Deployer SA (GH secret) ....... $saEmail
  GitHub repo ................... $GitHubRepo

Remaining manual steps:
  1. Set the Cloudflare Pages env var  API_ORIGIN = $cloudRunUrl  (then redeploy the SPA).
  2. If not passed here, set the GitHub secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
  3. Release: ensure root VERSION matches, then push a release-<VERSION> tag (see deploy.md).
"@ -ForegroundColor White
Write-Host 'Done.' -ForegroundColor Green
