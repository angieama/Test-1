import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const demoState = sqliteTable('demo_state', { id: text('id').primaryKey(), startedAt: integer('started_at').notNull() });
export const rides = sqliteTable('rides', {
 id: text('id').primaryKey(), route: text('route').notNull(), fare: integer('fare').notNull(),
 startedAt: integer('started_at').notNull(), endedAt: integer('ended_at'), activeSlot: integer('active_slot'),
}, t => [uniqueIndex('rides_active_slot_idx').on(t.activeSlot), index('rides_started_idx').on(t.startedAt)]);
export const cashPayments = sqliteTable('cash_payments', {
 id: text('id').primaryKey(), rideId: text('ride_id').notNull().references(() => rides.id), amount: integer('amount').notNull(),
 passengerCount: integer('passenger_count').notNull(), note: text('note').notNull(), createdAt: integer('created_at').notNull(),
}, t => [index('cash_ride_created_idx').on(t.rideId,t.createdAt)]);
export const payments = sqliteTable('payments', {
  receipt: text('receipt').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  amount: integer('amount').notNull(),
  receivedAt: integer('received_at').notNull(),
  claimedAt: integer('claimed_at'),
  claimedFor: text('claimed_for'),
  rideId: text('ride_id').references(() => rides.id),
}, t => [index('payments_ride_idx').on(t.rideId), index('payments_received_idx').on(t.receivedAt), index('payments_claimed_received_idx').on(t.receivedAt).where(sql`${t.claimedAt} IS NOT NULL`)]);
