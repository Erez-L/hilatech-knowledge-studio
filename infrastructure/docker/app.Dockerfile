# One image for the web app, the worker, the migrations and the demo seed.
# The workspace packages are consumed as TypeScript source (see apps/web/next.config.ts),
# and the worker and the scripts run through tsx, so the image keeps the whole workspace
# with its dependencies. This is simpler than the two slim images sketched in
# docs/DEPLOYMENT.md section 6, at the price of a larger image.
#
#   docker build -f infrastructure/docker/app.Dockerfile -t knowledge-studio/app:dev .
#
# No secret is needed at build time and none is baked in.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true

RUN npm install -g pnpm@10.28.0 && npm cache clean --force

WORKDIR /app
COPY . .

# Dev dependencies stay: tsx runs the worker, the migrations and the seed.
RUN pnpm install --frozen-lockfile --prod=false \
 && pnpm build \
 && pnpm store prune \
 && mkdir -p /app/.data \
 && chown -R node:node /app/apps/web/.next /app/.data

USER node
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Web by default. Other roles override the command:
#   worker:  pnpm --filter @hks/worker start
#   migrate: pnpm db:migrate
#   seed:    pnpm demo:seed
CMD ["pnpm", "start"]
