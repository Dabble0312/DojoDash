console.log("JS is running");



let visibleCandles = [];
let futureCandles = [];
let gameActive = true;
let chart;
let candlestickSeries;


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

    updateStreakDisplay();
    updateBestDisplay();
});
/* -----------------------------------------
   1. RANDOM BLOCK LOADER
----------------------------------------- */
function loadRandomBlock() {
    const blocks = [
        "block1.json",
        "block2.json",
        "block3.json",
        "block4.json",
        "block5.json",
        "block6.json",
        "block7.json",
        "block8.json",
        "block9.json",
        "block10.json",
        // add all your blocks here
    ];

    const randomBlock = blocks[Math.floor(Math.random() * blocks.length)];
    console.log("Loading block:", randomBlock);

    fetch(`./data/${randomBlock}`)
        .then(response => response.json())
        .then(data => {
            const allCandles = data.candles;
            visibleCandles = allCandles.slice(0, 10);
            futureCandles = allCandles.slice(10, 13);

            resetChart();
            initChart();
            setupButtons();
            gameActive = true;
        })
        .catch(error => console.error('Error loading block:', error));
}

/* -----------------------------------------
   2. RESET CHART BEFORE NEW ROUND
----------------------------------------- */
function resetChart() {
    const chartDiv = document.getElementById('chart');
    chartDiv.innerHTML = ""; // clears old chart
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
    chartDiv.style.height = '400px';

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

  const visibleDataWithTime = visibleCandles.map((candle, index) => ({
    time: index + 1,   // 1 through 10
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
}))
    candlestickSeries.setData(visibleDataWithTime);
    // temporarily no hollow logic
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

    const lastVisibleClose = visibleCandles[visibleCandles.length - 1].c;
    const lastFutureClose = futureCandles[futureCandles.length - 1].c;

    const priceWentUp = lastFutureClose > lastVisibleClose;

    if ((guess === 'up' && priceWentUp) || (guess === 'down' && !priceWentUp)) {
    // Correct guess
    streak++;
    localStorage.setItem(username + "_streak", streak);
    updateStreakDisplay();
    showPopup("correct");
} else {
    // Wrong guess
    streak = 0;
    localStorage.setItem(username + "_streak", streak);
    updateStreakDisplay();
    showPopup("wrong");
}
  

    appendFutureCandles();
    flashAndGlow();

    // Load next block after animation
    setTimeout(() => {
        loadRandomBlock();
    }, 1500);
}

/* -----------------------------------------
   7. APPEND FUTURE CANDLES
----------------------------------------- */
function appendFutureCandles() {
    const currentData = candlestickSeries.data();
    const start = Math.floor(Date.now() / 1000);
    const startIndex = visibleCandles.length;

    const futureData = futureCandles.map((candle, index) => ({
        time: start + (startIndex + index) * 60,
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
    const text = document.getElementById("resultText");

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

function updateStreakDisplay() {
    const streakEl = document.getElementById("streakDisplay");
    if (streakEl) streakEl.textContent = "Streak: " + streak;
}