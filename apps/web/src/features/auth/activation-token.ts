type LocationParts = Pick<Location, "search" | "hash">;

export function activationTokenFromLocation(location: LocationParts): string {
  const routeAndQuery = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const [route, hashQuery = ""] = routeAndQuery.split("?", 2);
  if (route === "/activar-cuenta") {
    return new URLSearchParams(hashQuery).get("token") ?? "";
  }
  return new URLSearchParams(location.search).get("token") ?? "";
}
