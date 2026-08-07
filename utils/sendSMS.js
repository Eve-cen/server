// Thin wrapper around Twilio's REST API (plain HTTPS call via axios, no SDK
// dependency needed) for sending a single SMS -- currently used only for the
// phone-number-change OTP flow (routes/settings.js).
//
// Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in the
// environment. Until those are set, this throws a clear "not configured"
// error instead of silently failing, so the calling route can surface a
// clean message rather than a bare 500.
const axios = require("axios");

const sendSMS = async ({ to, body }) => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    const err = new Error("SMS is not configured yet");
    err.code = "SMS_NOT_CONFIGURED";
    throw err;
  }

  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body }),
      { auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN } }
    );
  } catch (err) {
    console.error("Error sending SMS:", err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendSMS;
