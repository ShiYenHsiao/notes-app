"use client";

import { useActionState } from "react";

import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <div className="mt-7 w-full border border-line bg-accent-soft px-4 py-5 text-left">
        <p className="text-sm font-bold text-accent">信寄出去了</p>
        <p className="mt-1.5 text-xs text-ink-muted">
          點開信裡的連結就會登入。連結有時效，過期的話回來這裡重寄一次。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-7 grid w-full gap-3 text-left">
      <input type="hidden" name="next" value={next} />

      <label className="grid gap-1.5">
        <span className="text-2xs font-extrabold text-ink-muted">EMAIL</span>
        <input
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          className="min-h-10 rounded-sm border border-line bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-sm border border-action bg-action px-4 py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "寄送中…" : "寄登入連結給我"}
      </button>

      {state.status === "error" ? (
        <p role="alert" className="text-xs text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
