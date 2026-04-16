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

let currentLetter = 'A';
let currentResults = [];

// --- SPREADSHEET TRACKING VARIABLES ---
let medTable; 
let pendingEdits = {}; 

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dataFormSection').style.display = 'block';
        buildAlphabet(); 
        fetchByLetter('A');
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

// --- MEDICATION ROLODEX LOGIC ---
function buildAlphabet() {
    const container = document.getElementById('alphabetContainer');
    container.innerHTML = '';
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
        const btn = document.createElement('button');
        btn.innerText = letter;
        btn.className = letter === currentLetter ? 'alpha-btn active' : 'alpha-btn';
        btn.onclick = () => fetchByLetter(letter);
        container.appendChild(btn);
    });
}

async function fetchByLetter(letter) {
    currentLetter = letter;
    buildAlphabet(); 
    
    document.getElementById('emptyState').style.display = 'none';

    const now = Date.now();
    const CACHE_LIFETIME_MS = 15 * 60 * 1000; 
    const cacheKey = `pacpal_admin_meds_${letter}`; 
    
    const cachedMeds = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem('pacpal_admin_cache_time');

    if (cachedMeds && cachedTime && (now - parseInt(cachedTime, 10) < CACHE_LIFETIME_MS)) {
        console.log(`⚡ Admin loaded letter ${letter} from local cache.`);
        currentResults = JSON.parse(cachedMeds);
        renderSpreadsheet(currentResults); // Plugs directly into the spreadsheet
        return; 
    }

    try {
        console.log(`☁️ Admin downloading letter ${letter} from Firebase...`);
        const snapshot = await db.collection('medications')
            .where('name', '>=', letter)
            .where('name', '<=', letter + '\uf8ff')
            .orderBy('name').get();
            
        currentResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        localStorage.setItem(cacheKey, JSON.stringify(currentResults));
        localStorage.setItem('pacpal_admin_cache_time', now.toString());
        
        renderSpreadsheet(currentResults); // Plugs directly into the spreadsheet
    } catch (e) { 
        console.error(e);
        alert("Error fetching data from Firestore.");
    }
}

// --- NEW SPREADSHEET RENDERER ---
function renderSpreadsheet(medsArray) {
    if (medsArray.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        if (medTable) medTable.clearData();
        return;
    }
    
    document.getElementById('emptyState').style.display = 'none';

    if (medTable) {
        medTable.replaceData(medsArray);
        return;
    }

    medTable = new Tabulator("#medication-table", {
        data: medsArray, 
        layout: "fitColumns", 
        responsiveLayout: "collapse",
        
        columns: [
            { title: "Name", field: "name", editor: "input", width: 200 },
            { title: "Category", field: "category", editor: "input", width: 150 },
            { 
                title: "Clinical Instructions", 
                field: "instructions", 
                editor: "textarea", 
                formatter: "textarea", 
                variableHeight: true 
            },
            // The Delete Button inside the spreadsheet
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

        // Force a fresh pull of the current letter so the cache matches the database
        localStorage.removeItem(`pacpal_admin_meds_${currentLetter}`);
        fetchByLetter(currentLetter);
        
        alert("All changes saved successfully!");

    } catch (error) {
        console.error("Error saving batch:", error);
        alert("There was an error saving your changes. Check the console.");
        
        saveBtn.innerText = "⚠️ Save Pending Changes";
        saveBtn.disabled = false;
    }
}

// --- CACHE CLEARING HELPER ---
function refreshLetterCache(medicationName) {
    if (!medicationName) return;
    const targetLetter = medicationName.charAt(0).toUpperCase();

    localStorage.removeItem(`pacpal_admin_meds_${targetLetter}`);

    if (currentLetter !== targetLetter) {
        localStorage.removeItem(`pacpal_admin_meds_${currentLetter}`);
    }

    fetchByLetter(targetLetter);
}

// --- NEW MEDICATION ONLY (No more editing from this form) ---
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

        refreshLetterCache(medData.name);
        document.getElementById('addMedForm').reset(); // Clear form instantly
        
    } catch (error) {
        console.error("Save Error:", error);
        alert("System Error: Could not save to database.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Save to Database";
    }
});

// --- DELETE LOGIC ---
async function deleteMed(id, medName) {
    if (confirm(`⚠️ WARNING: Are you sure you want to permanently delete "${medName}"?`)) {
        try {
            await db.collection('medications').doc(id).delete();
            
            // Wipe the cache and instantly fetch the fresh data
            refreshLetterCache(medName);

        } catch (error) {
            console.error(error);
            alert("Error: Could not delete record.");
        }
    }
}
