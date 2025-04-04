export const prerender = false; // Not needed in 'server' mode

import type { APIRoute } from "astro";
import { supabase } from "../../../db/supabase";

export const POST: APIRoute = async ({ cookies, redirect }) => {
  try {
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Sign out error:", error);
      return new Response("Failed to sign out", { status: 500 });
    }

    // Clear cookies
    cookies.delete("sb-access-token", {
      path: "/",
    });
    cookies.delete("sb-refresh-token", {
      path: "/",
    });

    return redirect("/admin/login");
  } catch (error) {
    console.error("Unexpected error during sign out:", error);
    return new Response("An unexpected error occurred", { status: 500 });
  }
};
