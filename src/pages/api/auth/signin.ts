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
      return new Response("Email is required", { status: 400 });
    }

    if (!otp) {
      // Send OTP
      console.log("Sending OTP to:", email);
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
        return new Response(error.message, { status: 500 });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } else {
      // Verify OTP
      console.log("Verifying OTP for:", email);
      const { data: authData, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });

      if (error) {
        console.error("OTP verification error:", error);
        return new Response(error.message, { status: 500 });
      }

      if (authData.session) {
        const { access_token, refresh_token } = authData.session;

        // Set cookies
        cookies.set("sb-access-token", access_token, {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60, // 30 days or 1 hour
        });

        cookies.set("sb-refresh-token", refresh_token, {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60,
        });

        // Return success response instead of redirect
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      console.error("No session created after verification");
      return new Response("No session created after verification", {
        status: 500,
      });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response("An unexpected error occurred", { status: 500 });
  }
};
