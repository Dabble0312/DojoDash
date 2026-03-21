console.log("JS is running");

// supabase client is declared in supabase.js — loaded before this file in game.html

let roundCount = 0;
let correctCount = 0;
let wrongCount = 0;
const MAX_ROUNDS = 10;

let visibleCandles = [];
let futureCandles = [];
let gameActive = true;
let chart;
let candlestickSeries;
let volumeSeries;


// =========================
// 1. WSB REACTIONS
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

// ── Username + streak setup
let username = localStorage.getItem("username") || "Player";
let streak = parseInt(localStorage.getItem(username + "_streak")) || 0;
let best   = parseInt(localStorage.getItem(username + "_best"))   || 0;

function updateStreakDisplay() {
    const el = document.getElementById("streakDisplay");
    if (el) el.textContent = "Streak: " + streak;
}

function updateBestDisplay() {
    const el = document.getElementById("bestDisplay");
    if (el) el.textContent = "Best: " + best;
}

window.addEventListener("DOMContentLoaded", () => {
    const username = localStorage.getItem("username") || "Player";
    const display = document.getElementById("usernameDisplay");
    if (display) display.textContent = "Player: " + username;

    streak = 0;
    localStorage.setItem(username + "_streak", 0);
    updateStreakDisplay();
    updateBestDisplay();
});


/* -----------------------------------------
   2. RANDOM BLOCK LOADER (SUPABASE VERSION)
----------------------------------------- */
async function loadRandomBlock() {
    console.log("Fetching random block from Supabase...");

    try {
        const { data, error } = await supabase
            .from('chart_blocks')
            .select('id, block_id, candles, future, window_start')
            .order('id')
            .limit(1000);

        if (error) throw error;

        if (!data || data.length === 0) {
            console.error('No blocks returned from Supabase. Check RLS policy on chart_blocks.');
            return;
        }

        // Pick a random block from whatever was returned
        const block = data[Math.floor(Math.random() * data.length)];

        if (!block.candles || !block.future) {
            console.error('Block is missing candles or future field:', block);
            return;
        }

        visibleCandles = block.candles;
        futureCandles  = block.future;

        console.log("Loaded block ID:", block.block_id, "| Total available:", data.length);

        initChart();
        setupButtons();
        gameActive = true;

    } catch (err) {
        console.error('Supabase Error:', err.message);
    }
}

/* -----------------------------------------
   3. INITIAL LOAD
----------------------------------------- */
loadRandomBlock();

/* -----------------------------------------
   4. CHART SETUP
----------------------------------------- */
function initChart() {
    const chartDiv = document.getElementById('chart');

    if (chart) {
        chart.remove();
    }

    chart = window.LightweightCharts.createChart(chartDiv, {
        layout: {
            textColor: '#000',
            backgroundColor: '#fff',
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        },
        // Candlestick occupies top 75%, volume lives in the bottom 25%
        rightPriceScale: {
            scaleMargins: { top: 0.05, bottom: 0.25 },
        },
    });

    // ── Candlestick series — uses the default right price scale
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

    // ── Volume histogram — pinned to its own scale in the bottom 25%
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

    const visibleDataWithTime = visibleCandles.map(candle => ({
        time:  candle.date.slice(0, 10),
        open:  candle.open,
        high:  candle.high,
        low:   candle.low,
        close: candle.close,
    }));

    // Color each volume bar green or red based on candle direction
    const volumeDataWithTime = visibleCandles.map(candle => ({
        time:  candle.date.slice(0, 10),
        value: candle.volume,
        color: candle.bullish === 1 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));

    candlestickSeries.setData(visibleDataWithTime);
    volumeSeries.setData(volumeDataWithTime);

    // ── Fix 1: Set visible range to 30 candles + 4 empty bars of buffer on the right
    // The buffer gives the 3 future candles a landing zone — they appear in place
    // rather than pushing the chart and causing a resize
    chart.timeScale().setVisibleLogicalRange({
        from: 0,
        to:   33,   // 30 candles (0-29) + 4 bar buffer (30-33)
    });

    // ── Fix 2: Pre-calculate y-axis from ALL 33 candles (visible + future)
    // Locking this now means the reveal never rescales the y-axis
    const allCandles = [...visibleCandles, ...futureCandles];
    const yMin = Math.min(...allCandles.map(c => c.low))  * 0.995;
    const yMax = Math.max(...allCandles.map(c => c.high)) * 1.005;

    candlestickSeries.applyOptions({
        autoscaleInfoProvider: () => ({
            priceRange: { minValue: yMin, maxValue: yMax },
        }),
    });
}

/* -----------------------------------------
   5. BUTTONS
----------------------------------------- */
function setupButtons() {
    const upBtn = document.getElementById('upBtn');
    const downBtn = document.getElementById('downBtn');

    upBtn.onclick = () => handleGuess('up');
    downBtn.onclick = () => handleGuess('down');
}

/* -----------------------------------------
   6. GUESS LOGIC
   Bug fix #4: closing brace was missing — appendFutureCandles() and
   all functions below were accidentally nested inside handleGuess(),
   making them unreachable. Fixed by closing handleGuess() properly.
----------------------------------------- */
function handleGuess(guess) {
    if (!gameActive) return;
    gameActive = false;

    const lastVisibleClose = visibleCandles[visibleCandles.length - 1].close;
    const nextFutureClose  = futureCandles[0].close;

    const priceWentUp = nextFutureClose > lastVisibleClose;
    const correct = (guess === 'up' && priceWentUp) || (guess === 'down' && !priceWentUp);

    if (correct) {
        correctCount++;
        streak++;
        if (streak > best) {
            best = streak;
            localStorage.setItem(username + "_best", best);
            updateBestDisplay();
        }
        localStorage.setItem(username + "_streak", streak);
        updateStreakDisplay();
        showPopup("correct");
        showWSBPopup(true);
    } else {
        wrongCount++;
        streak = 0;
        localStorage.setItem(username + "_streak", 0);
        updateStreakDisplay();
        showPopup("wrong");
        showWSBPopup(false);
    }

    appendFutureCandles();
    flashAndGlow();

    roundCount++;

    if (roundCount >= MAX_ROUNDS) {
        setTimeout(() => {
            endRun();
        }, 1500);
        return;
    }

    setTimeout(async () => {
        await loadRandomBlock();
    }, 1500);
}   // ← this closing brace was missing — everything below was broken

/* -----------------------------------------
   7. APPEND FUTURE CANDLES
----------------------------------------- */
function appendFutureCandles() {
    // ── Candle data: visible + future combined
    const currentCandles = visibleCandles.map((candle) => ({
        time:  candle.date.slice(0, 10),
        open:  candle.open,
        high:  candle.high,
        low:   candle.low,
        close: candle.close,
    }));
    const futureCandle = futureCandles.map((candle) => ({
        time:  candle.date.slice(0, 10),
        open:  candle.open,
        high:  candle.high,
        low:   candle.low,
        close: candle.close,
    }));
    candlestickSeries.setData([...currentCandles, ...futureCandle]);

    // ── Volume data: visible + future combined
    const currentVolume = visibleCandles.map((candle) => ({
        time:  candle.date.slice(0, 10),
        value: candle.volume,
        color: candle.bullish === 1 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));
    const futureVolume = futureCandles.map((candle) => ({
        time:  candle.date.slice(0, 10),
        value: candle.volume,
        color: candle.bullish === 1 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));
    volumeSeries.setData([...currentVolume, ...futureVolume]);

    // No fitContent() here — keeping the viewport locked so reveal is smooth
}

/* -----------------------------------------
   8. Message Pop-Up
----------------------------------------- */
function showPopup(result) {
    const popup = document.getElementById("resultPopup");
    const text = document.getElementById("popupResultText");
    if (!popup || !text) return;

    popup.classList.remove("correct", "wrong", "hidden", "show");

    if (result === "correct") {
        text.textContent = "Correct!";
        popup.classList.add("correct");
    } else {
        text.textContent = "Wrong!";
        popup.classList.add("wrong");
    }

    popup.classList.add("show");

    setTimeout(() => {
        popup.classList.remove("show");
        setTimeout(() => popup.classList.add("hidden"), 400);
    }, 1200);
}

/* -----------------------------------------
   9. Flash Animation
----------------------------------------- */
function flashAndGlow() {
    const chartDiv = document.getElementById("chart");
    if (!chartDiv) return;
    chartDiv.classList.add("flash-candles");
    setTimeout(() => {
        chartDiv.classList.remove("flash-candles");
    }, 800);
}

/* -----------------------------------------
   10. WSB Lingo
----------------------------------------- */
function showWSBPopup(isCorrect) {
    const popup = document.getElementById("wsbPopup");
    const text = document.getElementById("wsbText");
    const emoji = document.getElementById("mascotEmoji");
    if (!popup || !text || !emoji) return;

    popup.classList.remove("good", "bad", "show");

    if (isCorrect) {
        text.textContent = WSB_GOOD[Math.floor(Math.random() * WSB_GOOD.length)];
        emoji.src = getRandomEmoji("profit");
        popup.classList.add("good");
    } else {
        text.textContent = WSB_BAD[Math.floor(Math.random() * WSB_BAD.length)];
        emoji.src = getRandomEmoji("loss");
        popup.classList.add("bad");
    }

    popup.classList.add("show");
    setTimeout(() => {
        popup.classList.remove("show");
    }, 1200);
}

function getRandomEmoji(type) {
    if (type === "profit") {
        const profitEmojis = [
            "assets/images/mascot/profit/profit1.png",
            "assets/images/mascot/profit/profit2.png",
            "assets/images/mascot/profit/profit3.png",
            "assets/images/mascot/profit/profit4.png"
        ];
        return profitEmojis[Math.floor(Math.random() * profitEmojis.length)];
    }
    const lossEmojis = [
        "assets/images/mascot/loss/loss1.png",
        "assets/images/mascot/loss/loss2.png",
        "assets/images/mascot/loss/loss3.png"
    ];
    return lossEmojis[Math.floor(Math.random() * lossEmojis.length)];
}

function endRun() {
    gameActive = false;
    showReportCard({
        correct: correctCount,
        wrong: wrongCount,
        accuracy: Math.round((correctCount / MAX_ROUNDS) * 100),
        bestStreak: best
    });
    roundCount = 0;
    correctCount = 0;
    wrongCount = 0;
    streak = 0;
}

function showReportCard(stats) {
    const endScreen = document.getElementById("endScreen");
    const resultText = endScreen.querySelector("p");
    if (!endScreen || !resultText) return;

    resultText.innerHTML = `You got <strong>${stats.correct}</strong> out of <strong>${MAX_ROUNDS}</strong> predictions correct.<br>Accuracy: <strong>${stats.accuracy}%</strong>`;
    endScreen.classList.remove("hidden");

    document.getElementById("playAgainBtn").onclick = () => {
        endScreen.classList.add("hidden");
        startNewRun();
    };

    document.getElementById("homeBtn").onclick = () => {
        window.location.href = "index.html";
    };
}

function startNewRun() {
    roundCount = 0;
    correctCount = 0;
    wrongCount = 0;
    streak = 0;
    localStorage.setItem(username + "_streak", 0);
    updateStreakDisplay();
    gameActive = true;
    loadRandomBlock();
}