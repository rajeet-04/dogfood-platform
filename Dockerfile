FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
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
COPY packages/validation/package.json packages/validation/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules
COPY --from=deps /app/packages /app/packages
COPY --from=deps /app/apps/web /app/apps/web
COPY . .
RUN pnpm --filter @dogfood/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next /app/apps/web/.next
COPY --from=build /app/apps/web/public /app/apps/web/public
COPY --from=build /app/apps/web/package.json /app/apps/web/package.json
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules
COPY --from=build /app/packages /app/packages
EXPOSE 3000
CMD ["sh", "-c", "cd /app/packages/db && pnpm migrate && cd /app && pnpm --filter @dogfood/web start"]