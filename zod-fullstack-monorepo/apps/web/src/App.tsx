import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type CreateUser, type User } from "@demo/shared";
import type { z } from "zod";

type ApiError = {
  message: string;
  issues?: { path: (string | number)[]; message: string; code: string }[];
};

export default function App() {
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [apiMessage, setApiMessage] = useState("");
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof createUserSchema>,
    unknown,
    CreateUser
  >({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", age: "" },
  });

  const onSubmit = async (data: CreateUser) => {
    setApiMessage("");
    setApiError(null);
    setCreatedUser(null);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const payload = await response.json();

      if (!response.ok) {
        setApiError(payload as ApiError);
        return;
      }

      setCreatedUser(payload as User);
      setApiMessage("Success! The API accepted and validated the request.");
      reset();
    } catch {
      setApiError({ message: "Could not reach the API. Is the backend running?" });
    }
  };

  return (
    <main className="page">
      <header className="hero">
        <div className="eyebrow">FULL-STACK TYPESCRIPT • LIVE DEMO</div>
        <h1>One schema. Two validation boundaries.</h1>
        <p>React Hook Form validates before submit. Express validates the request again.</p>
        <div className="pills"><span>React</span><span>TypeScript</span><span>Zod</span><span>Express</span></div>
      </header>

      <section className="layout">
        <form className="panel" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="panel-heading">
            <div><div className="eyebrow">STEP 1</div><h2>Create a user</h2></div>
            <span className="status">Client validation</span>
          </div>
          <p className="muted">Try invalid values to see Zod errors before the browser sends a request.</p>

          <label htmlFor="name">Full name</label>
          <input id="name" placeholder="e.g. Alex Morgan" {...register("name")} />
          {errors.name && <small className="field-error">{errors.name.message}</small>}

          <label htmlFor="email">Email address</label>
          <input id="email" type="email" placeholder="alex@example.com" {...register("email")} />
          {errors.email && <small className="field-error">{errors.email.message}</small>}

          <label htmlFor="age">Age</label>
          <input id="age" type="number" placeholder="18" {...register("age")} />
          {errors.age && <small className="field-error">{errors.age.message}</small>}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Submitting..." : "Validate & create user"}
          </button>
          <div className="hint">The shared schema trims the name, lowercases email and converts age to a number.</div>
        </form>

        <aside className="panel result-panel">
          <div className="panel-heading">
            <div><div className="eyebrow">STEP 2</div><h2>API response</h2></div>
            <span className="status server">Server validation</span>
          </div>
          <p className="muted">The request reaches Express only after client validation succeeds. The API still validates independently.</p>
          {apiMessage && <div className="success">{apiMessage}</div>}
          {apiError && <div className="error-box"><strong>{apiError.message}</strong>{apiError.issues?.map((issue, index) => <div key={index}>{issue.path.join(".")}: {issue.message}</div>)}</div>}
          {createdUser ? (
            <pre>{JSON.stringify(createdUser, null, 2)}</pre>
          ) : (
            <div className="empty"><span>⌁</span><strong>Waiting for a valid submission</strong><small>Your validated response will appear here.</small></div>
          )}
          <div className="callout"><strong>Try bypassing the UI</strong><br />Use the curl example in README.md with invalid JSON. The backend rejects it with HTTP 400.</div>
        </aside>
      </section>

      <section className="flow">
        <div><span className="number">01</span><strong>Shared schema</strong><small>packages/shared</small></div>
        <span className="arrow">→</span>
        <div><span className="number">02</span><strong>React Hook Form</strong><small>Validate for UX</small></div>
        <span className="arrow">→</span>
        <div><span className="number">03</span><strong>Express middleware</strong><small>Validate for trust</small></div>
        <span className="arrow">→</span>
        <div><span className="number">04</span><strong>Parsed data</strong><small>Safe to process</small></div>
      </section>
      <footer>Demo note: users are stored in memory and are cleared when the API restarts.</footer>
    </main>
  );
}
