import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { VideosService } from "../src/modules/videos/videos.service.js";
import type { StorageService } from "../src/modules/videos/storage.service.js";
import type { Gate } from "../src/authorization/gate.js";
import { ForbiddenError } from "../src/lib/http.js";

const file = {
  filename: "stored-abc.mp4",
  path: "/tmp/stored-abc.mp4",
  mimetype: "video/mp4",
  size: 12345,
};

function makeService(opts: {
  create?: ReturnType<typeof vi.fn>;
  del?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  dbDelete?: ReturnType<typeof vi.fn>;
  authorize?: ReturnType<typeof vi.fn>;
}) {
  const prisma = {
    video: {
      create: opts.create ?? vi.fn(),
      findUnique: opts.findUnique ?? vi.fn(),
      update: opts.update ?? vi.fn(),
      delete: opts.dbDelete ?? vi.fn(),
    },
  } as unknown as PrismaClient;
  const storage = {
    delete: opts.del ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;
  const gate = {
    authorizeVideo: opts.authorize ?? vi.fn(),
  } as unknown as Gate;
  return {
    service: new VideosService(prisma, storage, gate),
    prisma,
    storage,
    gate,
  };
}

describe("VideosService.create (unit)", () => {
  it("persists metadata from the uploaded file + body", async () => {
    const row = {
      id: "v1",
      title: "My clip",
      description: "desc",
      filename: file.filename,
      path: file.path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      ownerId: "owner-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const create = vi.fn().mockResolvedValue(row);
    const { service } = makeService({ create });

    const result = await service.create(
      "owner-1",
      { title: "My clip", description: "desc" },
      file,
    );

    expect(create).toHaveBeenCalledOnce();
    const arg = create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      title: "My clip",
      description: "desc",
      filename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      ownerId: "owner-1",
    });
    expect(result.id).toBe("v1");
    expect(result.ownerId).toBe("owner-1");
  });

  it("deletes the orphaned file if the DB write fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("db down"));
    const del = vi.fn().mockResolvedValue(undefined);
    const { service } = makeService({ create, del });

    await expect(
      service.create("owner-1", { title: "x" }, file),
    ).rejects.toThrow("db down");

    // Orphan cleanup must have been attempted with the stored filename.
    expect(del).toHaveBeenCalledWith(file.filename);
  });

  it("maps null description when none provided", async () => {
    const create = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "v2",
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const { service } = makeService({ create });

    const result = await service.create("owner-1", { title: "No desc" }, file);
    expect(result.description).toBeNull();
  });
});

const user = { id: "owner-1", permissions: ["video.update.own", "video.delete.own"] };
const existingRow = {
  id: "v1",
  title: "Old",
  description: null,
  filename: "stored-abc.mp4",
  path: "/tmp/stored-abc.mp4",
  mimeType: "video/mp4",
  sizeBytes: 10,
  ownerId: "owner-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("VideosService.update (unit)", () => {
  it("authorizes then updates when allowed", async () => {
    const findUnique = vi.fn().mockResolvedValue(existingRow);
    const update = vi
      .fn()
      .mockResolvedValue({ ...existingRow, title: "New title" });
    const authorize = vi.fn(); // allow (no throw)
    const { service } = makeService({ findUnique, update, authorize });

    const result = await service.update(user, "v1", { title: "New title" });

    expect(authorize).toHaveBeenCalledWith(user, "update", {
      ownerId: "owner-1",
    });
    expect(update).toHaveBeenCalledOnce();
    expect(result.title).toBe("New title");
  });

  it("throws 404 when the video does not exist", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const { service } = makeService({ findUnique });
    await expect(
      service.update(user, "missing", { title: "x" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not update when the gate denies (non-owner)", async () => {
    const findUnique = vi.fn().mockResolvedValue(existingRow);
    const update = vi.fn();
    const authorize = vi.fn(() => {
      throw new ForbiddenError("denied");
    });
    const { service } = makeService({ findUnique, update, authorize });

    await expect(
      service.update(
        { id: "other", permissions: ["video.update.own"] },
        "v1",
        { title: "x" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("VideosService.delete (unit)", () => {
  it("removes the DB row and the file when allowed", async () => {
    const findUnique = vi.fn().mockResolvedValue(existingRow);
    const dbDelete = vi.fn().mockResolvedValue(existingRow);
    const del = vi.fn().mockResolvedValue(undefined);
    const authorize = vi.fn();
    const { service } = makeService({ findUnique, dbDelete, del, authorize });

    await service.delete(user, "v1");

    expect(authorize).toHaveBeenCalledWith(user, "delete", {
      ownerId: "owner-1",
    });
    expect(dbDelete).toHaveBeenCalledWith({ where: { id: "v1" } });
    expect(del).toHaveBeenCalledWith("stored-abc.mp4");
  });

  it("does not delete when the gate denies (non-owner)", async () => {
    const findUnique = vi.fn().mockResolvedValue(existingRow);
    const dbDelete = vi.fn();
    const del = vi.fn();
    const authorize = vi.fn(() => {
      throw new ForbiddenError("denied");
    });
    const { service } = makeService({ findUnique, dbDelete, del, authorize });

    await expect(
      service.delete(
        { id: "other", permissions: ["video.delete.own"] },
        "v1",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(dbDelete).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("throws 404 when the video does not exist", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const { service } = makeService({ findUnique });
    await expect(service.delete(user, "missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
