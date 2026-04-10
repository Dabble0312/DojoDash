/**
 * focus-narate.js - THE MARKET ORACLE ENGINE
 * Version: MAXIMUM BEEF (REFINED)
 */

let narratorActive = false;

function toggleNarrator() {
    narratorActive = !narratorActive;
    const btn = document.getElementById('narratorBtn');
    if (narratorActive) {
        btn.classList.add('active');
        btn.innerHTML = `<span id="narratorIcon">🎙️</span> Narrator On`;
        readTheFullStory(); 
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<span id="narratorIcon">🔊</span> Narrator Off`;
        window.speechSynthesis.cancel();
    }
}

function readTheFullStory() {
    if (!allCandles || allCandles.length === 0) return;

    const history = allCandles;
    const latestReveal = window.revealedSoFar || [];
    
    const avgVol = history.reduce((a, b) => a + (b.volume || 0), 0) / history.length;
    const lastVol = history[history.length - 1].volume || 0;
    const volStatus = lastVol > avgVol * 1.5 ? "on explosive volume" : "with steady participation";
    
    const patterns = window.detectedPatterns || [];
    let patternStory = "";
    if (patterns.length > 0) {
        const p = patterns[patterns.length - 1];
        patternStory = `We established a ${p.label} recently. `;
    }

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
        `This is a volatile regime change. Buckle up.`,
        `Order flow shows a heavy imbalance. The delta is leaning one way.`,
        `We're seeing a vacuum of liquidity above us. Price could fly.`,
        `Exhaustion wicks are starting to print. This move is getting tired.`
    ];

    const conclusion = latestReveal.length > 0 ? 
        "The new candles suggest this story isn't over." : 
        "Make your move before the next reveal.";

    const fullScript = `${intros[Math.floor(Math.random()*intros.length)]} ${patternStory} ${statusQuotes[Math.floor(Math.random()*statusQuotes.length)]} ${conclusion}`;
    
    speak(fullScript);
}

function runNarratorEngine() {
    if (!narratorActive || !window.revealedSoFar || revealedSoFar.length === 0) return;

    const burstSize = parseInt(document.getElementById('revealCountSelect')?.value || 1);
    const recent = revealedSoFar.slice(-burstSize);
    
    let commentary = "";
    const ups = recent.filter(c => c.close > c.open).length;
    const downs = recent.length - ups;
    
    // Improved logic: If it's 50/50, call it chop
    if (ups > downs) {
        const bullLines = [
            "Buyers are stepping in with massive conviction.",
            "That's a clean break through resistance.",
            "Shorts are getting squeezed here. The pain is real.",
            "Demand is completely overwhelming the available supply.",
            "This is an aggressive mark-up phase."
        ];
        commentary = bullLines[Math.floor(Math.random()*bullLines.length)];
    } else if (downs > ups) {
        const bearLines = [
            "The floor just gave way. Aggressive selling.",
            "Bull trap confirmed. They're being liquidated.",
            "The sellers are in a frenzy now.",
            "Price is falling under its own weight.",
            "Heavy distribution. The trend has snapped."
        ];
        commentary = bearLines[Math.floor(Math.random()*bearLines.length)];
    } else {
        commentary = "Price is just churning here. No one is willing to commit yet.";
    }

    const p = (window.detectedPatterns || []).pop();
    if (p && p.indices.includes(allCandles.length + revealedSoFar.length - 1)) {
        commentary += ` Look at that ${p.label} play out!`;
    }

    speak(commentary);
}

function speak(text) {
    window.speechSynthesis.cancel(); 
    const msg = new SpeechSynthesisUtterance(text);
    msg.rate = 1.1; // "Fast-talking trader" vibe
    msg.pitch = 0.85; // Lower pitch sounds more authoritative/masculine
    
    // Ensure we use a clear voice
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural'));
    if (premiumVoice) msg.voice = premiumVoice;

    window.speechSynthesis.speak(msg);
}