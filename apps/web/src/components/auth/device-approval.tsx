"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  deviceCodeFormSchema,
  type DeviceCodeFormSchema,
} from "@/lib/auth/schemas";
import { Card, CardContent } from "@/components/ui/card";
import { Buddy } from "@/components/buddy";
import { toast } from "@/components/ui/toast";
import { CLI_CLIENT_ID } from "@senslop/contracts";

export const DeviceApproval = () => {
  const router = useRouter();
  const form = useForm<DeviceCodeFormSchema>({
    resolver: zodResolver(deviceCodeFormSchema),
    defaultValues: { code: "" },
  });
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const busy = form.formState.isSubmitting || deciding;
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  // Browser components use Better Auth's client hook; the shared helper is server-only.
  const { data: session, isPending } = authClient.useSession();

  const verify = async ({ code }: DeviceCodeFormSchema) => {
    setMessage("");
    setVerifiedCode(null);
    if (!session) {
      router.push(`/login?redirect=${encodeURIComponent("/device")}`);
      return;
    }
    try {
      const result = await authClient.device({ query: { user_code: code } });
      if (result.error && result.error.status >= 500) {
        toast.error("Couldn’t verify the code. Please try again.");
      } else if (result.error || result.data?.client_id !== CLI_CLIENT_ID) {
        form.setError("code", {
          message:
            "This code is invalid, expired, or belongs to another client. Request a new code from the CLI.",
        });
      } else setVerifiedCode(code);
    } catch {
      toast.error("Couldn’t verify the code. Please try again.");
    }
  };

  const decide = async (approve: boolean) => {
    if (!verifiedCode || busy) return;
    setDeciding(true);
    setMessage("");
    try {
      const result = approve
        ? await authClient.device.approve({ userCode: verifiedCode })
        : await authClient.device.deny({ userCode: verifiedCode });
      if (result.error)
        toast.error(
          result.error.error_description ||
            "Could not finish authorization. Please retry.",
        );
      else {
        setDone(true);
        setMessage(
          approve
            ? "Computer approved. Return to your CLI and run connect."
            : "Connection denied. No CLI credential was granted.",
        );
      }
    } catch {
      toast.error("Account service unavailable. Please retry.");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <Buddy className="mx-auto size-24" />
      <h1 className="mb-3 text-center text-4xl">Is this your computer?</h1>
      <p className="mb-7 text-center text-muted-foreground">
        Connect the Senslop CLI to your account.
      </p>
      <Card>
        <CardContent>
          {done ? (
            <p role="status">{message}</p>
          ) : (
            <>
              <form
                noValidate
                onSubmit={form.handleSubmit(verify)}
                className="space-y-4"
              >
                <Controller
                  name="code"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="gap-2">
                      <FieldLabel htmlFor="user-code" className="text-base">
                        Code shown in your terminal
                      </FieldLabel>
                      <Input
                        {...field}
                        id="user-code"
                        onChange={(event) => {
                          field.onChange(event);
                          setVerifiedCode(null);
                          setMessage("");
                        }}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="h-14 text-center font-mono text-2xl md:text-2xl uppercase"
                        disabled={busy || isPending}
                        aria-required="true"
                        aria-invalid={fieldState.invalid}
                        aria-describedby={
                          fieldState.invalid ? "user-code-error" : undefined
                        }
                      />
                      <FieldError
                        id="user-code-error"
                        errors={[fieldState.error]}
                        className="text-base"
                      />
                    </Field>
                  )}
                />
                {!verifiedCode && (
                  <Button
                    type="submit"
                    className="w-full text-base"
                    disabled={busy || isPending}
                  >
                    Check code
                  </Button>
                )}
              </form>
              {verifiedCode && (
                <div className="mt-5 space-y-4">
                  <p className="text-base">
                    This authorizes <strong>Senslop CLI</strong> to access your
                    account. Confirm the code above matches the one on a
                    computer in your possession. Do not approve an unexpected
                    request or a code someone sent you.
                  </p>
                  <div className="flex gap-3">
                    <Button disabled={busy} onClick={() => decide(true)}>
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => decide(false)}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
};
