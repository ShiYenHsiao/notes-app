"use client";

import { useActionState } from "react";

import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div className="rounded-lg border border-line bg-surface p-5">
        <p className="font-semibold">信寄出去了</p>
        <p className="mt-1 text-sm text-ink-muted">
          點開信裡的連結就會登入。連結有時效，過期的話回來這裡重寄一次。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />

      <label className="block">
        <span className="text-sm text-ink-muted">Email</span>
        <input
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "寄送中…" : "寄登入連結給我"}
      </button>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-accent">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
