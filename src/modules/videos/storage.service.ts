import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";

export type StorageConfig = {
  uploadDir: string;
  maxFileSize: number;
};

/**
 * StorageService encapsulates local-disk storage for uploaded media. It owns
 * path resolution, unique filename generation, and file deletion so that the
 * VideosService (and the multer middleware) never hand-roll filesystem paths.
 *
 * Injected with config (upload dir + size limit) via the constructor, keeping
 * it unit-testable against a temp directory.
 */
export class StorageService {
  readonly uploadDir: string;
  readonly maxFileSize: number;

  constructor(config: StorageConfig) {
    this.uploadDir = isAbsolute(config.uploadDir)
      ? config.uploadDir
      : resolve(process.cwd(), config.uploadDir);
    this.maxFileSize = config.maxFileSize;
    this.ensureDir();
  }

  /** Ensure the upload directory exists (created recursively if missing). */
  ensureDir(): void {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Generate a collision-resistant stored filename, preserving the original
   * extension. Avoids leaking/colliding on user-provided names.
   */
  generateFilename(originalName: string): string {
    const ext = extname(originalName).toLowerCase();
    const unique = `${Date.now()}-${randomUUID()}`;
    // Hash the random component to keep names uniform and opaque.
    const hashed = createHash("sha256")
      .update(unique)
      .digest("hex")
      .slice(0, 32);
    return `${hashed}${ext}`;
  }

  /** Absolute path for a stored filename. */
  resolvePath(filename: string): string {
    return join(this.uploadDir, filename);
  }

  /** Delete a stored file by filename. Idempotent (ignores ENOENT). */
  async delete(filename: string): Promise<void> {
    try {
      await unlink(this.resolvePath(filename));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }
}
