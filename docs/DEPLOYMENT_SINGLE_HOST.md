# Deployment on a single Docker host, next to another product

How the public demo at https://knowledge.hilatechdev.com is deployed. First done on 2026-11-17 with image `v0.1.0`. The reference design with managed services is in `docs/DEPLOYMENT.md`; this document describes what actually runs.

## What runs where

| Piece | Where |
|---|---|
| Host | EC2 `hilatech-demo` (`i-0dbaef6ebf899621c`, t3.medium, us-east-1, Elastic IP `98.91.94.108`), shared with HilaTech AI Assistant |
| This stack | `/opt/knowledge-studio`: compose project `knowledge-studio` with `ks-web`, `ks-worker`, `ks-postgres`, `ks-redis` and a one-shot `migrate` |
| The other product | `/opt/hilatech`, compose project `hilatech-ai-assistant`. It owns ports 80 and 443 through its Caddy container |
| Routing | A site block for `knowledge.hilatechdev.com` in `/opt/hilatech/Caddyfile` proxies to `knowledge-studio-web:3000`. The web container joins the network `hilatech-ai-assistant_default` under that alias |
| TLS | Caddy obtains the certificate from Let's Encrypt |
| DNS | Cloudflare, zone `hilatechdev.com`: A record `knowledge` to `98.91.94.108`, DNS only (not proxied), like `demosaas` |
| Image | `ghcr.io/erez-l/hilatech-knowledge-studio/app:<tag>`, built by `.github/workflows/build-image.yml` when a release with tag `v*` is published |
| AWS identity | The instance role `hilatech-demo-server`. Its existing policy allows Bedrock; the inline policy `knowledge-studio-s3` allows the bucket `hilatech-knowledge-studio-docs-590184083649` |
| Secrets | `/opt/knowledge-studio/.env`, `postgres.env` and `migrate.env`, mode 600, generated on the host. Database passwords and `AUTH_SECRET` exist nowhere else. See "Database roles and secrets" |

## Database roles and secrets

Three database roles, each given only to what needs it:

| Role | Used by | Where its credentials live |
|---|---|---|
| `postgres` (superuser) | the database container itself, backups (`pg_dump` over the local socket, no password) | `postgres.env` as `POSTGRES_PASSWORD`, read only when the data volume is first created |
| `hks_owner` (owns the tables) | the one-shot `migrate` job | `migrate.env` as `DATABASE_MIGRATION_URL`; its password also in `postgres.env` as `HKS_OWNER_PASSWORD` |
| `hks_app` (subject to row level security) | `ks-web` and `ks-worker` | `.env` as `DATABASE_URL`; its password also in `postgres.env` as `HKS_APP_PASSWORD` |

`.env` is the environment of the web and worker containers, so it must hold neither the superuser password nor the owner URL. Row level security is forced on the tenant tables (migration 0006), so even the owner role sees a tenant's rows only after setting `app.organization_id`, as the application does; the superuser bypasses it, which backups rely on. The audit trail (`audit_events`) is the exception: the owner role can still read all of it.

`docker-compose.prod.yml` reads `postgres.env` and `migrate.env` when they exist, so a host that still keeps these values in `.env` keeps working. To move them on an existing host (a server change, not done by a deploy):

1. Create `postgres.env` and `migrate.env` beside `.env` (formats in `env.example`), mode 600, with the values now in `.env`.
2. Remove `POSTGRES_SUPERUSER_PASSWORD`, `HKS_OWNER_PASSWORD`, `HKS_APP_PASSWORD` and `DATABASE_MIGRATION_URL` from `.env`, and check that `DATABASE_URL` names `hks_app`.
3. Deploy (`./deploy.sh <tag>`), then confirm by name only that the web container has no `DATABASE_MIGRATION_URL`: `docker exec knowledge-studio-ks-web-1 sh -c 'env | cut -d= -f1 | grep -c MIGRATION'` prints 0.

## Two things that are easy to get wrong

1. **Service names.** The web container is on two networks. On the proxy's network the other product also has services called `postgres` and `redis`. With those names in this stack, the web container connected to the other product's Redis and tried its Postgres. The services are therefore named `ks-postgres` and `ks-redis`. The same applies to `web`: Docker registers every service name as an alias on each network the container joins, so a service called `web` here was also reachable as `web` on the proxy's network, next to the other product's own `web`, and the proxy intermittently served this app on the other product's domain. The services are therefore named `ks-web` and `ks-worker` (containers `knowledge-studio-ks-web-1` and `knowledge-studio-ks-worker-1`); the proxy keeps reaching this app through the alias `knowledge-studio-web`. Never give a service here a name that exists in the other stack.
2. **The Caddyfile is a single-file bind mount.** Append to it in place (`cat >> Caddyfile`). An editor or `sed -i` replaces the file and the running container keeps seeing the old one. Validate before reloading: `docker exec hilatech-ai-assistant-proxy-1 caddy validate --config /etc/caddy/Caddyfile`, then `caddy reload`. The copy from before the change is `/opt/hilatech/Caddyfile.before-knowledge-studio`.

If a deployment of the other product replaces its Caddyfile from its own repository, the `knowledge.hilatechdev.com` block is lost. It has to be added to that repository as well. Not done yet.

## First deployment, in order

1. Publish a GitHub release with tag `vX.Y.Z` on the branch to deploy. Wait for the "Build image" workflow.
2. Cloudflare: A record for the subdomain to the Elastic IP, DNS only. Do this before step 5, or Caddy fails the certificate challenge.
3. IAM: inline policy on the instance role for the bucket (once).
4. On the host, in `/opt/knowledge-studio`: the four files from `infrastructure/deploy/`, a `.env` made from `env.example` with generated values, then `docker compose -f docker-compose.prod.yml --env-file .env up -d`. Wait for `ks-web` to be healthy.
5. Append the site block from `Caddyfile.snippet` to the proxy's Caddyfile, validate, reload.
6. Seed the demo once: `docker compose -f docker-compose.prod.yml --env-file .env run --rm --no-deps -T ks-worker pnpm -s demo:seed`. It embeds the twelve sample documents with the real embeddings model (a paid call of a few cents).
7. Check `https://<subdomain>/api/v1/demo` returns `available: true` with `pipeline.mode: "live"`, and that the other product still answers.

Commands on the host were run as root through AWS Systems Manager (`aws ssm send-command`, document `AWS-RunShellScript`) from CloudShell; the host needs no inbound SSH for this.

## Releasing a new version

1. Publish a release `vX.Y.Z`; wait for the image.
2. On the host: `cd /opt/knowledge-studio && ./deploy.sh vX.Y.Z`. It pulls, restarts, waits for `ks-web` to be healthy and prints the previous tag. It keeps the old image.
3. Check the live site.
4. Only after the owner has approved the new version: `./prune-old-images.sh`. It removes every older image of this app, and with them the quick way back.

To go back before pruning: `./deploy.sh <previous tag>`.

### The release that renames `web` and `worker`

The first deploy after the rename to `ks-web` and `ks-worker` needs the new `docker-compose.prod.yml` and `deploy.sh` copied to `/opt/knowledge-studio` first. `deploy.sh` then creates the containers `knowledge-studio-ks-web-1` and `knowledge-studio-ks-worker-1`, and its `--remove-orphans` removes the old `knowledge-studio-web-1` and `knowledge-studio-worker-1`. The site is down for the seconds between the two. The Caddy block does not change: it points at the alias `knowledge-studio-web`. Going back to an older image tag with the new compose file works; going back to the old compose file brings the name collision back.

## State on 2026-11-17

Image `v0.1.0`. Chat model `us.anthropic.claude-haiku-4-5-20251001-v1:0` (Haiku 5.5 was not available to the account). `APP_ENV=demo`, sign-up off, mail off, thresholds 0.4 / 0.5. The compose file on the host was patched by hand for the service names; it matches this repository from the commit that adds this document.

## Email (Amazon SES)

The app sends sign-up confirmation and password-reset mail through Amazon SES with
`MAIL_TRANSPORT=ses`. Nothing is stored for this: the AWS SDK uses the server's
instance role (`hilatech-demo-server`), whose `ses-send` policy allows `ses:SendEmail`
only from `no-reply@hilatechdev.com`.

State on 2026-11-17 (us-east-1):

- Domain identity `hilatechdev.com` is verified and DKIM-signed (shared with the SaaS).
- The SES account is in the **sandbox**: 200 messages a day, and only to recipient
  addresses that are themselves verified in SES. An earlier production-access
  request shows as denied.

To turn mail on, set in `/opt/knowledge-studio/.env` and run `./deploy.sh <tag>`:

```
MAIL_TRANSPORT=ses
MAIL_FROM="HilaTech Knowledge Studio <no-reply@hilatechdev.com>"
```

`AUTH_SIGNUP_ENABLED` stays `false` until the owner decides to open sign-up. While
SES is in the sandbox, opening sign-up only works for verified recipient addresses.

### Contact-form notifications

Every request from the contact form is saved in the `contact_leads` table. With
`LEADS_NOTIFY_EMAIL=<address>` in `/opt/knowledge-studio/.env`, each request is also mailed to
that address through the same transport, with the sender's address as Reply-To. The address
lives in `.env` only; it is not in the repository. Two conditions:

- `MAIL_TRANSPORT` must not be `none`. With no transport the request is still saved and the
  log shows `lead.notification_not_configured`.
- While SES is in the sandbox, the notification address itself has to be a verified identity
  in SES, or SES refuses the message. The request is still saved, the visitor still sees
  success, and the log shows `lead.notification_failed`.

## Scanned PDF pages (OCR)

With `OCR_PROVIDER=bedrock`, a PDF page that has no text layer is rendered to an image in the
worker and read by a vision-capable chat model on Bedrock (`OCR_MODEL_ID`, default
`LLM_MODEL_ID`). Pages that already have text are never sent. Each scanned page is one paid
model call; `OCR_MAX_PAGES` (default 20) caps the scanned pages per file, and the tokens count
against the organization's daily AI budget and are recorded as `document_ocr` usage.

Text read from a scan can contain mistakes, and accuracy on dense layouts or unusual type
(Rashi script, pages with commentaries around a main text) has not been measured. With
`OCR_PROVIDER=none` scanned PDFs are reported as unsupported, as before.

The release that introduces this includes migration `0004_usage_document_ocr.sql`; `deploy.sh`
runs migrations before starting the new containers.

### Which reader

`OCR_PROVIDER=tesseract` is the one to use. On 2026-11-17 the same printed Hebrew page (a study
sheet whose PDF text layer is unreadable) was read three ways on the server:

| Reader | Result | Cost | Time |
|---|---|---|---|
| Claude Haiku 4.5, whole page | most words wrong, though it looked like Hebrew | about 1 cent | about 20 s |
| Claude Haiku 4.5, page cut into four bands | structure right, many words wrong, repeated lines | about 1.5 cents | about 1 min |
| Tesseract 5.3, `heb`, 300 dpi | nearly word for word | none | 6 s |

One page is not a benchmark. Rashi script and pages with several columns of different texts were
not measured. The vision-model reader stays in the code, off, for a stronger model later.
