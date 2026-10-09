require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

// Validate required environment variables
const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize Supabase Client using SERVICE ROLE KEY to bypass RLS policies
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

function generateReference() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomStr = "";
  for (let i = 0; i < 6; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BK${randomStr}`;
}

function authenticateAdmin(req, res, next) {
  const token = req.cookies.admin_token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized access. Authentication token missing." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    console.error("JWT Verification Error:", err.message);
    return res.status(401).json({ error: "Unauthorized access. Invalid or expired token." });
  }
}

// PUBLIC ROUTES

// GET /api/services
app.get("/api/services", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Supabase Error [GET /api/services]:", error);
      return res.status(500).json({ error: `Database error: ${error.message}` });
    }

    return res.json(data);
  } catch (err) {
    console.error("Server Error [GET /api/services]:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/bookings
app.post("/api/bookings", async (req, res) => {
  try {
    const { service_id, name, contact, email, booking_date, booking_time, guests, notes } = req.body;

    if (!service_id || !name || !contact || !email || !booking_date || !booking_time) {
      return res.status(400).json({ error: "Please fill in all required booking fields." });
    }

    const guestCount = parseInt(guests, 10);
    if (isNaN(guestCount) || guestCount < 1) {
      return res.status(400).json({ error: "Number of devices must be at least 1." });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (booking_date < todayStr) {
      return res.status(400).json({ error: "Booking date cannot be in the past." });
    }

    if (booking_time < "07:00" || booking_time > "17:00") {
      return res.status(400).json({ error: "Booking time must be between 07:00 and 17:00." });
    }

    let reference = generateReference();
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      const { data: existing } = await supabase
        .from("bookings")
        .select("id")
        .eq("reference", reference)
        .maybeSingle();

      if (!existing) {
        isUnique = true;
      } else {
        reference = generateReference();
        attempts++;
      }
    }

    // Explicitly insert row and return created record
    const { data, error } = await supabase
      .from("bookings")
      .insert([
        {
          reference: reference,
          service_id: parseInt(service_id, 10),
          name: name.trim(),
          contact: contact.trim(),
          email: email.trim(),
          booking_date: booking_date,
          booking_time: booking_time,
          guests: guestCount,
          notes: notes ? notes.trim() : null,
          status: "pending"
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Supabase Error [POST /api/bookings]:", error);
      return res.status(500).json({ error: `Failed to create booking: ${error.message}` });
    }

    console.log(`Successfully created booking in DB with ref: ${data.reference}`);

    return res.status(201).json({
      message: "Booking successfully created.",
      reference: data.reference
    });
  } catch (err) {
    console.error("Server Error [POST /api/bookings]:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/bookings/:reference
app.get("/api/bookings/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .select("*, services(name, price)")
      .eq("reference", reference)
      .maybeSingle();

    if (error || !data) {
      console.error("Lookup Error [GET /api/bookings/:reference]:", error || "Not found");
      return res.status(404).json({ error: "Booking reference not found." });
    }

    return res.json(data);
  } catch (err) {
    console.error("Server Error [GET /api/bookings/:reference]:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ADMIN PROTECTED ROUTES

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const { data: admin, error } = await supabase
      .from("admins")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (error || !admin) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({ message: "Login successful.", username: admin.username });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/admin/logout", authenticateAdmin, (req, res) => {
  res.clearCookie("admin_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return res.json({ message: "Successfully logged out." });
});

app.get("/api/admin/bookings", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, services(name, price)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase Error [GET /api/admin/bookings]:", error);
      return res.status(500).json({ error: `Database error: ${error.message}` });
    }

    return res.json(data);
  } catch (err) {
    console.error("Server Error [GET /api/admin/bookings]:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.patch("/api/admin/bookings/:id/confirm", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Update Error [PATCH confirm]:", error);
      return res.status(404).json({ error: "Booking record not found." });
    }

    return res.json({ message: "Booking confirmed successfully.", booking: data });
  } catch (err) {
    console.error("Server Error [PATCH confirm]:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.patch("/api/admin/bookings/:id/cancel", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      console.error("Update Error [PATCH cancel]:", error);
      return res.status(404).json({ error: "Booking record not found." });
    }

    return res.json({ message: "Booking cancelled successfully.", booking: data });
  } catch (err) {
    console.error("Server Error [PATCH cancel]:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.delete("/api/admin/bookings/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete Error [DELETE booking]:", error);
      return res.status(500).json({ error: "Failed to delete booking." });
    }

    return res.json({ message: "Booking deleted successfully." });
  } catch (err) {
    console.error("Server Error [DELETE booking]:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.use(express.static("public"));

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running locally at http://localhost:${PORT}`);
  });
}
