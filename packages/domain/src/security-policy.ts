export const RATE_LIMIT_POLICY = {
  validFrom: "2026-09-26",
  validUntil: null,
  retentionMs: 24 * 60 * 60 * 1000,
  externalReview: "security",
} as const;

export const ABUSE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60 * 1000 },
  contactRequest: { limit: 3, windowMs: 60 * 60 * 1000 },
  estimatePdf: { limit: 60, windowMs: 60 * 1000 },
  estimateSignature: { limit: 5, windowMs: 60 * 1000 },
  changeDecision: { limit: 5, windowMs: 60 * 1000 },
} as const;
