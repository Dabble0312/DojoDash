console.log("Focus Mode JS is running");

// supabase client is declared in supabase.js — loaded before this file in focus.html

// =========================
// CONFIGURATION
// =========================
const REVEALS_BEFORE_GUESS = 4;   // how many candles auto-reveal before a guess is required
const MAX_WRONG             = 5;   // wrong guesses before "Focus Lost"
const REVEAL_SPEED_MS       = 600; // ms between each auto-reveal

// =========================
// STATE
// =========================
let allCandles    = [];   // the initial 50 candles loaded from DB
let futureCandles = [];   // the ~150 future candles loaded from DB
let revealIndex   = 0;    // how many future candles have been revealed so far
let revealedSoFar = [];   // accumulates candles added to the chart this session

let correctCount  = 0;
let wrongCount    = 0;
let guessCount    = 0;    // total guesses made this session

let awaitingGuess    = false;  // true when UP/DOWN are active
let autoRevealActive = false;  // true while auto-reveal timer is running
let sessionActive    = false;

// Stores the guess + price target between submission and the moment
// the prediction candle is actually revealed on the chart
let pendingPrediction = null;
// {
//   guess:       'up' | 'down',
//   targetPrice: number | NaN,
//   candleIndex: number   ← the revealIndex of the candle we're comparing against
// }

let chart;
let candlestickSeries;
let volumeSeries;

let username = localStorage.getItem("username") || "Player";

// =========================
// WSB REACTIONS — reused from MVP
// =========================
const WSB_GOOD = [
    "🚀 Nice call, you absolute legend.",
    "💎🙌 Diamond hands detected.",
    "📈 You're cooking, chef.",
    "🔥 Certified candle whisperer.",
    "🧠 Big brain energy."
];
const WSB_BAD = [
    "🤡 That candle clowned you.",
    "🩸 Paper hands spotted.",
    "📉 Should've stayed in school.",
    "💀 Market just slapped you.",
    "🙈 Bruh… not like this."
];


/* -----------------------------------------
   1. LOAD BLOCK FROM SUPABASE
   Queries focus_blocks table — same structure
   as chart_blocks but with larger arrays.
----------------------------------------- */
async function loadFocusBlock() {
    console.log("Focus Mode: Fetching block from Supabase...");
    showStatus("Loading chart...");

    try {
        const { data, error } = await supabase
            .from('focus_blocks')
            .select('id, block_id, candles, future, window_start')
            .order('id')
            .limit(500);

        if (error) throw error;

        if (!data || data.length === 0) {
            console.error('No focus blocks found. Check focus_blocks table and RLS.');
            showStatus("No blocks available.");
            return;
        }

        const block = data[Math.floor(Math.random() * data.length)];

        if (!block.candles || !block.future) {
            console.error('Block missing candles or future:', block);
            return;
        }

        allCandles    = block.candles;
        futureCandles = block.future;
        revealIndex   = 0;
        revealedSoFar = [];

        console.log("Focus block loaded:", block.block_id,
            "| initial candles:", allCandles.length,
            "| future candles:", futureCandles.length);

        initChart();
        resetSession();
        updateStatsPanel();
        showStatus("");

    } catch (err) {
        console.error("Supabase Error:", err.message);
        showStatus("Failed to load block.");
    }
}


/* -----------------------------------------
   2. CHART SETUP — identical to MVP
----------------------------------------- */
function initChart() {
    const chartDiv = document.getElementById('chart');
    if (chart) chart.remove();

    chart = window.LightweightCharts.createChart(chartDiv, {
        layout: {
            textColor: '#000',
            backgroundColor: '#fff',
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 4,
        },
        rightPriceScale: {
            scaleMargins: { top: 0.05, bottom: 0.25 },
        },
    });

    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        borderVisible: true,
        wickVisible: true,
        wickWidth: 5,
    });

    volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
    });

    chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
        visible: false,
    });

    renderChart();

    // Lock y-axis using all candles so reveals never rescale
    const every = [...allCandles, ...futureCandles];
    const yMin  = Math.min(...every.map(c => c.low))  * 0.995;
    const yMax  = Math.max(...every.map(c => c.high)) * 1.005;

    candlestickSeries.applyOptions({
        autoscaleInfoProvider: () => ({
            priceRange: { minValue: yMin, maxValue: yMax },
        }),
    });

    chart.timeScale().fitContent();
}


/* -----------------------------------------
   3. RENDER CHART
   Draws allCandles + whatever has been revealed
   so far from futureCandles.
----------------------------------------- */
function renderChart() {
    const candleData = [...allCandles, ...revealedSoFar].map(c => ({
        time:  c.date.slice(0, 10),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
    }));
    const volumeData = [...allCandles, ...revealedSoFar].map(c => ({
        time:  c.date.slice(0, 10),
        value: c.volume,
        color: c.bullish === 1 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));

    candlestickSeries.setData(candleData);
    volumeSeries.setData(volumeData);
}


/* -----------------------------------------
   4. SESSION STATE
----------------------------------------- */
function resetSession() {
    correctCount     = 0;
    wrongCount       = 0;
    guessCount       = 0;
    awaitingGuess    = false;
    autoRevealActive = false;
    sessionActive    = true;

    pendingPrediction = null;
    updateHUD();
    setButtonState("reveal");  // start with Reveal active, UP/DOWN inactive
}


/* -----------------------------------------
   5. REVEAL LOGIC
   Auto-reveals REVEALS_BEFORE_GUESS candles
   one by one, then locks and waits for guess.
----------------------------------------- */
function startAutoReveal() {
    if (!sessionActive || autoRevealActive || awaitingGuess) return;
    if (revealIndex >= futureCandles.length) {
        endSession("complete");
        return;
    }

    autoRevealActive = true;
    setButtonState("revealing");

    let count = 0;
    const maxThisBurst = REVEALS_BEFORE_GUESS;

    function revealNext() {
        if (count >= maxThisBurst || revealIndex >= futureCandles.length) {
            // Burst done — require a guess
            autoRevealActive = false;
            awaitingGuess    = true;
            setButtonState("guess");
            showStatus("What happens next?");
            return;
        }

        const candle        = futureCandles[revealIndex];
        const thisIndex     = revealIndex;   // capture before increment
        revealedSoFar.push(candle);
        revealIndex++;
        count++;

        renderChart();
        updateStatsPanel();

        // If a prediction is waiting for exactly this candle, score it now
        if (pendingPrediction && pendingPrediction.candleIndex === thisIndex) {
            scorePendingPrediction();
        }

        setTimeout(revealNext, REVEAL_SPEED_MS);
    }

    revealNext();
}


/* -----------------------------------------
   6. GUESS LOGIC
   Stores the prediction immediately but does NOT
   score or show feedback yet. Feedback fires inside
   startAutoReveal() the moment the prediction candle
   becomes visible on the chart.
----------------------------------------- */
function handleGuess(guess) {
    if (!sessionActive || !awaitingGuess) return;
    awaitingGuess = false;

    if (!futureCandles[revealIndex]) {
        endSession("complete");
        return;
    }

    // Read price target now (before input is disabled)
    const priceInput  = document.getElementById('priceTarget');
    const targetValue = priceInput ? parseFloat(priceInput.value) : NaN;
    if (priceInput) priceInput.value = '';

    // Store prediction — scoring happens when the candle is revealed
    pendingPrediction = {
        guess:       guess,
        targetPrice: targetValue,
        candleIndex: revealIndex,   // this is the future candle we're predicting
    };

    showStatus("Reveal to see if you were right!");
    setButtonState("reveal");
}

/* -----------------------------------------
   6b. SCORE PENDING PREDICTION
   Called by startAutoReveal() the moment
   pendingPrediction.candleIndex is revealed.
----------------------------------------- */
function scorePendingPrediction() {
    if (!pendingPrediction) return;

    const { guess, targetPrice, candleIndex } = pendingPrediction;
    pendingPrediction = null;
    guessCount++;

    const predictedCandle = futureCandles[candleIndex];
    const prevCandle      = candleIndex > 0
        ? futureCandles[candleIndex - 1]
        : revealedSoFar[revealedSoFar.length - 2]; // last of allCandles if first future

    // ── Direction feedback
    const priceWentUp = predictedCandle.close > prevCandle.close;
    const correct     = (guess === 'up' && priceWentUp) || (guess === 'down' && !priceWentUp);

    if (correct) {
        correctCount++;
        showPopup("correct");
        showWSBPopup(true);
    } else {
        wrongCount++;
        showPopup("wrong");
        showWSBPopup(false);
    }

    // ── Price target feedback
    const hasTarget = !isNaN(targetPrice) && targetPrice > 0;
    if (hasTarget) {
        const actual  = predictedCandle.close;
        const diff    = actual - targetPrice;
        const diffPct = ((Math.abs(diff) / actual) * 100).toFixed(1);
        let msg = '';

        if (Math.abs(diff) / actual < 0.005) {
            msg = `🎯 Spot on! Target ₹${targetPrice.toFixed(2)} vs actual ₹${actual.toFixed(2)}`;
        } else if (diff > 0) {
            msg = `📈 Actual was ${diffPct}% higher than your target (₹${targetPrice.toFixed(2)} → ₹${actual.toFixed(2)})`;
        } else {
            msg = `📉 Actual was ${diffPct}% lower than your target (₹${targetPrice.toFixed(2)} → ₹${actual.toFixed(2)})`;
        }
        showPriceFeedback(msg);
    }

    updateHUD();

    if (wrongCount >= MAX_WRONG) {
        setTimeout(() => endSession("focus_lost"), 1400);
        return;
    }

    if (revealIndex >= futureCandles.length) {
        setTimeout(() => endSession("complete"), 1400);
        return;
    }

    // Clear feedback and re-enable Reveal after a pause
    setTimeout(() => {
        showStatus("");
        showPriceFeedback("");
    }, 2000);
}

/* -----------------------------------------
   6c. PRICE FEEDBACK DISPLAY
----------------------------------------- */
function showPriceFeedback(msg) {
    const el = document.getElementById('priceFeedback');
    if (el) el.textContent = msg;
}


/* -----------------------------------------
   7. BUTTON STATES
   Three states:
   "reveal"    — Reveal active, UP/DOWN dimmed
   "revealing" — all buttons inactive (mid-reveal)
   "guess"     — UP/DOWN active, Reveal dimmed
----------------------------------------- */
function setButtonState(state) {
    const revealBtn  = document.getElementById('revealBtn');
    const upBtn      = document.getElementById('upBtn');
    const downBtn    = document.getElementById('downBtn');
    const priceInput = document.getElementById('priceTarget');

    if (!revealBtn || !upBtn || !downBtn) return;

    if (state === "reveal") {
        revealBtn.disabled = false;
        revealBtn.classList.remove('btn-dim');
        upBtn.disabled     = true;
        downBtn.disabled   = true;
        upBtn.classList.add('btn-dim');
        downBtn.classList.add('btn-dim');
        if (priceInput) { priceInput.disabled = true;  priceInput.classList.add('btn-dim'); }
    } else if (state === "revealing") {
        revealBtn.disabled = true;
        revealBtn.classList.add('btn-dim');
        upBtn.disabled     = true;
        downBtn.disabled   = true;
        upBtn.classList.add('btn-dim');
        downBtn.classList.add('btn-dim');
        if (priceInput) { priceInput.disabled = true;  priceInput.classList.add('btn-dim'); }
    } else if (state === "guess") {
        revealBtn.disabled = true;
        revealBtn.classList.add('btn-dim');
        upBtn.disabled     = false;
        downBtn.disabled   = false;
        upBtn.classList.remove('btn-dim');
        downBtn.classList.remove('btn-dim');
        if (priceInput) { priceInput.disabled = false; priceInput.classList.remove('btn-dim'); priceInput.focus(); }
    }
}


/* -----------------------------------------
   8. HUD + STATS PANEL
----------------------------------------- */
function updateHUD() {
    const el = document.getElementById('focusHUD');
    if (el) {
        el.innerHTML =
            `Correct: <strong>${correctCount}</strong> &nbsp;|&nbsp; ` +
            `Wrong: <strong>${wrongCount} / ${MAX_WRONG}</strong> &nbsp;|&nbsp; ` +
            `Revealed: <strong>${revealIndex} / ${futureCandles.length}</strong>`;
    }
}

function updateStatsPanel() {
    // Shows metadata from the most recently revealed candle
    const last = revealedSoFar.length > 0
        ? revealedSoFar[revealedSoFar.length - 1]
        : allCandles[allCandles.length - 1];

    if (!last) return;

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== null && val !== undefined ? val : '—';
    };

    set('statTrend',      last.trend_tag      ? last.trend_tag.replace(/_/g, ' ')      : '—');
    set('statMomentum',   last.momentum_tag   ? last.momentum_tag.replace(/_/g, ' ')   : '—');
    set('statVolatility', last.volatility_tag ? last.volatility_tag.replace(/_/g, ' ') : '—');
    set('statRSI',        last.rsi            ? last.rsi.toFixed(1)                     : '—');
    set('statATR',        last.atr            ? last.atr.toFixed(2)                     : '—');
    set('statVolume',     last.volume_tag     ? last.volume_tag.replace(/_/g, ' ')      : '—');
    set('statStrength',   last.candle_strength ? last.candle_strength                   : '—');
}

function showStatus(msg) {
    const el = document.getElementById('focusStatus');
    if (el) el.textContent = msg;
}


/* -----------------------------------------
   9. END SESSION
----------------------------------------- */
function endSession(reason) {
    sessionActive    = false;
    autoRevealActive = false;
    awaitingGuess    = false;
    setButtonState("revealing"); // disable all buttons

    // Show full chart — reveal all remaining future candles at once
    revealedSoFar = [...futureCandles];
    renderChart();

    const accuracy = guessCount > 0
        ? Math.round((correctCount / guessCount) * 100)
        : 0;

    const title = reason === "focus_lost"
        ? "Focus Lost — Reset Needed"
        : "Session Complete";

    const endScreen = document.getElementById('endScreen');
    const resultText = endScreen ? endScreen.querySelector('p') : null;

    if (endScreen && resultText) {
        resultText.innerHTML =
            `<strong>${title}</strong><br><br>` +
            `Guesses: <strong>${guessCount}</strong><br>` +
            `Correct: <strong>${correctCount}</strong><br>` +
            `Wrong: <strong>${wrongCount}</strong><br>` +
            `Accuracy: <strong>${accuracy}%</strong><br>` +
            `Candles revealed: <strong>${revealIndex} / ${futureCandles.length}</strong>`;
        endScreen.classList.remove('hidden');
    }

    document.getElementById('playAgainBtn').onclick = () => {
        endScreen.classList.add('hidden');
        loadFocusBlock();
    };
    document.getElementById('homeBtn').onclick = () => {
        window.location.href = 'index.html';
    };
}


/* -----------------------------------------
   10. POPUP — identical to MVP
----------------------------------------- */
function showPopup(result) {
    const popup = document.getElementById('resultPopup');
    const text  = document.getElementById('popupResultText');
    if (!popup || !text) return;

    popup.classList.remove('correct', 'wrong', 'hidden', 'show');
    text.textContent = result === 'correct' ? 'Correct!' : 'Wrong!';
    popup.classList.add(result === 'correct' ? 'correct' : 'wrong');
    popup.classList.add('show');

    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => popup.classList.add('hidden'), 400);
    }, 1200);
}


/* -----------------------------------------
   11. WSB POPUP — identical to MVP
----------------------------------------- */
function showWSBPopup(isCorrect) {
    const popup = document.getElementById('wsbPopup');
    const text  = document.getElementById('wsbText');
    const emoji = document.getElementById('mascotEmoji');
    if (!popup || !text || !emoji) return;

    popup.classList.remove('good', 'bad', 'show');
    text.textContent = isCorrect
        ? WSB_GOOD[Math.floor(Math.random() * WSB_GOOD.length)]
        : WSB_BAD[Math.floor(Math.random() * WSB_BAD.length)];
    emoji.src = getRandomEmoji(isCorrect ? 'profit' : 'loss');
    popup.classList.add(isCorrect ? 'good' : 'bad', 'show');

    setTimeout(() => popup.classList.remove('show'), 1200);
}

function getRandomEmoji(type) {
    if (type === 'profit') {
        return [
            'assets/images/mascot/profit/profit1.png',
            'assets/images/mascot/profit/profit2.png',
            'assets/images/mascot/profit/profit3.png',
            'assets/images/mascot/profit/profit4.png',
        ][Math.floor(Math.random() * 4)];
    }
    return [
        'assets/images/mascot/loss/loss1.png',
        'assets/images/mascot/loss/loss2.png',
        'assets/images/mascot/loss/loss3.png',
    ][Math.floor(Math.random() * 3)];
}


/* -----------------------------------------
   12. BOOT
----------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
    const display = document.getElementById('usernameDisplay');
    if (display) display.textContent = 'Player: ' + username;
    loadFocusBlock();
});