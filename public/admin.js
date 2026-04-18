// --- CONFIGURATION & INITIALIZATION ---
console.log("PACPal Admin Engine Started!");

const firebaseConfig = {
    apiKey: "AIzaSyA5uz0RFyrCkxJocq8kZwFg_pcO2P6WTUg",
    authDomain: "pacpal-9f9bf.firebaseapp.com",
    projectId: "pacpal-9f9bf",
    storageBucket: "pacpal-9f9bf.firebasestorage.app",
    messagingSenderId: "993977477357",
    appId: "1:993977477357:web:72a2c5dee83d40e4b7c4e4"
};

// --- UNIFIED DARK MODE LOGIC ---
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

if (localStorage.getItem('pacpal_theme') === 'dark') {
    body.classList.add('dark-theme');
    if (themeToggle) themeToggle.innerText = '☀️ Light Mode';
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-theme');
        const isDark = body.classList.contains('dark-theme');
        localStorage.setItem('pacpal_theme', isDark ? 'dark' : 'light');
        themeToggle.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    });
}

// --- FIREBASE SETUP ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

let currentResults = [];

// --- SPREADSHEET TRACKING VARIABLES ---
let medTable; 
let pendingEdits = {}; 

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dataFormSection').style.display = 'block';
        
        fetchAllMeds(); // Now fetches the whole database using the smart cache
        displayAdmins();
        loadMailingList();
    } else {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('dataFormSection').style.display = 'none';
    }
});

// --- BULLETPROOF BUTTON LISTENERS ---
document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    
    btn.innerText = "Authenticating...";
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        document.getElementById('loginError').innerText = "Incorrect email or password.";
        document.getElementById('loginError').style.display = 'block';
        btn.innerText = "Login to PACPal";
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut();
});

// --- MAILING LIST MANAGEMENT ---
async function loadMailingList() {
    const listEl = document.getElementById('mailing-list-ui');
    listEl.innerHTML = "<li>Loading subscribers...</li>";

    try {
        const doc = await db.collection('system').doc('mailingList').get();
        const emails = doc.exists ? (doc.data().emails || []) : [];

        if (emails.length === 0) {
            listEl.innerHTML = "<li class='admin-item' style='color: #888;'>No subscribers yet.</li>";
            return;
        }

        listEl.innerHTML = emails.map(email => `
            <li class="admin-item" style="display: flex; justify-content: space-between; align-items: center;">
                <strong>${email}</strong>
                <button class="delete-btn" onclick="removeMailingEmail('${email}')" style="padding: 5px 10px; font-size: 0.8rem;">Remove</button>
            </li>
        `).join('');

    } catch (error) {
        console.error("Error loading mailing list:", error);
        listEl.innerHTML = "<li class='error'>Error loading subscriber list.</li>";
    }
}

async function addMailingEmail() {
    const inputEl = document.getElementById('newEmailInput');
    const newEmail = inputEl.value.trim().toLowerCase();

    if (!newEmail || !newEmail.includes('@')) {
        alert("Please enter a valid email address.");
        return;
    }

    try {
        await db.collection('system').doc('mailingList').set({
            emails: firebase.firestore.FieldValue.arrayUnion(newEmail)
        }, { merge: true });

        inputEl.value = ""; 
        loadMailingList();  

    } catch (error) {
        console.error("Error adding email:", error);
        alert("Could not add email. Check console.");
    }
}

async function removeMailingEmail(emailToRemove) {
    if (!confirm(`Are you sure you want to remove ${emailToRemove} from the weekly briefing?`)) return;

    try {
        await db.collection('system').doc('mailingList').update({
            emails: firebase.firestore.FieldValue.arrayRemove(emailToRemove)
        });
        loadMailingList(); 
    } catch (error) {
        console.error("Error removing email:", error);
        alert("Could not remove email.");
    }
}

// --- ADMIN LIST ---
async function displayAdmins() {
    const listElement = document.getElementById('admin-list');
    try {
        const snapshot = await db.collection("admins").get();
        listElement.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const adminName = data.name || "Unnamed Admin"; 
            const li = document.createElement("li");
            li.className = "admin-item";
            li.innerHTML = `<div><strong>${adminName}</strong><br><span style="font-size: 10px; color: #b2bec3;">ID: ${doc.id}</span></div>`;
            listElement.appendChild(li);
        });
    } catch (error) {
        listElement.innerHTML = "<li class='error'>Access Denied: Could not load admins.</li>";
    }
}

// --- THE 1-READ MASTER CACHE SCRIPT (Storage Edition) ---
async function fetchAllMeds() {
    try {
        // 1. Fetch ONLY the metadata document (Costs exactly 1 Read)
        const metaDoc = await db.collection('system').doc('metadata').get();
        const serverUpdated = metaDoc.exists ? metaDoc.data().lastUpdated : null;
        
        // 2. Check local browser memory
        const localUpdated = localStorage.getItem('pacpal_admin_cache_timestamp');
        const cachedData = localStorage.getItem('pacpal_admin_meds_all');

        // 3. If timestamps match, load from memory instantly!
        if (cachedData && serverUpdated === localUpdated) {
            console.log("⚡ Database unchanged. Loading entire grid from local cache (0 Reads).");
            currentResults = JSON.parse(cachedData);
            renderSpreadsheet(currentResults);
            return; 
        }

        // 4. THE MAGIC: Download the JSON file instead of querying the database!
        console.log("☁️ Database updated. Downloading JSON from Cloud Storage...");
        const fileRef = storage.ref('public/medications.json');
        const url = await fileRef.getDownloadURL();
        
        const response = await fetch(url);
        currentResults = await response.json();
        
        // Save the new data and the new timestamp locally
        localStorage.setItem('pacpal_admin_meds_all', JSON.stringify(currentResults));
        if (serverUpdated) {
            localStorage.setItem('pacpal_admin_cache_timestamp', serverUpdated);
        }
        
        renderSpreadsheet(currentResults);
        
    } catch (error) {
        console.error("Fetch Error:", error);
        alert("Error fetching database. Are you sure the Cloud Function has generated the JSON?");
    }
}

        // 4. If they don't match, we download the fresh database
        console.log("☁️ Database updated or no cache found. Fetching all medications...");
        const snapshot = await db.collection('medications').orderBy('name').get();
        currentResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Save the new data and the new timestamp locally
        localStorage.setItem('pacpal_admin_meds_all', JSON.stringify(currentResults));
        if (serverUpdated) {
            localStorage.setItem('pacpal_admin_cache_timestamp', serverUpdated);
        }
        
        renderSpreadsheet(currentResults);
        
    } catch (error) {
        console.error("Fetch Error:", error);
        alert("Error fetching database.");
    }
}

// --- SPREADSHEET RENDERER ---
function renderSpreadsheet(medsArray) {
    if (medTable) {
        medTable.replaceData(medsArray);
        return;
    }

    medTable = new Tabulator("#medication-table", {
        data: medsArray, 
        layout: "fitColumns", 
        responsiveLayout: "collapse",
        pagination: "local", // Adds paging so it doesn't scroll forever
        paginationSize: 50,  // Show 50 per page
        
        columns: [
            { title: "Name", field: "name", editor: "input", width: 200, headerFilter: true },
            { title: "Category", field: "category", editor: "input", width: 150, headerFilter: true },
            { 
                title: "Clinical Instructions", 
                field: "instructions", 
                editor: "textarea", 
                formatter: "textarea", 
                variableHeight: true 
            },
            {
                title: "Del", 
                formatter: "buttonCross", 
                width: 60, 
                hozAlign: "center", 
                headerSort: false,
                cellClick: function(e, cell) {
                    const rowData = cell.getRow().getData();
                    deleteMed(rowData.id, rowData.name); 
                }
            }
        ],
    });

    medTable.on("cellEdited", function(cell) {
        const rowData = cell.getRow().getData(); 
        const fieldName = cell.getField();       
        const newValue = cell.getValue();        
        const medId = rowData.id;

        if (!pendingEdits[medId]) {
            pendingEdits[medId] = {};
        }
        pendingEdits[medId][fieldName] = newValue;

        document.getElementById('saveBatchBtn').style.display = 'block';
    });
}

// --- LIVE SEARCH BAR LOGIC ---
document.getElementById("searchInput").addEventListener("input", function(e) {
    const term = e.target.value.toLowerCase();
    
    if (!medTable) return;

    // Filter across all 3 columns instantly
    medTable.setFilter(function(data) {
        return (data.name && data.name.toLowerCase().includes(term)) ||
               (data.category && data.category.toLowerCase().includes(term)) ||
               (data.instructions && data.instructions.toLowerCase().includes(term));
    });
});

// --- BATCH SAVE LOGIC ---
async function saveAllChanges() {
    if (Object.keys(pendingEdits).length === 0) return;

    const saveBtn = document.getElementById('saveBatchBtn');
    saveBtn.innerText = "Saving to database...";
    saveBtn.disabled = true;

    try {
        const batch = db.batch();

        for (const [medId, changes] of Object.entries(pendingEdits)) {
            const medRef = db.collection('medications').doc(medId);
            batch.update(medRef, changes);
        }

        await batch.commit();

        pendingEdits = {}; 
        saveBtn.style.display = 'none'; 
        saveBtn.innerText = "⚠️ Save Pending Changes"; 
        saveBtn.disabled = false;

        // Invalidate the cache and reload
        localStorage.removeItem('pacpal_admin_meds_all');
        fetchAllMeds();
        
        alert("All changes saved successfully!");

    } catch (error) {
        console.error("Error saving batch:", error);
        alert("There was an error saving your changes. Check the console.");
        
        saveBtn.innerText = "⚠️ Save Pending Changes";
        saveBtn.disabled = false;
    }
}

// --- NEW MEDICATION ENTRY ---
document.getElementById('addMedForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const rawName = document.getElementById('medName').value.trim();
    const sanitizedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    const medData = {
        name: sanitizedName, 
        category: document.getElementById('medCategory').value.trim(),
        instructions: document.getElementById('medInstructions').value.trim()
    };

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerText = "Adding..."; 
    submitBtn.disabled = true;

    try {
        await db.collection('medications').add(medData);

        // Wipe local cache so it downloads the new medication
        localStorage.removeItem('pacpal_admin_meds_all');
        document.getElementById('addMedForm').reset(); 
        
        // Wait 2 seconds before refreshing so the Cloud Function has time to update the timestamp!
        setTimeout(fetchAllMeds, 2000); 
        
    } catch (error) {
        console.error("Save Error:", error);
        alert("System Error: Could not save to database.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Add to Database";
    }
});

// --- DELETE LOGIC ---
async function deleteMed(id, medName) {
    if (confirm(`⚠️ WARNING: Are you sure you want to permanently delete "${medName}"?`)) {
        try {
            await db.collection('medications').doc(id).delete();
            
            // Wipe local cache and reload
            localStorage.removeItem('pacpal_admin_meds_all');
            setTimeout(fetchAllMeds, 2000);

        } catch (error) {
            console.error(error);
            alert("Error: Could not delete record.");
        }
    }
}
