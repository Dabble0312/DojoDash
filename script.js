



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
   2. RANDOM BLOCK LOADER (SUPABASE VERSION)
----------------------------------------- */
async function loadRandomBlock() {
    console.log("Fetching random level from Supabase...");

    try {
        // This query gets one random row from your 'levels' table
        const { data, error } = await supabase
            .from('levels')
            .select('*')
            .limit(1); 
            // Note: For true randomness, we'll eventually use a custom function, 
            // but this gets you connected immediately.

        if (error) throw error;

        const block = data[0];

        // ⭐ UPDATED REFERENCE: Mapping Supabase columns to your variables
        // Assuming your table columns are named 'candles' and 'future'
        visibleCandles = block.candles;   // This was your JSON array
        futureCandles  = block.future;    // This was your future JSON array

        console.log("Loaded level ID:", block.id);
        
        initChart();
        setupButtons();
        gameActive = true;

    } catch (error) {
        console.error('Supabase Error:', error.message);
        // Fail-safe: You could call a local backup function here
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

    // ⭐ FIX: Cleanly re-initialize chart without double creation
    if (chart) {
        chart.remove();
    }

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
        wickWidth: 5,


    });

    // ⭐ UPDATED KEYS
    const visibleDataWithTime = visibleCandles.map(candle => ({
        time: candle.date,      
        open: candle.open,      
        high: candle.high,      
        low: candle.low,        
        close: candle.close,    
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

    // Resetting onclick to ensure clean handler assignment
    upBtn.onclick = () => handleGuess('up');
    downBtn.onclick = () => handleGuess('down');
}

/* -----------------------------------------
   6. GUESS LOGIC
----------------------------------------- */
function handleGuess(guess) {
    if (!gameActive) return;
    gameActive = false;

    // ⭐ FIXED: Compare last visible close with FIRST future candle close using correct keys
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

    // ⭐ FIX: Reload block after the guess to progress the game loop
setTimeout(async () => {
    await loadRandomBlock();
}, 1500);

/* -----------------------------------------
   7. APPEND FUTURE CANDLES
----------------------------------------- */
function appendFutureCandles() {
    // ⭐ UPDATED KEYS: Reveal future candles with date-based time
    const futureData = futureCandles.map((candle) => ({
        time: candle.date,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
    }));

    // Update the series with new data
    const currentData = candlestickSeries.data();
    const allData = [...currentData, ...futureData];
    candlestickSeries.setData(allData);
    chart.timeScale().fitContent();
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
