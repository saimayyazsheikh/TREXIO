import type { Metadata } from "next";
import { Brand } from "@/components/shell/brand";
import { GlassCard } from "@/components/features/glass-card";
import { LoginForm } from "@/app/(auth)/login/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Brand />
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to see today&apos;s work.</p>
        </div>
        <GlassCard className="p-6 sm:p-8">
          <LoginForm />
        </GlassCard>
        <p className="mt-6 text-center text-xs text-muted">
          Traxio only measures activity inside this app: your tasks, journal entries and breaks. Nothing else on your computer
          is tracked.
        </p>
      </div>
    </main>
  );
}
