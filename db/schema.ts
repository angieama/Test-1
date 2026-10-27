import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const journeys = sqliteTable("journeys", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  fareCents: integer("fare_cents").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  cashCents: integer("cash_cents").notNull().default(0),
}, table => [
  index("journeys_owner_started").on(table.ownerId, table.startedAt),
  uniqueIndex("one_active_journey_per_owner").on(table.ownerId).where(sql`${table.endedAt} IS NULL`),
]);

export const demoSessions = sqliteTable("demo_sessions", {
  ownerId: text("owner_id").primaryKey(),
  seededAt: integer("seeded_at").notNull(),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  receipt: text("receipt").notNull().unique(),
  customer: text("customer").notNull(),
  amountCents: integer("amount_cents").notNull(),
  receivedAt: integer("received_at").notNull(),
  journeyId: text("journey_id").references(() => journeys.id),
  fareCents: integer("fare_cents"),
}, table => [index("payments_owner_received").on(table.ownerId, table.receivedAt), index("payments_journey").on(table.journeyId)]);

export const claims = sqliteTable("claims", {
  paymentId: text("payment_id").primaryKey().references(() => payments.id),
  customer: text("customer").notNull(),
  reference: text("reference").notNull().default(""),
  verifiedAt: integer("verified_at").notNull(),
  passengers: integer("passengers").notNull().default(1),
  fareCents: integer("fare_cents"),
}, table => [index("claims_reference").on(table.reference)]);

export const fareRequests = sqliteTable("fare_requests", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  journeyId: text("journey_id").notNull().references(() => journeys.id),
  fareCents: integer("fare_cents").notNull(),
  passengers: integer("passengers").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const refunds = sqliteTable("refunds", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  amountCents: integer("amount_cents").notNull(),
  refundedAt: integer("refunded_at").notNull(),
}, table => [index("refunds_payment").on(table.paymentId), index("refunds_date").on(table.refundedAt)]);

export const savedRoutes = sqliteTable("saved_routes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  fareCents: integer("fare_cents").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [index("saved_routes_owner_updated").on(table.ownerId, table.updatedAt)]);
