import { z } from "zod";

export const memoryItemBodySchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string().min(1).max(2000),
  category: z.enum(["profile", "preference", "domain"]).optional(),
});

export const memoryPatchSchema = memoryItemBodySchema.partial();

export const summaryPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const summaryListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["pinned", "unpinned", "all"]).optional(),
  website: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
