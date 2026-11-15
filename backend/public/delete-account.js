(function () {
  const form = document.getElementById("verifyForm");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const error = document.getElementById("error");
  const confirmation = document.getElementById("confirmation");
  const continueButton = document.getElementById("continueButton");
  const confirmButton = document.getElementById("confirmButton");
  const success = document.getElementById("success");

  async function send(confirm) {
    const response = await fetch("/api/v1/auth/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim(), password: password.value, confirm: confirm })
    });
    const result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.message || "Unable to process your request.");
    return result;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    error.textContent = "";
    continueButton.disabled = true;
    continueButton.textContent = "Verifying…";
    try {
      await send(false);
      email.readOnly = true;
      password.readOnly = true;
      confirmation.classList.remove("hidden");
      continueButton.classList.add("hidden");
    } catch (err) {
      error.textContent = err.message;
    } finally {
      continueButton.disabled = false;
      continueButton.textContent = "Verify my account";
    }
  });

  confirmButton.addEventListener("click", async function () {
    if (!window.confirm("⚠️ FINAL WARNING\n\nDeactivate this Pinpoint account now? You will not be able to sign in again.")) return;
    confirmButton.disabled = true;
    confirmButton.textContent = "Deactivating…";
    error.textContent = "";
    try {
      const result = await send(true);
      form.classList.add("hidden");
      confirmation.classList.add("hidden");
      success.textContent = result.message || "Your account has been deactivated.";
      success.classList.remove("hidden");
    } catch (err) {
      error.textContent = err.message;
      confirmButton.disabled = false;
      confirmButton.textContent = "Yes, deactivate my account";
    }
  });
})();