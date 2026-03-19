console.log("JS is running");

let roundCount = 0;
let correctCount = 0;
let wrongCount = 0;
const MAX_ROUNDS = 10;

let visibleCandles = [];
let futureCandles = [];
let gameActive = true;
let chart;
let candlestickSeries;


// =========================
// 1. WSB REACTIONSS
// =========================
const WSB_GOOD = [
    "🚀 Nice call, you absolute legend.",
    "💎🙌 Diamond hands detected.",
    "📈 You’re cooking, chef.",
    "🔥 Certified candle whisperer.",
    "🧠 Big brain energy."
];

const WSB_BAD = [
    "🤡 That candle clowned you.",
    "🩸 Paper hands spotted.",
    "📉 Should’ve stayed in school.",
    "💀 Market just slapped you.",
    "🙈 Bruh… not like this."
];

// ⭐ Username + streak setup
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
   2. RANDOM BLOCK LOADER (UPDATED)
----------------------------------------- */
function loadRandomBlock() {
   const blocks = [
    "window_20170403_0000.json",
    "window_20170405_0000.json",
    "window_20170406_0000.json",
    "window_20170407_0000.json",
    "window_20170410_0000.json",
    "window_20170412_0000.json",
    "window_20170413_0000.json",
    "window_20170417_0000.json",
    "window_20170418_0000.json",
    "window_20170419_0000.json",
    "window_20170420_0000.json",
    "window_20170421_0000.json",
    "window_20170424_0000.json",
    "window_20170425_0000.json",
    "window_20170426_0000.json",
    "window_20170427_0000.json",
    "window_20170428_0000.json",
    "window_20170502_0000.json",
    "window_20170503_0000.json",
    "window_20170504_0000.json"
];

    const randomBlock = blocks[Math.floor(Math.random() * blocks.length)];
    console.log("Loading block:", randomBlock);

    fetch(`./data/${randomBlock}`)
        .then(response => response.json())
        .then(block => {

            // ⭐ NEW STRUCTURE
            visibleCandles = block.candles;   // 30 candles
            futureCandles  = block.future;    // 3 candles

            console.log("Loaded block:", block.id);
            console.log("Visible candles:", visibleCandles.length);
            console.log("Future candles:", futureCandles.length);

            resetChart();
            initChart();
            setupButtons();
            gameActive = true;
        })
        .catch(error => console.error('Error loading block:', error));
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

    const chartOptions = {
        layout: {
            textColor: '#000',
            backgroundColor: '#fff',
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        },
    };

    chart = window.LightweightCharts.createChart(chartDiv, chartOptions);

    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        borderVisible: true,
        wickVisible: true,
    });

    // ⭐ NEW: map all 30 visible candles
    const visibleDataWithTime = visibleCandles.map((candle, index) => ({
        time: index + 1,   // 1 → 30
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
    }));

    candlestickSeries.setData(visibleDataWithTime);

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

    // ⭐ FIXED: compare last visible to FIRST future candle
    const lastVisibleClose = visibleCandles[visibleCandles.length - 1].c;
    const nextFutureClose  = futureCandles[0].c;

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

    setTimeout(() => {
        loadRandomBlock();
    }, 1500);
}

/* -----------------------------------------
   7. APPEND FUTURE CANDLES
----------------------------------------- */
function appendFutureCandles() {
    const currentData = candlestickSeries.data();
    const startIndex = visibleCandles.length;   // 30

    const futureData = futureCandles.map((candle, index) => ({
        time: startIndex + index + 1,   // 31, 32, 33
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
    }));

    const allData = currentData.concat(futureData);
    candlestickSeries.setData(allData);
    chart.timeScale().fitContent();
}

/* -----------------------------------------
   8. Message Pop-Up of the answer 
----------------------------------------- */
function showPopup(result) {
    const popup = document.getElementById("resultPopup");
    const text = document.getElementById("popupResultText");


    popup.classList.remove("correct", "wrong", "hidden", "show");

    if (result === "correct") {
        text.textContent = "Correct!";
        popup.classList.add("correct");
    } else {
        text.textContent = "Wrong!";
        popup.classList.add("wrong");
    }

    popup.classList.add("show");

    // Hide after 1.2 seconds
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

    // Show your report card popup
    showReportCard({
        correct: correctCount,
        wrong: wrongCount,
        accuracy: Math.round((correctCount / MAX_ROUNDS) * 100),
        bestStreak: best
    });

    // Reset for next run
    roundCount = 0;
    correctCount = 0;
    wrongCount = 0;
    streak = 0;
}

function showReportCard(stats) {
    const endScreen = document.getElementById("endScreen");
    const resultText = endScreen.querySelector("p");

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

    loadRandomBlock(); // start fresh
}
