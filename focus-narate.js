/**
 * focus-narate.js
 * THE POST-BURST ANALYST ENGINE
 */

let narratorActive = false;

/**
 * Toggles the narrator state and updates the UI button
 */
function toggleNarrator() {
    narratorActive = !narratorActive;
    const btn = document.getElementById('narratorBtn');
    
    if (!btn) return;

    if (narratorActive) {
        btn.classList.add('active');
        btn.innerHTML = `<span id="narratorIcon">🎙️</span> Narrator On`;
        // Optional: Speak an intro when turned on
        speak("Narrator active. Analyzing market flow.");
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<span id="narratorIcon">🔊</span> Narrator Off`;
        window.speechSynthesis.cancel();
    }
}

/**
 * The main engine called by focus-core.js AFTER a reveal burst completes
 */
function runNarratorEngine() {
    if (!narratorActive || !window.revealedSoFar || revealedSoFar.length === 0) return;

    // 1. Get the size of the move just revealed (e.g., 4 days, 10 days)
    const revealSelect = document.getElementById('revealCountSelect');
    const burstSize = revealSelect ? parseInt(revealSelect.value) : 1;
    
    // 2. Grab the most recent candles revealed in this specific burst
    const recentBurst = revealedSoFar.slice(-burstSize);
    const ups = recentBurst.filter(c => c.close > c.open).length;
    const downs = recentBurst.length - ups;
    const lastCandle = recentBurst[recentBurst.length - 1];

    let commentary = "";

    // 3. CHECK FOR PATTERNS: Did a major pattern just complete?
    const latestPattern = (window.detectedPatterns || [])
        .filter(p => p.indices.some(idx => idx >= (allCandles.length + revealedSoFar.length - burstSize)))
        .pop();

    if (latestPattern) {
        commentary += `Significant signal detected: ${latestPattern.label}. `;
    }

    // 4. MOMENTUM ANALYSIS: What was the "Vibe" of the burst?
    if (ups > downs && ups >= (burstSize * 0.6)) {
        commentary += "A strong bullish sequence. Buyers are currently dominating the tape. ";
    } else if (downs > ups && downs >= (burstSize * 0.6)) {
        commentary += "Heavy selling pressure here. The bears are driving this move lower. ";
    } else if (burstSize > 1) {
        commentary += "The move was choppy and balanced. No clear winner in this sequence. ";
    }

    // 5. THE FINAL BRIDGE: How did the very last candle close?
    if (lastCandle.candle_strength === 'strong') {
        const dir = lastCandle.close > lastCandle.open ? "high" : "low";
        commentary += `The sequence ended with a strong close near the ${dir}, suggesting follow-through.`;
    } else {
        commentary += "We're seeing some stalling or indecision at the end of this move.";
    }

    speak(commentary);
}

/**
 * Handles the actual Speech Synthesis
 */
function speak(text) {
    // Stop any current speaking to avoid overlapping
    window.speechSynthesis.cancel(); 

    const msg = new SpeechSynthesisUtterance(text);
    
    // Voice Settings
    msg.rate = 1.0;  // Normal speed
    msg.pitch = 1.0; // Normal pitch
    
    // Attempt to use a cleaner voice if the browser supports it
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural'));
    if (naturalVoice) msg.voice = naturalVoice;

    window.speechSynthesis.speak(msg);
}