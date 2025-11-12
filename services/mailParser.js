const { simpleParser } = require("mailparser");
const Imap = require("imap");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const EmailData = require("../models/emailModel"); // import your EmailData schema

// Gemini Init
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Extract attributes with Gemini
async function extractAttributesWithGemini(emailText) {
    const currentDate = new Date().toISOString().split("T")[0];

    const prompt = `
Extract leave application details from the email below and return a single, clean JSON object.

**Instructions:**
1. Fields: employeeName, leaveReason, leaveType, startDate, endDate.
2. Categorize leaveType: "Sick Leave", "Function/Event Leave", "Personal Leave", "Vacation".
3. Resolve relative dates based on Current Date = ${currentDate}, format as YYYY-MM-DD.
4. leaveReason should capture original text.

**Email:**
\`\`\`
${emailText}
\`\`\`
`;

    const result = await model.generateContent(prompt);
    let raw = result.response.text();
    raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error("JSON parse error:", err, "\nRaw:", raw);
        return {};
    }
}

// Process individual email
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
                const extracted = await extractAttributesWithGemini(text);

                const emailData = new EmailData({
                    employeeName: extracted.employeeName || "Unknown Employee",
                    employeeEmail: from?.value?.[0]?.address || "unknown@example.com",
                    subject,
                    leaveReason: extracted.leaveReason || "Not specified",
                    leaveType: extracted.leaveType || "Other",
                    startDate: extracted.startDate ? new Date(extracted.startDate) : null,
                    endDate: extracted.endDate ? new Date(extracted.endDate) : null,
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

// Handle new emails
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

                msg.on("body", (bodyStream) => { stream = bodyStream; });
                msg.on("attributes", (attrs) => { messageId = attrs.uid; });

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

// Start IMAP listener (exported function)
function startEmailListener() {
    const imap = new Imap({
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS, // Gmail App Password if 2FA enabled
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

            // listen for new emails
            imap.on("mail", () => {
                console.log("New email detected!");
                handleNewEmail(imap);
            });

            // check existing unseen emails at startup
            handleNewEmail(imap);
        });
    });

    imap.once("error", (err) => {
        console.error("IMAP connection error:", err);
    });

    imap.once("end", () => {
        console.log("IMAP connection ended");
    });

    imap.connect();
}

module.exports = startEmailListener;
