import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditEvents } from "./audit";
import { events } from "./events";
import { users } from "./users";

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    eventTypes: text("event_types").array().notNull().default(sql`ARRAY['*']::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_endpoints_event_idx").on(t.eventId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpointId: uuid("endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    auditEventId: uuid("audit_event_id").notNull().references(() => auditEvents.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_deliveries_endpoint_event_unique").on(t.endpointId, t.auditEventId),
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
    check("webhook_deliveries_attempt_count_nonnegative", sql`${t.attemptCount} >= 0`),
    check("webhook_deliveries_status_valid", sql`${t.status} in ('PENDING', 'DELIVERING', 'RETRY', 'DELIVERED', 'DEAD')`),
  ],
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type WebhookEvent = typeof auditEvents.$inferSelect;
