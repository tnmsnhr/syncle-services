import { z } from "zod";

export const googleSignInBodySchema = z.object({
  accessToken: z.string().min(1),
});

export type GoogleSignInBody = z.infer<typeof googleSignInBodySchema>;
