export const prerender = false;

import type { APIRoute } from "astro";
import { supabase } from "../../../db/supabase";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const data = await request.json();

    const email = data.email;
    const otp = data.otp;
    const rememberMe = data["remember-me"];

    if (!email) {
      console.error("Email is missing in request data");
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
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
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
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
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
      }

      if (authData.session) {
        const { access_token, refresh_token } = authData.session;

        // Set cookies
        cookies.set("sb-access-token", access_token, {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "strict",
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60,
        });

        cookies.set("sb-refresh-token", refresh_token, {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "strict",
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60,
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
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
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
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
};
