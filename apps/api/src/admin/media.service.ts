import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Size limits mirror the admin form captions (image ≤ 2MB, audio ≤ 5MB).
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
  'audio/webm',
]);

export type MediaKind = 'image' | 'audio';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates and stores an uploaded file as a MediaFile row, returning the
   * public URL that serves it (`/media/:id`). Storage is Postgres because
   * the Railway container filesystem is ephemeral — files would vanish on
   * every redeploy. Trade-off: rows are heavy (BYTEA), so the size caps
   * above stay strict. If the project later wires up R2/S3, swap this
   * method's body; the URL contract stays the same.
   */
  async store(file: Express.Multer.File, kind: MediaKind): Promise<string> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    }
    const allowed = kind === 'image' ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES;
    const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException(
        kind === 'image'
          ? 'รองรับเฉพาะไฟล์ JPG/PNG/WebP'
          : 'รองรับเฉพาะไฟล์ MP3/M4A/WAV',
      );
    }
    if (file.size > maxBytes) {
      throw new BadRequestException(
        kind === 'image'
          ? 'ไฟล์รูปภาพต้องมีขนาดไม่เกิน 2MB'
          : 'ไฟล์เสียงต้องมีขนาดไม่เกิน 5MB',
      );
    }

    const row = await this.prisma.mediaFile.create({
      data: {
        mimeType: file.mimetype,
        size: file.size,
        // Copy into a plain ArrayBuffer-backed view — @types/node's
        // Buffer is ArrayBufferLike (possibly SharedArrayBuffer) while
        // Prisma's Bytes wants a definite ArrayBuffer.
        data: new Uint8Array(file.buffer),
      },
    });
    return `/media/${row.id}`;
  }

  async serve(id: string) {
    const row = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException();
    }
    return { mimeType: row.mimeType, data: row.data };
  }
}
