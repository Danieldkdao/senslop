"use client";

import { useState } from "react";
import { providerRequest } from "../lib/requests";
import type { ConnectionFeedback, ConnectionProbe } from "../types";

export const useConnectionCheck = ({
  initialFeedback = null,
  onFeedback,
}: {
  initialFeedback?: ConnectionFeedback | null;
  onFeedback?: (id: string, feedback: ConnectionFeedback | null) => void;
} = {}) => {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [checking, setChecking] = useState(false);
  const checkConnection = async (id: string) => {
    const updateFeedback = (result: ConnectionFeedback | null) => {
      setFeedback(result);
      onFeedback?.(id, result);
    };
    setChecking(true);
    updateFeedback(null);
    try {
      const result = await providerRequest<ConnectionProbe>({
        action: "test",
        id,
      });
      updateFeedback({
        failed: !result.supported,
        message: `Saved securely. ${result.message}`,
      });
    } catch (failure) {
      updateFeedback({
        failed: true,
        message: `Saved securely. Connection check failed. ${(failure as Error).message} Check your internet connection, endpoint, and API key, then retry.`,
      });
    } finally {
      setChecking(false);
    }
  };
  return { feedback, checking, checkConnection };
};
