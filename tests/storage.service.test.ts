import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageService } from "../src/modules/videos/storage.service.js";

describe("StorageService (unit)", () => {
  let dir: string;
  let storage: StorageService;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "vps-storage-"));
    storage = new StorageService({ uploadDir: dir, maxFileSize: 1000 });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the upload directory on construction", () => {
    expect(existsSync(dir)).toBe(true);
  });

  it("generates unique filenames preserving the extension", () => {
    const a = storage.generateFilename("my video.MP4");
    const b = storage.generateFilename("my video.MP4");
    expect(a).not.toBe(b);
    expect(a.endsWith(".mp4")).toBe(true);
    expect(b.endsWith(".mp4")).toBe(true);
  });

  it("resolves an absolute path inside the upload dir", () => {
    const p = storage.resolvePath("abc.mp4");
    expect(p).toBe(join(dir, "abc.mp4"));
  });

  it("deletes an existing file", async () => {
    const name = "to-delete.mp4";
    writeFileSync(storage.resolvePath(name), "data");
    expect(existsSync(storage.resolvePath(name))).toBe(true);
    await storage.delete(name);
    expect(existsSync(storage.resolvePath(name))).toBe(false);
  });

  it("delete is idempotent for a missing file (no throw)", async () => {
    await expect(storage.delete("does-not-exist.mp4")).resolves.toBeUndefined();
  });
});
