"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { Eye, EyeOff } from "lucide-react";
import { getFirebase } from "@/lib/firebase/client";
import { identifierToEmail } from "@/lib/auth-identifier";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

function friendlyError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-email":
        return "That username or password doesn't look right. Please try again.";
      case "auth/user-disabled":
        return "This account has been turned off. Please contact your admin.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a minute and try again.";
      case "auth/network-request-failed":
        return "Can't reach the server. Check your internet connection.";
    }
  }
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const { auth } = getFirebase();
      const cred = await signInWithEmailAndPassword(auth, identifierToEmail(values.identifier), values.password);
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await cred.user.getIdToken(true) }),
      });
      const body = (await res.json().catch(() => ({}))) as { role?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not sign you in.");
      router.replace(body.role === "admin" ? "/admin" : "/me");
      router.refresh();
    } catch (error) {
      setFormError(friendlyError(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="identifier">
          Username or email <span aria-hidden className="text-danger">*</span>
        </Label>
        <Input
          id="identifier"
          autoComplete="username"
          autoCapitalize="none"
          required
          aria-invalid={!!errors.identifier}
          aria-describedby={errors.identifier ? "identifier-error" : undefined}
          {...register("identifier")}
        />
        {errors.identifier ? (
          <p id="identifier-error" className="text-sm text-danger">
            {errors.identifier.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">
          Password <span aria-hidden className="text-danger">*</span>
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-12"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <Tooltip label={showPassword ? "Hide password" : "Show password"}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          </Tooltip>
        </div>
        {errors.password ? (
          <p id="password-error" className="text-sm text-danger">
            {errors.password.message}
          </p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={isSubmitting}>
        Sign in
      </Button>
      <p className="text-center text-sm text-muted">Forgot your password? Ask your admin to reset it.</p>
    </form>
  );
}
