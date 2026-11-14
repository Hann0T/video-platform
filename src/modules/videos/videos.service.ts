import type { PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../lib/http.js";
import type { Gate } from "../../authorization/gate.js";
import type { PolicyUser } from "../../authorization/policies/video.policy.js";
import type { StorageService } from "./storage.service.js";

/** Video metadata safe to return over the API. */
export type PublicVideo = {
  id: string;
  title: string;
  description: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Shape of a stored upload (subset of Express.Multer.File we rely on). */
export type UploadedFile = {
  filename: string;
  path: string;
  mimetype: string;
  size: number;
};

export type CreateVideoInput = {
  title: string;
  description?: string;
};

export type UpdateVideoInput = {
  title?: string;
  description?: string | null;
};

/**
 * VideosService owns video metadata persistence + file lifecycle. Dependencies
 * (StorageService, Gate, PrismaClient) are injected via the constructor so the
 * service is unit-testable with fakes.
 *
 * Ownership-gated update/delete load the resource, then ask the Gate to
 * authorize the action against the loaded record (owner OR *.any permission).
 */
export class VideosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly gate: Gate,
  ) {}

  /**
   * Persist metadata for an already-stored upload. If the DB write fails, the
   * orphaned file is removed so disk and DB stay consistent.
   */
  async create(
    ownerId: string,
    input: CreateVideoInput,
    file: UploadedFile,
  ): Promise<PublicVideo> {
    try {
      const video = await this.prisma.video.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          filename: file.filename,
          path: file.path,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          ownerId,
        },
      });
      return this.toPublic(video);
    } catch (err) {
      // Clean up the orphaned file so we don't leak disk space.
      await this.storage.delete(file.filename);
      throw err;
    }
  }

  /** List all videos (newest first). */
  async list(): Promise<PublicVideo[]> {
    const videos = await this.prisma.video.findMany({
      orderBy: { createdAt: "desc" },
    });
    return videos.map((v) => this.toPublic(v));
  }

  /** Get a single video by id, or throw NotFound. */
  async getById(id: string): Promise<PublicVideo> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) {
      throw new NotFoundError("Video not found");
    }
    return this.toPublic(video);
  }

  /**
   * Update a video's metadata. Loads the record, authorizes the acting user
   * via the Gate (owner with update.own OR anyone with update.any), then
   * applies the change. Throws NotFound (404) or Forbidden (403).
   */
  async update(
    user: PolicyUser,
    id: string,
    input: UpdateVideoInput,
  ): Promise<PublicVideo> {
    const existing = await this.prisma.video.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError("Video not found");
    }

    this.gate.authorizeVideo(user, "update", { ownerId: existing.ownerId });

    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });
    return this.toPublic(updated);
  }

  /**
   * Delete a video: load, authorize (owner with delete.own OR delete.any),
   * remove the DB row, then delete the file from disk. Row-first so that if
   * file deletion fails we don't leave a dangling DB record.
   */
  async delete(user: PolicyUser, id: string): Promise<void> {
    const existing = await this.prisma.video.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError("Video not found");
    }

    this.gate.authorizeVideo(user, "delete", { ownerId: existing.ownerId });

    await this.prisma.video.delete({ where: { id } });
    await this.storage.delete(existing.filename);
  }

  private toPublic(video: {
    id: string;
    title: string;
    description: string | null;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
  }): PublicVideo {
    return {
      id: video.id,
      title: video.title,
      description: video.description,
      filename: video.filename,
      mimeType: video.mimeType,
      sizeBytes: video.sizeBytes,
      ownerId: video.ownerId,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  }
}
