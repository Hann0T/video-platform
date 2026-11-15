import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, VISIBILITIES } from "../api/client";
import type { Visibility } from "../api/client";
import { StatusPage } from "./StatusPage";

/** Upload form. The server rejects (403) uploads into a channel that isn't yours. */
export function StudioCreatePage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: () =>
      api.uploadVideo(userId, {
        file: file as File,
        title,
        description: description || undefined,
        visibility,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channel", userId] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      navigate(`/studio/channel/${userId}`);
    },
  });

  if (upload.error instanceof ApiError && upload.error.status === 403) {
    return <StatusPage title="403" message="You can only upload to your own channel." />;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (file) upload.mutate();
  }

  return (
    <main className="page">
      <p>
        <Link to={`/studio/channel/${userId}`}>← Back to your videos</Link>
      </p>
      <form className="card" onSubmit={onSubmit}>
        <h1>Upload a video</h1>
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
          Visibility
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            {VISIBILITIES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          Video file
          <input
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
    </main>
  );
}
