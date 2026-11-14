import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageService } from "../src/modules/videos/storage.service.js";
import { createUploadMiddleware } from "../src/middleware/upload.js";
import { ok } from "../src/lib/http.js";
import {
  errorHandler,
  notFoundHandler,
} from "../src/middleware/error-handler.js";

describe("upload middleware (integration)", () => {
  let dir: string;
  let storage: StorageService;
  let app: Express;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "vps-upload-"));
    // Small size limit (1 KB) so we can test the 413 path cheaply.
    storage = new StorageService({ uploadDir: dir, maxFileSize: 1024 });
    const upload = createUploadMiddleware(storage);

    app = express();
    app.post(
      "/upload",
      upload.single("video"),
      upload.mapError,
      (req, res) => {
        res.json(
          ok({
            filename: req.file?.filename,
            size: req.file?.size,
            mimeType: req.file?.mimetype,
          }),
        );
      },
    );
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores a valid small video file on disk", async () => {
    const res = await request(app)
      .post("/upload")
      .attach("video", Buffer.from("tiny-bytes"), {
        filename: "clip.mp4",
        contentType: "video/mp4",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.filename).toBeTypeOf("string");
    expect(res.body.data.mimeType).toBe("video/mp4");
    expect(existsSync(join(dir, res.body.data.filename))).toBe(true);
  });

  it("rejects a non-video MIME type with 415", async () => {
    const res = await request(app)
      .post("/upload")
      .attach("video", Buffer.from("hello"), {
        filename: "note.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects a file exceeding the size limit with 413", async () => {
    const big = Buffer.alloc(2048, 1); // 2 KB > 1 KB limit
    const res = await request(app)
      .post("/upload")
      .attach("video", big, {
        filename: "big.mp4",
        contentType: "video/mp4",
      });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
