FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME/bin:$PNPM_HOME:$PATH
RUN corepack enable
RUN corepack prepare pnpm@12.5.1 --activate
RUN npm install --global --prefix "$PNPM_HOME" pnpm@12.5.1

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/applications/package.json packages/applications/
COPY packages/certificates/package.json packages/certificates/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/permissions/package.json packages/permissions/
COPY packages/events/package.json packages/events/
COPY packages/teams/package.json packages/teams/
COPY packages/submissions/package.json packages/submissions/
COPY packages/judging/package.json packages/judging/
COPY packages/scoring/package.json packages/scoring/
COPY packages/normalization/package.json packages/normalization/
COPY packages/ranking/package.json packages/ranking/
COPY packages/audit/package.json packages/audit/
COPY packages/exports/package.json packages/exports/
COPY packages/notifications/package.json packages/notifications/
COPY packages/validation/package.json packages/validation/
COPY packages/shared/package.json packages/shared/
COPY packages/voting/package.json packages/voting/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules
COPY --from=deps /app/packages /app/packages
COPY --from=deps /app/apps/web /app/apps/web
COPY . .
# Route collection initializes the DB client but does not connect during build.
RUN mkdir -p /app/apps/web/public \
    && DATABASE_URL=postgresql://dogfood:dogfood@127.0.0.1:5432/dogfood pnpm --filter @dogfood/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --from=build /app/apps/web/.next /app/apps/web/.next
COPY --from=build /app/apps/web/public /app/apps/web/public
COPY --from=build /app/apps/web/package.json /app/apps/web/package.json
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/fixtures.json /app/fixtures.json
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @dogfood/db seed && pnpm --filter @dogfood/web start"]
