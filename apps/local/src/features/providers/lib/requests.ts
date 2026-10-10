export const providerRequest = async <T>(body?: object): Promise<T> => {
  const response = await fetch(
    "/api/providers",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      (data as { message?: string }).message ??
        "Local provider settings are unavailable. Retry.",
    );
  return data as T;
};
