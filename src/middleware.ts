import { defineMiddleware } from "astro:middleware";
import { supabase } from "./db/supabase";

export const onRequest = defineMiddleware(
  async ({ request, cookies, redirect }, next) => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Skip auth check for login page and API routes
    if (pathname === "/admin/login" || pathname.startsWith("/api/")) {
      return next();
    }

    // Skip auth check for non-admin routes
    if (!pathname.startsWith("/admin/")) {
      return next();
    }

    const accessToken = cookies.get("sb-access-token");
    const refreshToken = cookies.get("sb-refresh-token");

    if (!accessToken || !refreshToken) {
      return redirect("/admin/login");
    }

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.setSession({
        access_token: accessToken.value,
        refresh_token: refreshToken.value,
      });

      if (error || !session) {
        // Clear invalid tokens
        cookies.delete("sb-access-token", { path: "/" });
        cookies.delete("sb-refresh-token", { path: "/" });
        return redirect("/admin/login");
      }

      // Refresh tokens if needed
      if (
        session.expires_at &&
        new Date(session.expires_at).getTime() < Date.now() + 60 * 1000
      ) {
        const {
          data: { session: newSession },
          error: refreshError,
        } = await supabase.auth.refreshSession();

        if (refreshError || !newSession) {
          cookies.delete("sb-access-token", { path: "/" });
          cookies.delete("sb-refresh-token", { path: "/" });
          return redirect("/admin/login");
        }

        // Update cookies with new tokens
        cookies.set("sb-access-token", newSession.access_token, {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
        });

        cookies.set("sb-refresh-token", newSession.refresh_token, {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
        });
      }
    } catch (error) {
      console.error("Auth error:", error);
      return redirect("/admin/login");
    }

    return next();
  }
);
