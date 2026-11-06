export type Severity = "informational" | "low" | "medium" | "high";
export type SectionId =
  | "general"
  | "camera"
  | "capture"
  | "gps"
  | "iptc"
  | "xmp"
  | "technical"
  | "other";
export type EntryStatus = "present" | "empty" | "unreadable";
export type SensitiveKind = "location" | "identifier";
export type MetaValue = string | number | boolean | string[] | null;

export interface MetaEntry {
  section: SectionId;
  /** Source block, e.g. "EXIF", "IFD0", "XMP", "IPTC" */
  group: string;
  key: string;
  value: MetaValue;
  status: EntryStatus;
  sensitive: boolean;
  sensitiveKind?: SensitiveKind;
  /** true when the value was withheld by the API (privacy default) */
  masked?: boolean;
}

export interface Field {
  id: string;
  label: string;
  /** Display value, or null when the field is not in the file */
  value: string | null;
  present: boolean;
  sensitive: boolean;
  sensitiveKind?: SensitiveKind;
  masked?: boolean;
  /** Extra clarification, e.g. time zone caveats */
  note?: string;
}

export interface GpsInfo {
  present: boolean;
  masked: boolean;
  latitude: number | null;
  longitude: number | null;
  altitude: string | null;
  timestamp: string | null;
  direction: string | null;
  speed: string | null;
}

export interface FileInfo {
  filename: string;
  extension: string;
  detectedFormat: string;
  mime: string;
  sizeBytes: number;
  sizeLabel: string;
  width: number;
  height: number;
  aspectRatio: string;
  megapixels: number;
  colorMode: string;
  colorProfile: string;
  orientation: string;
  sha256: string;
  extensionMatches: boolean;
}

export interface IndicatorEvidence {
  field: string;
  value: string | null;
  sensitive: boolean;
  masked?: boolean;
}

export interface Indicator {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  evidence: IndicatorEvidence[];
  /** Plain-language reason the rule fired */
  triggeredBy: string;
  why: string;
  limitation: string;
  recommendation: string;
}

export interface DuplicateRef {
  id: string;
  filename: string;
  analyzedAt: string;
}

export type MetadataLevel = "none" | "limited" | "rich";

export interface AnalysisResult {
  id: string;
  sessionId: string;
  analyzedAt: string;
  file: FileInfo;
  camera: Field[];
  capture: Field[];
  authoring: Field[];
  gps: GpsInfo;
  entries: MetaEntry[];
  indicators: Indicator[];
  duplicates: DuplicateRef[];
  availability: {
    level: MetadataLevel;
    hasExif: boolean;
    hasIptc: boolean;
    hasXmp: boolean;
    hasIcc: boolean;
    hasGps: boolean;
    entryCount: number;
  };
  integrity: {
    sha256: string;
    trailingBytes: number;
    thumbnail: { width: number; height: number } | null;
    notes: string[];
  };
  engine: { name: string; notes: string[] };
  limitations: string[];
  persisted: boolean;
  thumbnail?: string | null;
}

export interface HistoryItem {
  id: string;
  sessionId: string;
  filename: string;
  format: string;
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  cameraMake: string | null;
  cameraModel: string | null;
  hasGps: boolean;
  hasExif: boolean;
  metadataLevel: MetadataLevel;
  indicatorCount: number;
  topSeverity: Severity;
  persisted: boolean;
  createdAt: string;
}

export interface Limits {
  maxFiles: number;
  maxFileBytes: number;
  maxMegapixels: number;
  bulkConcurrency: number;
  formats: string[];
}

export interface AppSettings {
  saveHistory: boolean;
  storeThumbnail: boolean;
  retentionDays: number;
  confirmBeforeReveal: boolean;
}

export interface SettingsResponse {
  settings: AppSettings;
  limits: Limits;
  cloud: { enabled: boolean; note: string };
  engine: { metadata: string; imaging: string; heicSupported: boolean };
}

export interface DashboardStats {
  total: number;
  today: number;
  sessions: number;
  withGps: number;
  missingMetadata: number;
  formats: { label: string; count: number }[];
  makers: { label: string; count: number }[];
  recent: HistoryItem[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface RevealOptions {
  location: boolean;
  identifiers: boolean;
}
