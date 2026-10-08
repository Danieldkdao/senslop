"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Send } from "lucide-react";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import { authClient } from "@/lib/auth/auth-client";
import { localReturnPath } from "@/lib/auth/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  authFormSchema,
  signUpFormSchema,
  type AuthFormSchema,
} from "@/lib/auth/schemas";
import { Card, CardContent } from "@/components/ui/card";
import { Buddy } from "@/components/buddy";
import { VerifyAccount } from "@/components/auth/verify-account";
import { toast } from "@/components/ui/toast";
import { Separator } from "@/components/ui/separator";
import {
  PasswordInput,
  PasswordInputStrengthChecker,
} from "@/components/ui/password-input";

export const AuthForm = ({ signup = false }: { signup?: boolean }) => {
  const router = useRouter();
  const params = useSearchParams();
  const [socialProvider, setSocialProvider] = useState<
    "google" | "github" | null
  >(null);
  const initialEmail =
    params.get("verify") === "1"
      ? authFormSchema.shape.email.safeParse(params.get("email"))
      : null;
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    initialEmail?.success ? initialEmail.data : null,
  );
  const form = useForm<AuthFormSchema>({
    resolver: zodResolver(signup ? signUpFormSchema : authFormSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const busy = socialProvider !== null || form.formState.isSubmitting;
  const next = localReturnPath(params.get("redirect"));

  const socialSignIn = async (provider: "google" | "github") => {
    setSocialProvider(provider);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: next,
      });
      if (result.error)
        toast.error(
          result.error.message || "Could not sign in. Please try again.",
        );
    } catch {
      toast.error("We couldn’t reach account services. Please try again.");
    } finally {
      setSocialProvider(null);
    }
  };

  const submit = async (values: AuthFormSchema) => {
    try {
      const { name, email, password } = values;
      const result = signup
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setVerificationEmail(email);
          form.setValue("password", "");
        } else {
          toast.error(
            result.error.message ||
              "Could not sign in. Check your details and try again.",
          );
        }
        return;
      }
      if (signup || result.data?.user.emailVerified === false) {
        setVerificationEmail(email);
        form.setValue("password", "");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      toast.error("We couldn’t reach account services. Please try again.");
    }
  };

  if (verificationEmail)
    return (
      <VerifyAccount
        email={verificationEmail}
        setEmail={setVerificationEmail}
        redirectTo={next}
      />
    );

  return (
    <Card className="w-full max-w-[30rem] rounded-2xl text-base shadow-none">
      <CardContent className="gap-0">
        <div className="mb-6 text-center">
          <Buddy className="mx-auto mb-3 size-16" />
          <h1 className="font-sans text-3xl font-semibold">
            {signup ? "Create your account" : "Welcome Back"}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            {signup
              ? "Make a little room for understanding."
              : "Your next aha moment is waiting."}
          </p>
        </div>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full bg-muted/40 text-base font-normal"
            disabled={busy}
            onClick={() => socialSignIn("github")}
            aria-label="Continue with GitHub"
            aria-busy={socialProvider === "github"}
          >
            <LoadingSwap
              isLoading={socialProvider === "github"}
              className="flex items-center justify-center gap-2"
            >
              <FaGithub aria-hidden="true" className="size-5" />
              Continue with GitHub
            </LoadingSwap>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full bg-muted/40 text-base font-normal"
            disabled={busy}
            onClick={() => socialSignIn("google")}
            aria-label="Continue with Google"
            aria-busy={socialProvider === "google"}
          >
            <LoadingSwap
              isLoading={socialProvider === "google"}
              className="flex items-center justify-center gap-2"
            >
              {/* Google requires its official multicolor identity. */}
              <FcGoogle aria-hidden="true" className="size-5" />
              Continue with Google
            </LoadingSwap>
          </Button>
        </div>
        <div className="flex items-center gap-2 py-5">
          <Separator className="h-px flex-1" />
          <span className="shrink-0 text-base text-muted-foreground">
            Or continue with
          </span>
          <Separator className="h-px flex-1" />
        </div>
        <form
          noValidate
          onSubmit={form.handleSubmit(submit)}
          className="space-y-5"
        >
          {signup && (
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-2">
                  <FieldLabel htmlFor="name" className="text-base">
                    Your name
                  </FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    className="h-10 bg-muted/40 text-base md:text-base dark:bg-muted/40"
                    autoComplete="name"
                    disabled={busy}
                    aria-required="true"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "name-error" : undefined
                    }
                  />
                  <FieldError
                    id="name-error"
                    errors={[fieldState.error]}
                    className="text-base"
                  />
                </Field>
              )}
            />
          )}
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-2">
                <FieldLabel htmlFor="email" className="text-base">
                  Email
                </FieldLabel>
                <Input
                  {...field}
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  className="h-10 bg-muted/40 text-base md:text-base dark:bg-muted/40"
                  autoComplete="email"
                  disabled={busy}
                  aria-required="true"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "email-error" : undefined
                  }
                />
                <FieldError
                  id="email-error"
                  errors={[fieldState.error]}
                  className="text-base"
                />
              </Field>
            )}
          />
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-2">
                <FieldLabel htmlFor="password" className="text-base">
                  Password
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id="password"
                  placeholder="••••••••"
                  className="h-10 bg-muted/40 text-base md:text-base dark:bg-muted/40"
                  autoComplete={signup ? "new-password" : "current-password"}
                  disabled={busy}
                  aria-required="true"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "password-error" : undefined
                  }
                >
                  <PasswordInputStrengthChecker />
                </PasswordInput>
                <FieldError
                  id="password-error"
                  errors={[fieldState.error]}
                  className="text-base"
                />
              </Field>
            )}
          />
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full text-base"
            aria-label="Continue"
            aria-busy={form.formState.isSubmitting}
          >
            <LoadingSwap
              isLoading={form.formState.isSubmitting}
              className="flex items-center justify-center gap-2"
            >
              <Send aria-hidden="true" />
              Continue
            </LoadingSwap>
          </Button>
        </form>
        <p className="mt-5 text-center text-base text-muted-foreground">
          {signup ? "Already have an account?" : "Don't have an account?"}{" "}
          <Link
            className="font-medium hover:text-foreground hover:underline hover:underline-offset-4"
            href={`${signup ? "/login" : "/signup"}?redirect=${encodeURIComponent(next)}`}
          >
            {signup ? "Sign in here" : "Sign up here"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};
