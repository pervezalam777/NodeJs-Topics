# Architecture notes

- `packages/shared` owns reusable validation contracts.
- `apps/web` uses `zodResolver` with React Hook Form; client validation is for usability.
- `apps/api` validates every incoming body/query/params boundary with `safeParse`.
- Middleware stores parsed values in `res.locals.validated`, so handlers consume normalized output.
- The API validates the generated user response with `userSchema`.
- This demo deliberately uses in-memory storage and is not a production persistence layer.
