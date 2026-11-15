import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, VISIBILITIES } from "../api/client";
import type { Visibility } from "../api/client";
import { VideoCard } from "../components/VideoCard";
import { StatusPage } from "./StatusPage";

/**
 * Creator view of a channel. The page just asks the server for the channel's
 * videos. If the id isn't the signed-in user's, the server answers 403 and we
 * show that, nothing more.
 */
export function StudioChannelPage() {
  const { userId = "" } = useParams();
  const queryClient = useQueryClient();
  const queryKey = ["channel", userId];

  const videos = useQuery({ queryKey, queryFn: () => api.channelVideos(userId) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const setVisibility = useMutation({
    mutationFn: (v: { id: string; visibility: Visibility }) =>
      api.updateVideo(v.id, { visibility: v.visibility }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteVideo(id),
    onSuccess: refresh,
  });

  if (videos.error instanceof ApiError && videos.error.status === 403) {
    return <StatusPage title="403" message="You can only open your own studio." />;
  }

  const actionError = setVisibility.error ?? remove.error;

  return (
    <main className="page">
      <div className="row">
        <h1>Your videos</h1>
        <Link className="button" to={`/studio/channel/${userId}/create`}>
          Upload a video
        </Link>
      </div>

      {videos.isPending && <p className="muted">Loading…</p>}
      {videos.error && (
        <p className="error" role="alert">
          {videos.error instanceof ApiError ? videos.error.message : "Could not load videos"}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          {actionError instanceof ApiError ? actionError.message : "Action failed"}
        </p>
      )}
      {videos.data?.length === 0 && <p className="muted">You haven't uploaded anything yet.</p>}

      <ul className="videos">
        {videos.data?.map((v) => (
          <VideoCard
            key={v.id}
            video={v}
            actions={
              <>
                <label>
                  Visibility
                  <select
                    value={v.visibility}
                    disabled={setVisibility.isPending}
                    onChange={(e) =>
                      setVisibility.mutate({ id: v.id, visibility: e.target.value as Visibility })
                    }
                  >
                    {VISIBILITIES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete “${v.title}”? This cannot be undone.`)) {
                      remove.mutate(v.id);
                    }
                  }}
                >
                  Delete
                </button>
              </>
            }
          />
        ))}
      </ul>
    </main>
  );
}
