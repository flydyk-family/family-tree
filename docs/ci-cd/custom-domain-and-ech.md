# Custom domain & disabling ECH (regional access fix)

How to keep the site reachable from **Belarus / Russia**, where the default
`*.pages.dev` deployment is blocked at the network level. The fix is to serve the
app from a **custom domain on our own Cloudflare zone** and **disable ECH** on that
zone. This is an operational runbook (DNS/Cloudflare settings) — it does **not**
touch app code or the deploy pipeline.

## The problem

A visitor in Belarus reported the site simply would not open
(`https://family-tree-4fl.pages.dev` timed out / reset); the same link worked fine
from the US. Two overlapping, country-level filtering mechanisms cause this:

1. **`*.pages.dev` is blanket-blocked.** Cloudflare's free subdomains are widely
   used to bypass censorship, so the whole `pages.dev` apex is filtered in BY/RU —
   our specific subdomain is caught regardless of content.
2. **Cloudflare's ECH (Encrypted Client Hello) handshake is dropped by DPI.** In
   October 2024 Cloudflare turned **ECH on by default** across its edge (including
   Pages). Since 2024-11-05 Russia's TSPU — and Belarus uses the same filtering
   stack — drops any TLS 1.3 connection that advertises the `cloudflare-ech.com`
   SNI + ECH extension. ECH only exists in **TLS 1.3**, which is why forcing a
   client to TLS 1.2 "fixes" it (no TLS 1.3 ⇒ no ECH extension).

Both are about *reaching Cloudflare's edge*. Our `/api/*` proxy fetches Cloud Run
server-side (browser → Cloudflare → Cloud Run), so once a visitor can reach
Cloudflare at all, the rest works.

### Why not just flip a TLS toggle in the dashboard?

- On the bare **`*.pages.dev`** host there are **no SSL/TLS controls** — it lives in
  Cloudflare's own zone, not ours.
- **Pages custom domains use Pages' own SSL/TLS settings** and ignore the zone-level
  *Minimum TLS Version* / *TLS 1.3* toggles — so those don't help either.
- **ECH, however, is advertised through the zone's DNS `HTTPS` record**, which the
  zone-level **ECH** setting *does* control. Disabling it stops Cloudflare from
  publishing the `ech=` parameter for hostnames in the zone — verified empirically
  below.
- The dashboard ECH toggle (**SSL/TLS → Edge Certificates → Encrypted ClientHello**)
  is **paid-plan only**; the **API** call works on the **free** plan, so we use the
  API.

## The setup

- **Registrable domain:** `perovsky.family` (registered via **Cloudflare Registrar**,
  so it is automatically a Cloudflare **zone** — no nameserver change needed).
- **App hostname:** the app is served from the **apex** `perovsky.family`, attached to
  the Pages project (**Pages → the project → Custom domains → Set up a custom domain**).
  Cloudflare auto-creates the record and the edge certificate; at the apex it applies
  **CNAME flattening** automatically.
- **ECH disabled** on the `perovsky.family` zone — a zone-level setting that covers the
  apex (and any hostname under it).

> The deploy pipeline still publishes the SPA to
> [`family-tree-4fl.pages.dev`](https://family-tree-4fl.pages.dev) (the Pages project);
> **`perovsky.family`** is the custom domain layered on top and the URL handed to
> visitors. Because visitors load — and sign in from — `https://perovsky.family`, add
> that origin to the OAuth client's **Authorized JavaScript origins** (see
> [`google-signin-setup.md`](google-signin-setup.md)) or Google sign-in fails there. If
> you retire the `*.pages.dev` URL entirely, also update the production-URL references in
> the root `README.md`, `CLAUDE.md`, and [`docs/reference/`](../reference/README.md).

## Disable ECH

### 1. Get the Zone ID
Cloudflare dashboard → select **perovsky.family** → **Overview** → right sidebar
**API** section → copy **Zone ID**.

### 2. Create a scoped API token (preferred over the Global API Key)
**My Profile → API Tokens → Create Token → Custom token**:
- **Permissions:** `Zone` · `Zone Settings` · **Edit** (if the call returns an
  authorization error, also add `Zone` · `SSL and Certificates` · **Edit**).
- **Zone Resources:** Include · **Specific zone** · `perovsky.family`.

The Global API Key (`X-Auth-Email` + `X-Auth-Key`) also works — that's what the
[reference article](https://habr.com/ru/articles/856602/) uses — but it has full
account access, so a single-zone token is the safe choice. **Never commit either.**

### 3. Send the PATCH

**PowerShell:**
```powershell
$zone  = "<ZONE_ID>"
$token = "<API_TOKEN>"

Invoke-RestMethod -Method Patch `
  -Uri "https://api.cloudflare.com/client/v4/zones/$zone/settings/ech" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"id":"ech","value":"off"}'
```

**curl:**
```bash
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/settings/ech" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"id":"ech","value":"off"}'
```

Success returns `"success": true` with `"result": { "id": "ech", "value": "off", … }`.

### 4. Verify (allow ~5–15 min for DNS to refresh)

```powershell
(Invoke-RestMethod "https://dns.google/resolve?name=perovsky.family&type=HTTPS").Answer.data
```

The output should still show `alpn=` / `ipv4hint=` etc. but **no `ech=`**. For
reference, while ECH was *on* the `HTTPS` record contained:

```
1 . alpn=h3,h2 ipv4hint=… ech=AEX+DQBBDwAg…Y2xvdWRmbGFyZS1lY2guY29t… ipv6hint=…
```

(the base64 decodes to include `cloudflare-ech.com` — exactly the DPI trigger). When
the `ech=` field is gone, have the Belarus visitor retry **`https://perovsky.family`**
in a fresh browser.

> The ECH disable only helps on **`perovsky.family`** — it does nothing for the old
> `family-tree-4fl.pages.dev` URL (Cloudflare's zone, not ours). BY/RU visitors must
> use the custom-domain URL.

## Revert (re-enable ECH)

ECH is on by default at Cloudflare; we explicitly turned it off. To restore the
default, PATCH the same endpoint with `value: on`.

**Check the current value first:**
```powershell
Invoke-RestMethod -Method Get `
  -Uri "https://api.cloudflare.com/client/v4/zones/$zone/settings/ech" `
  -Headers @{ Authorization = "Bearer $token" }
```

**Re-enable:**
```powershell
Invoke-RestMethod -Method Patch `
  -Uri "https://api.cloudflare.com/client/v4/zones/$zone/settings/ech" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"id":"ech","value":"on"}'
```

(curl: same as the disable command with `"value":"on"`.) After a few minutes the
`ech=` parameter reappears in the `HTTPS` record — confirm with the same DoH query.

**When / why to revert — and the trade-off.** Re-enabling ECH **re-blocks the site in
Belarus/Russia**, so only do it if BY/RU reachability no longer matters, e.g. you've
moved the site off Cloudflare's edge or the regional ECH blocking has ended. The only
thing ECH buys here is hiding the SNI (which site a visitor connects to) from the
network; disabling it exposes the SNI, a minor privacy reduction with no functional
downside for a public site.

## References
- [ECH Protocol · Cloudflare SSL/TLS docs](https://developers.cloudflare.com/ssl/edge-certificates/ech/)
- [Disabling ECH on the Cloudflare free tier via API — Bisquit Wiki](https://wiki.bisquit.host/cloudflare/ech/)
- [Blocking of Cloudflare ECH in Russia (2024-11-05) — net4people/bbs #417](https://github.com/net4people/bbs/issues/417)
- [Habr — Как отключить ECH для вашего домена на Cloudflare](https://habr.com/ru/articles/856602/)
