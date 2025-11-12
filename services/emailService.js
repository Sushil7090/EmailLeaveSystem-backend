const nodemailer = require('nodemailer');

let sharedTransporter = null;

function getTransporter() {
    if (sharedTransporter) return sharedTransporter;

    const { EMAIL_USER, EMAIL_PASS } = process.env;
    if (!EMAIL_USER || !EMAIL_PASS) {
        throw new Error('Email credentials are not configured. Please set EMAIL_USER and EMAIL_PASS in environment.');
    }

    sharedTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS,
        },
    });

    return sharedTransporter;
}

async function sendEmail({ to, subject, html, text, cc, bcc, attachments }) {
    const transporter = getTransporter();
    const fromAddress = `"DYP Company" <${process.env.EMAIL_USER}>`;

    const mailOptions = {
        from: fromAddress,
        to,
        cc,
        bcc,
        subject,
        html,
        text,
        attachments,
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { sendEmail };


