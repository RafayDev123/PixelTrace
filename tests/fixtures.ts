import sharp from "sharp";

/** Synthetic images only. No real photographs or personal data are used in tests. */
export const EXIF_FULL = {
  IFD0: {
    Make: "TestCam",
    Model: "Synth 1",
    Software: "Adobe Photoshop 25.0",
    DateTime: "2024:03:05 14:22:10",
    Artist: "Test Author",
    Copyright: "(c) Test",
  },
  IFD2: {
    DateTimeOriginal: "2024:03:05 14:00:00",
    DateTimeDigitized: "2024:03:05 14:00:00",
    FNumber: "28/10",
    ExposureTime: "1/250",
    ISOSpeedRatings: "200",
    FocalLength: "50/1",
    BodySerialNumber: "SN-TEST-123",
  },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "51/1 30/1 0/1",
    GPSLongitudeRef: "W",
    GPSLongitude: "0/1 7/1 30/1",
    GPSAltitude: "35/1",
    GPSAltitudeRef: "0",
  },
};

type Fmt = "jpeg" | "png" | "webp" | "tiff";

export async function makeImage(
  fmt: Fmt = "jpeg",
  opts: { exif?: typeof EXIF_FULL | Record<string, Record<string, string>>; width?: number; height?: number; color?: string } = {},
): Promise<Buffer> {
  let img = sharp({
    create: { width: opts.width ?? 64, height: opts.height ?? 48, channels: 3, background: opts.color ?? "#336699" },
  });
  if (opts.exif) img = img.withExif(opts.exif as Record<string, Record<string, string>>);
  return img[fmt]().toBuffer();
}
