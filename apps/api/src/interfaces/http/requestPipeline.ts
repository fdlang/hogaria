import type { HttpRequest, HttpResponse } from "./authController.js";

type AuthResult = { actorId: number } | HttpResponse;

export async function authenticateBeforeBody<T extends HttpRequest & { actorId?: number }>(
  request: T,
  protectedRoute: boolean,
  authenticate: (request: HttpRequest) => Promise<AuthResult>,
  readBody: () => Promise<unknown>,
): Promise<HttpResponse | null> {
  if (protectedRoute) {
    const result = await authenticate(request);
    if ("status" in result) return result;
    request.actorId = result.actorId;
  }
  request.body = (await readBody()) ?? {};
  return null;
}
