// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface RegistrationData {
  email: string;
  name: string;
  // Add any other registration fields you need
}

interface EmailError {
  status?: number;
  message: string;
}

const FORWARDEMAIL_API_KEY = Deno.env.get("FORWARDEMAIL_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL");
const BCC_EMAIL = Deno.env.get("BCC_EMAIL");

async function sendEmail(to: string, name: string) {
  const response = await fetch("https://api.forwardemail.net/v1/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(FORWARDEMAIL_API_KEY + ":")}`,
    },
    body: JSON.stringify({
      from: `Keshmat Chess Center <${FROM_EMAIL}>`,
      to: to,
      bcc: BCC_EMAIL,
      subject: "Thanks for registering!",
      html: `
        <h1>Welcome ${name}!</h1>
        <p>Thank you for registering with us. See you at the tournament!</p>
        <p>Your registration details:</p>
        <ul>
          <li>Name: ${name}</li>
          <li>Email: ${to}</li>
        </ul>
        <p>If you have any questions, feel free to reach out to us at <a href="mailto:info@keshmat.org">info@keshmat.org</a>.</p>
      `,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to send email: ${JSON.stringify(error)}`);
  }

  return await response.json();
}

Deno.serve(async (req: Request) => {
  try {
    // Verify request method
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse registration data
    const data = (await req.json()) as RegistrationData;

    // Validate required fields
    if (!data.email || !data.name) {
      return new Response(
        JSON.stringify({ error: "Email and name are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send confirmation email
    const emailResult = await sendEmail(data.email, data.name);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Registration confirmation email sent successfully",
        data: emailResult,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing registration:", error);

    const emailError = error as EmailError;
    return new Response(
      JSON.stringify({
        success: false,
        error: emailError.message || "Internal server error",
      }),
      {
        status: emailError.status || 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-registration-email' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
