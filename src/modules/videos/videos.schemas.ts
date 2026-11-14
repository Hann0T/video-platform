import { z } from "zod";

export const createVideoSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
});

export type CreateVideoBody = z.infer<typeof createVideoSchema>;

export const updateVideoSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined, {
    message: "At least one of title or description must be provided",
  });

export type UpdateVideoBody = z.infer<typeof updateVideoSchema>;

export const videoIdParamSchema = z.object({
  id: z.string().min(1),
});
