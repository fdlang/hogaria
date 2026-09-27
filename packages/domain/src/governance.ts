export function requiresIndependentApproval(input: {
  activeAdministrators: number;
  independentApprovalRequired: boolean;
  actorId: number;
  originators: Array<number | null | undefined>;
}): boolean {
  const hasUnknownOriginator = input.originators.some(
    (originator) => typeof originator !== "number",
  );
  const required = input.activeAdministrators > 1 || input.independentApprovalRequired || hasUnknownOriginator;
  if (!required) return false;
  const knownOriginators = input.originators.filter(
    (originator): originator is number => typeof originator === "number",
  );
  return knownOriginators.length !== input.originators.length || knownOriginators.includes(input.actorId);
}
