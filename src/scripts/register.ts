import { supabase } from "../db/supabase";
import * as tus from "tus-js-client";
import { marked } from "marked";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

// Configure marked to sanitize HTML
marked.setOptions({
  sanitize: true,
  breaks: true,
});

export async function initRegistrationForm() {
  // Fetch registration settings
  const { data: settings } = await supabase
    .from("registration_settings")
    .select(
      "is_registration_open, max_registrations, registration_deadline, registration_message"
    )
    .single();

  // Get registration count using the function
  const { data: count } = await supabase.rpc("get_registration_count");

  if (!settings) {
    console.error("Failed to fetch registration settings");
    return;
  }

  const now = new Date();
  const deadline = settings.registration_deadline
    ? new Date(settings.registration_deadline)
    : null;
  const isRegistrationClosed =
    !settings.is_registration_open || (deadline && now > deadline);
  const isRegistrationFull = (count || 0) >= settings.max_registrations;

  // Update the registration message if it exists
  const messageContainer = document.querySelector(".alert-info p");
  if (messageContainer && settings.registration_message) {
    // Convert markdown to HTML and set it as innerHTML
    messageContainer.innerHTML = marked(settings.registration_message);
  }

  // Update registration status
  const statusContainer = document.querySelector(".registration-status");
  if (statusContainer) {
    if (isRegistrationClosed) {
      statusContainer.innerHTML = `
        <div class="alert alert-error mb-8">
          <div class="flex-1">
            <p>
              Registration is currently closed.
              ${
                deadline && now > deadline
                  ? ` The registration deadline was ${deadline.toLocaleString()}.`
                  : ""
              }
            </p>
          </div>
        </div>
      `;
    } else if (isRegistrationFull) {
      statusContainer.innerHTML = `
        <div class="alert alert-error mb-8">
          <div class="flex-1">
            <p>
              Registration is full. The maximum number of registrations (${settings.max_registrations}) has been reached.
            </p>
          </div>
        </div>
      `;
    } else {
      // Show the form with deadline warning if applicable
      const formSection = statusContainer.querySelector("section");
      if (formSection) {
        const seatsOpen = settings.max_registrations - (count || 0);
        const warningDiv = document.createElement("div");
        warningDiv.className = "alert alert-warning mb-4";
        warningDiv.innerHTML = `
          <div class="flex-1">
            ${
              deadline
                ? `<p>Registration closes on ${deadline.toLocaleString()}</p>`
                : ""
            }
            <p class="mt-2">${seatsOpen} seat${
          seatsOpen !== 1 ? "s" : ""
        } remaining</p>
          </div>
        `;
        formSection
          .querySelector(".card-body")
          ?.insertBefore(warningDiv, formSection.querySelector("form"));
      }
    }
  }

  // Handle FIDE ID section visibility
  const fideIdSection = document.getElementById("fide-id-section");
  const fideIdInputs = document.querySelectorAll('input[name="has-fide-id"]');
  const fideIdInput = document.getElementById("fide-id") as HTMLInputElement;
  const birthdaySection = document.getElementById(
    "birthday-section"
  ) as HTMLDivElement;
  const birthdayInput = document.getElementById("birthday") as HTMLInputElement;

  if (
    fideIdSection &&
    fideIdInputs &&
    fideIdInput &&
    birthdaySection &&
    birthdayInput
  ) {
    // Initially set FIDE ID as not required since it's hidden
    fideIdInput.required = false;
    birthdayInput.required = true; // Birthday is required by default

    fideIdInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value === "yes") {
          fideIdSection.classList.remove("hidden");
          birthdaySection.classList.add("hidden");
          fideIdInput.required = true;
          birthdayInput.required = false;
          birthdayInput.value = ""; // Clear birthday when hiding
        } else {
          fideIdSection.classList.add("hidden");
          birthdaySection.classList.remove("hidden");
          fideIdInput.required = false;
          birthdayInput.required = true;
          fideIdInput.value = ""; // Clear FIDE ID when hiding
        }
      });
    });
  }

  const form = document.getElementById("registration-form") as HTMLFormElement;
  const submitButton = form?.querySelector(
    "button[type='submit']"
  ) as HTMLButtonElement;
  const fileInput = document.getElementById(
    "payment-receipt"
  ) as HTMLInputElement;
  const progressBar = document.createElement("progress");
  progressBar.className = "progress progress-primary w-full mt-2 hidden";
  progressBar.setAttribute("value", "0");
  progressBar.setAttribute("max", "100");
  fileInput.parentElement?.appendChild(progressBar);

  // Add file size validation on file selection
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file && file.size > MAX_FILE_SIZE) {
      // Show error message
      const errorMessage = document.createElement("div");
      errorMessage.className = "text-error text-sm mt-2";
      errorMessage.textContent = "File size must be less than 10MB";

      // Remove any existing error message
      const existingError =
        fileInput.parentElement?.querySelector(".text-error");
      if (existingError) {
        existingError.remove();
      }

      fileInput.parentElement?.appendChild(errorMessage);

      // Clear the file input
      fileInput.value = "";
    } else {
      // Remove any existing error message
      const existingError =
        fileInput.parentElement?.querySelector(".text-error");
      if (existingError) {
        existingError.remove();
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!submitButton) return;

    // Disable submit button and show loading state
    submitButton.disabled = true;
    submitButton.innerHTML = "Submitting...";

    const formData = new FormData(form);

    // Check honeypot
    if (formData.get("bot-field")) {
      console.log("Bot detected");
      return;
    }

    try {
      // Get the file from the form
      const receiptFile = formData.get("payment-receipt") as File;
      if (!receiptFile) throw new Error("No file selected");

      // Check file size
      if (receiptFile.size > MAX_FILE_SIZE) {
        throw new Error("File size must be less than 10MB");
      }

      // Show progress bar
      progressBar.classList.remove("hidden");

      // Create a unique filename
      const fileName = `${Date.now()}-${receiptFile.name}`;

      // Upload file using tus
      const upload = new tus.Upload(receiptFile, {
        endpoint: `${
          import.meta.env.PUBLIC_SUPABASE_URL
        }/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${import.meta.env.PUBLIC_SUPABASE_ANON_KEY}`,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: "receipts",
          objectName: fileName,
          contentType: receiptFile.type,
        },
        chunkSize: 6 * 1024 * 1024, // 6MB chunks
        onError: function (error) {
          console.error("Upload error:", error);
          throw error;
        },
        onProgress: function (bytesUploaded, bytesTotal) {
          const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
          progressBar.setAttribute("value", percentage);
        },
        onSuccess: async function () {
          // Create registration record
          const { error: insertError } = await supabase
            .from("registrations")
            .insert({
              first_name: formData.get("first-name"),
              last_name: formData.get("last-name"),
              email: formData.get("email"),
              phone: formData.get("phone"),
              fide_id: formData.get("fide-id"),
              birthday: formData.get("birthday") || null,
              payment_receipt_url: fileName,
              status: "pending",
            });

          if (insertError) throw insertError;

          // Redirect to success page
          window.location.href = "/register-success";
        },
      });

      // Start the upload
      upload.start();
    } catch (error) {
      console.error("Registration error:", error);

      // Show error notification
      const notification = document.createElement("div");
      notification.className = "toast toast-top toast-end";
      notification.innerHTML = `
        <div class="alert alert-error">
          <span>${
            error instanceof Error
              ? error.message
              : "There was an error submitting your registration. Please try again."
          }</span>
        </div>
      `;
      document.body.appendChild(notification);

      // Remove notification after 5 seconds
      setTimeout(() => {
        notification.remove();
      }, 5000);

      // Reset button state
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = "Submit Registration";
      }
    }
  });
}
