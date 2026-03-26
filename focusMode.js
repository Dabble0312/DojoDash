console.log("Focus Mode JS is running");

// supabase client is declared in supabase.js — loaded before this file in focus.html

// =========================
// CONFIGURATION
// =========================
const MAX_REVEALS_PER_BURST = 7;   // hard cap — dropdown cannot exceed this

// Reads the dropdown value at the moment it's needed, so the player
// can change it between rounds without reloading anything.
function getRevealCount() {
    const el = document.getElementById('revealCount');
    if (!el) return 4;   // safe fallback
    const val = parseInt(el.value);
    if (isNaN(val) || val < 1) return 1;
    if (val > MAX_REVEALS_PER_BURST) return MAX_REVEALS_PER_BURST;
    return val;
}
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
        showCandleInfo(null);
        showPriceFeedback("");
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

    // ── Candle click handler
    // When the user clicks a candle, find the matching candle object
    // by date and update the stats panel with that candle's tags.
    chart.subscribeCrosshairMove((param) => {
        // Only fire on actual clicks, not just hover
    });

    chart.subscribeClick((param) => {
        if (!param || !param.time) return;

        // param.time is "YYYY-MM-DD" — find matching candle in visible data
        const clickedDate = param.time;
        const allVisible  = [...allCandles, ...revealedSoFar];
        const matched     = allVisible.find(c => c.date.slice(0, 10) === clickedDate);

        if (!matched) return;

        // Update the stats panel with the clicked candle's tags
        updateStatsPanel(matched);

        // Show OHLC in the dedicated candle info panel — stays until next click
        showCandleInfo(matched);

        // If summary panel is open, refresh it for the newly clicked candle
        refreshSummaryIfOpen(matched);
    });
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
    const maxThisBurst = getRevealCount();

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

    // Store prediction — scoring happens when the LAST candle of the
    // next burst is revealed, not the first.
    // burstEndIndex = the index of the last candle that will be revealed
    // in the upcoming burst (capped at the end of futureCandles).
    const burstEndIndex = Math.min(
        revealIndex + getRevealCount() - 1,
        futureCandles.length - 1
    );

    // Capture the close price of the candle currently at the right edge
    // of the chart — this is the baseline for direction comparison.
    const baselineClose = revealedSoFar.length > 0
        ? revealedSoFar[revealedSoFar.length - 1].close
        : allCandles[allCandles.length - 1].close;

    pendingPrediction = {
        guess:        guess,
        targetPrice:  targetValue,
        candleIndex:  burstEndIndex,   // score on the LAST candle of the burst
        baseClose:    baselineClose,   // compare direction against THIS price
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

    const { guess, targetPrice, candleIndex, baseClose } = pendingPrediction;
    pendingPrediction = null;
    guessCount++;

    // predictedCandle is the LAST candle of the reveal burst
    const predictedCandle = futureCandles[candleIndex];

    // Direction: compare the last revealed candle's close against
    // the baseline close captured just before the guess was made
    const priceWentUp = predictedCandle.close > baseClose;
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

    // Clear only the status line after a pause — price feedback stays
    setTimeout(() => {
        showStatus("");
    }, 2000);
}

/* -----------------------------------------
   6c. PRICE FEEDBACK DISPLAY
   Stays visible until next prediction fires.
   Cleared only on new block load.
----------------------------------------- */
function showPriceFeedback(msg) {
    const el = document.getElementById('priceFeedback');
    if (el) el.textContent = msg;
}

/* -----------------------------------------
   6d. CANDLE INFO PANEL
   Shows OHLC of the clicked candle.
   Stays visible until the user clicks another candle.
   Pass null to clear (new block load).
----------------------------------------- */
function showCandleInfo(candle) {
    const el = document.getElementById('candleInfo');
    if (!el) return;

    if (!candle) {
        el.innerHTML = '<span class="candle-info-empty">Click any candle to inspect</span>';
        return;
    }

    const dir      = candle.bullish === 1 ? '▲' : '▼';
    const dirColor = candle.bullish === 1 ? '#10b981' : '#ef4444';

    el.innerHTML =
        `<span class="candle-info-date">${candle.date.slice(0, 10)}</span>` +
        `<span class="candle-info-dir" style="color:${dirColor}">${dir}</span>` +
        `<span class="candle-info-item"><span class="candle-info-label">O</span>₹${candle.open.toFixed(2)}</span>` +
        `<span class="candle-info-item"><span class="candle-info-label">H</span>₹${candle.high.toFixed(2)}</span>` +
        `<span class="candle-info-item"><span class="candle-info-label">L</span>₹${candle.low.toFixed(2)}</span>` +
        `<span class="candle-info-item"><span class="candle-info-label">C</span><strong>₹${candle.close.toFixed(2)}</strong></span>`;
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

function updateStatsPanel(candle) {
    // If a candle is passed (e.g. from a click), use it.
    // Otherwise fall back to the most recently revealed candle.
    const last = candle !== undefined
        ? candle
        : (revealedSoFar.length > 0
            ? revealedSoFar[revealedSoFar.length - 1]
            : allCandles[allCandles.length - 1]);

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
   11b. SUMMARY ENGINE v2
   Natural language descriptions of a candle.
   Called on demand via toggleSummary().

   Layers:
     mapIdentity()   — what kind of candle is this?
     mapAtmosphere() — what is the broader market doing?
     mapConviction() — how much force and size is behind this move?
     mapEnergy()     — is this move fresh or running on fumes?
----------------------------------------- */


/* -----------------------------------------
   IDENTITY
   What kind of candle is this, and what does it suggest?
----------------------------------------- */
function mapIdentity(candle) {

    if (candle.inside_bar === 1)
        return "The market paused today, forming an inside bar — a candle that fits entirely within the previous one. This signals compression, where neither buyers nor sellers are willing to push further. Watch closely, because the market is coiling before its next move.";

    if (candle.outside_bar === 1)
        return "Today expanded the battlefield with an outside bar, swallowing the entire range of the previous candle. This shows the market is agitated and indecisive at a larger scale — a resolution is coming, but the direction is not yet decided.";

    if (candle.engulfing_soft === 1 && candle.bullish === 1)
        return "This candle quietly engulfed the previous one to the upside, hinting at a shift in control toward the buyers. It is not a dramatic takeover, but it suggests the sellers are losing their grip.";

    if (candle.engulfing_soft === 1 && candle.bearish === 1)
        return "This candle quietly engulfed the previous one to the downside, hinting at a shift in control toward the sellers. It is not a dramatic takeover, but it suggests the buyers are losing their grip.";

    if (candle.candle_strength === "strong" && candle.bullish === 1)
        return "Today was a decisive win for the buyers. Price closed much higher than it opened, leaving little room for doubt. When a candle this strong appears, it tells you that buyers were not just present — they were in full control from open to close.";

    if (candle.candle_strength === "strong" && candle.bearish === 1)
        return "Sellers dominated today, pushing price sharply lower with conviction. The large body tells you there was no meaningful fight from the buyers — the bears were in control all day. This kind of candle often signals that the path of least resistance is downward.";

    if (candle.candle_strength === "weak" && candle.body_ratio < 0.20)
        return "Neither side won today. The candle barely moved from where it opened, meaning buyers and sellers ended in a stalemate. On its own this tells you little, but after a strong move it can be an early warning that momentum is fading.";

    if (candle.candle_strength === "medium" && candle.bullish === 1)
        return "Buyers nudged the price higher today with moderate force. This is not a statement candle — it is a continuation nudge. By itself it is unremarkable, but in a sequence of similar candles it builds a case for steady buying pressure.";

    if (candle.candle_strength === "medium" && candle.bearish === 1)
        return "Sellers had the edge today, closing price below the open with moderate force. Not a dramatic move, but a quiet lean in the bears' favour. In a downtrend this is normal; in an uptrend it is worth watching.";

    // fallback
    return "This candle did not fit a clear structural pattern today, suggesting a quiet session with no strong commitment from either side.";
}


/* -----------------------------------------
   ATMOSPHERE
   Where is the market, and is it calm or nervous?
----------------------------------------- */
function mapAtmosphere(candle) {
    const trend = candle.trend_tag;
    const vol   = candle.volatility_tag;

    let trendSentence = "";
    if (trend === "uptrend")
        trendSentence = "The broader market is on an upward path — the average price has been rising, which means the general tide is in the buyers' favour.";
    else if (trend === "downtrend")
        trendSentence = "The broader market is stepping downward — the average price has been declining, which means sellers have had the upper hand over recent sessions.";
    else
        trendSentence = "The market is moving sideways without a clear directional bias. In this environment, moves in either direction are less trustworthy until a clearer trend emerges.";

    let volSentence = "";
    if (vol === "high_volatility")
        volSentence = " On top of that, the market is in an agitated state right now — candles are larger than normal, meaning price is swinging more than usual. In high volatility, moves can be sharp and fast but also unreliable.";
    else if (vol === "low_volatility")
        volSentence = " The market feels calm right now — candles have been smaller than usual and price is moving in a contained way. Low volatility often precedes a breakout, so calm periods are worth paying attention to.";
    else
        volSentence = " Volatility is normal right now — price is moving at a typical pace, neither unusually calm nor unusually agitated.";

    return trendSentence + volSentence;
}


/* -----------------------------------------
   CONVICTION
   How much force and size is behind this move?
   Covers volume, wick pressure, and candle size vs norm.
----------------------------------------- */
function mapConviction(candle) {
    let parts = [];

    // Volume context
    if (candle.volume_tag === "volume_spike" && candle.bullish === 1)
        parts.push("This move came with a surge in volume — the market is shouting its approval. High volume on a bullish candle means more participants were buying, which adds real weight to the move.");
    else if (candle.volume_tag === "volume_spike" && candle.bearish === 1)
        parts.push("Sellers acted with force today, backed by a surge in volume. Heavy selling volume is a meaningful signal — it means this was not a casual decline but a deliberate one.");
    else if (candle.volume_tag === "volume_drop" && candle.bullish === 1)
        parts.push("The price rose today, but the market was only whispering. Low volume on a bullish candle is a caution sign — when fewer participants show up to push price higher, the move may not have the legs to continue.");
    else if (candle.volume_tag === "volume_drop" && candle.bearish === 1)
        parts.push("Price declined today, but without much energy behind it. Low volume selling is less threatening than it looks — it may simply mean buyers stepped aside rather than sellers actively pushing.");
    else
        parts.push("Volume was normal today — neither unusually heavy nor unusually thin, suggesting no special conviction behind the move.");

    // Wick pressure
    if (candle.upper_wick_ratio > 0.6)
        parts.push("The long upper wick is a tell — price tried to go higher but was pushed back down by sellers before the close. That rejection is a warning that the bulls could not hold those higher levels.");
    else if (candle.lower_wick_ratio > 0.6)
        parts.push("The long lower wick shows buyers stepped in aggressively. Price was pushed down at some point during the session, but buyers refused to let it stay there and drove it back up. That kind of demand is meaningful.");

    // Volatility size context (is this candle normal-sized or unusual?)
    if (candle.volatility_tag === "high_volatility")
        parts.push("This candle is larger than the market's historical average, which means what you are seeing is not typical behaviour. Unusually large candles can mark turning points or accelerations — either way, they deserve extra attention.");
    else if (candle.volatility_tag === "low_volatility")
        parts.push("This candle is smaller than the market's historical average. A quiet candle in a normally active market can mean the move is losing steam, or that the market is pausing before the next leg.");

    return parts.join(" ");
}


/* -----------------------------------------
   ENERGY
   Is this move fresh or running on fumes?
   Based on RSI momentum_tag.
----------------------------------------- */
function mapEnergy(candle) {
    const momentum = candle.momentum_tag;
    const bullish  = candle.bullish === 1;
    const bearish  = candle.bearish === 1;

    if (momentum === "bullish_momentum" && bullish)
        return "The energy behind this move is fresh — momentum is on the buyers' side and has not yet reached extreme levels. This is often the most comfortable environment for a trend to continue.";

    if (momentum === "bullish_momentum" && bearish)
        return "Here is an interesting tension: the candle closed lower, but underlying momentum is still leaning bullish. This could be a brief pullback within a broader buying environment, rather than a true reversal. Worth watching the next candle before drawing conclusions.";

    if (momentum === "bearish_momentum" && bearish)
        return "The energy behind this decline is fresh — momentum is on the sellers' side and has not yet reached extreme levels. This is the kind of environment where downtrends tend to persist.";

    if (momentum === "bearish_momentum" && bullish)
        return "Here is an interesting tension: the candle closed higher, but underlying momentum is still leaning bearish. This could be a relief bounce in a broader selling environment — not necessarily the start of a recovery. Caution is warranted.";

    if (momentum === "neutral_momentum" && bullish)
        return "Momentum is balanced right now — neither overbought nor oversold. A bullish candle from a neutral momentum position is a healthy sign, suggesting the move is not yet stretched or exhausted.";

    if (momentum === "neutral_momentum" && bearish)
        return "Momentum is balanced right now — neither overbought nor oversold. A bearish candle from a neutral momentum position means there is room for further decline if sellers stay in control.";

    // fallback for doji / neutral body
    if (momentum === "neutral_momentum")
        return "Momentum is sitting in neutral territory — no strong signal in either direction. This reinforces the indecisive nature of today's candle.";

    return "";
}


/* -----------------------------------------
   SUMMARIZE
   Assembles all four layers into one paragraph.
----------------------------------------- */
function summarize(candle) {
    const identity    = mapIdentity(candle);
    const atmosphere  = mapAtmosphere(candle);
    const conviction  = mapConviction(candle);
    const energy      = mapEnergy(candle);

    return [identity, atmosphere, conviction, energy]
        .filter(s => s && s.trim().length > 0)
        .join(" ");
}

/* -----------------------------------------
   11c. SUMMARY PANEL TOGGLE
   The summary box is hidden by default.
   Clicking the info icon next to the stats
   panel shows/hides it and fills it with
   the summary for the currently displayed candle.
----------------------------------------- */
function toggleSummary() {
    const panel = document.getElementById('summaryPanel');
    if (!panel) return;

    const isHidden = panel.classList.contains('hidden');

    if (isHidden) {
        // Find which candle is currently shown in the stats panel
        // (either clicked candle or last revealed)
        const candle = revealedSoFar.length > 0
            ? revealedSoFar[revealedSoFar.length - 1]
            : allCandles[allCandles.length - 1];

        if (!candle) return;

        const text = document.getElementById('summaryText');
        if (text) text.textContent = summarize(candle);
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

// Called from showCandleInfo so the summary updates
// automatically if the panel is already open
function refreshSummaryIfOpen(candle) {
    const panel = document.getElementById('summaryPanel');
    if (!panel || panel.classList.contains('hidden')) return;
    const text = document.getElementById('summaryText');
    if (text && candle) text.textContent = summarize(candle);
}



/* -----------------------------------------
   12: PATTERN EXPLAINER ENGINE (From whatwherewhy4.py)
----------------------------------------- */
const PatternExplainer = {
    summarize: function(pattern, candles) {
        const A = this.semanticLayer(pattern);
        const B = this.contextualLayer(pattern, candles);
        const C = this.catalystLayer(pattern, candles);
        const D = this.priceActionLayer(pattern, candles);

        return {
            label: pattern.label,
            full_summary: `${A} ${B} ${C} ${D}`
        };
    },

    semanticLayer: (p) => {
        const length = p.metadata?.absolute_length || p.indices.length;
        const defs = {
            "Compression": `A ${length}-candle compression where price contracts and volatility dries up.`,
            "Momentum Burst": `A ${length}-candle momentum burst showing strong directional pressure.`,
            "Failed Breakout": "A failed breakout where price pushed above resistance but could not hold.",
            "Failed Breakdown": "A failed breakdown where price dipped below support but snapped back.",
            "Spring": "A spring pattern — a sharp shakeout below support followed by a strong recovery.",
            "Engulfing Flip": "An engulfing flip — a decisive candle that swallows the prior range."
        };
        return defs[p.label] || `A ${p.label} pattern.`;
    },

    contextualLayer: (p, candles) => {
        const last = candles[p.indices[p.indices.length - 1]];
        const trend = last.trend_tag || "sideways";
        const vol = last.volatility_tag || "normal";
        return `This occurred during a ${trend} with ${vol.replace('_', ' ')} volatility.`;
    },

    catalystLayer: (p, candles) => {
        const seq = p.indices.map(i => candles[i]);
        const hasSpike = seq.some(c => c.volume_tag === "volume_spike");
        const avgBody = seq.reduce((acc, c) => acc + (c.body_ratio || 0), 0) / seq.length;
        
        const volText = hasSpike ? "The move was confirmed by strong volume." : "Volume was normal.";
        const bodyText = avgBody > 0.5 ? "Candle bodies showed high conviction." : "Bodies showed moderate force.";
        return `${volText} ${bodyText}`;
    },

    priceActionLayer: (p, candles) => {
        const seq = p.indices.map(i => candles[i]);
        const first = seq[0];
        const last = seq[seq.length - 1];
        const direction = last.close > first.open ? "rose" : "fell";
        return `Price ${direction} from ₹${first.open.toFixed(2)} to ₹${last.close.toFixed(2)}.`;
    }
};

/* -----------------------------------------
   NEW: GUIDED TOUR STATE & HIGHLIGHTING
----------------------------------------- */
let currentPatternIdx = 0;
let detectedPatterns = []; 
let highlightSeries = null;

// Call this once your data is loaded from Supabase
function initializePatterns(blockData) {
    detectedPatterns = blockData.detected_patterns || [];
    currentPatternIdx = 0;
}

function togglePatternHighlighting() {
    const isShowing = !!highlightSeries;
    if (isShowing) {
        chart.removeSeries(highlightSeries);
        highlightSeries = null;
    } else {
        showAllPatterns();
    }
}

function showAllPatterns() {
    if (highlightSeries) chart.removeSeries(highlightSeries);
    
    highlightSeries = chart.addHistogramSeries({
        color: 'rgba(33, 150, 243, 0.15)',
        priceFormat: { type: 'volume' },
        priceScaleId: 'overlay',
    });

    const highlightData = [];
    detectedPatterns.forEach(p => {
        p.indices.forEach(idx => {
            if (allCandles[idx]) {
                highlightData.push({ time: allCandles[idx].time, value: 999999 });
            }
        });
    });
    highlightSeries.setData(highlightData);
}

function explainCurrentPattern() {
    if (detectedPatterns.length === 0) return;
    
    const p = detectedPatterns[currentPatternIdx];
    const explanation = PatternExplainer.summarize(p, allCandles);
    
    // Update your UI elements (Ensure these IDs exist in your HTML)
    const titleEl = document.getElementById('patternTitle');
    const descEl = document.getElementById('patternDescription');
    const panel = document.getElementById('patternExplainPanel');
    
    if (titleEl) titleEl.textContent = `${p.label} (${currentPatternIdx + 1}/${detectedPatterns.length})`;
    if (descEl) descEl.textContent = explanation.full_summary;
    if (panel) panel.classList.remove('hidden');

    // Focus chart on the pattern
    chart.timeScale().scrollToPosition(p.indices[0], true);
}

function nextPattern() {
    if (currentPatternIdx < detectedPatterns.length - 1) {
        currentPatternIdx++;
        explainCurrentPattern();
    }
}

function prevPattern() {
    if (currentPatternIdx > 0) {
        currentPatternIdx--;
        explainCurrentPattern();
    }
}
/* -----------------------------------------
   12. BOOT
----------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
    const display = document.getElementById('usernameDisplay');
    if (display) display.textContent = 'Player: ' + username;
    loadFocusBlock();
});