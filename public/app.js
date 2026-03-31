// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA5uz0RFyrCkxJocq8kZwFg_pcO2P6WTUg",
    authDomain: "pacpal-9f9bf.firebaseapp.com",
    projectId: "pacpal-9f9bf",
    storageBucket: "pacpal-9f9bf.firebasestorage.app",
    messagingSenderId: "993977477357",
    appId: "1:993977477357:web:72a2c5dee83d40e4b7c4e4",
    measurementId: "G-QMLLEV67R5"
};

// --- 2. DARK MODE (Unified with Admin) ---
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

// Apply saved preference immediately
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

// --- 3. FIREBASE & SEARCH INIT ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let myDatabase = [];
let fuse = null;
window.currentSearchResults = []; // Safe array to prevent button crashes

const searchInput = document.getElementById('medSearch');
const searchResults = document.getElementById('searchResults');
const medicationList = document.getElementById('medicationList');
const printBtn = document.getElementById('printBtn');
const listHeader = document.getElementById('listHeader');

async function init() {
    try {
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.innerHTML = "↻ Connecting to Database...";

        // 1. PING: Fetch the metadata first (Cost: 1 Read)
        const metaDoc = await db.collection('system').doc('metadata').get();
        const serverDate = metaDoc.exists ? metaDoc.data().lastUpdated : null;
        
        if (serverDate) {
            const dateDisplay = document.getElementById('updateDateDisplay');
            if (dateDisplay) {
                dateDisplay.innerHTML = `<strong>Database Update ${serverDate}</strong>`;
            }
        }

        // --- NEW: Time-Based Expiration Logic ---
        const CACHE_LIFETIME_HOURS = 12; // Change this to force a refresh sooner or later
        const CACHE_LIFETIME_MS = CACHE_LIFETIME_HOURS * 60 * 60 * 1000;
        const now = Date.now();

        // 2. CACHE CHECK: Look inside the browser's memory
        const cachedMeds = localStorage.getItem('pacpal_meds');
        const cachedDate = localStorage.getItem('pacpal_date');
        const cachedTime = localStorage.getItem('pacpal_cache_time');

        let useCache = false;

        if (cachedMeds && cachedDate === serverDate && cachedTime) {
            const timeSinceLastDownload = now - parseInt(cachedTime, 10);
            
            if (timeSinceLastDownload < CACHE_LIFETIME_MS) {
                useCache = true; // The cache is fresh enough, use it!
            } else {
                console.log("⏱️ Cache expired! Forcing a fresh download.");
            }
        }

        if (useCache) {
            // CACHE HIT! Load from memory (Cost: 0 Reads)
            console.log("⚡ Loaded database from local cache.");
            myDatabase = JSON.parse(cachedMeds);
        } else {
            // CACHE MISS! The database is new, updated, OR the timer expired.
            console.log("☁️ Downloading zero-read JSON database...");
            
            // This is the direct, public link to your new Storage file!
            const fileUrl = "https://firebasestorage.googleapis.com/v0/b/pacpal-9f9bf.firebasestorage.app/o/public%2Fmedications.json?alt=media";
            
            const response = await fetch(fileUrl);
            
            if (!response.ok) throw new Error("Network response was not ok");
            
            myDatabase = await response.json();
            
            // Save this fresh data AND the exact timestamp into memory for next time
            localStorage.setItem('pacpal_meds', JSON.stringify(myDatabase));
            localStorage.setItem('pacpal_cache_time', now.toString());
            
            if (server
