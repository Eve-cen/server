// const nodemailer = require("nodemailer");
// const dotenv = require("dotenv");

// dotenv.config({ path: "./config.env" });

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   host: process.env.MAIL_HOST,
//   port: 587,
//   secure: false,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS, // Gmail App Password
//   },
// });

// const sendEmail = async ({ to, subject, text, html }) => {
//   try {
//     const info = await transporter.sendMail({
//       from: `"VenCome" <${process.env.EMAIL_USER}>`,
//       to,
//       subject,
//       text,
//       html,
//     });

//     console.log("Email sent:", info.messageId);
//   } catch (err) {
//     console.error("Error sending email:", err);
//     throw err; // IMPORTANT: bubble up errors
//   }
// };

// module.exports = sendEmail;

// // const nodemailer = require("nodemailer");

// // (async (to, subject, text) => {
// //   // creates a test account
// //   const testAccount = await nodemailer.createTestAccount();
// //   console.log(testAccount);
// //   // testAccount contains: { user, pass, smtp: { host, port, secure }, web }
// //   const transporter = nodemailer.createTransport({
// //     host: testAccount.smtp.host,
// //     port: testAccount.smtp.port,
// //     secure: testAccount.smtp.secure,
// //     auth: {
// //       user: testAccount.user,
// //       pass: testAccount.pass,
// //     },
// //   });

// //   const info = await transporter.sendMail({
// //     from: process.env.EMAIL_USER,
// //     to,
// //     subject,
// //     text,
// //   });

// //   console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
// // })();

const sgMail = require("@sendgrid/mail");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const msg = {
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: "VenCome",
      },
      subject,
      text,
      html,
    };

    await sgMail.send(msg);
  } catch (err) {
    console.error("Error sending email:", err.response?.body || err.message);
    throw err; // bubble up errors (important for APIs)
  }
};

module.exports = sendEmail;
