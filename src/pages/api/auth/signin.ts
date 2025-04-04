export const prerender = false;

import type { APIRoute } from "astro";
import { supabase } from "../../../db/supabase";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const data = await request.json();
    console.log("Received data:", data);

    const email = data.email;
    const otp = data.otp;
    const rememberMe = data["remember-me"];

    if (!email) {
      console.error("Email is missing in request data");
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (!otp) {
      // Send OTP
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          data: {
            remember_me: rememberMe,
          },
        },
      });

      if (error) {
        console.error("OTP send error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } else {
      // Verify OTP
      const { data: authData, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });

      if (error) {
        console.error("OTP verification error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      if (authData.session) {
        const { access_token, refresh_token } = authData.session;
        console.log("Session data:", authData.session);
        console.log("Access token:", access_token);
        console.log("Refresh token:", refresh_token);

        // Set cookies
        cookies.set("sb-access-token", access_token, {
          path: "/",
          secure: true,
          httpOnly: false,
          sameSite: "lax",
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60,
        });

        cookies.set("sb-refresh-token", refresh_token, {
          path: "/",
          secure: true,
          httpOnly: false,
          sameSite: "lax",
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60,
        });

        // Log the cookies that were set
        console.log("Cookies after setting:", {
          accessToken: cookies.get("sb-access-token")?.value,
          refreshToken: cookies.get("sb-refresh-token")?.value,
        });

        // Redirect to registrations page
        return redirect("/admin/registrations");
      }

      console.error("No session created after verification");
      return new Response(
        JSON.stringify({ error: "No session created after verification" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
