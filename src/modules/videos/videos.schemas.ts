import { z } from "zod";
import { VISIBILITIES } from "../../lib/visibility.js";

const visibilitySchema = z.enum(VISIBILITIES);

export const createVideoSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  visibility: visibilitySchema.optional(),
});

export type CreateVideoBody = z.infer<typeof createVideoSchema>;

export const updateVideoSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.visibility !== undefined,
    {
      message: "At least one of title, description or visibility must be provided",
    },
  );

export type UpdateVideoBody = z.infer<typeof updateVideoSchema>;

export const videoIdParamSchema = z.object({
  id: z.string().min(1),
});

export const channelParamSchema = z.object({
  userId: z.string().min(1),
});
