// Thin wrapper around Twilio's REST API (plain HTTPS call via axios, no SDK
// dependency needed) for sending a single SMS -- currently used only for the
// phone-number-change OTP flow (routes/settings.js).
//
// Requires TWILIO_ACCOUNT_SID and TWILIO_PHONE_NUMBER, plus either
// TWILIO_AUTH_TOKEN (the account-level auth token) or the pair
// TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (a scoped API key, Twilio's
// recommended alternative -- the Basic Auth username is the API key SID in
// that case, not the account SID, but the account SID is still required in
// the request URL either way). Until these are set, this throws a clear
// "not configured" error instead of silently failing, so the calling route
// can surface a clean message rather than a bare 500.
//
// Optional TWILIO_SENDER_ID (e.g. "VenCome") makes the SMS show that name
// as the sender instead of the raw phone number -- this is Twilio's
// Alphanumeric Sender ID feature and must be registered in the Twilio
// Console first (Messaging -> Senders) before it'll actually work; sending
// from an unregistered alphanumeric ID gets silently rejected by carriers.
// One-way only -- a recipient can never reply to it, which is fine here
// since this is OTP/notification sending, not two-way conversation. Falls
// back to TWILIO_PHONE_NUMBER (a real number, so replies-not-needed isn't
// a concern) until TWILIO_SENDER_ID is set.
const axios = require("axios");

const sendSMS = async ({ to, body }) => {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    TWILIO_PHONE_NUMBER,
    TWILIO_SENDER_ID,
  } = process.env;

  const authUsername = TWILIO_API_KEY_SID || TWILIO_ACCOUNT_SID;
  const authPassword = TWILIO_API_KEY_SID ? TWILIO_API_KEY_SECRET : TWILIO_AUTH_TOKEN;

  if (!TWILIO_ACCOUNT_SID || !authUsername || !authPassword || !TWILIO_PHONE_NUMBER) {
    const err = new Error("SMS is not configured yet");
    err.code = "SMS_NOT_CONFIGURED";
    throw err;
  }

  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({ To: to, From: TWILIO_SENDER_ID || TWILIO_PHONE_NUMBER, Body: body }),
      { auth: { username: authUsername, password: authPassword } }
    );
  } catch (err) {
    console.error("Error sending SMS:", err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendSMS;
