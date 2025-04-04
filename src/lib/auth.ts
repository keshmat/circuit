import type { APIContext } from "astro";

export function isAuthenticated(context: APIContext): boolean {
  const accessToken = context.cookies.get("sb-access-token")?.value;
  return !!accessToken;
}

export function requireAuth(context: APIContext): Response | null {
  if (!isAuthenticated(context)) {
    return context.redirect("/admin/login");
  }
  return null;
}
