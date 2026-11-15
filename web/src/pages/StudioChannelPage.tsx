import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import type { Video } from "../api/client";
import { StatusPage } from "./StatusPage";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function StudioChannelPage() {
  const { userId } = useParams();
  const { user, logout } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<Video | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: api.uploadVideo,
    onSuccess: (video) => {
      setUploaded(video);
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    },
  });

  if (!user) return null; // RequireAuth guarantees a user
  const isOwner = user.id === userId;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) {
    return <StatusPage title="403" message="You can only open your own studio." />;
  }
  // Uploads are always created under the signed-in user, so an admin viewing
  // another channel can't upload on that user's behalf.
  const canUpload = isOwner && user.permissions.includes("video.create");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploaded(null);
    upload.mutate({ file, title, description: description || undefined });
  }

  return (
    <main className="studio">
      <header className="topbar">
        <strong>VidStream Studio</strong>
        <span className="muted">
          {user.email} ({user.role})
        </span>
        <button className="secondary" onClick={() => void logout()}>
          Sign out
        </button>
      </header>

      <section className="card">
        <h2>Channel {userId}</h2>
        {!isOwner && <p className="muted">Viewing as admin. Uploading is disabled here.</p>}

        {canUpload ? (
          <form onSubmit={onSubmit}>
            <h3>Upload a video</h3>
            <label>
              Title
              <input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Description (optional)
              <textarea
                maxLength={2000}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              Video file
              <input
                ref={fileInput}
                type="file"
                accept="video/*"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {upload.error && (
              <p className="error" role="alert">
                {upload.error instanceof ApiError ? upload.error.message : "Upload failed"}
              </p>
            )}
            <button type="submit" disabled={upload.isPending || !file}>
              {upload.isPending ? "Uploading…" : "Upload"}
            </button>
          </form>
        ) : (
          isOwner && <p className="muted">Your role cannot upload videos.</p>
        )}

        {uploaded && (
          <p className="success" role="status">
            Uploaded “{uploaded.title}” ({formatSize(uploaded.sizeBytes)}, {uploaded.mimeType}).
          </p>
        )}
      </section>

      <p className="muted">
        The video list, edit and delete will return once the video access policy is defined.
      </p>
    </main>
  );
}
