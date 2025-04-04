export function isAuthenticated(astro: any): boolean {
  const accessToken = astro.cookies.get("sb-access-token")?.value;
  return !!accessToken;
}

export function requireAuth(astro: any): Response | null {
  if (!isAuthenticated(astro)) {
    return astro.redirect("/admin/login");
  }
  return null;
}
