import { supabase } from "../db/supabase";
import * as tus from "tus-js-client";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

export function initRegistrationForm() {
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

  // Handle FIDE ID radio buttons
  const hasFideIdRadio = document.querySelectorAll(
    'input[name="has-fide-id"]'
  ) as NodeListOf<HTMLInputElement>;
  const fideIdSection = document.getElementById("fide-id-section");
  const birthdaySection = document.getElementById("birthday-section");
  const fideInput = document.getElementById("fide-id") as HTMLInputElement;
  const birthdayInput = document.getElementById("birthday") as HTMLInputElement;

  if (fideIdSection && birthdaySection && fideInput && birthdayInput) {
    const handleFideChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.value === "yes") {
        // Show FIDE ID, hide birthday
        fideIdSection.classList.remove("hidden");
        birthdaySection.classList.add("hidden");
        // Make FIDE ID required, birthday not required
        fideInput.required = true;
        birthdayInput.required = false;
        // Clear birthday value since it's not required
        birthdayInput.value = "";
      } else {
        // Show birthday, hide FIDE ID
        fideIdSection.classList.add("hidden");
        birthdaySection.classList.remove("hidden");
        // Make birthday required, FIDE ID not required
        birthdayInput.required = true;
        fideInput.required = false;
        // Clear FIDE ID value since it's not required
        fideInput.value = "";
      }
    };

    // Set initial state (No FIDE ID selected by default)
    const noRadio = document.querySelector(
      'input[name="has-fide-id"][value="no"]'
    ) as HTMLInputElement;
    if (noRadio) {
      // Initially show birthday, hide FIDE ID
      fideIdSection.classList.add("hidden");
      birthdaySection.classList.remove("hidden");
      // Initially make birthday required, FIDE ID not required
      fideInput.required = false;
      birthdayInput.required = true;
      // Ensure FIDE ID is cleared initially
      fideInput.value = "";
    }

    hasFideIdRadio.forEach((radio) => {
      radio.addEventListener("change", handleFideChange);
    });
  }

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
              birthday: formData.get("birthday"),
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
