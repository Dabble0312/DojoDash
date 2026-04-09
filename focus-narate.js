/**
 * focus-narate.js
 * Real-time Narrator Engine
 */

let narratorActive = false;
let lastSpokenIndex = -1;

// 1. THE TOGGLE (Called by the HTML Button)
function toggleNarrator() {
    const btn = document.getElementById('narratorBtn');
    const icon = document.getElementById('narratorIcon');
    
    narratorActive = !narratorActive;

    if (narratorActive) {
        btn.classList.add('active');
        btn.innerHTML = `<span id="narratorIcon">🎙️</span> Narrator On`;
        // Immediate check in case candles are already revealed
        runNarratorEngine();
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<span id="narratorIcon">🔊</span> Narrator Off`;
        window.speechSynthesis.cancel(); // Stop talking immediately
    }
}

// 2. THE TRIGGER (Called by focus-core.js inside revealNext)
function runNarratorEngine() {
    // Safety checks
    if (!narratorActive || typeof revealedSoFar === 'undefined' || revealedSoFar.length === 0) return;

    const currentIndex = revealedSoFar.length - 1;

    // Prevent re-triggering the same candle logic
    if (currentIndex === lastSpokenIndex) return;

    const candle = revealedSoFar[currentIndex];
    let textToSpeak = "";

    // A. Priority 1: Check for Pattern Starts (Level 2)
    // detectedPatterns is global from focus-core.js
    const startingPattern = (typeof detectedPatterns !== 'undefined') 
        ? detectedPatterns.find(p => p.indices[0] === currentIndex) 
        : null;

    if (startingPattern) {
        textToSpeak = getPatternNarrative(startingPattern);
    } 
    // B. Priority 2: Check for Key Candles (Level 1)
    else if (isKeyCandle(candle)) {
        // summarize(candle) is from focus-summary.js
        textToSpeak = summarize(candle);
    }

    // C. Execute Speech
    if (textToSpeak) {
        speak(textToSpeak);
        lastSpokenIndex = currentIndex;
    }
}

// --- HELPERS ---

function speak(text) {
    // Cancel previous speech so it doesn't queue up and get delayed
    window.speechSynthesis.cancel();
    
    const msg = new SpeechSynthesisUtterance(text);
    msg.rate = 0.95; 
    msg.pitch = 1.0;
    window.speechSynthesis.speak(msg);
}

function isKeyCandle(candle) {
    return (
        candle.outside_bar === 1 || 
        candle.engulfing_soft === 1 || 
        candle.failed_breakdown === 1 || 
        candle.failed_breakout === 1 ||
        candle.candle_strength === 'strong'
    );
}

function getPatternNarrative(p) {
    const length = p.metadata?.absolute_length || p.indices.length;
    const map = {
        "Failed Breakdown": `Notice this Failed Breakdown. Price dipped, but sellers couldn't hold it, creating a trap.`,
        "Failed Breakout": `A Failed Breakout here. Bulls pushed high but got rejected, leaving buyers stranded.`,
        "Momentum Burst": `This is a Momentum Burst. High conviction over ${length} candles showing a clear aggressive move.`,
        "Engulfing Flip": `An Engulfing Flip. The market sentiment just did a 180-degree turn in a single candle.`,
        "Compression": `Volatility is drying up into a ${length} candle compression. The market is coiling.`
    };
    return map[p.label] || `A ${p.label} pattern is forming over ${length} candles.`;
}