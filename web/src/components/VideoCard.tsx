import type { ReactNode } from "react";
import type { Video } from "../api/client";

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Metadata card. Playback arrives with the streaming endpoint. */
export function VideoCard({ video, actions }: { video: Video; actions?: ReactNode }) {
  return (
    <li className="video">
      <div>
        <h3>{video.title}</h3>
        {video.description && <p>{video.description}</p>}
        <p className="muted">
          {formatSize(video.sizeBytes)} · {video.mimeType} ·{" "}
          {new Date(video.createdAt).toLocaleDateString()}
        </p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </li>
  );
}
