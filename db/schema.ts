// Intentionally empty by default.
export const businessInquiries = sqliteTable("business_inquiries", {
  id: text("id").primaryKey(), companyProduct: text("company_product").notNull(),
  region: text("region").notNull(), type: text("type").notNull(), description: text("description").notNull(),
  budget: text("budget").notNull(), timeline: text("timeline").notNull(), contact: text("contact").notNull(), createdAt: text("created_at").notNull(),
}, table => [index("idx_business_inquiries_created").on(table.createdAt, table.id)]);
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, index, integer } from "drizzle-orm/sqlite-core";

export const danmakuMessages = sqliteTable("danmaku_messages", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  content: text("content").notNull(),
  sender: text("sender").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_danmaku_created").on(table.createdAt), index("idx_danmaku_sender_created").on(table.sender, table.createdAt)]);

export const siteContentUpdates = sqliteTable("site_content_updates", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_site_content_updates_created_at").on(table.createdAt)]);
