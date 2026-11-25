import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  createUserSchema,
  listUsersQuerySchema,
  userIdParamsSchema,
  userSchema,
  type User,
} from "@demo/shared";
import { validate } from "../middleware/validate.js";

type ValidatedLocals = {
  validated: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
  };
};

const router = Router();
const users: User[] = [];

router.post(
  "/",
  validate("body", createUserSchema),
  (req, res) => {
    const input = (res.locals as ValidatedLocals).validated.body as {
      name: string; email: string; age: number;
    };

    const user = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };

    const parsed = userSchema.safeParse(user);
    if (!parsed.success) {
      res.status(500).json({ message: "Server generated an invalid user response" });
      return;
    }

    users.push(parsed.data);
    res.status(201).json(parsed.data);
  },
);

router.get(
  "/",
  validate("query", listUsersQuerySchema),
  (req, res) => {
    const { page, limit } = (res.locals as ValidatedLocals).validated.query as {
      page: number; limit: number;
    };
    const start = (page - 1) * limit;
    res.json({
      data: users.slice(start, start + limit),
      pagination: { page, limit, total: users.length },
    });
  },
);

router.get(
  "/:id",
  validate("params", userIdParamsSchema),
  (req, res) => {
    const { id } = (res.locals as ValidatedLocals).validated.params as { id: string };
    const user = users.find((candidate) => candidate.id === id);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json(user);
  },
);

export default router;
