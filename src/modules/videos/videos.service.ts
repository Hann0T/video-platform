import type { PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../lib/http.js";
import { DEFAULT_VISIBILITY, type Visibility } from "../../lib/visibility.js";
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
  visibility: Visibility;
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
  visibility?: Visibility;
};

export type UpdateVideoInput = {
  title?: string;
  description?: string | null;
  visibility?: Visibility;
};

type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * VideosService owns video metadata persistence + file lifecycle. Dependencies
 * (StorageService, Gate, PrismaClient) are injected via the constructor so the
 * service is unit-testable with fakes.
 *
 * Every read or write of a single video goes through the Gate against the
 * loaded record. Videos the user may not see are reported as NotFound (404),
 * never Forbidden, so private videos can't be discovered by guessing ids.
 */
export class VideosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly gate: Gate,
  ) {}

  /**
   * Persist metadata for an already-stored upload. If the DB write fails, the
   * orphaned file is removed so disk and DB stay consistent. Videos default to
   * private unless a visibility is given.
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
          visibility: input.visibility ?? DEFAULT_VISIBILITY,
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

  /** The feed: every public video, newest first. */
  async listFeed(): Promise<PublicVideo[]> {
    const videos = await this.prisma.video.findMany({
      where: { visibility: "public" },
      orderBy: { createdAt: "desc" },
    });
    return videos.map((v) => this.toPublic(v));
  }

  /**
   * All of a channel's videos (any visibility), newest first. Only the channel
   * owner may call this; anyone else gets Forbidden (403).
   */
  async listChannel(
    user: PolicyUser,
    channelUserId: string,
  ): Promise<PublicVideo[]> {
    this.gate.authorizeChannel(user, channelUserId);
    const videos = await this.prisma.video.findMany({
      where: { ownerId: channelUserId },
      orderBy: { createdAt: "desc" },
    });
    return videos.map((v) => this.toPublic(v));
  }

  /** Get a single video the user is allowed to see, or throw NotFound. */
  async getById(user: PolicyUser, id: string): Promise<PublicVideo> {
    return this.toPublic(await this.loadViewable(user, id));
  }

  /**
   * Update a video's metadata or visibility. Loads the record (404 if the user
   * can't see it), authorizes the update via the Gate (owner with update.own
   * OR anyone with update.any), then applies the change. Throws NotFound (404)
   * or Forbidden (403).
   */
  async update(
    user: PolicyUser,
    id: string,
    input: UpdateVideoInput,
  ): Promise<PublicVideo> {
    const existing = await this.loadViewable(user, id);

    this.gate.authorizeVideo(user, "update", this.resourceOf(existing));

    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.visibility !== undefined
          ? { visibility: input.visibility }
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
    const existing = await this.loadViewable(user, id);

    this.gate.authorizeVideo(user, "delete", this.resourceOf(existing));

    await this.prisma.video.delete({ where: { id } });
    await this.storage.delete(existing.filename);
  }

  /**
   * Load a video the user is allowed to see. Missing and not-viewable both
   * throw NotFound so a 403 never confirms that a private video exists.
   */
  private async loadViewable(user: PolicyUser, id: string): Promise<VideoRow> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video || !this.gate.canVideo(user, "view", this.resourceOf(video))) {
      throw new NotFoundError("Video not found");
    }
    return video;
  }

  private resourceOf(video: VideoRow) {
    return {
      ownerId: video.ownerId,
      visibility: video.visibility as Visibility,
    };
  }

  private toPublic(video: VideoRow): PublicVideo {
    return {
      id: video.id,
      title: video.title,
      description: video.description,
      filename: video.filename,
      mimeType: video.mimeType,
      sizeBytes: video.sizeBytes,
      visibility: video.visibility as Visibility,
      ownerId: video.ownerId,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  }
}
