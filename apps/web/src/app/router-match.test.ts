import { describe, expect, it } from "vitest";
import { matchRoute, type Route } from "./Router";

const routes = [
  { path: "#/admin", element: null },
  { path: "#/admin/projects", element: null },
  { path: "#/admin/projects/", element: null },
] satisfies Route[];

describe("matchRoute", () => {
  it("matches declared detail routes but rejects unknown private paths", () => {
    expect(matchRoute(routes, "/admin/projects/12")?.path).toBe("#/admin/projects/");
    expect(matchRoute(routes, "/admin/projects/")?.path).toBe("#/admin/projects");
    expect(matchRoute(routes, "/admin/projects/not-an-id")).toBeNull();
    expect(matchRoute(routes, "/admin/unknown")).toBeNull();
  });
});
