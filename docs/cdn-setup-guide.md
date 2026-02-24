# CloudFront CDN Setup Guide (Phase 2.3)

**Goal:** Enable signed CDN URLs for secure, cacheable content delivery.

**Time estimate:** 20–30 minutes

---

## Overview

This guide covers:
1. **Phase 2.1** — Plain URL rewriting (optional, no signing)
2. **Phase 2.3** — CloudFront signed URLs (recommended for production)

**Why use signed URLs?**
- Audio files cached at CloudFront edges (cheaper than S3)
- Presigned URLs expire automatically (security)
- DDoS protection via CloudFront
- Cost reduction: ~50% vs direct S3

---

## Prerequisites

- AWS account with CloudFront + S3 access
- S3 bucket already created (where audio/PDF files are stored)
- OpenSSL installed (`openssl` command available)
- `.env` file ready to edit

---

## Part 1: CloudFront Distribution Setup (AWS Console)

### Step 1: Create CloudFront Distribution

1. Go to **AWS Console** → **CloudFront**
2. Click **Create distribution**
3. Choose **Web** as the distribution type

### Step 2: Configure Origin

**Origin Domain Name:**
- Select your S3 bucket (e.g., `clap-storage.s3.ap-south-1.amazonaws.com`)
- If using Supabase Storage (S3-compatible), use the Supabase S3 endpoint

**Origin Path:**
- Leave empty (files are at bucket root)

**Restrict Bucket Access:**
- Select **Yes** (recommended)
- Create **New Origin Access Control (OAC)**
- Name: `clap-s3-oac`
- Type: `S3`
- This ensures CloudFront is the only way to access S3 files

### Step 3: Default Cache Behavior

**Viewer Protocol Policy:**
- **Redirect HTTP to HTTPS** (production) or **Allow both** (dev)

**Allowed HTTP Methods:**
- `GET, HEAD` (only needed for downloads)

**Cache Policy:**
- Select **Managed-CachingOptimized**
- Or create custom:
  - TTL: 86400 (24 hours for audio/PDF)
  - Query strings: Forward all (for presigned URLs)

**Request Policy:**
- **Managed-AllViewerExceptHostHeader** (forward auth headers)

**Origin Request Policy:**
- **AllViewer** (needed for presigned URL parameters)

### Step 4: Restrict Access with Signed URLs

**Restrict Viewer Access:**
- Select **Yes**
- **Type:** Trusted key groups (not trusted signers — deprecated)

### Step 5: Create Key Pair for Signing

**In AWS Console → CloudFront → Public keys:**

1. Click **Create public key**
2. Name: `clap-signing-key`
3. Upload your **public key file** (we'll generate this next)
4. Copy the **Key Pair ID** (looks like `K2XXXXXXXXXXXXX`)

### Step 6: Create Key Group

**In AWS Console → CloudFront → Key groups:**

1. Click **Create key group**
2. Name: `clap-key-group`
3. Add the public key you just created
4. Save

### Step 7: Finish Distribution

**Alternate domain names (CNAMEs):**
- Add your CDN domain if you have one (e.g., `cdn.example.com`)
- Leave empty if using CloudFront domain

**Default Root Object:**
- Leave empty

**Create distribution** and wait ~5 minutes for it to deploy

Note the **Distribution Domain Name** (e.g., `d123abc456.cloudfront.net`)

---

## Part 2: Generate RSA Key Pair (Local Machine)

### Step 1: Generate Private Key

```bash
openssl genrsa -out cf_private.pem 2048
```

Output: `cf_private.pem` (~1.7 KB, contains private key)

### Step 2: Extract Public Key

```bash
openssl rsa -pubout -in cf_private.pem -out cf_public.pem
```

Output: `cf_public.pem` (can be shared, use for CloudFront)

### Step 3: Verify Keys

```bash
# View public key (safe to share)
cat cf_public.pem

# View private key (keep secret!)
cat cf_private.pem
```

### Step 4: Base64-Encode Private Key (for .env)

```bash
# macOS/Linux:
base64 -w0 cf_private.pem > cf_private_base64.txt

# Windows (PowerShell):
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("cf_private.pem")) | Set-Content -Path cf_private_base64.txt

# Then copy contents of cf_private_base64.txt
cat cf_private_base64.txt
```

**Copy the output** — this is your `CDN_SIGNING_PRIVATE_KEY` value

---

## Part 3: Configure Django (.env file)

### Step 1: Copy and Edit .env

```bash
cd django-backend
cp .env.example .env
```

### Step 2: Set CDN Phase 2.1 (Plain Rewriting)

```env
# Phase 2.1 — Plain URL rewriting
CDN_ENABLED=True
CDN_BASE_URL=https://d123abc456.cloudfront.net
CDN_PROVIDER=generic
CDN_SIGNED_URLS_ENABLED=False
```

**Test:** This should work immediately. Audio URLs will be rewritten to CloudFront.

### Step 3: Enable Phase 2.3 (Signed URLs)

```env
# Phase 2.3 — CloudFront signed URLs
CDN_SIGNED_URLS_ENABLED=True
CDN_PROVIDER=cloudfront

# From Step 5 above:
CDN_SIGNING_KEY_ID=K2XXXXXXXXXXXXX

# From Step 4 above (base64-encoded private key):
CDN_SIGNING_PRIVATE_KEY=MIIEpAIBAAKCAQEA...VERY_LONG_BASE64_STRING...==
```

### Step 4: Verify .env

```bash
# Check that these are set:
grep "^CDN_" .env
```

Expected output:
```
CDN_ENABLED=True
CDN_BASE_URL=https://d123abc456.cloudfront.net
CDN_PROVIDER=cloudfront
CDN_SIGNED_URLS_ENABLED=True
CDN_SIGNING_KEY_ID=K2XXXXXXXXXXXXX
CDN_SIGNING_PRIVATE_KEY=MIIEpAIBAAKCAQEA...==
```

---

## Part 4: Test CDN Integration

### Test 1: Verify Settings Load

```bash
cd django-backend

# Start Django shell
python manage.py shell

# Check that CDN settings are loaded:
from django.conf import settings
print(f"CDN_ENABLED: {settings.CDN_ENABLED}")
print(f"CDN_BASE_URL: {settings.CDN_BASE_URL}")
print(f"CDN_PROVIDER: {settings.CDN_PROVIDER}")
print(f"CDN_SIGNED_URLS_ENABLED: {settings.CDN_SIGNED_URLS_ENABLED}")
print(f"CDN_SIGNING_KEY_ID: {settings.CDN_SIGNING_KEY_ID[:10]}...")  # First 10 chars only
print(f"CDN_SIGNING_PRIVATE_KEY: {settings.CDN_SIGNING_PRIVATE_KEY[:20]}...")  # First 20 chars

# Should see True, your CloudFront URL, cloudfront, True, K2XXXXX..., MIIEpA...
```

### Test 2: Generate a Signed URL

```python
# (In the Django shell, continue from above)

from api.utils.cdn import generate_signed_cdn_url

# Generate a signed URL for a test object:
signed_url = generate_signed_cdn_url("audio_responses/test.mp3", expires_in=3600)
print(f"Signed URL: {signed_url}")

# Should output: https://d123abc456.cloudfront.net/audio_responses/test.mp3?Policy=...&Signature=...&Key-Pair-Id=K2...
```

### Test 3: Test in Application

1. Start Django server: `python manage.py runserver`
2. Upload an audio file via `/api/admin/clap-items/<id>/upload-audio`
3. Check response URL:
   - Should be: `https://d123abc456.cloudfront.net/audio_responses/...?Policy=...`
   - NOT: `https://clap-storage.s3.ap-south-1.amazonaws.com/...`

### Test 4: Verify CloudFront Origin

```bash
# This request should work (CloudFront to S3):
curl -I "https://d123abc456.cloudfront.net/audio_responses/test.mp3"

# Should see:
# HTTP/2 403  (expected — signed URL needed for authenticated distribution)
# OR
# HTTP/2 200  (if presigned URL is valid)

# Direct S3 access should be blocked:
curl -I "https://clap-storage.s3.ap-south-1.amazonaws.com/audio_responses/test.mp3"
# Should see: HTTP/2 403 AccessDenied (OAC blocks direct access)
```

---

## Part 5: Production Hardening

### TLS/HTTPS

**CloudFront Distribution Settings:**
- **Viewer Protocol Policy:** Redirect HTTP to HTTPS
- **HTTPS Certificate:** Use default CloudFront certificate or import custom

### WAF (Optional)

1. Go to **AWS WAF**
2. Create a Web ACL
3. Attach to CloudFront distribution
4. Add rules (e.g., rate limiting, SQL injection protection)

### Monitoring

**CloudFront Console:**
- Monitor cache hit ratio (should be >80% for audio)
- Set alarms for 4xx/5xx errors

**CloudWatch:**
```bash
# Check CloudFront metrics:
# - Requests, BytesDownloaded, BytesUploaded
# - CacheHitRate, OriginLatency
```

### Key Rotation (Quarterly)

1. Generate new key pair:
   ```bash
   openssl genrsa -out cf_private_new.pem 2048
   openssl rsa -pubout -in cf_private_new.pem -out cf_public_new.pem
   ```

2. Upload `cf_public_new.pem` to CloudFront → Public keys

3. Create new Key Pair ID

4. Update `.env`:
   ```env
   CDN_SIGNING_KEY_ID=K2NEWKEYID
   CDN_SIGNING_PRIVATE_KEY=<new base64-encoded private key>
   ```

5. Restart Django + Celery workers

6. After 7 days, remove old key from CloudFront

---

## Part 6: Troubleshooting

### "403 AccessDenied" from CloudFront

**Cause:** OAC not configured correctly or S3 bucket policy not updated

**Fix:**
1. Go to **AWS CloudFront** → **Distributions** → **Your distribution**
2. Go to **Origins** tab
3. Click your S3 origin
4. Look for **Copy policy** button
5. Copy the auto-generated S3 bucket policy
6. Go to **S3** → **Your bucket** → **Permissions** → **Bucket policy**
7. Paste the policy (replaces existing policy)

### "400 Bad Request" from CloudFront

**Cause:** Signed URL parameter format incorrect

**Fix:**
- Ensure `CDN_SIGNING_PRIVATE_KEY` is properly base64-decoded
- Check that `CDN_SIGNING_KEY_ID` matches the CloudFront key

### "ERROR: Unsupported key format" in Django logs

**Cause:** Private key not base64-encoded correctly

**Fix:**
```bash
# Re-encode the private key:
base64 -w0 cf_private.pem
# Copy the entire output (single line, no newlines)
```

### CloudFront not caching (always cache MISS)

**Cause:** Cache policy TTL set to 0, or query string differences

**Fix:**
1. Check **Cache behavior** → **Cache policy** → TTL settings
2. Ensure **Query string forwarding** is set (needed for presigned URL params)
3. CloudFront takes 5–10 minutes to show cache HIT ratio

---

## Summary Checklist

- [ ] CloudFront distribution created and deployed
- [ ] S3 bucket origin access control (OAC) configured
- [ ] RSA key pair generated (`cf_private.pem`, `cf_public.pem`)
- [ ] Public key uploaded to CloudFront
- [ ] Key Pair ID obtained (K2XXXXXXXXXXXXX)
- [ ] Private key base64-encoded and saved
- [ ] `.env` file configured with CDN settings
- [ ] Django shell test passes (signed URLs generated)
- [ ] Audio upload test passes (URL is CloudFront domain)
- [ ] CloudFront distribution returning 200 status
- [ ] S3 direct access blocked (403 response)
- [ ] Cache hit ratio monitored in CloudFront dashboard

---

## Cost Estimation

| Item | Usage | Cost/Month |
|------|-------|-----------|
| CloudFront data transfer (165 GB/month) | 165 GB | $14 |
| CloudFront requests (300K/month) | 300K | $0.22 |
| S3 origin tier (tier-1) | 165 GB | $3 |
| **Total** | | **$17.22** |

*With S3 lifecycle (90d IA, 180d Glacier), costs drop to ~$6/month*

---

## Next Steps

1. ✅ Deploy to staging environment
2. ✅ Load test CDN (verify cache hit ratio)
3. ✅ Monitor for 48 hours
4. ✅ Deploy to production
5. Set up quarterly key rotation reminder

**Support:** For issues, check AWS CloudFront documentation or contact AWS Support.
