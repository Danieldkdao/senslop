export const staticReviewLimitation =
  "Static review only: code, tests, builds, browser behavior, live provider integrations, and packaged applications were not executed or verified at runtime.";

export const consolidateReviewLimitations = (limitations: string[]) => {
  const output: string[] = [];
  const seen = new Set<string>();
  const add = (text: string) => {
    const key = text
      .toLowerCase()
      .replace(/[`'"‘’]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(text.trim());
  };
  for (const limitation of limitations) {
    // Specific failures must retain their cause instead of becoming generic scope notices.
    if (
      /\b(failed|crashed|timed out|because|due to|truncated|excluded|retracted|incomplete|no direct [^.]*tests (?:were )?found)\b/i.test(
        limitation,
      )
    ) {
      add(limitation);
      continue;
    }
    const sentences = limitation.trim().split(/(?<=[.!?])\s+(?=[A-Z])/);
    for (const sentence of sentences) {
      if (
        /^(?:Captured diagnostics were read|Read all captured diagnostics|Relevant declarations, callers and tests were inspected|Relevant callers and tests were inspected|Caller and test verification (?:therefore )?relied)/i.test(
          sentence,
        )
      )
        continue;
      if (
        /\b(?:all|every)\b.*\b(?:zero|0) captured diagnostics\b/i.test(sentence)
      )
        continue;
      if (
        /\bcontext[- ](?:agent|model)\b/i.test(sentence) &&
        /returned no|no substantive|no additional/i.test(sentence)
      ) {
        add(
          "The Context agent returned no additional evidence; verification relied on direct repository source tools.",
        );
      } else if (
        /text analysis only; no compiler diagnostics|non.javascript\/typescript files receive text.only review/i.test(
          sentence,
        )
      ) {
        add(
          "Non-JavaScript/TypeScript files receive text-only review, without compiler diagnostics.",
        );
      } else if (
        /declaration|external|unresolved.*modules|aliases|JSX|Node types/i.test(
          sentence,
        ) &&
        /unresolved|unavailable|missing|not captured|outside.*snapshot/i.test(
          sentence,
        )
      ) {
        add(
          "Compiler diagnostics are limited by missing external declarations and generated outputs; they do not establish a full-project build failure.",
        );
      } else if (
        /static (?:and read.only|review)|review was static|no (?:code|tests|tests, builds)|assessed from captured source only|review used frozen source|verification was limited to captured/i.test(
          sentence,
        ) ||
        (/tests?|builds?|browser|runtime|OAuth|credential|native|authorization|packag|integration|SDK/i.test(
          sentence,
        ) &&
          /(?:not|could not|couldn.t).*(?:executed|verified)/i.test(sentence))
      ) {
        add(staticReviewLimitation);
      } else {
        add(sentence);
      }
    }
  }
  return output;
};
