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
    // Visual feedback so you know the refresh is actually happening
    list.innerHTML = "<div style='padding: 20px; text-align: center;'>↻ Fetching secure database...</div>"; 
    document.getElementById('emptyState').style.display = 'none';

    try {
        const snapshot = await db.collection('medications')
            .where('name', '>=', letter)
            .where('name', '<=', letter + '\uf8ff')
            .orderBy('name').get();
            
        currentResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
            <div class="med-info">
                <strong>${med.name}</strong>
                <span class="category-badge">${med.category || 'General'}</span>
            </div>
            <div class="med-actions">
                <button class="edit-btn" onclick="startEdit('${med.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteMed('${med.id}', '${med.name}')">Delete</button>
            </div>
        </li>`).join('');
}

// --- SAVE / UPDATE LOGIC ---
// This handles BOTH adding new meds and updating existing ones
// --- SAVE / UPDATE LOGIC ---
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
            await fetchByLetter(currentLetter); // Refresh list immediately
        } catch (error) {
            console.error(error);
            alert("Error: Could not delete record.");
        }
    }
}
