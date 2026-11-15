import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { VideoCard } from "../components/VideoCard";

export function FeedPage() {
  const feed = useQuery({ queryKey: ["feed"], queryFn: api.feed });

  return (
    <main className="page">
      <h1>Feed</h1>
      {feed.isPending && <p className="muted">Loading…</p>}
      {feed.error && (
        <p className="error" role="alert">
          {feed.error instanceof ApiError ? feed.error.message : "Could not load the feed"}
        </p>
      )}
      {feed.data?.length === 0 && <p className="muted">No public videos yet.</p>}
      <ul className="videos">
        {feed.data?.map((v) => <VideoCard key={v.id} video={v} />)}
      </ul>
    </main>
  );
}
