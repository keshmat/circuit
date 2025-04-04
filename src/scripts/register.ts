import { supabase } from "../db/supabase";

export function initRegistrationForm() {
  const form = document.getElementById("registration-form") as HTMLFormElement;
  if (!form) return;

  // Handle FIDE ID radio button changes
  const fideRadio = document.querySelector('input[name="has-fide-id"]');
  const fideSection = document.getElementById("fide-id-section");
  const birthdaySection = document.getElementById("birthday-section");
  const fideInput = document.getElementById("fide-id") as HTMLInputElement;
  const birthdayInput = document.getElementById("birthday") as HTMLInputElement;

  if (
    fideRadio &&
    fideSection &&
    birthdaySection &&
    fideInput &&
    birthdayInput
  ) {
    const handleFideChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.value === "yes") {
        // Show FIDE ID, hide birthday
        fideSection.classList.remove("hidden");
        birthdaySection.classList.add("hidden");
        // Make FIDE ID required, birthday not required
        fideInput.required = true;
        birthdayInput.required = false;
        // Clear birthday value since it's not required
        birthdayInput.value = "";
      } else {
        // Show birthday, hide FIDE ID
        fideSection.classList.add("hidden");
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
      fideSection.classList.add("hidden");
      birthdaySection.classList.remove("hidden");
      // Initially make birthday required, FIDE ID not required
      fideInput.required = false;
      birthdayInput.required = true;
      // Ensure FIDE ID is cleared initially
      fideInput.value = "";
    }

    document.querySelectorAll('input[name="has-fide-id"]').forEach((radio) => {
      radio.addEventListener("change", handleFideChange);
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);

    // Show loading state
    const submitButton = form.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = "Submitting...";
    }

    try {
      // Upload payment receipt to Supabase Storage
      const receiptFile = formData.get("payment-receipt") as File;
      const { data: receiptData, error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(`${Date.now()}-${receiptFile.name}`, receiptFile);

      if (uploadError) throw uploadError;

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
          payment_receipt_url: receiptData?.path,
          status: "pending",
        });

      if (insertError) throw insertError;

      // Redirect to success page
      window.location.href = "/register-success";
    } catch (error) {
      console.error("Registration error:", error);

      // Show error notification
      const notification = document.createElement("div");
      notification.className = "toast toast-top toast-end";
      notification.innerHTML = `
        <div class="alert alert-error">
          <span>There was an error submitting your registration. Please try again.</span>
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
