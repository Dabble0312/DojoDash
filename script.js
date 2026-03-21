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
   2. RANDOM BLOCK LOADER
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
            rightOffset: 4,      // reserves 4 bar-widths on the right for the reveal
        },
        rightPriceScale: {
            scaleMargins: { top: 0.05, bottom: 0.25 },
        },
    });

    // ── Candlestick series
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

    // ── Volume histogram — occupies bottom 25% via scaleMargins
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

    // ── Candle data
    const visibleDataWithTime = visibleCandles.map(candle => ({
        time:  candle.date.slice(0, 10),
        open:  candle.open,
        high:  candle.high,
        low:   candle.low,
        close: candle.close,
    }));

    // ── Volume data — colored by direction
    const volumeDataWithTime = visibleCandles.map(candle => ({
        time:  candle.date.slice(0, 10),
        value: candle.volume,
        color: candle.bullish === 1 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));

    candlestickSeries.setData(visibleDataWithTime);
    volumeSeries.setData(volumeDataWithTime);

    // ── Lock y-axis using all 33 candles so reveal never causes a rescale
    const allCandles = [...visibleCandles, ...futureCandles];
    const yMin = Math.min(...allCandles.map(c => c.low))  * 0.995;
    const yMax = Math.max(...allCandles.map(c => c.high)) * 1.005;

    candlestickSeries.applyOptions({
        autoscaleInfoProvider: () => ({
            priceRange: { minValue: yMin, maxValue: yMax },
        }),
    });

    // fitContent sizes the bars to fill the chart width.
    // rightOffset then naturally reserves 4 empty bars on the right.
    // No other viewport manipulation needed.
    chart.timeScale().fitContent();
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
        setTimeout(() => { endRun(); }, 1500);
        return;
    }

    setTimeout(async () => { await loadRandomBlock(); }, 2800);
}

/* -----------------------------------------
   7. APPEND FUTURE CANDLES — one by one with delay
   Each future candle is revealed 600ms apart, simulating a live chart.
   Candles and volume bars appear together per bar.
----------------------------------------- */
function appendFutureCandles() {
    // Build the base visible data once — same for all three reveals
    const baseCandles = visibleCandles.map(c => ({
        time:  c.date.slice(0, 10),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
    }));
    const baseVolume = visibleCandles.map(c => ({
        time:  c.date.slice(0, 10),
        value: c.volume,
        color: c.bullish === 1 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));

    // Reveal each future candle one at a time, 600ms apart
    futureCandles.forEach((candle, i) => {
        setTimeout(() => {
            // Add candles revealed so far (0→1, then 0→2, then 0→3)
            const revealedCandles = futureCandles.slice(0, i + 1).map(c => ({
                time:  c.date.slice(0, 10),
                open:  c.open,
                high:  c.high,
                low:   c.low,
                close: c.close,
            }));
            const revealedVolume = futureCandles.slice(0, i + 1).map(c => ({
                time:  c.date.slice(0, 10),
                value: c.volume,
                color: c.bullish === 1 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
            }));

            candlestickSeries.setData([...baseCandles, ...revealedCandles]);
            volumeSeries.setData([...baseVolume, ...revealedVolume]);

        }, i * 600);   // 0ms, 600ms, 1200ms
    });
}

/* -----------------------------------------
   8. POPUP
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
   9. FLASH ANIMATION
----------------------------------------- */
function flashAndGlow() {
    const chartDiv = document.getElementById("chart");
    if (!chartDiv) return;
    chartDiv.classList.add("flash-candles");
    setTimeout(() => { chartDiv.classList.remove("flash-candles"); }, 800);
}

/* -----------------------------------------
   10. WSB LINGO
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
    setTimeout(() => { popup.classList.remove("show"); }, 1200);
}

function getRandomEmoji(type) {
    if (type === "profit") {
        return [
            "assets/images/mascot/profit/profit1.png",
            "assets/images/mascot/profit/profit2.png",
            "assets/images/mascot/profit/profit3.png",
            "assets/images/mascot/profit/profit4.png"
        ][Math.floor(Math.random() * 4)];
    }
    return [
        "assets/images/mascot/loss/loss1.png",
        "assets/images/mascot/loss/loss2.png",
        "assets/images/mascot/loss/loss3.png"
    ][Math.floor(Math.random() * 3)];
}

/* -----------------------------------------
   11. END RUN
----------------------------------------- */
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