import type { RequestHandler } from "express";
import type { z } from "zod";

type RequestPart = "body" | "query" | "params";

export function validate<TSchema extends z.ZodTypeAny>(
  part: RequestPart,
  schema: TSchema,
): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      res.status(400).json({
        message: `Invalid request ${part}`,
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        })),
      });
      return;
    }

    const validated = (res.locals.validated ??= {}) as Record<string, unknown>;
    validated[part] = result.data;
    next();
  };
}
