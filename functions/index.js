const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

exports.generateMedsJSON = functions.firestore
    .document('medications/{medId}')
    .onWrite(async (change, context) => {
        const db = admin.firestore();
        const bucket = admin.storage().bucket(); 
        const medId = context.params.medId;

        try {
            console.log("Database change detected! Logging action...");

            // --- 1. THE AUDIT LOG LOGIC ---
            let actionType = 'UPDATE';
            let medName = 'Unknown';
            let updateDetails = null; // NEW: To store what actually changed

            if (!change.before.exists) {
                actionType = 'CREATE';
                medName = change.after.data().name || 'New Medication';
            } else if (!change.after.exists) {
                actionType = 'DELETE';
                medName = change.before.data().name || 'Deleted Medication';
            } else {
                actionType = 'UPDATE';
                const beforeData = change.before.data();
                const afterData = change.after.data();
                medName = afterData.name || 'Updated Medication';

                let changes = [];
                
                // We check the three main fields that usually change
                const fieldsToWatch = ['instructions', 'category', 'name'];
                
                fieldsToWatch.forEach(field => {
                    const oldVal = beforeData[field] || '(empty)';
                    const newVal = afterData[field] || '(empty)';
                    
                    if (oldVal !== newVal) {
                        // We format it as "Field: Old Value → New Value"
                        // We use .substring(0, 100) to keep the log from getting too massive
                        changes.push(`${field}: "${oldVal.substring(0, 60)}..." → "${newVal.substring(0, 60)}..."`);
                    }
                });

                updateDetails = changes.length > 0 ? changes.join(' | ') : 'Minor edit';
            }

            // Save the record to the 'logs' collection
            await db.collection('logs').add({
                action: actionType,
                medicationId: medId,
                medicationName: medName,
                updateDetails: updateDetails, // Save our new "Spot the Difference" string
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            // ------------------------------

            console.log("Generating new JSON file...");

            // 2. Fetch all medications
            const snapshot = await db.collection('medications').orderBy('name').get();
            const medsArray = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // 3. Save to Cloud Storage
            const jsonString = JSON.stringify(medsArray);
            const file = bucket.file('public/medications.json');
            await file.save(jsonString, {
                metadata: {
                    contentType: 'application/json',
                    cacheControl: 'public, max-age=43200' 
                }
            });

            // --- NEW: Generate a public updates.json file ---
            console.log("Generating updates.json...");
            // Grab the 50 most recent logs
            const logsSnapshot = await db.collection('logs')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();

            const logsArray = logsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    action: data.action,
                    medicationName: data.medicationName,
                    updateDetails: data.updateDetails || null,
                    date: data.timestamp ? data.timestamp.toDate().toLocaleDateString() : new Date().toLocaleDateString()
                };
            });

            const logsFile = bucket.file('public/updates.json');
            await logsFile.save(JSON.stringify(logsArray), {
                metadata: { contentType: 'application/json', cacheControl: 'public, max-age=43200' }
            });

            // 4. Update the PING timestamp
            const nowString = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
            await db.collection('system').doc('metadata').set({
                lastUpdated: nowString
            }, { merge: true });

            console.log(`Success! Log saved and JSON updated with ${medArray.length} items.`);
            return null;
            
        } catch (error) {
            console.error("Critical Error:", error);
            return null;
        }
    });

const nodemailer = require('nodemailer');

// --- EMAIL CONFIGURATION ---
// Swap these out with the email you are sending FROM and your App Password
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'drsleep@gmail.com', 
        pass: 'wpxv vgju ogux mxnc' 
    }
});

// --- WEEKLY SCHEDULED FUNCTION ---
// Runs every Monday at 9:00 AM Pacific Time
exports.weeklyMedUpdate = functions.pubsub.schedule('every monday 09:00')
    .timeZone('America/Los_Angeles') 
    .onRun(async (context) => {
        const db = admin.firestore();
        
        // 1. Calculate the date exactly 7 days ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        try {
            // 2. Grab all logs from the last 7 days
            const snapshot = await db.collection('logs')
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(oneWeekAgo))
                .get();

            // If nothing changed, go back to sleep!
            if (snapshot.empty) {
                console.log("No changes this week. Skipping email.");
                return null;
            }

            // 3. Sort the logs into categories
            let added = [];
            let updated = [];
            let removed = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.action === 'CREATE') added.push(data.medicationName);
                else if (data.action === 'UPDATE') updated.push(data.medicationName);
                else if (data.action === 'DELETE') removed.push(data.medicationName);
            });

            // 4. Build the HTML Email body
            let htmlBody = `<h2 style="color: #2c3e50;">PACPal Weekly Update</h2>`;
            htmlBody += `<p>Here are the medication changes from the past 7 days:</p>`;

            if (added.length > 0) {
                htmlBody += `<h3 style="color: #27ae60;">🟢 Added</h3><ul>`;
                added.forEach(med => htmlBody += `<li>${med}</li>`);
                htmlBody += `</ul>`;
            }

            if (updated.length > 0) {
                htmlBody += `<h3 style="color: #f39c12;">🟠 Updated</h3><ul>`;
                updated.forEach(med => htmlBody += `<li>${med}</li>`);
                htmlBody += `</ul>`;
            }

            if (removed.length > 0) {
                htmlBody += `<h3 style="color: #c0392b;">🔴 Removed</h3><ul>`;
                removed.forEach(med => htmlBody += `<li>${med}</li>`);
                htmlBody += `</ul>`;
            }

            // 5. Send the email!
            await transporter.sendMail({
                from: '"Matt Malkin" <drsleep@gmail.com>',
                to: 'mrmalkin@health.ucdavis.edu', // Change this to whoever should receive it!
                subject: 'PACPal Weekly Medication Updates',
                html: htmlBody
            });

            console.log("Weekly update email sent successfully!");
            return null;

        } catch (error) {
            console.error("Error sending weekly email:", error);
            return null;
        }
    });