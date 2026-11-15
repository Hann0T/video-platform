import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { VideoPlayer } from "../components/VideoPlayer";
import { formatSize } from "../components/VideoCard";
import { StatusPage } from "./StatusPage";

/** The server answers 404 for videos you can't see, so that's all we show. */
export function WatchPage() {
  const { videoId = "" } = useParams();
  const video = useQuery({ queryKey: ["video", videoId], queryFn: () => api.getVideo(videoId) });

  if (video.error instanceof ApiError && video.error.status === 404) {
    return <StatusPage title="404" message="Video not found." />;
  }

  return (
    <main className="page">
      {video.error && (
        <p className="error" role="alert">
          {video.error instanceof ApiError ? video.error.message : "Could not load the video"}
        </p>
      )}
      {video.data && (
        <>
          <VideoPlayer videoId={video.data.id} />
          <h1>{video.data.title}</h1>
          {video.data.description && <p>{video.data.description}</p>}
          <p className="muted">
            {formatSize(video.data.sizeBytes)} · {video.data.visibility} ·{" "}
            {new Date(video.data.createdAt).toLocaleDateString()}
          </p>
        </>
      )}
      {video.isPending && <p className="muted">Loading…</p>}
    </main>
  );
}
