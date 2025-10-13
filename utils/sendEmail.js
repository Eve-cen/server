const nodemailer = require("nodemailer");
require("dotenv").config();

const sendEmail = async (to, subject, text) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });

    console.log("Email sent:", info.response);
  } catch (err) {
    console.error("Error sending email:", err);
  }
};

module.exports = sendEmail;

// const nodemailer = require("nodemailer");

// (async (to, subject, text) => {
//   // creates a test account
//   const testAccount = await nodemailer.createTestAccount();
//   console.log(testAccount);
//   // testAccount contains: { user, pass, smtp: { host, port, secure }, web }
//   const transporter = nodemailer.createTransport({
//     host: testAccount.smtp.host,
//     port: testAccount.smtp.port,
//     secure: testAccount.smtp.secure,
//     auth: {
//       user: testAccount.user,
//       pass: testAccount.pass,
//     },
//   });

//   const info = await transporter.sendMail({
//     from: process.env.EMAIL_USER,
//     to,
//     subject,
//     text,
//   });

//   console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
// })();
