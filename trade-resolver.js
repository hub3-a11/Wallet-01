import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMucqvSoBlUo5jn5Pu4ClQIGRlInu55mQ", authDomain: "project-app-259f2.firebaseapp.com",
  projectId: "project-app-259f2", storageBucket: "project-app-259f2.firebasestorage.app",
  messagingSenderId: "389607996830", appId: "1:389607996830:web:a9e456c60e4608f1a9ea8f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 1. INJECT THE ANIMATION MODAL HTML & CSS ---
const injectModal = () => {
    const style = document.createElement('style');
    style.innerHTML = `
        .tr-modal-overlay { position: fixed; inset: 0; background: rgba(11, 14, 17, 0.95); z-index: 10000; display: none; justify-content: center; align-items: center; flex-direction: column; padding: 20px; font-family: -apple-system, sans-serif;}
        .tr-modal-overlay.show { display: flex; animation: trFadeIn 0.3s ease-out; }
        @keyframes trFadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .tr-circle { width: 100px; height: 100px; border-radius: 50%; display: flex; justify-content: center; align-items: center; position: relative; margin-bottom: 25px; animation: trPopIn 0.5s cubic-bezier(0.16,1,0.3,1); }
        .tr-circle.win { background: rgba(14, 203, 129, 0.1); border: 2px solid #0ecb81; }
        .tr-circle.loss { background: rgba(246, 70, 93, 0.1); border: 2px solid #f6465d; }
        .tr-circle::before { content: ''; position: absolute; inset: -10px; border-radius: 50%; animation: trRipple 1.5s ease-out infinite; }
        .tr-circle.win::before { border: 2px solid rgba(14, 203, 129, 0.3); }
        .tr-circle.loss::before { border: 2px solid rgba(246, 70, 93, 0.3); }
        @keyframes trRipple { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; } }
        @keyframes trPopIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        
        .tr-svg { width: 50px; height: 50px; }
        .tr-svg.win path { stroke: #0ecb81; stroke-width: 4; fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 60; stroke-dashoffset: 60; animation: trDraw 0.6s 0.3s ease forwards; }
        .tr-svg.loss path { stroke: #f6465d; stroke-width: 4; fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 60; stroke-dashoffset: 60; animation: trDraw 0.6s 0.3s ease forwards; }
        @keyframes trDraw { to { stroke-dashoffset: 0; } }
        
        .tr-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; color: white; }
        .tr-desc { font-size: 15px; color: #848e9c; margin-bottom: 30px; text-align: center; line-height: 1.5; }
        .tr-desc strong { font-size: 18px; }
        .tr-btn { width: 100%; max-width: 200px; padding: 15px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; transition: 0.2s; color: white;}
        .tr-btn:active { transform: scale(0.98); }
        .tr-btn.win { background: #5b41ff; }
        .tr-btn.loss { background: #2b3139; }
    `;
    document.head.appendChild(style);

    const modalHTML = `
        <div class="tr-modal-overlay" id="trade-result-modal">
            <div class="tr-circle" id="tr-icon-circle">
                <svg class="tr-svg" id="tr-icon-svg" viewBox="0 0 52 52">
                    <path d="M14 27 L22 35 L38 18" id="tr-path" />
                </svg>
            </div>
            <div class="tr-title" id="tr-title">Trade Won!</div>
            <div class="tr-desc" id="tr-desc">You won <strong>0.00</strong></div>
            <button class="tr-btn" id="tr-btn" onclick="document.getElementById('trade-result-modal').classList.remove('show'); window.location.reload();">Done</button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectModal);
} else {
    injectModal();
}

// --- 2. GLOBAL TRADE CHECKER ENGINE ---
auth.onAuthStateChanged((user) => {
    if (user) {
        // Check immediately on page load
        checkExpiredTrades(user.uid);
        
        // Then check every 5 seconds while on this page
        setInterval(() => {
            checkExpiredTrades(user.uid);
        }, 5000);
    }
});

async function checkExpiredTrades(uid) {
    try {
        const now = new Date();
        
        // Find open trades for this user that have expired
        const q = query(
            collection(db, "trades"), 
            where("uid", "==", uid), 
            where("status", "==", "open")
        );
        
        const snapshot = await getDocs(q);
        
        snapshot.forEach(async (tradeDoc) => {
            const t = tradeDoc.data();
            const expiresAt = t.expiresAt.toDate();
            
            if (now >= expiresAt) {
                // This trade is expired! Resolve it.
                const walletRef = doc(db, "wallets", t.walletId);
                
                if (t.willWin) {
                    // User WINS
                    const totalReturn = t.amount * t.payoutMultiplier;
                    await updateDoc(walletRef, { [`balances.${t.asset}`]: increment(totalReturn) });
                    await updateDoc(tradeDoc.ref, { status: 'won', resolvedAt: new Date() });
                    
                    showResultModal('win', t.asset, totalReturn);
                } else {
                    // User LOSES
                    await updateDoc(tradeDoc.ref, { status: 'lost', resolvedAt: new Date() });
                    
                    showResultModal('loss', t.asset, t.amount);
                }
            }
        });
    } catch (error) {
        console.error("Trade check error:", error);
    }
}

// --- 3. SHOW THE ANIMATION ---
let isModalShowing = false;

function showResultModal(type, asset, amount) {
    if (isModalShowing) return; // Prevent overlapping modals
    isModalShowing = true;

    const modal = document.getElementById('trade-result-modal');
    const circle = document.getElementById('tr-icon-circle');
    const svg = document.getElementById('tr-icon-svg');
    const title = document.getElementById('tr-title');
    const desc = document.getElementById('tr-desc');
    const btn = document.getElementById('tr-btn');

    // Reset classes
    circle.className = 'tr-circle';
    svg.className = 'tr-svg';
    btn.className = 'tr-btn';

    if (type === 'win') {
        circle.classList.add('win');
        svg.classList.add('win');
        btn.classList.add('win');
        title.innerText = "Trade Won! 🎉";
        title.style.color = "var(--green)";
        desc.innerHTML = `Congratulations!<br>You won <strong style="color: #0ecb81;">${amount.toFixed(4)} ${asset}</strong>`;
    } else {
        circle.classList.add('loss');
        svg.classList.add('loss');
        btn.classList.add('loss');
        title.innerText = "Trade Lost 📉";
        title.style.color = "var(--red)";
        // Change the checkmark path to an X
        document.getElementById('tr-path').setAttribute('d', 'M16 16 L36 36 M36 16 L16 36');
        desc.innerHTML = `Better luck next time.<br>You lost <strong style="color: #f6465d;">${amount} ${asset}</strong>`;
    }

    modal.classList.add('show');
}