import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * One row per analysed image. Uploaded image bytes are NEVER stored.
 * Only the extracted metadata report (and, optionally, a small preview
 * thumbnail) is retained. See docs/PRIVACY.md.
 */
export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull(),
    filename: text("filename").notNull(),
    format: text("format").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    cameraMake: text("camera_make"),
    cameraModel: text("camera_model"),
    hasGps: boolean("has_gps").notNull().default(false),
    hasExif: boolean("has_exif").notNull().default(false),
    metadataLevel: text("metadata_level").notNull().default("none"),
    indicatorCount: integer("indicator_count").notNull().default(0),
    topSeverity: text("top_severity").notNull().default("informational"),
    /** false = session-only report, purged automatically after one hour */
    persisted: boolean("persisted").notNull().default(true),
    thumbnail: text("thumbnail"),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("analyses_sha256_idx").on(t.sha256),
    index("analyses_created_idx").on(t.createdAt),
    index("analyses_session_idx").on(t.sessionId),
  ],
);

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  saveHistory: boolean("save_history").notNull().default(true),
  storeThumbnail: boolean("store_thumbnail").notNull().default(true),
  retentionDays: integer("retention_days").notNull().default(0),
  confirmBeforeReveal: boolean("confirm_before_reveal").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
