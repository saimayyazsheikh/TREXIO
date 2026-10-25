import type { Metadata } from "next";
import { Activity, ListChecks, MessageCircle } from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { LoginForm } from "@/app/(auth)/login/login-form";

export const metadata: Metadata = { title: "Sign in" };

const POINTS = [
  { icon: ListChecks, title: "Daily and one-off tasks", text: "Assign work once, and every business gets today's list on time." },
  { icon: Activity, title: "See who is working", text: "Hourly journals, breaks and idle time, in one calm view." },
  { icon: MessageCircle, title: "Talk without leaving", text: "Reminders, questions and chat sit next to the task they are about." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-sidebar relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-[radial-gradient(closest-side,rgb(142_182_155/0.35),transparent)]" />
        <Brand />
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight">Every business on track, every day.</h2>
          <ul className="mt-10 flex flex-col gap-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sidebar-active)]">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="mt-0.5 text-sm text-sidebar-muted">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">Traxio only measures activity inside this app. Nothing else on your computer is tracked.</p>
      </aside>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Brand className="mb-8 lg:hidden" />
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to see today&apos;s work.</p>
          {reason === "idle" ? (
            <p role="status" className="mt-4 rounded-control bg-warning/12 px-3 py-2 text-sm text-warning">
              You were signed out after an hour with no activity. Sign in to carry on.
            </p>
          ) : null}
          <div className="mt-8">
            <LoginForm />
          </div>
          <p className="mt-8 text-xs text-muted lg:hidden">
            Traxio only measures activity inside this app: your tasks, journal entries and breaks. Nothing else on your computer is tracked.
          </p>
        </div>
      </section>
    </main>
  );
}
