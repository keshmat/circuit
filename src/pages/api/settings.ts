export const prerender = false; // Not needed in 'server' mode
import { supabase } from "../../db/supabase";
import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.json();

    const { error } = await supabase
      .from("registration_settings")
      .update(formData)
      .eq("id", formData.id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Error updating settings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to update settings" }),
      { status: 500 }
    );
  }
};
