export const proposalTokens = {
  colors: {
    ink: "#080f1a",
    ink2: "#0d1626",
    ink3: "#132033",
    teal: "#0eb5a8",
    teal2: "#2dd4c7",
    teal3: "#a8f0ea",
    smoke: "#8b8b9a",
    light: "#e8e8f0",
    white: "#f9f9fc",
    danger: "#e05c5c",
    warn: "#e8923a",
    success: "#4caf82",
  },
  fonts: {
    body: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    mono: "'DM Mono', ui-monospace, monospace",
  },
  radius: {
    sm: "12px",
    md: "20px",
  },
} as const;

export type ProposalTokens = typeof proposalTokens;
