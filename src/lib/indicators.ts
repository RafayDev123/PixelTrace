import { parseExifDate } from "./dates";
import { entryValue } from "./extract";
import type { DuplicateRef, FileInfo, GpsInfo, Indicator, IndicatorEvidence, MetaEntry, MetaValue, Severity } from "./types";

export interface RuleInput {
  file: FileInfo;
  entries: MetaEntry[];
  gps: GpsInfo;
  hasExif: boolean;
  thumbnail: { width: number; height: number } | null;
  trailingBytes: number;
  duplicates: DuplicateRef[];
  /** epoch ms; injectable for deterministic tests */
  now?: number;
}

export const SEVERITY_ORDER: Record<Severity, number> = { informational: 0, low: 1, medium: 2, high: 3 };

const EDITORS =
  /photoshop|lightroom|gimp|affinity|pixelmator|snapseed|capture one|paint\.net|canva|picsart|facetune|darktable|rawtherapee|luminar|acdsee|photoscape|krita|illustrator|inkscape|figma|sketch|photopea|fotor|vsco|polarr|imagemagick|photoshop express|adobe|corel|paintshop|on1|dxo|topaz|skylum|gimp/i;

function str(v: MetaValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function evidence(entries: MetaEntry[], keys: string[]): IndicatorEvidence {
  const lk = keys.map((k) => k.toLowerCase());
  const e = entries.find((x) => lk.includes(x.key.toLowerCase()) && x.status === "present");
  if (!e) return { field: keys[0], value: null, sensitive: false };
  return { field: `${e.group}:${e.key}`, value: str(e.value), sensitive: e.sensitive };
}

const HOUR = 3_600_000;

function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 120_000) return `${Math.round(abs / 1000)} seconds`;
  if (abs < 2 * HOUR) return `${Math.round(abs / 60_000)} minutes`;
  if (abs < 48 * HOUR) return `${Math.round(abs / HOUR)} hours`;
  return `${Math.round(abs / (24 * HOUR))} days`;
}

export function runIndicators(input: RuleInput): Indicator[] {
  const { file, entries, gps, thumbnail, trailingBytes, duplicates } = input;
  const now = input.now ?? Date.now();
  const out: Indicator[] = [];
  const add = (i: Indicator) => out.push(i);
  const get = (...keys: string[]) => entryValue(entries, ...keys);

  // 1. Missing or limited EXIF
  const exifCount = entries.filter((e) => e.status === "present" && ["EXIF", "IFD0", "GPS"].includes(e.group) && !["technical"].includes(e.section)).length;
  if (!input.hasExif) {
    add({
      id: "no-exif",
      title: "No EXIF metadata found",
      severity: "informational",
      description: "This file does not contain readable EXIF metadata.",
      evidence: [{ field: "EXIF / IFD0", value: "No readable entries", sensitive: false }],
      triggeredBy: "No camera, capture or GPS entries were found in the EXIF/IFD0 blocks.",
      why: "Social networks, messaging apps, screenshots, export tools and privacy tools routinely remove EXIF. Its absence limits what the file can tell you.",
      limitation: "Missing metadata does not establish that the image was edited, manipulated or is inauthentic.",
      recommendation: "Look for the original file from the source, and consider other evidence such as context, reverse-image search or witnesses.",
    });
  } else if (exifCount < 6) {
    add({
      id: "limited-exif",
      title: "Limited EXIF metadata",
      severity: "informational",
      description: `Only ${exifCount} descriptive EXIF entries were found.`,
      evidence: [{ field: "EXIF entry count", value: String(exifCount), sensitive: false }],
      triggeredBy: "Fewer than 6 descriptive entries (camera, capture, GPS or other) were present in EXIF.",
      why: "A small amount of EXIF is common after processing by apps or conversion tools that keep only some fields.",
      limitation: "This is a count of fields, not a measure of authenticity.",
      recommendation: "Compare with other files from the same source if available.",
    });
  }

  // 7. Missing camera information
  const make = str(get("Make"));
  const model = str(get("Model"));
  if (!make && !model) {
    add({
      id: "no-camera",
      title: "No camera information found",
      severity: "informational",
      description: "Neither camera manufacturer (Make) nor camera model (Model) is recorded.",
      evidence: [{ field: "Make / Model", value: null, sensitive: false }],
      triggeredBy: "The Make and Model tags are absent or empty.",
      why: "Without these fields the capturing device cannot be named from the file.",
      limitation: "This does not establish that the image was manipulated. PixelTrace does not guess the device.",
      recommendation: "If device identity matters, obtain the original file or other provenance records.",
    });
  }

  // 8. Missing GPS
  if (!gps.present) {
    add({
      id: "no-gps",
      title: "No GPS location metadata",
      severity: "informational",
      description: "GPS location metadata was not found in this image.",
      evidence: [{ field: "GPS coordinates", value: null, sensitive: false }],
      triggeredBy: "No valid GPSLatitude/GPSLongitude pair was found.",
      why: "Many devices disable geotagging, and platforms often strip location before sharing.",
      limitation: "Location is never inferred. Absence of GPS is not evidence about where the photo was taken.",
      recommendation: "Do not rely on this file for location questions.",
    });
  } else {
    add({
      id: "gps-present",
      title: "Embedded GPS coordinates present",
      severity: "informational",
      description: "This file contains GPS coordinates. Sharing the file may disclose where it was recorded.",
      evidence: [evidence(entries, ["GPSLatitude"]), evidence(entries, ["GPSLongitude"])],
      triggeredBy: "A valid GPSLatitude/GPSLongitude pair was found.",
      why: "Embedded location is a privacy exposure and a lead for verification.",
      limitation: "Coordinates are device-reported and can be edited or wrong. They are not independently verified.",
      recommendation: "Strip location data before sharing, and treat the coordinates as a claim to verify.",
    });
  }

  // 2. Editing software
  const softwareKeys = ["Software", "CreatorTool", "HistorySoftwareAgent", "ProcessingSoftware"];
  const softwareEntry = entries.find((e) => softwareKeys.map((k) => k.toLowerCase()).includes(e.key.toLowerCase()) && e.status === "present");
  const historyAction = entries.find((e) => ["historyaction", "history"].includes(e.key.toLowerCase()) && e.status === "present");
  if (softwareEntry) {
    const sw = str(softwareEntry.value) ?? "";
    if (EDITORS.test(sw)) {
      add({
        id: "editing-software",
        title: "Editing software recorded in metadata",
        severity: "medium",
        description: `The metadata names software associated with image editing or processing: "${sw}".`,
        evidence: [{ field: `${softwareEntry.group}:${softwareEntry.key}`, value: sw, sensitive: false }],
        triggeredBy: "The software value matches a list of known image editors and processing tools.",
        why: "It indicates the file was saved or exported by that software at some point.",
        limitation: "This indicates that the file records software information; it does not prove that the visual content was altered. Editors are also used for routine cropping, resizing or colour correction.",
        recommendation: "Look for an earlier or original version of the file and compare the metadata.",
      });
    } else {
      add({
        id: "software-tag",
        title: "Software or firmware tag present",
        severity: "informational",
        description: `A Software value is recorded: "${sw}".`,
        evidence: [{ field: `${softwareEntry.group}:${softwareEntry.key}`, value: sw, sensitive: false }],
        triggeredBy: "A Software/CreatorTool value exists but does not match the list of known editors.",
        why: "Cameras and phones usually write their firmware or OS version here.",
        limitation: "PixelTrace cannot tell whether this value is device firmware or processing software.",
        recommendation: "Check the value against the manufacturer's firmware naming if relevant.",
      });
    }
  }
  if (historyAction) {
    add({
      id: "xmp-history",
      title: "XMP editing history present",
      severity: "low",
      description: "The file includes XMP history entries that describe actions applied to it.",
      evidence: [{ field: `${historyAction.group}:${historyAction.key}`, value: str(historyAction.value)?.slice(0, 300) ?? null, sensitive: false }],
      triggeredBy: "An XMP History / HistoryAction field was found.",
      why: "Editing history records that the document was saved, converted or derived by software.",
      limitation: "History can be incomplete, and routine saves are recorded alongside substantive edits.",
      recommendation: "Review the history fields in the XMP section of the metadata explorer.",
    });
  }

  // Timestamp analysis (3, 4)
  const origRaw = get("DateTimeOriginal");
  const createRaw = get("CreateDate", "DateTimeDigitized");
  const modifyRaw = get("ModifyDate", "DateTime");
  const orig = parseExifDate(origRaw);
  const create = parseExifDate(createRaw);
  const modify = parseExifDate(modifyRaw);

  for (const [label, raw, parsed] of [
    ["DateTimeOriginal", origRaw, orig],
    ["CreateDate", createRaw, create],
    ["ModifyDate", modifyRaw, modify],
  ] as const) {
    const s = str(raw);
    if (s && parsed === null && !/^[0 :\-/]+$/.test(s)) {
      add({
        id: `bad-timestamp-${label}`,
        title: `${label} is not a valid timestamp`,
        severity: "low",
        description: `The ${label} value could not be interpreted as a date.`,
        evidence: [evidence(entries, [label])],
        triggeredBy: "The value does not match the EXIF date format (YYYY:MM:DD HH:MM:SS).",
        why: "Malformed or placeholder timestamps may come from software that rewrote the field incorrectly.",
        limitation: "Some devices write placeholder text before their clock is set.",
        recommendation: "Cross-check with other timestamp fields and the file's source.",
      });
    }
  }

  if (orig !== null && modify !== null) {
    const diff = modify - orig;
    if (diff < -60_000) {
      add({
        id: "modify-before-original",
        title: "Modification time is earlier than capture time",
        severity: "medium",
        description: `ModifyDate is ${fmtDuration(diff)} earlier than DateTimeOriginal.`,
        evidence: [evidence(entries, ["DateTimeOriginal"]), evidence(entries, ["ModifyDate", "DateTime"])],
        triggeredBy: "ModifyDate < DateTimeOriginal by more than 60 seconds.",
        why: "A file is normally modified at or after the moment it was captured. The reverse can result from clock changes, time-zone handling or rewritten metadata.",
        limitation: "Camera clocks can be wrong and zone-less timestamps are not directly comparable across devices.",
        recommendation: "Check the device clock settings and look for other copies of the file.",
      });
    } else if (diff > 60_000) {
      add({
        id: "modified-after-capture",
        title: "Modification time differs from capture time",
        severity: "low",
        description: `ModifyDate is ${fmtDuration(diff)} later than DateTimeOriginal.`,
        evidence: [evidence(entries, ["DateTimeOriginal"]), evidence(entries, ["ModifyDate", "DateTime"])],
        triggeredBy: "ModifyDate is more than 60 seconds after DateTimeOriginal.",
        why: "It suggests the file's metadata was written again after capture, for example when saved, rotated or processed.",
        limitation: "Routine operations such as rotating, resizing or exporting also update ModifyDate. It does not show that the content was changed.",
        recommendation: "Compare with Software and XMP history fields to understand what touched the file.",
      });
    }
  }
  if (orig !== null && create !== null && Math.abs(create - orig) > 60_000) {
    add({
      id: "create-vs-original",
      title: "CreateDate differs from DateTimeOriginal",
      severity: "low",
      description: `CreateDate (digitised) and DateTimeOriginal differ by ${fmtDuration(create - orig)}.`,
      evidence: [evidence(entries, ["DateTimeOriginal"]), evidence(entries, ["CreateDate", "DateTimeDigitized"])],
      triggeredBy: "The two fields differ by more than 60 seconds. On most cameras they match.",
      why: "These fields are meant to record when the picture was taken and when it was digitised; for scans they legitimately differ.",
      limitation: "Scanners and some apps populate the two fields differently on purpose.",
      recommendation: "Treat each timestamp as a separate claim. Do not merge them into one capture time.",
    });
  }
  if (orig !== null && orig > now + 24 * HOUR) {
    add({
      id: "future-capture",
      title: "Capture time is in the future",
      severity: "medium",
      description: "DateTimeOriginal is later than the current time.",
      evidence: [evidence(entries, ["DateTimeOriginal"])],
      triggeredBy: "DateTimeOriginal is more than 24 hours after the time of this analysis.",
      why: "A capture time that has not happened yet suggests a wrong device clock or altered metadata.",
      limitation: "Time zones and unset camera clocks can produce implausible dates.",
      recommendation: "Verify the device clock and compare with other provenance records.",
    });
  }
  // GPS timestamp vs capture
  const gpsTs = gps.timestamp ? /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/.exec(gps.timestamp) : null;
  if (orig !== null && gpsTs) {
    const gpsMs = parseExifDate(`${gpsTs[1]} ${gpsTs[2]}`);
    if (gpsMs !== null && Math.abs(gpsMs - orig) > 26 * HOUR) {
      add({
        id: "gps-time-mismatch",
        title: "GPS timestamp is far from capture time",
        severity: "medium",
        description: `The GPS timestamp differs from DateTimeOriginal by ${fmtDuration(gpsMs - orig)}.`,
        evidence: [
          { field: "GPS:GPSDateStamp/GPSTimeStamp", value: gps.timestamp, sensitive: true },
          evidence(entries, ["DateTimeOriginal"]),
        ],
        triggeredBy: "The difference exceeds 26 hours, which is larger than any time-zone offset explains.",
        why: "GPS time is recorded in UTC at the last satellite fix. A difference beyond time zones points to a stale fix, a clock error or rewritten fields.",
        limitation: "Devices may keep a stale GPS fix for a long time, and the camera clock may be wrong.",
        recommendation: "Verify device clock settings and treat the location as unverified.",
      });
    }
  }

  // 5. Thumbnail vs full-size
  if (thumbnail) {
    const rm = file.width / file.height;
    const rt = thumbnail.width / thumbnail.height;
    const direct = Math.abs(rt / rm - 1);
    const rotated = Math.abs(rt * rm - 1);
    if (Math.min(direct, rotated) > 0.05) {
      add({
        id: "thumbnail-mismatch",
        title: "Embedded thumbnail has a different aspect ratio",
        severity: "medium",
        description: `The embedded thumbnail is ${thumbnail.width}×${thumbnail.height}, while the image is ${file.width}×${file.height}.`,
        evidence: [
          { field: "IFD1 thumbnail dimensions", value: `${thumbnail.width}×${thumbnail.height}`, sensitive: false },
          { field: "Image dimensions", value: `${file.width}×${file.height}`, sensitive: false },
        ],
        triggeredBy: "The thumbnail aspect ratio differs from the main image by more than 5% (also checked after a 90° rotation).",
        why: "Cameras generate the thumbnail from the original image. Software that crops or resizes may leave the old thumbnail behind.",
        limitation: "Only dimensions are compared, not thumbnail pixel content. Some tools regenerate thumbnails with different crops.",
        recommendation: "Extract the embedded thumbnail with a forensic tool and compare it visually with the full image.",
      });
    }
  }

  // 6. Unusual combinations
  if ((make && !model) || (!make && model)) {
    add({
      id: "partial-camera",
      title: "Only part of the camera identity is recorded",
      severity: "low",
      description: make ? "Camera manufacturer is present but the model is missing." : "Camera model is present but the manufacturer is missing.",
      evidence: [evidence(entries, ["Make"]), evidence(entries, ["Model"])],
      triggeredBy: "Exactly one of Make and Model exists.",
      why: "Devices normally write both. A partial identity can result from tools that rewrite the tags.",
      limitation: "Some software legitimately writes only one of the fields.",
      recommendation: "Compare with other photos from the same device.",
    });
  }
  const hasExposure = [get("ExposureTime"), get("FNumber"), get("ISO", "ISOSpeedRatings")].filter((v) => v !== undefined).length >= 2;
  if (hasExposure && !make && !model) {
    add({
      id: "settings-without-camera",
      title: "Exposure settings recorded without camera identity",
      severity: "low",
      description: "Camera exposure settings are present while camera make and model are absent.",
      evidence: [evidence(entries, ["ExposureTime"]), evidence(entries, ["FNumber"]), evidence(entries, ["ISO", "ISOSpeedRatings"])],
      triggeredBy: "At least two of ExposureTime, FNumber and ISO exist, and both Make and Model are missing.",
      why: "Selective stripping of identity fields while keeping settings can occur with privacy tools.",
      limitation: "This is a technically explainable combination, not a finding of tampering.",
      recommendation: "Review the Camera and Capture tabs together.",
    });
  }
  const exW = Number(get("ExifImageWidth", "PixelXDimension"));
  const exH = Number(get("ExifImageHeight", "PixelYDimension"));
  if (exW > 0 && exH > 0) {
    const same = (exW === file.width && exH === file.height) || (exW === file.height && exH === file.width);
    if (!same) {
      add({
        id: "exif-dimension-mismatch",
        title: "EXIF-declared dimensions differ from the actual image",
        severity: "low",
        description: `EXIF declares ${exW}×${exH}, but the decoded image is ${file.width}×${file.height}.`,
        evidence: [
          { field: "EXIF:ExifImageWidth/Height", value: `${exW}×${exH}`, sensitive: false },
          { field: "Decoded image dimensions", value: `${file.width}×${file.height}`, sensitive: false },
        ],
        triggeredBy: "EXIF pixel dimensions do not equal the decoded width and height (in either orientation).",
        why: "The image was probably resized or cropped by software that kept the original EXIF.",
        limitation: "Resizing for web or messaging is routine and does not imply content manipulation.",
        recommendation: "Look for the full-resolution original.",
      });
    }
  }

  // 10. other technically explainable anomalies
  if (!file.extensionMatches) {
    add({
      id: "extension-mismatch",
      title: "File extension does not match the real format",
      severity: "low",
      description: `The file is named ".${file.extension || "(none)"}" but its content is ${file.detectedFormat}.`,
      evidence: [
        { field: "Filename extension", value: file.extension || "(none)", sensitive: false },
        { field: "Detected format", value: file.detectedFormat, sensitive: false },
      ],
      triggeredBy: "Content signature (magic bytes) disagrees with the extension.",
      why: "Files get renamed or converted incorrectly, sometimes to hide the real type.",
      limitation: "A wrong extension is often just a naming mistake.",
      recommendation: "Rely on the detected format and ask where the file came from.",
    });
  }
  if (trailingBytes > 32) {
    add({
      id: "trailing-data",
      title: "Extra data after the end of the image",
      severity: "low",
      description: `${trailingBytes.toLocaleString()} bytes follow the image end marker.`,
      evidence: [{ field: "Bytes after image end", value: trailingBytes.toLocaleString(), sensitive: false }],
      triggeredBy: `More than 32 bytes were found after the final ${file.detectedFormat === "PNG" ? "IEND chunk" : "JPEG end-of-image marker (FFD9)"}.`,
      why: "Appended data can be an embedded video (motion photos), a maker extension, a signature, or unrelated hidden payload.",
      limitation: "Many phones append legitimate data such as motion-photo video or depth maps.",
      recommendation: "Identify the appended data type with a hex viewer before drawing conclusions.",
    });
  }

  // 9. duplicates
  if (duplicates.length) {
    add({
      id: "duplicate-hash",
      title: "Identical file already analysed",
      severity: "informational",
      description: `The SHA-256 fingerprint matches ${duplicates.length} other analysis${duplicates.length > 1 ? "es" : ""}.`,
      evidence: [{ field: "SHA-256", value: file.sha256, sensitive: false }, ...duplicates.slice(0, 3).map((d) => ({ field: "Matches", value: d.filename, sensitive: false }))],
      triggeredBy: "Another stored analysis has the same SHA-256 digest, meaning byte-identical file content.",
      why: "The same file was submitted more than once, possibly under a different name.",
      limitation: "Only files analysed with history enabled can be matched. Re-encoded copies have different hashes.",
      recommendation: "Use the filename and analysis time to tell the copies apart.",
    });
  }

  // Converging evidence (count-based, not probabilistic)
  const mediums = out.filter((i) => i.severity === "medium");
  if (mediums.length >= 2) {
    add({
      id: "multiple-anomalies",
      title: "Multiple independent metadata anomalies",
      severity: "high",
      description: `${mediums.length} separate medium-severity indicators fired on this file: ${mediums.map((m) => m.title.toLowerCase()).join("; ")}.`,
      evidence: mediums.slice(0, 4).map((m) => ({ field: "Indicator", value: m.title, sensitive: false })),
      triggeredBy: "Two or more medium-severity rules fired independently. This category is a count of rules, not a probability.",
      why: "Several unrelated anomalies together justify a closer manual review than any single one.",
      limitation: "Each rule has benign explanations such as editing for web use or incorrect clocks. This is not a verdict on authenticity.",
      recommendation: "Prioritise this file for manual forensic review and seek the original from its source.",
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
}

export function topSeverity(list: Indicator[]): Severity {
  return list.reduce<Severity>((top, i) => (SEVERITY_ORDER[i.severity] > SEVERITY_ORDER[top] ? i.severity : top), "informational");
}
