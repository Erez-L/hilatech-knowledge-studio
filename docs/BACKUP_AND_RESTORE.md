# Database backup and restore

For the single-host deployment described in `docs/DEPLOYMENT_SINGLE_HOST.md`. Everything the
application stores in PostgreSQL (accounts, organizations, document text and vectors,
conversations, summaries, contact-form leads) lives in one Docker volume, `postgres-data`, on one
server. Without a backup, losing that volume or that server loses all of it.

`infrastructure/deploy/backup-db.sh` makes a dump of the database, checks that the dump can be
read, and copies it to S3. **Nothing in this document is installed by merging the code**: the
steps under "Install" are done once, by hand, on the server.

## What is and is not covered

| Data | Where it lives | Covered by this backup |
|---|---|---|
| PostgreSQL database `hks` | volume `postgres-data` | Yes |
| Uploaded files | the S3 bucket in `S3_BUCKET` | No. They are already in S3. Turn on bucket versioning to protect them from deletion |
| Redis (job queue, rate limits, sign-ups waiting for confirmation) | volume `redis-data` | No. It is rebuilt; a sign-up that was waiting has to be started again |
| `/opt/knowledge-studio/.env` (passwords, `AUTH_SECRET`) | the server only | No. Keep a copy in a password manager. A restored database is useless without the role passwords, and sessions need `AUTH_SECRET` |

## Install (once, on the server)

1. Copy `infrastructure/deploy/backup-db.sh` to `/opt/knowledge-studio/` and make it executable
   (`chmod 750 backup-db.sh`).
2. Choose where the dumps go and add it to `/opt/knowledge-studio/.env`:

   ```
   BACKUP_S3_URI=s3://<bucket>/db-backups
   ```

   A separate bucket is safer than the documents bucket: a mistake in the application's own
   bucket policy or lifecycle rules then cannot touch the backups.
3. The server's instance role must be allowed `s3:PutObject` on that prefix (and `s3:GetObject`
   and `s3:ListBucket` for a restore). The existing inline policy was written for the documents
   bucket; check it before the first run.
4. The script needs the AWS CLI on the host (`aws --version`). It is not part of this
   repository and is not installed by the deploy script.
5. Run it once by hand and read the last line:

   ```
   cd /opt/knowledge-studio && ./backup-db.sh
   BACKUP OK hks-20261126T011500Z.dump 1830421 bytes -> s3://<bucket>/db-backups/hks-20261126T011500Z.dump
   ```

6. Schedule it nightly, for example in `/etc/cron.d/knowledge-studio-backup`:

   ```
   15 1 * * * root /opt/knowledge-studio/backup-db.sh >> /var/log/knowledge-studio-backup.log 2>&1
   ```

7. On the bucket, add a lifecycle rule that expires objects under the prefix after the number of
   days you want to keep (30 is a reasonable start). The script never deletes anything in S3.

The script keeps the three newest dumps in `/opt/knowledge-studio/backups` (`BACKUP_KEEP_LOCAL`)
and removes older local ones. A failed run prints `BACKUP FAILED: <reason>` and exits with a
non-zero status; nothing is copied to S3 unless the dump passed the readability check.

`./backup-db.sh --local-only` makes and checks a dump without copying it. Run it right before a
deploy: `deploy.sh` applies database migrations, and a migration cannot be undone by going back
to the previous image.

## Knowing that it still works

A backup that nobody looks at fails silently. At least:

- Look at `/var/log/knowledge-studio-backup.log` after the first nights, then from time to time.
  Every night should end with a `BACKUP OK` line.
- List the prefix (`aws s3 ls s3://<bucket>/db-backups/`) and check that the newest object is
  from last night and that sizes do not suddenly drop.
- Do the restore check below once after installing, and again after any change to the database
  setup. A backup is proven only by a restore.

These procedures were written from the PostgreSQL documentation and the layout of this stack.
They have not been run against this server yet: the first restore check is also the test of
this document. Correct it if a step turns out differently.

## Restore check (safe: does not touch the live database)

This restores a dump into a scratch database next to the real one and counts rows.

```bash
cd /opt/knowledge-studio
aws s3 cp s3://<bucket>/db-backups/<name>.dump ./restore-check.dump
c() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }
c exec -T ks-postgres dropdb -U postgres --if-exists hks_restore_check
c exec -T ks-postgres createdb -U postgres -O hks_owner hks_restore_check
c exec -T ks-postgres pg_restore -U postgres -d hks_restore_check --exit-on-error < ./restore-check.dump
c exec -T ks-postgres psql -U postgres -d hks_restore_check -c 'select count(*) from users' -c 'select count(*) from documents'
c exec -T ks-postgres dropdb -U postgres hks_restore_check
rm ./restore-check.dump
```

The counts should be close to the live database's at the time of the dump. The scratch database
needs about as much disk as the live one; check `df -h /` first.

## Real restore (replaces the live database)

Do this only when the live database is lost or damaged. Everything written after the dump was
taken is lost. Read the whole procedure first.

1. Tell users, then stop the application so nothing writes during the restore. Leave
   `ks-postgres` running. The application services are `web` and `worker` (`ks-web` and
   `ks-worker` after the service rename):

   ```bash
   cd /opt/knowledge-studio
   c() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }
   c ps --services            # shows the exact service names
   c stop <web service> <worker service>
   ```

2. If the damaged database still answers, dump it first, so there is a way back:
   `./backup-db.sh --local-only`.
3. Fetch the dump to restore: `aws s3 cp s3://<bucket>/db-backups/<name>.dump ./restore.dump`.
4. Replace the database. The roles `hks_owner` and `hks_app` must exist; on this server they do
   (they were created when the volume was first initialized).

   ```bash
   c exec -T ks-postgres dropdb -U postgres --if-exists hks
   c exec -T ks-postgres createdb -U postgres -O hks_owner hks
   c exec -T ks-postgres pg_restore -U postgres -d hks --exit-on-error < ./restore.dump
   ```

5. Start the stack with the image tag that was running when the dump was taken, or a newer one:
   `./deploy.sh <tag>`. It applies any migrations the dump does not have yet. An image **older**
   than the dump's schema must not be started against it.
6. Check `https://<domain>/api/health`, sign in, open a document and ask a question.
7. Remove `./restore.dump`.

### On a new server (the old one is gone)

Set the server up as in `docs/DEPLOYMENT_SINGLE_HOST.md` with the saved `.env`, start only the
database (`c up -d ks-postgres`; this creates the roles with the passwords from `.env`), then do
steps 3 to 7 above. Documents whose files are in S3 open as before; the bucket is not part of
the server.

## Health checks that came with this change

- `GET /api/health` answers 200 with `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`
  when the web server reaches PostgreSQL and Redis, and 503 with the failing check marked
  `failed` otherwise. It needs no sign-in and shows nothing but those names. Point an outside
  uptime monitor at it; none is set up by this repository.
- The web container's health check uses it (and falls back to the older demo endpoint when an
  image from before this change is deployed).
- The worker has no HTTP port. It rewrites a small heartbeat file every 15 seconds while its
  queue consumer runs and Redis answers, and its container health check fails when the file is older
  than 90 seconds. Docker shows the result in `docker ps`; it does not restart an unhealthy
  container by itself.
