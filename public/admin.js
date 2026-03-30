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
let editingId = null;

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dataFormSection').style.display = 'block';
        buildAlphabet(); 
        fetchByLetter('A');
        displayAdmins();
    } else {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('dataFormSection').style.display = 'none';
    }
});

async function login() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    const btn = document.querySelector('#loginSection button');
    
    btn.innerText = "Authenticating...";
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        document.getElementById('loginError').innerText = "Incorrect email or password.";
        document.getElementById('loginError').style.display = 'block';
        btn.innerText = "Login to PACPal";
    }
}

function logout() { auth.signOut(); }

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
    buildAlphabet(); // Updates active button color
    
    const list = document.getElementById('databaseList');
    document.getElementById('emptyState').style.display = 'none';

    const now = Date.now();
    const CACHE_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours
    const cacheKey = `pacpal_admin_meds_${letter}`; // Unique cache for each letter
    
    const cachedMeds = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem('pacpal_admin_cache_time');

    // CACHE CHECK
    if (cachedMeds && cachedTime && (now - parseInt(cachedTime, 10) < CACHE_LIFETIME_MS)) {
        console.log(`⚡ Admin loaded letter ${letter} from local cache.`);
        currentResults = JSON.parse(cachedMeds);
        renderList();
        return; // Stop here! Don't run the Firebase code below.
    }

    // CACHE MISS: Fetch from Firebase
    list.innerHTML = "<div style='padding: 20px; text-align: center;'>↻ Fetching secure database...</div>"; 

    try {
        console.log(`☁️ Admin downloading letter ${letter} from Firebase...`);
        const snapshot = await db.collection('medications')
            .where('name', '>=', letter)
            .where('name', '<=', letter + '\uf8ff')
            .orderBy('name').get();
            
        currentResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Save the fresh results and the timestamp to memory
        localStorage.setItem(cacheKey, JSON.stringify(currentResults));
        localStorage.setItem('pacpal_admin_cache_time', now.toString());
        
        renderList();
    } catch (e) { 
        console.error(e);
        list.innerHTML = "<li class='error'>Error fetching data from Firestore.</li>"; 
    }
}

function renderList() {
    const list = document.getElementById('databaseList');
    
    if (currentResults.length === 0) {
        list.innerHTML = "";
        document.getElementById('emptyState').style.display = 'block';
        return;
    }
    
    document.getElementById('emptyState').style.display = 'none';
    list.innerHTML = currentResults.map(med => `
        <li class="med-item">
            <div class="med-info" style="width: 70%;">
                <strong>${med.name}</strong>
                <span class="category-badge">${med.category || 'General'}</span>
                
                <p style="font-size: 0.85em; color: var(--text-muted); margin-top: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${med.instructions || 'No instructions provided.'}
                </p>
                
            </div>
            <div class="med-actions">
                <button class="edit-btn" onclick="startEdit('${med.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteMed('${med.id}', '${med.name}')">Delete</button>
            </div>
        </li>`).join('');
}

// --- SAVE / UPDATE LOGIC ---
// This handles BOTH adding new meds and updating existing ones
document.getElementById('addMedForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const rawName = document.getElementById('medName').value.trim();
    // Capitalize the first letter, but DO NOT force lowercase on the rest (Preserves acronyms like HCTZ)
    const sanitizedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const targetLetter = sanitizedName.charAt(0).toUpperCase();

    const medData = {
        name: sanitizedName, 
        category: document.getElementById('medCategory').value.trim(),
        instructions: document.getElementById('medInstructions').value.trim()
    };

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerText = "Syncing..."; 
    submitBtn.disabled = true;

    try {
        if (editingId) {
            // 1. Send update to Firebase
            await db.collection('medications').doc(editingId).update(medData);
            
            // 2. Optimistic UI: Force the local array to update instantly (Bypasses cache lag)
            const index = currentResults.findIndex(m => m.id === editingId);
            if (index !== -1) {
                currentResults[index] = { id: editingId, ...medData };
            }

            // 3. Re-sort the array alphabetically just in case the name change altered the order
            currentResults.sort((a, b) => a.name.localeCompare(b.name));

        } else {
            // Create a brand new record
            await db.collection('medications').add(medData);
        }
        // This instantly destroys the admin cache timer so the next click forces a fresh download
        localStorage.removeItem('pacpal_admin_cache_time');
        
        // If they changed the first letter (e.g. Aspirin -> Bayer) or added a new med, fetch the new letter
        if (targetLetter !== currentLetter || !editingId) {
            await fetchByLetter(targetLetter);
        } else {
            // If staying on the same letter, immediately re-render our instantly updated array
            renderList();
        }
        
        // Clear the form back to default state
        cancelEdit(); 
        
    } catch (error) {
        console.error("Save Error:", error);
        alert("System Error: Could not save to database.");
    } finally {
        submitBtn.disabled = false;
        // Ensure button text returns to normal
        if (!editingId) submitBtn.innerText = "Save to Database";
    }
});

function startEdit(id) {
    const med = currentResults.find(m => m.id === id);
    if (!med) return;
    
    document.getElementById('medName').value = med.name;
    document.getElementById('medCategory').value = med.category;
    document.getElementById('medInstructions').value = med.instructions;
    editingId = id;
    
    document.getElementById('formTitle').innerText = "Editing: " + med.name;
    document.getElementById('submitBtn').innerText = "Update Database";
    // Using inline-block so it sits nicely next to the save button
    document.getElementById('cancelBtn').style.display = "inline-block"; 
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    document.getElementById('addMedForm').reset();
    document.getElementById('formTitle').innerText = "Add New Medication";
    document.getElementById('submitBtn').innerText = "Save to Database";
    document.getElementById('cancelBtn').style.display = "none";
}

async function deleteMed(id, medName) {
    if (confirm(`⚠️ WARNING: Are you sure you want to permanently delete "${medName}"?`)) {
        try {
            await db.collection('medications').doc(id).delete();
            // Destroy the cache timer so the deleted item vanishes from the list immediately
            localStorage.removeItem('pacpal_admin_cache_time');
            await fetchByLetter(currentLetter); // Refresh list immediately
        } catch (error) {
            console.error(error);
            alert("Error: Could not delete record.");
        }
    }
}

// --- SYSTEM NOTIFICATIONS ---
async function notifyUpdate() {
    const btn = document.getElementById('notifyBtn');
    
    // Safety check so you don't accidentally click it
    if (!confirm("Are you sure you want to update the public database date to today?")) {
        return;
    }

    btn.innerText = "Pushing...";
    btn.disabled = true;

    try {
        // Get exactly today's date formatted as M/D/YY (e.g., 3/24/26)
        const today = new Date();
        const dateString = today.toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric', 
            year: '2-digit' 
        });

        // Save it to a special "system" collection in Firestore
        await db.collection('system').doc('metadata').set({
            lastUpdated: dateString
        }, { merge: true });

        btn.innerText = `✓ Updated to ${dateString}`;
        btn.style.backgroundColor = "var(--success)"; // Turn it green!
        
        // Reset the button after 3 seconds
        setTimeout(() => {
            btn.innerText = "📢 Push Update Notification";
            btn.style.backgroundColor = "var(--warning)";
            btn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error("Error pushing date:", error);
        alert("System Error: Could not update the public date.");
        btn.innerText = "📢 Push Update Notification";
        btn.disabled = false;
    }
}

// --- MANUAL DATE OVERRIDE ---
async function setManualDate() {
    const dateInput = document.getElementById('manualDateInput').value.trim();
    const statusMsg = document.getElementById('manualDateStatus');

    if (!dateInput) {
        alert("Please enter a date first.");
        return;
    }

    try {
        // Save the manually typed date to Firestore
        await db.collection('system').doc('metadata').set({
            lastUpdated: dateInput
        }, { merge: true });

        // Show a temporary success message
        statusMsg.innerText = `✓ Public date set to: ${dateInput}`;
        statusMsg.style.color = "var(--success)";
        statusMsg.style.display = "block";
        document.getElementById('manualDateInput').value = ''; // clear the box

        // Hide the message after 4 seconds
        setTimeout(() => {
            statusMsg.style.display = "none";
        }, 4000);

    } catch (error) {
        console.error("Manual Date Error:", error);
        statusMsg.innerText = "✖ Error saving manual date.";
        statusMsg.style.color = "var(--danger)";
        statusMsg.style.display = "block";
    }
}
