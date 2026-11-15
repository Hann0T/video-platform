import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";

/**
 * Plays a video from a signed stream URL. The URL's token expires, so if the
 * browser hits a load error mid-playback (e.g. seeking after expiry), fetch a
 * fresh URL once and resume from the same position.
 */
export function VideoPlayer({ videoId }: { videoId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resumeAt = useRef<number | null>(null);
  const retried = useRef(false);

  const load = useCallback(async () => {
    try {
      const { url } = await api.playback(videoId);
      setSrc(url);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start playback");
    }
  }, [videoId]);

  useEffect(() => {
    retried.current = false;
    void load();
  }, [load]);

  function onError() {
    if (retried.current) {
      setError("Playback failed.");
      return;
    }
    retried.current = true;
    resumeAt.current = ref.current?.currentTime ?? 0;
    void load();
  }

  function onLoadedMetadata() {
    const el = ref.current;
    if (el && resumeAt.current !== null) {
      el.currentTime = resumeAt.current;
      resumeAt.current = null;
      void el.play().catch(() => undefined);
    }
  }

  // A successful play resets the one-shot retry, so a later expiry can retry too.
  function onPlaying() {
    retried.current = false;
  }

  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  if (!src) return <div className="player placeholder muted">Loading…</div>;

  return (
    <video
      ref={ref}
      className="player"
      src={src}
      controls
      preload="metadata"
      onError={onError}
      onLoadedMetadata={onLoadedMetadata}
      onPlaying={onPlaying}
    />
  );
}
