document.addEventListener("DOMContentLoaded", () => {
  const bookingForm = document.getElementById("booking-form");
  const serviceSelect = document.getElementById("service_id");
  const dateInput = document.getElementById("booking_date");
  const timeInput = document.getElementById("booking_time");
  const timeSlotsContainer = document.getElementById("time-slots-container");
  const errorBanner = document.getElementById("error-banner");
  const submitBtn = document.getElementById("submit-btn");

  // Set minimum booking date to today
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
  }

  // 1. Initialize time slot buttons (07:00 AM to 05:00 PM in 30-min steps)
  if (timeSlotsContainer) {
    renderTimeSlots();
  }

  // 2. Fetch active services if select dropdown exists
  if (serviceSelect) {
    loadServices();
  }

  // 3. Handle Booking Form Submission
  if (bookingForm) {
    bookingForm.addEventListener("submit", handleBookingSubmit);
  }

  /**
   * Generates clickable time slot buttons
   */
  function renderTimeSlots() {
    timeSlotsContainer.innerHTML = "";
    const startHour = 7;
    const endHour = 17;

    for (let h = startHour; h <= endHour; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === endHour && m > 0) break; // Stop exactly at 17:00

        const time24 = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        
        // 12-hour AM/PM label format
        const period = h >= 12 ? "PM" : "AM";
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        const displayTime = `${displayHour}:${String(m).padStart(2, "0")} ${period}`;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "time-slot-btn";
        btn.textContent = displayTime;
        btn.dataset.time = time24;

        btn.addEventListener("click", () => {
          document.querySelectorAll(".time-slot-btn").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          if (timeInput) timeInput.value = time24;
          clearFieldError("booking_time");
        });

        timeSlotsContainer.appendChild(btn);
      }
    }
  }

  /**
   * Loads services from API and populates dropdown
   */
  async function loadServices() {
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedId = urlParams.get("serviceId");

    try {
      const response = await fetch("/api/services");
      const services = await response.json();

      if (!response.ok) {
        throw new Error(services.error || "Failed to load services from server.");
      }

      serviceSelect.innerHTML = '<option value="" disabled selected>-- Select a Service --</option>';
      services.forEach(s => {
        const option = document.createElement("option");
        option.value = s.id;
        option.textContent = `${s.name} - ₱${Number(s.price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
        
        if (preselectedId && s.id == preselectedId) {
          option.selected = true;
        }
        serviceSelect.appendChild(option);
      });
    } catch (err) {
      showBanner(err.message, "danger");
    }
  }

  /**
   * Form submission handler with complete error checks
   */
  async function handleBookingSubmit(e) {
    e.preventDefault();
    clearAllErrors();
    hideBanner();

    // Client-side validation
    let isValid = true;

    const serviceVal = serviceSelect ? serviceSelect.value : "";
    const dateVal = dateInput ? dateInput.value : "";
    const timeVal = timeInput ? timeInput.value : "";
    const guestsVal = parseInt(document.getElementById("guests")?.value, 10);
    const nameVal = document.getElementById("name")?.value.trim();
    const contactVal = document.getElementById("contact")?.value.trim();
    const emailVal = document.getElementById("email")?.value.trim();
    const notesVal = document.getElementById("notes")?.value.trim() || "";

    const todayStr = new Date().toISOString().split("T")[0];

    if (!serviceVal) {
      setFieldError("service_id", "Please select a service.");
      isValid = false;
    }

    if (!dateVal) {
      setFieldError("booking_date", "Please pick an appointment date.");
      isValid = false;
    } else if (dateVal < todayStr) {
      setFieldError("booking_date", "Date cannot be in the past.");
      isValid = false;
    }

    if (!timeVal) {
      setFieldError("booking_time", "Please click to select a time slot.");
      isValid = false;
    }

    if (isNaN(guestsVal) || guestsVal < 1) {
      setFieldError("guests", "Must be at least 1 device/item.");
      isValid = false;
    }

    if (!nameVal) {
      setFieldError("name", "Full name is required.");
      isValid = false;
    }

    if (!contactVal) {
      setFieldError("contact", "Contact number is required.");
      isValid = false;
    }

    if (!emailVal) {
      setFieldError("email", "Email address is required.");
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(emailVal)) {
      setFieldError("email", "Please enter a valid email address.");
      isValid = false;
    }

    if (!isValid) return;

    // Set loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Processing Booking...";
    }

    const payload = {
      service_id: parseInt(serviceVal, 10),
      booking_date: dateVal,
      booking_time: timeVal,
      guests: guestsVal,
      name: nameVal,
      contact: contactVal,
      email: emailVal,
      notes: notesVal
    };

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      // Guard against non-200 responses or missing references
      if (!response.ok || !data || !data.reference) {
        throw new Error(data?.error || "Booking failed. The server did not return a reference code.");
      }

      // Redirect to confirmation page on success
      window.location.href = `/confirmation.html?ref=${encodeURIComponent(data.reference)}`;

    } catch (err) {
      showBanner(err.message, "danger");

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm & Submit Booking";
      }
    }
  }

  // Helpers
  function setFieldError(id, msg) {
    const errEl = document.getElementById(`err-${id}`);
    if (errEl) errEl.textContent = msg;
  }

  function clearFieldError(id) {
    const errEl = document.getElementById(`err-${id}`);
    if (errEl) errEl.textContent = "";
  }

  function clearAllErrors() {
    document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
  }

  function showBanner(msg, type) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    errorBanner.className = `banner banner-${type}`;
    errorBanner.style.display = "block";
  }

  function hideBanner() {
    if (errorBanner) {
      errorBanner.style.display = "none";
      errorBanner.textContent = "";
    }
  }
});
