# Zod Full-Stack Validation — Presentation & Working Demo

A runnable npm-workspaces monorepo demonstrating **one shared Zod schema** used by a React form and an Express REST API.

> Audience: software engineers familiar with JavaScript/TypeScript  
> Suggested session: 35–45 minutes + 10 minutes Q&A  
> Demo: create a user through a React form, then inspect the API's independent validation.

---

## 1. Learning objectives

By the end of this session, participants should be able to:

1. Explain the difference between TypeScript's compile-time types and runtime validation.
2. Define reusable schemas with Zod and infer TypeScript types from them.
3. Validate REST request bodies, query parameters and path parameters in Express.
4. Reuse validation rules in React Hook Form before making an API request.
5. Explain `parse()` vs `safeParse()`, transformations, refinements and error reporting.
6. Identify where Zod helps, where it adds cost, and what it does not replace.

## 2. The problem: types disappear at runtime

TypeScript protects code while it is being developed and compiled. It does **not** validate incoming JSON at runtime.

For example, this annotation does not stop a caller from sending `{ "age": "not-a-number" }`:

```ts
type CreateUserInput = {
  name: string;
  email: string;
  age: number;
};

// A type annotation is not a runtime validation boundary.
const input = req.body as CreateUserInput;
```

HTTP requests, browser input, environment variables, database records and third-party responses are runtime data. Treat them as untrusted until validated.

**Discussion prompt:** If the frontend is written in TypeScript, can the backend trust its payload?  
**Answer:** No. Requests can come from scripts, old clients, browser devtools, mobile apps or malicious callers. Validate at the server boundary.

## 3. What is Zod?

Zod is a TypeScript-first schema validation library. A schema describes the shape and constraints of data. Zod can validate unknown runtime values and infer corresponding TypeScript types.

```ts
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.coerce.number().int().min(18),
});

type User = z.infer<typeof userSchema>;
```

The schema is executable runtime code; `User` is a compile-time type derived from it.

## 4. Architecture in this repository

```text
zod-fullstack-monorepo/
├── apps/
│   ├── api/                 # Express + TypeScript REST API
│   └── web/                 # React + Vite + React Hook Form
└── packages/
    └── shared/              # Shared Zod schemas and inferred types
```

```text
                  packages/shared
                  Zod schemas + types
                     /         \
                    /           \
          apps/web                 apps/api
      React Hook Form          Express middleware
      validates early          validates again
                    \           /
                     REST JSON
```

**Important:** Sharing a schema reduces duplication; it does not remove the need for server-side validation. The API is the trust boundary.

## 5. Run the live demo

### Requirements

- Node.js 20 or newer
- npm 10 or newer
- Internet access for the first dependency installation

### Start both applications

From the repository root:

```bash
npm install
npm run dev
```

Open:

- React application: http://localhost:5173
- API health endpoint: http://localhost:4000/api/health

The Vite development server proxies `/api` requests to Express.

### Try the happy path

1. Enter a name with at least two characters.
2. Enter a valid email address.
3. Enter an age of 18 or above.
4. Submit. React Hook Form validates before the request is sent.
5. Express validates the received JSON again and returns the created user.

### Try invalid values

- Name: `A`
- Email: `not-an-email`
- Age: `12`

The form displays field-level errors and does not submit.

To demonstrate backend validation independently, send a malformed request directly:

```bash
curl -i -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"A","email":"bad","age":12}'
```

Expected result: HTTP `400` with structured validation issues. This request bypasses the React form, but it cannot bypass the API's validation.

### Try query and path validation

```bash
curl "http://localhost:4000/api/users?page=0&limit=500"
curl "http://localhost:4000/api/users/not-a-uuid"
```

Both demonstrate validation of non-body request data. The list endpoint expects `page >= 1` and `limit` between 1 and 100. The detail endpoint expects a UUID.

> The demo stores users in memory. Restarting the API clears the data. This is intentional so the focus stays on validation rather than database setup.

## 6. Walkthrough: the shared schema

See `packages/shared/src/schemas/user.ts`.

The shared `createUserSchema` is imported by both the web and API apps. It defines:

- `name`: trimmed string, minimum and maximum length.
- `email`: trimmed, valid email, normalized to lowercase.
- `age`: coerced to a number, integer, bounded range.

```ts
export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  age: z.coerce.number().int().min(18).max(120),
});

export type CreateUserInput = z.input<typeof createUserSchema>;
export type CreateUser = z.output<typeof createUserSchema>;
```

Notice the distinction:

- `z.input<typeof schema>` is the type accepted before parsing.
- `z.output<typeof schema>` is the validated/transformed result.
- `z.infer<typeof schema>` is an alias for the output type.

The age field can arrive as `"25"` from a browser form and become `25` after parsing. Email is normalized to lowercase.

## 7. `parse()` vs `safeParse()`

### `parse()`

- Returns validated/transformed data.
- Throws a `ZodError` when validation fails.
- Useful when exceptions are the desired control flow.

```ts
const result = createUserSchema.parse(requestBody);
```

### `safeParse()`

- Returns a discriminated result: `{ success: true, data }` or `{ success: false, error }`.
- Does not throw for ordinary validation failure.
- Often convenient for request boundaries and form flows.

```ts
const result = createUserSchema.safeParse(requestBody);

if (!result.success) {
  console.log(result.error.issues);
  return;
}

console.log(result.data);
```

The API middleware in this project uses `safeParse()` to return a predictable `400` response.

## 8. Express REST API validation

The API validates each boundary:

| Endpoint | Input | Schema |
|---|---|---|
| `POST /api/users` | JSON body | `createUserSchema` |
| `GET /api/users` | Query string | `listUsersQuerySchema` |
| `GET /api/users/:id` | Path parameter | `userIdParamsSchema` |

A request validation middleware parses the unknown value and stores the **parsed output** in `res.locals.validated`. Route handlers consume that parsed value rather than trusting `req.body`.

Why use the parsed output? Because Zod may trim, normalize, coerce or transform values. Continuing to use the original request would discard those guarantees.

The API also validates the response with `userSchema` before sending it. Response validation is useful for catching accidental contract drift, though it has a runtime cost and should be applied deliberately.

## 9. React Hook Form integration

See `apps/web/src/App.tsx`.

The form uses:

```ts
useForm<
  z.input<typeof createUserSchema>,
  unknown,
  z.output<typeof createUserSchema>
>({
  resolver: zodResolver(createUserSchema),
});
```

This expresses the distinction between browser input and parsed output. React Hook Form runs the Zod resolver before calling the submit handler. Invalid fields receive messages, and valid submission receives transformed data.

The frontend uses the shared schema for user experience. The backend independently runs the same schema because client-side checks are never a security boundary.

## 10. Useful Zod building blocks

### Optional, nullable and default

```ts
const profileSchema = z.object({
  nickname: z.string().optional(), // may be undefined / omitted
  middleName: z.string().nullable(), // may explicitly be null
  active: z.boolean().default(true), // default when absent
});
```

These are not interchangeable. Decide whether the API contract distinguishes omitted values from explicit `null`.

### Refinements

```ts
const passwordSchema = z.string().min(12);

const registrationSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine(
  (value) => value.password === value.confirmPassword,
  {
    message: "Passwords must match",
    path: ["confirmPassword"],
  },
);
```

Use refinements for rules that involve more than a basic primitive constraint.

### Transformations and coercion

```ts
const pageSchema = z.coerce.number().int().min(1).default(1);
const emailSchema = z.string().trim().toLowerCase().email();
```

Use coercion intentionally. For example, `z.coerce.number()` follows JavaScript number conversion rules; an empty string can coerce to `0`. Add constraints or preprocessing when that behavior is not suitable.

### Arrays and enums

```ts
const roleSchema = z.enum(["admin", "editor", "viewer"]);

const teamSchema = z.object({
  name: z.string().min(1),
  roles: z.array(roleSchema).min(1),
});
```

## 11. Pros and cons

### Advantages

- **Runtime safety:** validates data that TypeScript alone cannot validate.
- **Type inference:** derive TypeScript types from schemas and reduce duplicated declarations.
- **Shared contracts:** the same schema can be used in browser and server code.
- **Composability:** schemas can be nested, extended, picked, omitted and combined.
- **Useful errors:** structured issues can be mapped to API responses and form fields.
- **Transformations:** normalize and coerce values at a boundary.
- **Ecosystem:** integrations exist for React Hook Form and many other tools.

### Trade-offs and limitations

- **Runtime overhead:** validation consumes CPU and allocations. Measure on high-throughput paths; validate at trust boundaries and avoid needless repeated parsing.
- **Bundle size:** shipping schemas to the browser adds JavaScript. Keep browser-shared schemas focused and check production bundle output.
- **Shared-code constraints:** browser and server may need different rules. Do not import server-only logic or secrets into a shared package.
- **Complex schemas can be hard to read:** split large schemas into smaller named schemas and reusable helpers.
- **Not a security system by itself:** validation does not replace authentication, authorization, rate limiting, output encoding or database constraints.
- **Not a database consistency guarantee:** uniqueness and race-sensitive business rules still need database enforcement and transactions.
- **Version and API changes:** keep Zod and integrations compatible; review migration notes when upgrading major versions.
- **Coercion can surprise:** JavaScript conversion semantics may not match product expectations.

### Balanced recommendation

Use Zod at external boundaries: HTTP requests, form submissions, environment configuration and third-party responses. Keep schemas small and named, infer types from them, and validate again on the server. Benchmark before adding validation to extremely hot internal paths.

## 12. Common mistakes to avoid

1. **Trusting TypeScript casts:** `req.body as SomeType` does not validate JSON.
2. **Only validating in React:** callers can bypass the UI.
3. **Ignoring parsed output:** transformations are lost if the original object is used.
4. **Overusing coercion:** validate the exact input semantics expected by the API.
5. **Putting server secrets in shared code:** anything imported into a browser bundle can be exposed.
6. **Treating validation as authorization:** a valid `role: "admin"` value does not prove the caller is an admin.
7. **Leaking internal details:** return useful field errors, not stack traces or sensitive server data.
8. **Duplicating schemas unnecessarily:** share stable contract rules, but allow intentional UI-only or server-only constraints.

## 13. Suggested presentation plan (40 minutes)

| Time | Topic | Presenter action |
|---:|---|---|
| 0–4 min | The runtime validation problem | Show a TypeScript type and an invalid JSON payload |
| 4–9 min | Zod fundamentals | Explain schema, `z.infer`, input and output |
| 9–15 min | Shared monorepo architecture | Walk through `packages/shared` |
| 15–23 min | Backend demo | Show body, query and path validation |
| 23–30 min | Frontend demo | Submit valid and invalid React form data |
| 30–35 min | Advanced features | Explain transform, coercion, refine and safeParse |
| 35–40 min | Pros, cons and Q&A | Discuss trade-offs and take questions |

### Live demo speaking notes

- “TypeScript tells us what our code expects; Zod checks what actually arrived.”
- “We define the contract once, then use it in both applications.”
- “The browser validates early for a better user experience.”
- “The server validates again because the server is the trust boundary.”
- “We use the parsed result, so normalization and transformations are applied consistently.”
- “Zod complements security and database constraints; it does not replace them.”

## 14. Audience exercises

1. Add a `country` field that must contain exactly two uppercase letters.
2. Add an optional `website` field that must be a valid URL when supplied.
3. Add a `role` enum with `admin`, `editor` and `viewer`.
4. Add a cross-field rule that rejects a minimum age greater than a maximum age.
5. Change the list query so `limit` defaults to 20, while remaining between 1 and 100.

Ask participants: Which rules belong in the shared contract, which are UI-only, and which require server/database enforcement?

## 15. Project scripts

From the root:

```bash
npm run dev          # build shared package, then run API + web
npm run build        # build all workspaces
npm run typecheck    # type-check all workspaces
npm run dev:api      # run only the API
npm run dev:web      # run only the web app
```

Individual endpoints:

- `GET /api/health`
- `POST /api/users`
- `GET /api/users?page=1&limit=20`
- `GET /api/users/:id`

## 16. Production-readiness checklist

Before using this pattern in a production service:

- [ ] Pin and regularly update dependency versions.
- [ ] Add automated tests for valid, invalid and boundary payloads.
- [ ] Define a stable API error response contract.
- [ ] Avoid exposing raw internal errors.
- [ ] Keep browser-shared schemas free of server-only dependencies.
- [ ] Enforce authorization separately from input validation.
- [ ] Enforce uniqueness and transactional invariants in the database.
- [ ] Consider request size limits and rate limiting.
- [ ] Measure validation overhead on high-volume endpoints.
- [ ] Document intentional differences between UI and API validation.

---

## Final takeaway

**Zod gives TypeScript applications runtime validation and a reusable contract.** Its biggest value in a full-stack application is consistency: validate early in the UI, validate authoritatively on the server, and use the parsed data—not an unchecked type assertion.
