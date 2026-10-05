export const localReturnPath = (value: string | null) => {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/dashboard";
  try {
    const url = new URL(value, "http://localhost");
    if (
      url.origin !== "http://localhost" ||
      ["/login", "/signup"].includes(url.pathname.replace(/\/$/, ""))
    )
      return "/dashboard";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/dashboard";
  }
};
