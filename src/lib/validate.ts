import type { Context } from "hono";
import type { z } from "zod";

export async function parseJsonBody<T extends z.ZodType>(
  c: Context,
  schema: T
): Promise<
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: Response }
> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      response: c.json({ error: "Invalid JSON body" }, 400),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: c.json(
        {
          error: "Validation failed",
          details: result.error.flatten(),
        },
        400
      ),
    };
  }

  return { ok: true, data: result.data };
}
