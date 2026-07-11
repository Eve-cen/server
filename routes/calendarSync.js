const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const googleCalendar = require("../utils/googleCalendar");
const outlookCalendar = require("../utils/outlookCalendar");
const router = express.Router();

// GET /calendar/google/connect — returns the Google consent screen URL.
// The frontend either redirects the browser there directly (Settings page,
// window.location.href) or opens it in a popup (Create Space wizard, so the
// wizard's in-progress state isn't lost by navigating away) — pass
// ?popup=1 to get popup-mode callback behavior.
router.get("/google/connect", auth, async (req, res) => {
  try {
    // Short-lived signed state so the unauthenticated callback below can
    // trust which VenCome user is connecting.
    const state = jwt.sign(
      { userId: req.user.id, purpose: "calendar-connect", popup: req.query.popup === "1" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );
    const url = googleCalendar.getAuthUrl(state);
    res.json({ url });
  } catch (err) {
    console.error("Calendar connect error:", err.message);
    res.status(500).json({ error: "Couldn't start Google Calendar connection" });
  }
});

// GET /calendar/google/callback — Google redirects the browser here after
// consent. No auth header available (plain navigation), so identity comes
// from the signed state param instead. In popup mode, responds with a tiny
// HTML page that posts a message back to the opener and closes itself,
// instead of redirecting (which would navigate the wizard tab away).
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || "https://vencome.com";

  let decoded = null;
  if (state) {
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (_) {
      decoded = null;
    }
  }
  const isPopup = Boolean(decoded?.popup);

  const respond = (success) => {
    if (isPopup) {
      res.set("Content-Type", "text/html").send(`<!DOCTYPE html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: "vencome-calendar", provider: "google", success: ${success} }, ${JSON.stringify(clientUrl)});
        }
        window.close();
      </script></body></html>`);
    } else {
      res.redirect(`${clientUrl}/settings?calendar=${success ? "connected" : "error"}`);
    }
  };

  if (error || !code || !decoded || decoded.purpose !== "calendar-connect") {
    return respond(false);
  }

  try {
    const tokens = await googleCalendar.exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google only issues a refresh_token on first-ever consent (or when
      // prompt=consent forces it, which we do) -- if it's still missing the
      // account was probably already connected once before without a full
      // disconnect+reconnect. Ask them to try again.
      return respond(false);
    }

    const email = await googleCalendar.getUserEmail(tokens.access_token);

    await User.findByIdAndUpdate(decoded.userId, {
      googleCalendar: {
        connected: true,
        refreshToken: tokens.refresh_token,
        email,
        connectedAt: new Date(),
        lastSyncedAt: null,
        lastSyncError: null,
      },
    });

    respond(true);
  } catch (err) {
    console.error("Calendar callback error:", err.message);
    respond(false);
  }
});

router.get("/google/status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("googleCalendar");
    res.json(user?.googleCalendar || { connected: false });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/google/disconnect", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      googleCalendar: { connected: false, refreshToken: null, email: null },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Outlook / Microsoft Graph — same pattern as Google above ─────────────────

router.get("/outlook/connect", auth, async (req, res) => {
  try {
    const state = jwt.sign(
      { userId: req.user.id, purpose: "calendar-connect", popup: req.query.popup === "1" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );
    const url = outlookCalendar.getAuthUrl(state);
    res.json({ url });
  } catch (err) {
    console.error("Outlook connect error:", err.message);
    res.status(500).json({ error: "Couldn't start Outlook connection" });
  }
});

router.get("/outlook/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || "https://vencome.com";

  let decoded = null;
  if (state) {
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (_) {
      decoded = null;
    }
  }
  const isPopup = Boolean(decoded?.popup);

  const respond = (success) => {
    if (isPopup) {
      res.set("Content-Type", "text/html").send(`<!DOCTYPE html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: "vencome-calendar", provider: "outlook", success: ${success} }, ${JSON.stringify(clientUrl)});
        }
        window.close();
      </script></body></html>`);
    } else {
      res.redirect(`${clientUrl}/settings?calendar=${success ? "connected" : "error"}`);
    }
  };

  if (error || !code || !decoded || decoded.purpose !== "calendar-connect") {
    return respond(false);
  }

  try {
    const tokens = await outlookCalendar.exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return respond(false);
    }

    const email = await outlookCalendar.getUserEmail(tokens.access_token);

    await User.findByIdAndUpdate(decoded.userId, {
      outlookCalendar: {
        connected: true,
        refreshToken: tokens.refresh_token,
        email,
        connectedAt: new Date(),
        lastSyncedAt: null,
        lastSyncError: null,
      },
    });

    respond(true);
  } catch (err) {
    console.error("Outlook callback error:", err.message);
    respond(false);
  }
});

router.get("/outlook/status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("outlookCalendar");
    res.json(user?.outlookCalendar || { connected: false });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/outlook/disconnect", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      outlookCalendar: { connected: false, refreshToken: null, email: null },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
