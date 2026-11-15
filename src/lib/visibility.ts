/**
 * Video visibility levels.
 *
 * - private:  only the owner can see it.
 * - public:   listed on the feed, visible to any user with `video.read`.
 * - unlisted: stored, but not listed anywhere. Link-based access is not
 *             implemented yet, so for now it behaves like private.
 */
export const VISIBILITIES = ["private", "public", "unlisted"] as const;

export type Visibility = (typeof VISIBILITIES)[number];

export const DEFAULT_VISIBILITY: Visibility = "private";
