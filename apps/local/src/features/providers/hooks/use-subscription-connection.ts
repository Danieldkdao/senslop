"use client";

import { useEffect, useRef, useState } from "react";
import type { SubscriptionProvider } from "@senslop/contracts";
import { toast } from "@/components/ui/toast";
import { subscriptionSignInSchema } from "../subscription-schemas";

const subscriptionRequest = async (body: object) => {
  const response = await fetch("/api/providers/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Account connection could not be updated. Retry.",
    );
  return data;
};

export const useSubscriptionConnection = (
  provider: SubscriptionProvider,
  onSaved: () => Promise<void>,
) => {
  const [flow, setFlow] = useState<{ id: string; url: string | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const popup = useRef<Window | null>(null);
  const saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  }, [onSaved]);
  useEffect(() => {
    if (!flow) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/providers/subscriptions?id=${encodeURIComponent(flow.id)}`,
          { signal: abort.signal, cache: "no-store" },
        );
        if (!response.ok)
          throw new Error(
            "Sign-in status is unavailable. Cancel and retry sign-in.",
          );
        const progress = subscriptionSignInSchema.parse(await response.json());
        if (abort.signal.aborted) return;
        setError(null);
        if (progress.status === "pending")
          timer = setTimeout(() => void poll(), 1000);
        else {
          pending.current = false;
          setBusy(false);
          setFlow(null);
          popup.current?.close();
          if (progress.status === "complete") {
            await saved.current();
            toast.success("Account connected.");
          } else if (progress.error) setError(progress.error);
        }
      } catch (failure) {
        if (abort.signal.aborted) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Sign-in status is unavailable. Retry.",
        );
        timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [flow]);
  const signIn = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    if (provider === "chatgpt-subscription") {
      popup.current = window.open("about:blank", "_blank");
      if (popup.current) popup.current.opener = null;
    }
    try {
      const result = subscriptionSignInSchema.parse(
        await subscriptionRequest({ action: "sign-in", provider }),
      );
      if (result.status !== "pending")
        throw new Error(result.error ?? "Sign-in could not start. Retry.");
      if (
        result.url &&
        new URL(result.url).origin !== "https://auth.openai.com"
      )
        throw new Error("Unexpected sign-in destination.");
      if (result.url && popup.current) popup.current.location.href = result.url;
      setFlow({ id: result.id, url: result.url });
    } catch (failure) {
      pending.current = false;
      setBusy(false);
      popup.current?.close();
      setError(
        failure instanceof Error
          ? failure.message
          : "Sign-in could not start. Retry.",
      );
    }
  };
  const cancel = async () => {
    if (!flow) return;
    try {
      await subscriptionRequest({ action: "cancel", id: flow.id });
      setError(null);
      setFlow(null);
      setBusy(false);
      pending.current = false;
      popup.current?.close();
    } catch {
      setError("Could not cancel sign-in. Retry.");
    }
  };
  const signOut = async (id: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await subscriptionRequest({ action: "sign-out", id });
      await saved.current();
      if (result?.warning) toast.error(result.warning);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Sign-out failed. Retry.",
      );
    } finally {
      setBusy(false);
      pending.current = false;
    }
  };
  return {
    signIn,
    signOut,
    cancel,
    busy,
    pending: !!flow,
    error,
    url: flow?.url,
  };
};
