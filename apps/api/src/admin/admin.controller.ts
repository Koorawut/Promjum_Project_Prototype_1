import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { MediaService } from './media.service';

// Size caps enforced at the parser level too (belt-and-braces with
// MediaService): rejects oversized uploads before the whole body lands
// in memory.
const IMAGE_LIMIT = 2 * 1024 * 1024 + 1024;
const AUDIO_LIMIT = 5 * 1024 * 1024 + 1024;

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly mediaService: MediaService,
  ) {}

  @Get('stats')
  async stats() {
    return this.adminService.getStats();
  }

  // ---------- Quiz management ----------

  @Get('quizzes')
  async listQuizzes(@Query('category') category: string) {
    if (!category) {
      return [];
    }
    return this.adminService.listQuizzes(category);
  }

  @Post('quizzes')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: IMAGE_LIMIT } }),
  )
  async createQuiz(
    @UploadedFile() image: Express.Multer.File | undefined,
    @Body()
    body: {
      category?: string;
      textEn?: string;
      textTh?: string;
      question?: string;
      options?: string;
      correctIndex?: string;
      imageUrl?: string;
      audioUrl?: string;
    },
  ) {
    return this.adminService.createQuiz({
      categorySlug: this.requireCategory(body.category),
      textEn: this.requireText(body.textEn, 'ประโยคอังกฤษ'),
      textTh: this.requireText(body.textTh, 'ประโยคไทย'),
      question: this.requireText(body.question, 'คำถาม'),
      options: this.parseOptions(body.options),
      correctIndex: this.parseIndex(body.correctIndex),
      imageUrl: image
        ? await this.mediaService.store(image, 'image')
        : (body.imageUrl ?? null),
      audioUrl: body.audioUrl ?? null,
    });
  }

  @Patch('quizzes/:id')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: IMAGE_LIMIT } }),
  )
  async updateQuiz(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() image: Express.Multer.File | undefined,
    @Body()
    body: {
      textEn?: string;
      textTh?: string;
      question?: string;
      options?: string;
      correctIndex?: string;
      imageUrl?: string | null;
      audioUrl?: string | null;
      enabled?: string | boolean;
    },
  ) {
    // The Enable/Disable switch sends only `enabled`; media-less text
    // edits send JSON-ish fields; a new image arrives as multipart with
    // everything else in text fields. Normalize both shapes here.
    const enabled =
      body.enabled === undefined
        ? undefined
        : body.enabled === true ||
          body.enabled === 'true' ||
          body.enabled === '1';

    const options =
      body.options !== undefined ? this.parseOptions(body.options) : undefined;

    return this.adminService.updateQuiz(id, {
      ...(body.textEn !== undefined && { textEn: body.textEn }),
      ...(body.textTh !== undefined && { textTh: body.textTh }),
      ...(body.question !== undefined && { question: body.question }),
      ...(options && { options }),
      ...(body.correctIndex !== undefined && {
        correctIndex: this.parseIndex(body.correctIndex),
      }),
      ...(enabled !== undefined && { isEnabled: enabled }),
      ...(image
        ? { imageUrl: await this.mediaService.store(image, 'image') }
        : body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.audioUrl !== undefined && { audioUrl: body.audioUrl }),
    });
  }

  @Delete('quizzes/:id')
  async deleteQuiz(@Param('id', ParseUUIDPipe) id: string) {
    await this.adminService.deleteQuiz(id);
    return { ok: true };
  }

  // ---------- Audio upload (separate endpoint: the edit form has one
  // image field that carries the multipart request; audio goes alone) ----------

  @Post('media/audio')
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: AUDIO_LIMIT } }),
  )
  async uploadAudio(@UploadedFile() audio: Express.Multer.File) {
    const url = await this.mediaService.store(audio, 'audio');
    return { url };
  }

  // ---------- Minigame answer sets ----------
  // Multipart contract (mirrors the quiz form's approach):
  //   POST   /admin/minigame-sets       4 files under field "images" (in
  //                                     A–D slot order) + correctIndex
  //   PATCH  /admin/minigame-sets/:id   correctIndex + optional "images"
  //                                     files for the slots being replaced +
  //                                     a JSON `slots` array where "" marks
  //                                     a replaced slot (see PATCH below)

  @Get('minigame-sets')
  async listMinigameSets() {
    return this.adminService.listMinigameSets();
  }

  @Post('minigame-sets')
  @UseInterceptors(
    FilesInterceptor('images', 4, { limits: { fileSize: IMAGE_LIMIT } }),
  )
  async createMinigameSet(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { correctIndex?: string },
  ) {
    // The frontend appends the 4 files in A–D slot order under one field
    // name, so files[k] is slot k.
    if (!files || files.length !== 4) {
      throw new BadRequestException('ต้องแนบรูปภาพครบทั้ง 4 รูป (A–D)');
    }
    const images = await Promise.all(
      files.map((f) => this.mediaService.store(f, 'image')),
    );
    return this.adminService.createMinigameSet({
      images,
      correctIndex: this.parseIndex(body.correctIndex),
    });
  }

  @Patch('minigame-sets/:id')
  @UseInterceptors(
    FilesInterceptor('images', 4, { limits: { fileSize: IMAGE_LIMIT } }),
  )
  async updateMinigameSet(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body()
    body: {
      correctIndex?: string;
      // JSON array of 4 strings: the stored URL to keep, or "" for a slot
      // being replaced by a newly uploaded file (files follow in A–D slot
      // order of the replaced slots).
      slots?: string;
    },
  ) {
    const current = (await this.adminService.listMinigameSets()).find(
      (s) => s.id === id,
    );
    if (!current) {
      throw new NotFoundException('ไม่พบชุดคำตอบนี้');
    }

    let nextImages: string[] | undefined;
    if (body.slots !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.slots);
      } catch {
        throw new BadRequestException('รูปแบบรูปภาพไม่ถูกต้อง');
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 4 ||
        parsed.some((u) => typeof u !== 'string')
      ) {
        throw new BadRequestException('รูปแบบรูปภาพไม่ถูกต้อง');
      }
      nextImages = parsed as string[];
    }

    if (files && files.length > 0) {
      const uploaded = await Promise.all(
        files.map((f) => this.mediaService.store(f, 'image')),
      );
      if (!nextImages) nextImages = [...current.images];
      // Fill the "" placeholder slots with uploaded files in order.
      let ui = 0;
      for (let k = 0; k < 4 && ui < uploaded.length; k++) {
        if (nextImages[k] === '') {
          nextImages[k] = uploaded[ui++];
        }
      }
      if (ui < uploaded.length) {
        throw new BadRequestException('จำนวนไฟล์ที่แนบไม่ตรงกับช่องที่เปลี่ยน');
      }
    }

    return this.adminService.updateMinigameSet(id, {
      ...(nextImages && { images: nextImages }),
      ...(body.correctIndex !== undefined && {
        correctIndex: this.parseIndex(body.correctIndex),
      }),
    });
  }

  @Delete('minigame-sets/:id')
  async deleteMinigameSet(@Param('id', ParseUUIDPipe) id: string) {
    await this.adminService.deleteMinigameSet(id);
    return { ok: true };
  }

  // ---------- User management ----------

  @Get('users')
  async listUsers(@Query('search') search?: string) {
    return this.adminService.listUsers(search);
  }

  @Patch('users/:id/verify')
  @HttpCode(200)
  async verifyUser(@Param('id', ParseUUIDPipe) id: string) {
    await this.adminService.verifyUser(id);
    return { ok: true };
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.adminService.deleteUser(id, user.userId);
    return { ok: true };
  }

  // ---------- helpers ----------

  private requireCategory(v: string | undefined): string {
    if (!v) {
      throw new Error('category is required');
    }
    return v;
  }

  private requireText(v: string | undefined, label: string): string {
    if (v === undefined || !v.trim()) {
      throw new Error(`${label} is required`);
    }
    return v;
  }

  private parseOptions(raw: string | undefined): string[] {
    if (raw === undefined) {
      throw new Error('options is required');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.split('|');
    }
    if (!Array.isArray(parsed) || parsed.some((o) => typeof o !== 'string')) {
      throw new Error('options must be a string array');
    }
    return parsed as string[];
  }

  private parseIndex(raw: string | undefined): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error('correctIndex must be a non-negative integer');
    }
    return n;
  }
}

// Media serving lives outside the admin guard so <img>/<audio> tags on
// the user-facing practice pages can fetch uploaded files without a
// Bearer token (the ids are unguessable UUIDs, same trust model as the
// existing picsum/soundhelix URLs).
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':id')
  async serve(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { mimeType, data } = await this.mediaService.serve(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(data);
  }
}
