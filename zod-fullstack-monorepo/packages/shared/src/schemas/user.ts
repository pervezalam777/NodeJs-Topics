import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must contain at least 2 characters").max(80),
  email: z.string().trim().email("Enter a valid email address").transform((value) => value.toLowerCase()),
  age: z.coerce.number().int("Age must be a whole number").min(18, "You must be at least 18").max(120),
});

export type CreateUserInput = z.input<typeof createUserSchema>;
export type CreateUser = z.output<typeof createUserSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  age: z.number().int(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const userIdParamsSchema = z.object({
  id: z.string().uuid("User ID must be a valid UUID"),
});

export const apiErrorSchema = z.object({
  message: z.string(),
  issues: z.array(z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
    code: z.string(),
  })).optional(),
});
