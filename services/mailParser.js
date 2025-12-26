const { simpleParser } = require("mailparser");
const Imap = require("imap");
const EmailData = require("../models/emailModel");

/* ============================================
   📌 Manual Extraction Function (Regex Based)
   ============================================ */
function extractAttributesManually(emailText) {
    const lower = emailText.toLowerCase();

    // Employee Name
    let employeeName =
        /name[:\-]?\s*([A-Za-z ]+)/i.exec(emailText)?.[1] ||
        /i am ([A-Za-z ]+)/i.exec(emailText)?.[1] ||
        "Unknown Employee";

    employeeName = employeeName.trim();

    // Leave Reason
    const leaveReason =
        /reason[:\-]?\s*(.+)/i.exec(emailText)?.[1]?.trim() ||
        emailText.slice(0, 200).trim();

    // Leave Type Classification
    let leaveType = "Other";
    if (lower.includes("sick") || lower.includes("ill")) leaveType = "Sick Leave";
    else if (lower.includes("function") || lower.includes("event")) leaveType = "Function/Event Leave";
    else if (lower.includes("personal")) leaveType = "Personal Leave";
    else if (lower.includes("vacation") || lower.includes("holiday")) leaveType = "Vacation";

    // Dates
    const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;
    const allDates = emailText.match(dateRegex);

    let startDate = null;
    let endDate = null;

    if (allDates && allDates.length >= 1) {
        startDate = new Date(allDates[0]);
        if (allDates.length >= 2) endDate = new Date(allDates[1]);
    }

    return {
        employeeName,
        leaveReason,
        leaveType,
        startDate,
        endDate,
    };
}

/* ============================================
   📌 Process Individual Email
   ============================================ */
async function processEmail(stream, messageId) {
    return new Promise((resolve, reject) => {
        simpleParser(stream, async (err, parsed) => {
            if (err) {
                console.error("Parsing error:", err);
                return reject(err);
            }

            const { subject, from, text, date } = parsed;

            if (!subject || !subject.toLowerCase().includes("leave")) {
                return resolve();
            }

            try {
                // ⭐ Extract using our manual function
                const extracted = extractAttributesManually(text);

                const emailData = new EmailData({
                    employeeName: extracted.employeeName,
                    employeeEmail: from?.value?.[0]?.address || "unknown@example.com",
                    subject,
                    leaveReason: extracted.leaveReason,
                    leaveType: extracted.leaveType,
                    startDate: extracted.startDate,
                    endDate: extracted.endDate,
                    rawEmailId: messageId,
                    receivedAt: date,
                });

                await emailData.save();
                console.log("Leave request saved for:", emailData.employeeName);
                resolve();
            } catch (saveErr) {
                if (saveErr.code === 11000) {
                    console.log("Duplicate email ignored:", messageId);
                } else {
                    console.error("Save error:", saveErr);
                }
                resolve();
            }
        });
    });
}

/* ============================================
   📌 Handle New Emails
   ============================================ */
function handleNewEmail(imap) {
    imap.openBox("INBOX", false, (err, box) => {
        if (err) return console.error("Error opening inbox:", err);

        imap.search(["UNSEEN"], (err, results) => {
            if (err) return console.error("Search error:", err);
            if (!results || !results.length) {
                console.log("📭 No new leave requests found.");
                return;
            }

            console.log(`Found ${results.length} new leave request(s)`);

            const fetch = imap.fetch(results, { bodies: "" });
            fetch.on("message", (msg) => {
                let messageId, stream;

                msg.on("body", (bodyStream) => {
                    stream = bodyStream;
                });

                msg.on("attributes", (attrs) => {
                    messageId = attrs.uid;
                });

                msg.once("end", async () => {
                    if (stream && messageId) {
                        try {
                            await processEmail(stream, messageId);
                        } catch (err) {
                            console.error("Error processing email:", err);
                        }
                    }
                });
            });

            fetch.once("error", (err) => console.error("Fetch error:", err));
            fetch.once("end", () => console.log("Finished processing new emails"));
        });
    });
}

/* ============================================
   📌 Start IMAP Email Listener
   ============================================ */
function startEmailListener() {
    const imap = new Imap({
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
    });

    imap.once("ready", () => {
        console.log("📬 IMAP connection ready");

        imap.openBox("INBOX", false, (err) => {
            if (err) return console.error("Error opening inbox:", err);

            console.log("Inbox opened successfully");

            imap.on("mail", () => {
                console.log("New email detected!");
                handleNewEmail(imap);
            });

            handleNewEmail(imap);
        });
    });

    imap.once("error", (err) => console.error("IMAP connection error:", err));
    imap.once("end", () => console.log("IMAP connection ended"));

    imap.connect();
}

module.exports = startEmailListener;
