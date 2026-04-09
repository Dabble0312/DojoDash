/**
 * focus-narate.js - THE MARKET ORACLE ENGINE
 * Version: MAXIMUM BEEF
 */

let narratorActive = false;

function toggleNarrator() {
    narratorActive = !narratorActive;
    const btn = document.getElementById('narratorBtn');
    if (narratorActive) {
        btn.classList.add('active');
        btn.innerHTML = `<span id="narratorIcon">🎙️</span> Narrator On`;
        readTheFullStory(); // Immediate deep-dive analysis
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<span id="narratorIcon">🔊</span> Narrator Off`;
        window.speechSynthesis.cancel();
    }
}

// THE DEEP DIVE: Combines Pattern Dates, Volume, and Mean
function readTheFullStory() {
    if (!allCandles || allCandles.length === 0) return;

    const history = allCandles;
    const latestReveal = window.revealedSoFar || [];
    
    // 1. ANALYZE THE VIBE (Using Volume & Mean from your data)
    const avgVol = history.reduce((a, b) => a + (b.volume || 0), 0) / history.length;
    const lastVol = history[history.length - 1].volume || 0;
    const volStatus = lastVol > avgVol * 1.5 ? "on explosive volume" : "with steady participation";
    
    // 2. THE PATTERN RECOGNITION (Stitching the "When")
    const patterns = window.detectedPatterns || [];
    let patternStory = "";
    if (patterns.length > 0) {
        const p = patterns[patterns.length - 1];
        patternStory = `We established a ${p.label} recently. `;
    }

    // 3. THE "BEEFED UP" SENTENCE BANK (20 Random Combinations for "AI" feel)
    const intros = [
        "Scanning the tape. ", "Listen closely. ", "The chart is whispering. ", 
        "Market structure analysis complete. ", "Price action is revealing a narrative. "
    ];
    
    const statusQuotes = [
        `The bulls are trying to defend the mean, ${volStatus}.`,
        `Distribution is evident here; the smart money is offloading.`,
        `We are seeing classic absorption at these levels.`,
        `The bears are exhausted, but the bulls haven't stepped up yet.`,
        `This is a textbook squeeze play in the making.`,
        `Price is currently overextended from the mean, watch for a snap-back.`,
        `Volume is drying up, suggesting a massive breakout is imminent.`,
        `The sellers are hitting the bids hard, but price isn't budging. That's hidden strength.`,
        `Clean trend lines are being respected, almost too perfectly.`,
        `This is a volatile regime change. Buckle up.`
    ];

    const conclusion = latestReveal.length > 0 ? 
        "The new candles suggest this story isn't over." : 
        "Make your move before the next reveal.";

    const fullScript = `${intros[Math.floor(Math.random()*intros.length)]} ${patternStory} ${statusQuotes[Math.floor(Math.random()*statusQuotes.length)]} ${conclusion}`;
    
    speak(fullScript);
}

// THE POST-REVEAL COMMENTARY
function runNarratorEngine() {
    if (!narratorActive || !window.revealedSoFar || revealedSoFar.length === 0) return;

    const burstSize = parseInt(document.getElementById('revealCountSelect')?.value || 1);
    const recent = revealedSoFar.slice(-burstSize);
    
    // DYNAMIC SENTENCE BUILDER
    let commentary = "";
    const isBullishBurst = recent.filter(c => c.close > c.open).length > (burstSize / 2);
    
    if (isBullishBurst) {
        const bullLines = [
            "Buyers are stepping in with massive conviction.",
            "That's a clean break through resistance.",
            "Shorts are getting squeezed here. The pain is real.",
            "Demand is completely overwhelming the available supply.",
            "This is an aggressive mark-up phase."
        ];
        commentary = bullLines[Math.floor(Math.random()*bullLines.length)];
    } else {
        const bearLines = [
            "The floor just gave way. Aggressive selling.",
            "Bull trap confirmed. They're being liquidated.",
            "The sellers are in a frenzy now.",
            "Price is falling under its own weight.",
            "Heavy distribution. The trend has snapped."
        ];
        commentary = bearLines[Math.floor(Math.random()*bearLines.length)];
    }

    // Stitch it to the pattern if one exists
    const p = (window.detectedPatterns || []).pop();
    if (p && p.indices.includes(allCandles.length + revealedSoFar.length - 1)) {
        commentary += ` Look at that ${p.label} play out!`;
    }

    speak(commentary);
}

function speak(text) {
    window.speechSynthesis.cancel(); 
    const msg = new SpeechSynthesisUtterance(text);
    msg.rate = 1.05; // Slightly faster "News" pace
    msg.pitch = 0.9; // Slightly lower "Serious Analyst" pitch
    window.speechSynthesis.speak(msg);
}