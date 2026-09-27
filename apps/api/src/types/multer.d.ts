// Minimal ambient typings for the multer usage in this project (the real
// @types/multer isn't installed; only what AdminController/MediaService
// need). This file has no top-level import/export so it stays a global
// script — both declarations below land in the global scope as intended.

declare module 'multer' {
  interface MulterStorageEngine {
    _handleFile(
      req: unknown,
      file: Express.Multer.File,
      cb: (error?: unknown, info?: unknown) => void,
    ): void;
    _removeFile(
      req: unknown,
      file: Express.Multer.File,
      cb: (error: unknown) => void,
    ): void;
  }
  interface MulterOptions {
    dest?: string;
    storage?: MulterStorageEngine;
    limits?: {
      fieldSize?: number;
      fileSize?: number;
      files?: number;
    };
  }
  interface MulterInstance {
    single(field: string): (
      req: unknown,
      res: unknown,
      next: (err?: unknown) => void,
    ) => void;
  }
  function multer(options?: MulterOptions): MulterInstance;
  export = multer;
}

declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }
  }
}
