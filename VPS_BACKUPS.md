# VPS Backup Guide

End-to-end backup strategy for a single-user Paperclip instance hosted on a VPS. Covers what's built in, what to back up, and offsite options.

## What needs to be backed up

Two directories cover everything:

| Directory | Contents |
|---|---|
| `~/.paperclip/instances/default/data/backups/` | DB dumps (created by Paperclip's built-in backup) |
| `~/.paperclip/instances/default/data/storage/` | Uploaded files, agent outputs, attachments |

Do not back up the raw Postgres data dir (`~/.paperclip/instances/default/db/`) — use the dumps instead.

## Built-in DB backup

Paperclip automatically dumps the database on a schedule. Controlled by `config.json`:

```json
"backup": {
  "enabled": true,
  "intervalMinutes": 60,
  "retentionDays": 30,
  "dir": "~/.paperclip/instances/default/data/backups"
}
```

Trigger a manual backup at any time:

```bash
pnpm paperclipai db:backup
```

Retention follows a daily/weekly/monthly scheme — daily for `retentionDays`, weekly for 4 weeks, monthly for 1 month.

**The problem:** these backups are on the same disk as the data. If the VPS is lost or corrupted, you lose everything. You need an offsite copy.

---

## Offsite backup with rclone

[rclone](https://rclone.org) is a single binary that syncs to any object storage provider. The setup is identical regardless of provider — only the `rclone config` step differs.

### 1. Install rclone

```bash
curl https://rclone.org/install.sh | sudo bash
```

### 2. Configure your provider

```bash
rclone config
```

Follow the interactive prompts for your chosen provider (see [Provider options](#provider-options) below).

### 3. Add a daily cron job

```bash
crontab -e
```

```cron
# Sync DB dumps at 3:00 AM daily
0 3 * * * rclone sync ~/.paperclip/instances/default/data/backups/ your-remote:your-bucket/paperclip/db-backups/

# Sync storage files at 3:30 AM daily
30 3 * * * rclone sync ~/.paperclip/instances/default/data/storage/ your-remote:your-bucket/paperclip/storage/
```

Replace `your-remote` with the name you gave the remote in `rclone config`, and `your-bucket` with your bucket name.

### 4. Enable bucket versioning

Turn on file versioning on your bucket (available in all providers below). This lets you recover a previous version if a corrupted or deleted file gets synced up.

---

## Provider options

### Backblaze B2 — recommended default

- **Cost:** ~$0.006/GB/month storage, free egress to Cloudflare CDN
- **rclone remote type:** `b2`
- Sign up → create a bucket → create an Application Key with read/write access
- Add `--b2-hard-delete` to the rclone commands so deleted local files are actually removed remotely

### Cloudflare R2

- **Cost:** $0.015/GB/month, **zero egress fees**
- **Best for:** already on Cloudflare, no surprise bandwidth charges
- **rclone remote type:** `s3` (S3-compatible, set endpoint to your R2 endpoint)

### Wasabi

- **Cost:** $0.0068/GB/month, no egress, no API fees
- **rclone remote type:** `s3` (endpoint: `s3.wasabisys.com` or region-specific)

### Hetzner Object Storage

- **Cost:** €0.011/GB/month, free egress within same region
- **Best for:** VPS already on Hetzner — same-region transfers are free
- **rclone remote type:** `s3` (S3-compatible)

### AWS S3

- **Cost:** $0.023/GB/month + egress
- Most reliable, but overkill and more expensive for personal use
- **rclone remote type:** `s3`

### Borgbase (managed BorgBackup)

- **Cost:** free up to 10GB, then $2/month for 100GB
- Purpose-built for backups — deduplication and encryption built in
- Uses [Borg](https://www.borgbackup.org/) instead of rclone, different setup

### Restic

- **Cost:** depends on backend (supports B2, S3, SFTP, local)
- Deduplication + encryption + snapshot history; more powerful than rclone sync but more complex
- Supports all the providers above as backends

---

## VPS snapshots (complement, not replacement)

Most providers (Hetzner, DigitalOcean, Vultr, Linode) offer automated whole-disk snapshots. Useful for **full machine recovery** (OS + config + everything), but:

- More expensive per GB than file-level backups
- Not a substitute for application-level DB dumps

Recommended: enable **weekly VPS snapshots** as a recovery layer alongside daily rclone syncs.

---

## Summary

| Layer | Tool | Frequency | What it covers |
|---|---|---|---|
| DB dumps | Paperclip built-in | Hourly | Database, retained 30 days locally |
| Offsite copy | rclone → object storage | Daily cron | DB dumps + storage files |
| Version history | Bucket versioning | Continuous | Protection against corrupt/deleted files |
| Full machine | VPS snapshots | Weekly | OS + config recovery |

For a single-user instance, **Backblaze B2 + rclone** covers all practical failure scenarios at under $2/month.
