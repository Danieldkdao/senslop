import * as React from "react";

const DEFAULT_MOBILE_BREAKPOINT = 768;

export function useIsMobile(mobileBreakpointOverride?: number) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  const mobileBreakpoint =
    mobileBreakpointOverride ?? DEFAULT_MOBILE_BREAKPOINT;

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < mobileBreakpoint);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < mobileBreakpoint);
    return () => mql.removeEventListener("change", onChange);
  }, [mobileBreakpoint]);

  return !!isMobile;
}
