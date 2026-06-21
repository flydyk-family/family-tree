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
        (gcloud needs Python 3.10-3.14; if your default `python` is older or is the
         Windows Store stub, pass -CloudSdkPython <python.exe> — e.g. a conda env's.)
      * gh CLI, authenticated:      gh auth login        (unless -SkipGitHub)
      * billing enabled on the project (pass -BillingAccountId to link it, or do
        it in the console) — Cloud Run will not deploy without it.

.EXAMPLE
    ./setup-gcp-deploy.ps1 -ProjectId my-fam-tree -GitHubRepo flydyk-family/family-tree

.EXAMPLE
    # gcloud's default Python is too old — wire it to a conda interpreter for this run:
    ./setup-gcp-deploy.ps1 -ProjectId my-fam-tree -CloudSdkPython 'D:\Soft\miniconda3\python.exe'

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
    [string]$GoogleClientId         = '',   # public OAuth client ID; sign-in env + GitHub var are wired only if set
    [string[]]$EditorEmails         = @(),  # editor allow-list (PII → Secret Manager); one secret per entry
    [string]$SeedBucket             = '',   # GCS seed bucket; defaults to "<ProjectId>-family-seed" when empty
    [string]$SeedObject             = 'family.json',
    [string]$CloudSdkPython         = '',   # path to a Python 3.10-3.14 exe for gcloud (sets CLOUDSDK_PYTHON);
                                            # use when your default `python` is too old (e.g. a conda env's python.exe)

    # --- GitHub ---
    [string]$GitHubRepo             = '',   # 'owner/repo'; auto-detected via gh if empty
    [switch]$SkipGitHub,

    # --- Cloudflare (mostly manual; values flow into GitHub if provided) ---
    [string]$CloudflarePagesProject = 'family-tree',
    [string]$PagesProductionBranch  = 'production',   # prod/preview LABEL; MUST equal deploy.yml's --branch
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
# gcloud requires Python 3.10-3.14. If your default `python` is older (e.g. 3.8) or
# resolves to the Windows Store stub, point gcloud at a good interpreter for this run.
if ($CloudSdkPython) {
    if (-not (Test-Path $CloudSdkPython)) { throw "CloudSdkPython not found: $CloudSdkPython" }
    $env:CLOUDSDK_PYTHON = $CloudSdkPython
    $pyVer = ((& $CloudSdkPython --version 2>&1) -replace 'Python\s*', '').Trim()
    if ($pyVer -notmatch '^3\.(1[0-4])\b') { Write-Warning "CLOUDSDK_PYTHON is Python $pyVer; gcloud needs 3.10-3.14." }
    Write-Note "gcloud will use CLOUDSDK_PYTHON = $CloudSdkPython (Python $pyVer)"
}
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
  Google Client ID .. $(if ($GoogleClientId) { 'yes' } else { 'skip' })
  Editor emails ..... $(if ($EditorEmails.Count -gt 0) { "$($EditorEmails.Count) provided" } else { 'skip' })
  Seed bucket ....... $(if ($SeedBucket) { $SeedBucket } else { "<ProjectId>-family-seed (default)" })
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

# ----------------------------- 7b. Firestore (durable edits) -----------------
Write-Step 'Firestore (native mode)'
Invoke-Exe gcloud @('services', 'enable', 'firestore.googleapis.com', '--project', $ProjectId)
if (Test-Exe gcloud @('firestore', 'databases', 'describe', '--database=(default)', '--project', $ProjectId)) {
    Write-Note 'Default Firestore database already exists.'
} else {
    Invoke-Exe gcloud @('firestore', 'databases', 'create', '--location', $Region, '--type', 'firestore-native', '--project', $ProjectId)
}
Invoke-Exe gcloud @('projects', 'add-iam-policy-binding', $ProjectId,
    '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com",
    '--role', 'roles/datastore.user', '--condition=None')

# TTL policy: expired session docs self-reap (the app filters them on read, but never
# deletes them). The store writes `expiresAt` as a Firestore timestamp. Best-effort and
# idempotent — re-enabling an already-enabled TTL is a harmless no-op.
try {
    Invoke-Exe gcloud @('firestore', 'fields', 'ttls', 'update', 'expiresAt',
        '--collection-group=sessions', '--enable-ttl', '--project', $ProjectId, '--quiet')
} catch {
    Write-Warning "Could not enable the Firestore TTL on sessions.expiresAt ($($_.Exception.Message)). Set it later: gcloud firestore fields ttls update expiresAt --collection-group=sessions --enable-ttl --project $ProjectId"
}

# Security rules: deny ALL client/REST access. The API reaches Firestore via the Admin
# SDK (ADC + datastore.user), which bypasses rules, so this is pure defense-in-depth —
# it stops an accidental console "test mode" toggle from opening the data. Best-effort
# (needs `firebase login` once); the committed firestore.rules is the source of truth.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..' '..')).Path
try {
    Invoke-Exe gcloud @('services', 'enable', 'firebaserules.googleapis.com', '--project', $ProjectId)
    Invoke-Exe npx @('-y', 'firebase-tools@latest', 'deploy', '--only', 'firestore:rules',
        '--project', $ProjectId, '--config', (Join-Path $repoRoot 'firebase.json'), '--non-interactive')
} catch {
    Write-Warning "Could not deploy firestore.rules ($($_.Exception.Message)). Deploy it manually after 'firebase login': npx -y firebase-tools@latest deploy --only firestore:rules --project $ProjectId"
}

# ----------------------------- 7c. GCS seed bucket ---------------------------
Write-Step 'GCS seed bucket'
if (-not $SeedBucket) { $SeedBucket = "$ProjectId-family-seed" }
Invoke-Exe gcloud @('services', 'enable', 'storage.googleapis.com', '--project', $ProjectId)
if (Test-Exe gcloud @('storage', 'buckets', 'describe', "gs://$SeedBucket", '--project', $ProjectId)) {
    Write-Note "Bucket gs://$SeedBucket already exists."
} else {
    Invoke-Exe gcloud @('storage', 'buckets', 'create', "gs://$SeedBucket",
        '--project', $ProjectId, '--location', $Region, '--uniform-bucket-level-access')
}
Invoke-Exe gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$SeedBucket",
    '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com",
    '--role', 'roles/storage.objectViewer')
# Publish the committed seed so the first real deploy can read it (fail-fast on startup
# otherwise). Re-publish an edited seed later with scripts/upload-seed.mjs.
# ($repoRoot was resolved in 7b for the firestore.rules deploy.)
$seedPath = Join-Path $repoRoot 'src/backend/FamilyTree.Api/Data/family.json'
Invoke-Exe gcloud @('storage', 'cp', $seedPath, "gs://$SeedBucket/$SeedObject", '--project', $ProjectId)

# ----------------------------- 7d. Editor allow-list (Secret Manager) --------
Write-Step 'Editor allow-list (Secret Manager)'
if ($EditorEmails.Count -gt 0) {
    Invoke-Exe gcloud @('services', 'enable', 'secretmanager.googleapis.com', '--project', $ProjectId)
    for ($i = 0; $i -lt $EditorEmails.Count; $i++) {
        $secretName = "family-editor-$i"
        $tmp = New-TemporaryFile
        try {
            [System.IO.File]::WriteAllText($tmp.FullName, $EditorEmails[$i])   # no trailing newline
            if (Test-Exe gcloud @('secrets', 'describe', $secretName, '--project', $ProjectId)) {
                Invoke-Exe gcloud @('secrets', 'versions', 'add', $secretName, '--data-file', $tmp.FullName, '--project', $ProjectId)
            } else {
                Invoke-Exe gcloud @('secrets', 'create', $secretName, '--data-file', $tmp.FullName, '--project', $ProjectId)
            }
        } finally {
            Remove-Item $tmp.FullName -Force
        }
        Invoke-Exe gcloud @('secrets', 'add-iam-policy-binding', $secretName, '--project', $ProjectId,
            '--role', 'roles/secretmanager.secretAccessor',
            '--member', "serviceAccount:${pnum}-compute@developer.gserviceaccount.com", '--condition=None')
    }
} else {
    Write-Note 'No -EditorEmails provided - editors unset (sign-in works, no one can edit).'
}

# ----------------------------- 7e. Cloud Run runtime config ------------------
Write-Step 'Cloud Run runtime config (env vars + secrets)'
$envList = "Firestore__ProjectId=$ProjectId,FamilyData__Source=gs://$SeedBucket/$SeedObject"
if ($GoogleClientId) { $envList += ",Authentication__Google__ClientId=$GoogleClientId" }
Invoke-Exe gcloud @('run', 'services', 'update', $CloudRunService, '--project', $ProjectId, '--region', $Region,
    '--update-env-vars', $envList)
if ($EditorEmails.Count -gt 0) {
    $secretPairs = (0..($EditorEmails.Count - 1) |
        ForEach-Object { "Authentication__Google__Editors__$($_)=family-editor-$($_):latest" }) -join ','
    Invoke-Exe gcloud @('run', 'services', 'update', $CloudRunService, '--project', $ProjectId, '--region', $Region,
        '--update-secrets', $secretPairs)
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
    if ($GoogleClientId) {
        Set-GhVar 'VITE_GOOGLE_CLIENT_ID' $GoogleClientId
    } else {
        Write-Note 'No -GoogleClientId provided - set the VITE_GOOGLE_CLIENT_ID GitHub variable before releasing.'
    }
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
        # Production branch is a Direct-Upload prod/preview LABEL (releases deploy from
        # a vX.Y.Z tag, not a watched git branch). It MUST equal deploy.yml's
        # `--branch` so each release publishes to production, not a preview.
        Write-Host "  > npx wrangler pages project create $CloudflarePagesProject --production-branch $PagesProductionBranch" -ForegroundColor DarkCyan
        & npx wrangler pages project create $CloudflarePagesProject --production-branch $PagesProductionBranch
        if ($LASTEXITCODE -ne 0) { Write-Warning 'wrangler project create failed (it may already exist).' }
    }
}
Write-Host '  ACTION REQUIRED in the Cloudflare dashboard (Workers & Pages):' -ForegroundColor Magenta
Write-Host "    - production branch (project settings) = $PagesProductionBranch   (must equal deploy.yml --branch)" -ForegroundColor Magenta
Write-Host "    - environment variable  API_ORIGIN = $cloudRunUrl   (Production), then redeploy the SPA" -ForegroundColor Magenta

# ------------------------------------------------------------- summary -------
Write-Step 'Summary'
Write-Host @"
  Cloud Run URL ................. $cloudRunUrl
  WIF provider (GH secret) ...... $providerResource
  Deployer SA (GH secret) ....... $saEmail
  GitHub repo ................... $GitHubRepo

Remaining manual steps:
  1. Cloudflare Pages: production branch = $PagesProductionBranch (must equal deploy.yml --branch),
     and env var API_ORIGIN = $cloudRunUrl (Production), then redeploy the SPA.
  2. If not passed here, set the GitHub secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
  3. Auth/Firestore/GCS (done by this script): Firestore (native) enabled with a TTL on
     sessions.expiresAt, seed bucket gs://$SeedBucket created + seeded, editor secrets in
     Secret Manager, Cloud Run configured. The deny-all firestore.rules deploy is best-effort
     (needs a one-time 'firebase login'); if it was skipped above, run:
       npx -y firebase-tools@latest deploy --only firestore:rules --project $ProjectId
     Still manual: if you did not pass -GoogleClientId, set the VITE_GOOGLE_CLIENT_ID GitHub
     variable (= the public client ID) before releasing; re-publish an edited seed with:
     SEED_BUCKET=$SeedBucket SEED_OBJECT=$SeedObject node scripts/upload-seed.mjs
  4. Release: cut release-X.Y.Z from main, bump main's VERSION, then
     `git tag vX.Y.Z` and `git push origin vX.Y.Z` (see deploy.md).
"@ -ForegroundColor White
Write-Host 'Done.' -ForegroundColor Green
