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

            // Figure out exactly what happened
            if (!change.before.exists) {
                actionType = 'CREATE';
                medName = change.after.data().name || 'New Medication';
            } else if (!change.after.exists) {
                actionType = 'DELETE';
                medName = change.before.data().name || 'Deleted Medication';
            } else {
                actionType = 'UPDATE';
                medName = change.after.data().name || 'Updated Medication';
            }

            // Save the record to a new 'logs' collection
            await db.collection('logs').add({
                action: actionType,
                medicationId: medId,
                medicationName: medName,
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
