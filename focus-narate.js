/**
 * focus-narate.js — MARKET NARRATOR ENGINE v2.0
 *
 * Professional market analyst voice. Stitches the 50-candle history backdrop
 * against the newly revealed burst candles. Uses speech memory to prevent
 * repetition, ingests window.detectedPatterns from the pattern engine, and
 * prioritises synthesised (newly-detected) patterns by name and date.
 *
 * Load order: after focus-patterns.js, before focus-core.js.
 * Exposes: toggleNarrator(), runNarratorEngine()
 */

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// Use var (not let/const) so re-loading or dual-script scenarios don't throw
// "already declared" SyntaxErrors.
// ─────────────────────────────────────────────────────────────────────────────
if (typeof narratorActive === 'undefined') var narratorActive = false;
var SPEECH_MEMORY_SIZE = 5;   // remember last N phrases to avoid repeats
var speechMemory = typeof speechMemory !== 'undefined' ? speechMemory : [];

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API  (called by focus-core.js)
// ─────────────────────────────────────────────────────────────────────────────

/** Toggle the narrator on/off from the UI button. */
function toggleNarrator() {
    narratorActive = !narratorActive;
    const btn = document.getElementById('narratorBtn');
    if (!btn) return;

    if (narratorActive) {
        btn.classList.add('active');
        btn.innerHTML = `<span id="narratorIcon">🎙️</span> Narrator On`;
        _narrateHistory();          // opening read of the historical backdrop
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<span id="narratorIcon">🔊</span> Narrator Off`;
        window.speechSynthesis.cancel();
    }
}

/**
 * Called by focus-core.js after every reveal burst.
 * Syncs patterns, then narrates the new candles vs the history.
 */
function runNarratorEngine() {
    if (!narratorActive) return;

    // ── Sync the pattern engine so we always have the latest data
    if (typeof getVisiblePatterns === 'function') {
        window.detectedPatterns = getVisiblePatterns();
    }

    const history = window.allCandles       || [];
    const burst   = window.revealedSoFar    || [];
    if (history.length === 0 || burst.length === 0) return;

    const burstSize  = _getRevealCount();
    const recentBurst = burst.slice(-burstSize);

    const script = _buildRevealScript(history, burst, recentBurst);
    _speak(script);
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY NARRATOR  (fires when narrator is first toggled on)
// ─────────────────────────────────────────────────────────────────────────────
function _narrateHistory() {
    const history = window.allCandles || [];
    if (history.length === 0) return;

    if (typeof getVisiblePatterns === 'function') {
        window.detectedPatterns = getVisiblePatterns();
    }

    const ctx      = _buildHistoryContext(history);
    const patterns = (window.detectedPatterns || []).filter(p =>
        p.indices.every(i => i < history.length)
    );

    const intro = _pick([
        "Stepping back to read the full tape.",
        "Analysing the historical structure before the reveal.",
        "Let me walk you through what the chart is showing.",
        "Here is the backdrop — the fifty-candle foundation.",
        "Setting the scene before the price action unfolds.",
    ]);

    const trendLine  = _historyTrendLine(ctx);
    const volLine    = _historyVolumeLine(ctx);
    const meanLine   = `The price mean sits around ${_fmt(ctx.mean)}, acting as the structural pivot.`;
    const patLine    = patterns.length > 0
        ? _patternHistorySummary(patterns)
        : "No dominant sequences have been flagged in the historical window.";

    const closeLine  = _pick([
        "Now let us watch what the market does next.",
        "The stage is set — the reveal will tell us who is in control.",
        "Keep your eye on the mean and the extremes as the candles come in.",
        "That is the backdrop. The real test begins with the reveal.",
    ]);

    _speak([intro, trendLine, volLine, meanLine, patLine, closeLine].join(' '));
}

// ─────────────────────────────────────────────────────────────────────────────
// REVEAL SCRIPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function _buildRevealScript(history, allRevealed, recentBurst) {
    const hCtx = _buildHistoryContext(history);
    const bCtx = _buildBurstContext(recentBurst);

    const parts = [];

    // 1. Synthesised patterns (newly detected in the reveal) — highest priority
    const synthPatterns = _getSynthesisedPatterns(allRevealed, history.length);
    if (synthPatterns.length > 0) {
        parts.push(_synthPatternLine(synthPatterns));
    }

    // 2. Trend vs history comparison (the "stitch")
    parts.push(_stitchLine(hCtx, bCtx));

    // 3. Volume context
    parts.push(_burstVolumeLine(hCtx, bCtx));

    // 4. Mean / structural position
    parts.push(_meanPositionLine(hCtx, bCtx));

    // 5. Candle-level detail (wicks, body strength)
    const detailLine = _candleDetailLine(recentBurst);
    if (detailLine) parts.push(detailLine);

    // 6. Forward outlook
    parts.push(_outlookLine(hCtx, bCtx));

    // Collapse, de-dupe against memory, and return
    return _filterAndJoin(parts);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT BUILDERS
// ─────────────────────────────────────────────────────────────────────────────
function _buildHistoryContext(candles) {
    const n       = candles.length;
    const closes  = candles.map(c => c.close);
    const highs   = candles.map(c => c.high);
    const lows    = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume || 0);

    const mean     = closes.reduce((a, b) => a + b, 0) / n;
    const avgVol   = volumes.reduce((a, b) => a + b, 0) / n;
    const firstClose = closes[0];
    const lastClose  = closes[n - 1];
    const netChange  = ((lastClose - firstClose) / firstClose) * 100;

    // Trend bias: count bullish vs bearish candles in history
    const bullCount = candles.filter(c => c.close > c.open).length;
    const trendBias = bullCount / n;  // >0.55 = bullish, <0.45 = bearish

    // Volatility: average range vs mean close
    const avgRange = candles.map(c => c.high - c.low).reduce((a, b) => a + b, 0) / n;
    const relVol   = avgRange / mean;  // relative range as % of price

    // Trend tag from last candle (most recent state)
    const lastCandle  = candles[n - 1];
    const trendTag    = lastCandle.trend_tag   || 'sideways';
    const volatilityTag = lastCandle.volatility_tag || 'normal_volatility';

    return {
        mean, avgVol, firstClose, lastClose, netChange,
        trendBias, trendTag, volatilityTag, relVol,
        resistance: Math.max(...highs),
        support: Math.min(...lows),
        lastCandle,
        bullCount, bearCount: n - bullCount, n,
    };
}

function _buildBurstContext(burst) {
    if (!burst || burst.length === 0) return null;

    const closes  = burst.map(c => c.close);
    const volumes = burst.map(c => c.volume || 0);
    const n       = burst.length;

    const bullCount  = burst.filter(c => c.close > c.open).length;
    const bearCount  = n - bullCount;
    const trendBias  = bullCount / n;
    const avgVol     = volumes.reduce((a, b) => a + b, 0) / n;

    const netChange  = closes.length > 1
        ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
        : 0;

    // Check for momentum through consecutive closes
    let consecutive = 1;
    for (let i = n - 1; i > 0; i--) {
        if ((closes[i] > closes[i - 1]) === (closes[n - 1] > closes[n - 2] || true)) consecutive++;
        else break;
    }

    const lastCandle = burst[n - 1];

    return {
        bullCount, bearCount, trendBias, avgVol, netChange,
        n, lastCandle, consecutive,
        firstClose: closes[0],
        lastClose: closes[n - 1],
        high: Math.max(...burst.map(c => c.high)),
        low:  Math.min(...burst.map(c => c.low)),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// NARRATIVE LINE GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

function _historyTrendLine(ctx) {
    if (ctx.trendTag === 'uptrend' || ctx.netChange > 2) {
        return _pick([
            `The fifty-candle backdrop carries a bullish bias — price has been trending higher, with ${ctx.bullCount} of ${ctx.n} candles closing up.`,
            `History leans constructive. The dominant motion over the last ${ctx.n} sessions has been upward, with a net gain of ${ctx.netChange.toFixed(1)} percent.`,
            `The structural backdrop is bullish. Buyers have controlled the tape for the majority of this historical window.`,
        ]);
    } else if (ctx.trendTag === 'downtrend' || ctx.netChange < -2) {
        return _pick([
            `The historical window carries a clear bearish bias. Price has been declining — ${ctx.bearCount} of ${ctx.n} sessions closed lower.`,
            `The backdrop is distributional. Net price action over the last ${ctx.n} candles reflects consistent selling pressure, down ${Math.abs(ctx.netChange).toFixed(1)} percent.`,
            `Sellers have dominated the historical structure. The path of least resistance has been downward.`,
        ]);
    } else {
        return _pick([
            `The fifty-candle history shows a range-bound, sideways structure — no dominant directional bias.`,
            `The historical backdrop is essentially neutral. Buyers and sellers have kept price contained within a defined range.`,
            `This is a rotational market. No clear trend has established itself in the historical window.`,
        ]);
    }
}

function _historyVolumeLine(ctx) {
    const volLabel = ctx.lastCandle.volume_tag;
    if (volLabel === 'volume_spike') {
        return _pick([
            "Volume has been elevated — participants are engaged, and the tape reflects real conviction behind recent moves.",
            "Participation is heavy in this window. Elevated volume adds credibility to the price action.",
        ]);
    } else if (volLabel === 'volume_drop') {
        return _pick([
            "Volume has been subdued through this historical stretch — the move, whatever its direction, lacks full market participation.",
            "Thin volume in the backdrop suggests this structure may be fragile. Moves on light volume are easier to reverse.",
        ]);
    }
    return _pick([
        "Volume has been running at average levels — no unusual participation in either direction.",
        "Participation is steady through this historical window, suggesting orderly price discovery.",
    ]);
}

function _patternHistorySummary(patterns) {
    if (patterns.length === 1) {
        const p = patterns[0];
        return `The pattern engine has flagged a ${p.label} in the historical structure, dated ${p.start_date.slice(0,10)}.`;
    }
    const labels = [...new Set(patterns.map(p => p.label))];
    return `The historical window contains ${patterns.length} flagged sequences, including ${_naturalList(labels)}.`;
}

function _stitchLine(hCtx, bCtx) {
    if (!bCtx) return '';

    const histBull   = hCtx.trendBias  > 0.55;
    const histBear   = hCtx.trendBias  < 0.45;
    const burstBull  = bCtx.trendBias  > 0.55;
    const burstBear  = bCtx.trendBias  < 0.45;

    // Reversal scenarios
    if (histBull && burstBear) {
        return _pick([
            "This burst runs counter to the prevailing uptrend — a potential distribution signal or bearish reversal attempt against the trend.",
            "The new candles are pushing back against the bullish backdrop. This could be early distribution, or a healthy pullback to re-test structure.",
            "Selling is emerging against the bullish trend. Watch whether this is a brief retracement or the beginning of a directional change.",
        ]);
    }
    if (histBear && burstBull) {
        return _pick([
            "The reveal shows buying against a bearish backdrop — a counter-trend bounce at minimum, and possibly a reversal setup if volume confirms.",
            "Bulls are mounting a challenge against the prevailing downtrend. This is a potential trend reversal, but premature conviction here is dangerous.",
            "These candles are fighting the downtrend. Keep an eye on whether buyers can hold these gains or whether sellers re-assert control.",
        ]);
    }

    // Continuation scenarios
    if (histBull && burstBull) {
        return _pick([
            "The burst confirms the bullish backdrop — buyers are maintaining control, and the trend appears to have continuation potential.",
            "Price is following the path of least resistance upward. The reveal is consistent with the bullish historical structure.",
            "This is a trend continuation read. The new candles align with the dominant buying structure in the history.",
        ]);
    }
    if (histBear && burstBear) {
        return _pick([
            "The reveal reinforces the bearish backdrop. Sellers are staying consistent — this is a trend continuation setup.",
            "The new candles are aligned with the downtrend. No counter-trend pressure has emerged; the bears remain in control.",
            "Continuation of the bearish structure. The reveal offers no evidence yet that sellers are losing their grip.",
        ]);
    }

    // Neutral / sideways
    return _pick([
        "The new candles are mixed — no decisive directional edge has been established relative to the prior structure.",
        "Price action in the reveal is balanced, consistent with the sideways backdrop. The market is still searching for a catalyst.",
        "Neither buyers nor sellers have made a decisive statement in this burst. The structure remains ambiguous.",
    ]);
}

function _burstVolumeLine(hCtx, bCtx) {
    if (!bCtx) return '';
    const ratio = hCtx.avgVol > 0 ? bCtx.avgVol / hCtx.avgVol : 1;

    if (ratio > 1.6) {
        return _pick([
            `Volume in the reveal is running roughly ${ratio.toFixed(1)} times the historical average — significant institutional participation.`,
            "This burst is backed by substantially elevated volume. When volume expands with price, the move carries real conviction.",
            "Volume has surged relative to history. That participation validates the move rather than dismissing it as noise.",
        ]);
    } else if (ratio < 0.6) {
        return _pick([
            "Volume in the reveal is light relative to history. A move on diminishing participation is harder to trust.",
            "This burst came in on below-average volume — a caution flag. Breakouts and breakdowns without volume tend to fail.",
            "Participation has faded. The price move exists, but the volume signature is unconvincing.",
        ]);
    }
    return _pick([
        "Volume in the reveal is broadly consistent with the historical average — no unusual commitment in either direction.",
        "Participation in this burst is ordinary. The volume does not add urgency to the move.",
    ]);
}

function _meanPositionLine(hCtx, bCtx) {
    if (!bCtx) return '';
    const close   = bCtx.lastClose;
    const mean    = hCtx.mean;
    const range   = hCtx.resistance - hCtx.support;
    const pctFromMean = range > 0 ? (close - mean) / range : 0;

    if (pctFromMean > 0.25) {
        return _pick([
            `Price has pushed above the historical mean of ${_fmt(mean)} — now extended. A snap-back to the mean remains a live scenario.`,
            `We are above the structural mean at ${_fmt(mean)}. Overextension in either direction tends to self-correct.`,
        ]);
    } else if (pctFromMean < -0.25) {
        return _pick([
            `Price is trading below the historical mean of ${_fmt(mean)}, suggesting bearish displacement from equilibrium.`,
            `We are below the structural mean at ${_fmt(mean)}. Either the mean acts as resistance on any bounce, or buyers reclaim it — that is the key test.`,
        ]);
    }
    return _pick([
        `Price is rotating around the historical mean near ${_fmt(mean)} — still within equilibrium territory.`,
        `We are close to the structural mean at ${_fmt(mean)}, suggesting the market has not yet committed to a decisive directional move away from fair value.`,
    ]);
}

function _candleDetailLine(burst) {
    if (!burst || burst.length === 0) return '';
    const last = burst[burst.length - 1];

    const parts = [];

    if ((last.upper_wick_ratio || 0) > 0.6) {
        parts.push(_pick([
            "The most recent candle is printing a long upper wick — overhead rejection is present.",
            "Upper wick on the last candle signals sellers stepping in above the close.",
        ]));
    } else if ((last.lower_wick_ratio || 0) > 0.6) {
        parts.push(_pick([
            "A long lower wick on the latest candle indicates aggressive demand absorption below the open.",
            "The lower wick shows buyers refused to let price stay at the lows — demand is present.",
        ]));
    }

    if (last.candle_strength === 'strong' && last.close > last.open) {
        parts.push(_pick([
            "The last candle closed strongly bullish — large body, minimal wicks. That is a high-conviction bar.",
            "A strong-bodied bullish candle to close the burst. Buyers stayed in control from open to close.",
        ]));
    } else if (last.candle_strength === 'strong' && last.close < last.open) {
        parts.push(_pick([
            "The final candle is a strong bearish close — sellers dominated the full session without meaningful pushback.",
            "Large bearish body on the last candle. The bears are making a statement.",
        ]));
    }

    if (last.inside_bar === 1) {
        parts.push("The last candle is an inside bar — the market is compressing, coiling for the next directional move.");
    }
    if (last.outside_bar === 1) {
        parts.push("An outside bar printed at the close of the burst — expanded range, uncertain resolution.");
    }

    return parts.length > 0 ? parts.join(' ') : '';
}

function _outlookLine(hCtx, bCtx) {
    if (!bCtx) return '';
    const last = bCtx.lastCandle;

    // Momentum tag from last revealed candle
    const mom = last.momentum_tag || '';

    if (mom === 'bullish_momentum') {
        return _pick([
            "Momentum is leaning bullish. The next sequence will tell us whether buyers can sustain the move or whether it exhausts.",
            "Bullish momentum underpins this structure. Until it deteriorates, the path of least resistance favours the upside.",
        ]);
    } else if (mom === 'bearish_momentum') {
        return _pick([
            "Momentum is bearish. If sellers maintain this pressure into the next reveal, the structural case for lower prices strengthens.",
            "The momentum signature is bearish. Buyers will need to show up with conviction to invalidate this read.",
        ]);
    }

    return _pick([
        "Momentum is neutral — no strong directional edge. Make your read and wait for the next reveal to confirm.",
        "The market is at a pivot. Both sides have a case here; the next candles will be the arbiter.",
        "This is a decision point. Commitment from either buyers or sellers in the next sequence will likely resolve the ambiguity.",
    ]);
}

function _synthPatternLine(patterns) {
    if (patterns.length === 1) {
        const p = patterns[0];
        return _pick([
            `Significant: the pattern engine has synthesised a ${p.label} in the reveal, anchored at ${p.start_date.slice(0,10)}. This is a live, newly-printed signal — treat it with priority.`,
            `A ${p.label} has just been confirmed in the revealed candles as of ${p.start_date.slice(0,10)}. The structure has spoken — this pattern is now in play.`,
            `Pattern alert: ${p.label} detected in the burst. Date of formation: ${p.start_date.slice(0,10)}. This is not a historical artifact; it is a current market signal.`,
        ]);
    }

    const labels = patterns.map(p => p.label);
    return _pick([
        `Multiple patterns synthesised in the reveal: ${_naturalList(labels)}. Convergence of signals increases the analytical weight of this move.`,
        `The pattern engine has flagged ${patterns.length} active formations in the burst, including ${_naturalList(labels)}. Treat this as a high-signal zone.`,
    ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns patterns whose indices include at least one candle in the reveal burst.
 * These are "newly synthesised" — the pattern wasn't complete until these candles arrived.
 */
function _getSynthesisedPatterns(allRevealed, historyLength) {
    const allPatterns = window.detectedPatterns || [];
    return allPatterns.filter(p =>
        p.indices.some(i => i >= historyLength)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEECH MEMORY & FILTERING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filters phrases against speechMemory to avoid repetition,
 * then joins and records to memory.
 */
function _filterAndJoin(phrases) {
    const filtered = phrases.filter(phrase => {
        if (!phrase || phrase.trim() === '') return false;
        // Check if a very similar phrase is already in memory (word-overlap heuristic)
        const tokens = _tokenise(phrase);
        return !speechMemory.some(mem => _similarity(tokens, _tokenise(mem)) > 0.65);
    });

    // Fall back to all phrases if memory filtering removes everything
    const toSpeak = filtered.length > 0 ? filtered : phrases.filter(Boolean);

    const script = toSpeak.join(' ').trim();

    // Record each phrase
    toSpeak.forEach(phrase => {
        speechMemory.push(phrase);
        if (speechMemory.length > SPEECH_MEMORY_SIZE) speechMemory.shift();
    });

    return script;
}

function _tokenise(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
}

function _similarity(tokensA, tokensB) {
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const intersection = [...setA].filter(t => setB.has(t)).length;
    return intersection / Math.max(setA.size, setB.size);
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEECH ENGINE
// ─────────────────────────────────────────────────────────────────────────────
function _speak(text) {
    if (!text || text.trim() === '') return;
    window.speechSynthesis.cancel();

    const msg  = new SpeechSynthesisUtterance(text);
    msg.rate   = 1.05;   // measured, authoritative pace
    msg.pitch  = 0.88;   // lower pitch — senior analyst tone

    // Prefer a high-quality voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
        v.lang.startsWith('en') && (
            v.name.includes('Google') ||
            v.name.includes('Natural') ||
            v.name.includes('Premium') ||
            v.name.includes('Enhanced')
        )
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferred) msg.voice = preferred;

    window.speechSynthesis.speak(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/** Pick a random element from an array. */
function _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Format a price to 2 decimal places with ₹ symbol. */
function _fmt(price) {
    return `₹${(+price).toFixed(2)}`;
}

/** Convert an array of strings to a natural-language list: "A, B, and C". */
function _naturalList(items) {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}

/** Read reveal count from the UI (mirrors focus-core.js helper). */
function _getRevealCount() {
    const el = document.getElementById('revealCount') || document.getElementById('revealCountSelect');
    if (!el) return 4;
    const val = parseInt(el.value);
    return isNaN(val) || val < 1 ? 4 : val;
}