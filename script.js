console.log("JS is running");

let visibleCandles = [];
let futureCandles = [];
let gameActive = true;
let chart;
let candlestickSeries;

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

    const start = Math.floor(Date.now() / 1000);
    const visibleDataWithTime = visibleCandles.map((candle, index) => ({
        time: start + index * 60,
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
    }));

    candlestickSeries.setData(visibleDataWithTime);
    applyHollowCandleLogic(visibleDataWithTime); // now exists again
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
        showPopup("correct");
    } else {
       showPopup("wrong");
    }

    appendFutureCandles();

    // Load next block after animation
    setTimeout(() => {
        loadRandomBlock();
    }, 1500);
}

/* -----------------------------------------
   7. APPEND FUTURE CANDLES
----------------------------------------- */
function appendFutureCandles() {
    const start = Math.floor(Date.now() / 1000);
    const startIndex = visibleCandles.length;

    futureCandles.forEach((candle, index) => {
        const newCandle = {
            time: start + (startIndex + index) * 60,
            open: candle.o,
            high: candle.h,
            low: candle.l,
            close: candle.c,
        };

        // Build a prevCandle in the same shape (with .open/.close)
        let prevCandle;
        if (index === 0) {
            const lastVisible = visibleCandles[visibleCandles.length - 1];
            prevCandle = {
                open: lastVisible.o,
                close: lastVisible.c,
            };
        } else {
            const prevFuture = futureCandles[index - 1];
            prevCandle = {
                open: prevFuture.o,
                close: prevFuture.c,
            };
        }

        applyHollowCandleLogicToSingle(newCandle, prevCandle);

        // Append without touching old candles
        candlestickSeries.update(newCandle);
    });

    chart.timeScale().fitContent();
}

/* -----------------------------------------
   8. HOLLOW CANDLE LOGIC
----------------------------------------- */
// Batch version used on initial visible candles
function applyHollowCandleLogic(data) {
    data.forEach((candle, index) => {
        const prev = index > 0 ? data[index - 1] : null;
        applyHollowCandleLogicToSingle(candle, prev);
    });
}

// Single-candle version used when appending
function applyHollowCandleLogicToSingle(candle, prevCandle) {
    const isGreen = candle.close > candle.open;
    const isHollow = prevCandle ? candle.close > prevCandle.close : isGreen;

    const greenColor = '#26a69a';
    const redColor = '#ef5350';
    const transparentGreen = 'rgba(38,166,154,0.0)';
    const transparentRed = 'rgba(239,83,80,0.0)';

    if (isGreen) {
        candlestickSeries.applyOptions({
            upColor: isHollow ? transparentGreen : greenColor,
            borderUpColor: greenColor,
            wickUpColor: greenColor,
        });
    } else {
        candlestickSeries.applyOptions({
            downColor: isHollow ? transparentRed : redColor,
            borderDownColor: redColor,
            wickDownColor: redColor,
        });
    }
}

/* -----------------------------------------
   9. Message Pop-Up of the answer 
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
