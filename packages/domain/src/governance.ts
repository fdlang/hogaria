export function requiresIndependentApproval(input: {
  activeAdministrators: number;
  actorId: number;
  originators: Array<number | null | undefined>;
}): boolean {
  return input.activeAdministrators > 1 && input.originators.includes(input.actorId);
}
