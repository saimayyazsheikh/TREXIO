"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, type User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { getFirebase } from "@/lib/firebase/client";
import { identifierToEmail } from "@/lib/auth-identifier";
import { suggestCode, workspaceCodeSchema, workspaceNameSchema } from "@/lib/domain/org";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email"),
  workspace: z.string().trim(),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

const CODE_KEY = "traxio.workspaceCode";
const readCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
};

function friendlyError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-email":
        return "That workspace code, username or password doesn't look right. Please try again.";
      case "auth/user-disabled":
        return "This account has been turned off. Please contact your admin.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a minute and try again.";
      case "auth/network-request-failed":
        return "Can't reach the server. Check your internet connection.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Google sign-in was cancelled. Press the button to try again.";
      case "auth/popup-blocked":
        return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
      case "auth/operation-not-allowed":
        return "Google sign-in isn't switched on yet. The site owner needs to enable it in Firebase.";
      case "auth/unauthorized-domain":
        return "This web address isn't allowed for Google sign-in yet. The site owner needs to add it in Firebase.";
    }
  }
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [stage, setStage] = useState<"signin" | "workspace">("signin");
  const newOwner = useRef<User | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { identifier: "", workspace: "", password: "" } });

  useEffect(() => setValue("workspace", readCode()), [setValue]);
  const isEmail = watch("identifier").includes("@");

  /** Turns a signed-in Firebase user into the app's session cookie, then opens the right home page. */
  async function openApp(user: User) {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await user.getIdToken(true) }),
    });
    const body = (await res.json().catch(() => ({}))) as { role?: string; error?: string };
    if (!res.ok) throw new Error(body.error ?? "Could not sign you in.");
    router.replace(body.role === "admin" ? "/admin" : "/me");
    router.refresh();
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const email = identifierToEmail(values.identifier, values.workspace);
      if (!email) {
        setFormError("Enter your workspace code (your admin can tell you what it is).");
        return;
      }
      const { auth } = getFirebase();
      const cred = await signInWithEmailAndPassword(auth, email, values.password);
      if (!values.identifier.includes("@")) {
        try {
          localStorage.setItem(CODE_KEY, values.workspace.trim().toLowerCase());
        } catch {
          /* remembering the code is a convenience only */
        }
      }
      await openApp(cred.user);
    } catch (error) {
      setFormError(friendlyError(error));
    }
  }

  async function continueWithGoogle() {
    setFormError(null);
    setGoogleBusy(true);
    try {
      const { auth } = getFirebase();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const { user } = await signInWithPopup(auth, provider);
      const claims = (await user.getIdTokenResult()).claims;
      if (typeof claims.orgId === "string" && claims.orgId) {
        await openApp(user); // someone coming back to their workspace
      } else {
        newOwner.current = user; // first time: they name their workspace next
        setStage("workspace");
      }
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setGoogleBusy(false);
    }
  }

  if (stage === "workspace" && newOwner.current) {
    return <NewWorkspaceForm user={newOwner.current} onDone={openApp} onBack={() => setStage("signin")} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button type="button" variant="secondary" size="lg" loading={googleBusy} onClick={continueWithGoogle} className="gap-3">
          <GoogleMark /> Continue with Google
        </Button>
        <p className="text-center text-xs text-muted">Business owners: sign in, or create your own Traxio workspace in a minute.</p>
      </div>

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted" role="separator">
        <span className="h-px flex-1 bg-border-solid" /> Team members <span className="h-px flex-1 bg-border-solid" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        {isEmail ? null : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace">
              Workspace code <span aria-hidden className="text-danger">*</span>
            </Label>
            <Input id="workspace" autoComplete="organization" autoCapitalize="none" spellCheck={false} placeholder="for example acme-traders" {...register("workspace")} />
            <p className="text-xs text-muted">Your admin gave you this. It is the same for everyone in your business.</p>
          </div>
        )}
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
    </div>
  );
}

/** The one step after a first Google sign-in: name the workspace (and optionally pick its code). */
function NewWorkspaceForm({ user, onDone, onBack }: { user: User; onDone: (user: User) => Promise<void>; onBack: () => void }) {
  const first = (user.displayName ?? "").split(" ")[0];
  const [name, setName] = useState(first ? `${first}'s business` : "");
  const [code, setCode] = useState("");
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = workspaceNameSchema.safeParse(name);
    if (!n.success) return setError(n.error.issues[0]?.message ?? "Give your workspace a name.");
    if (custom && code.trim()) {
      const c = workspaceCodeSchema.safeParse(code);
      if (!c.success) return setError(c.error.issues[0]?.message ?? "That code isn't valid.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await user.getIdToken(), name, ...(custom && code.trim() ? { code } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't create your workspace. Please try again.");
      await onDone(user);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="font-display text-xl font-bold">Set up your workspace</h2>
        <p className="mt-1 text-sm text-muted">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>. This is your own private space: only you and the people you add can see it.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ws-name">
          Workspace name <span aria-hidden className="text-danger">*</span>
        </Label>
        <Input id="ws-name" autoFocus autoComplete="organization" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="for example Acme Traders" />
        <p className="text-xs text-muted">Usually your company or group of businesses. You add each business inside it next.</p>
      </div>
      <div>
        <button type="button" aria-expanded={custom} onClick={() => setCustom((c) => !c)} className="flex items-center gap-1.5 text-sm font-medium text-brand-text">
          <ChevronDown className={`size-4 transition-transform ${custom ? "rotate-180" : ""}`} aria-hidden /> Choose my own workspace code
        </button>
        {custom ? (
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="ws-code">Workspace code</Label>
            <Input id="ws-code" autoCapitalize="none" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggestCode(name || "my team")} />
            <p className="text-xs text-muted">Your team types this to sign in, so keep it short. Letters, numbers and dashes. Leave it empty and we pick one from the name.</p>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" size="lg" loading={busy} className="flex-1">
          Create my workspace
        </Button>
      </div>
    </form>
  );
}
