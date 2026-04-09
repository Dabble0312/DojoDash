/**
 * focus-narrator.js
 * Combines focus-summary.js (Level 1) and focus-patterns.js (Level 2)
 * into a single chronological narrative script.
 */

function generateNarrativeScript(block) {
    const candles = block.candles;
    const patterns = block.detected_patterns || [];
    const script = [];

    // 1. INTRO BEAT
    script.push({
        index: 0,
        type: 'INTRO',
        text: `Starting analysis for block ${block.id}. We have ${candles.length} candles to review. The current trend is ${block.trend_tag || 'developing'}.`
    });

    // 2. CHRONOLOGICAL LOOP
    candles.forEach((candle, i) => {
        let spokeThisCandle = false;

        // Check if a pattern STARTS on this candle (Level 2)
        const startingPatterns = patterns.filter(p => p.indices[0] === i);
        
        startingPatterns.forEach(p => {
            // We use the pattern label and can add custom logic here
            const patternDesc = getPatternNarrative(p); 
            script.push({
                index: i,
                type: 'PATTERN',
                label: p.label,
                text: patternDesc
            });
            spokeThisCandle = true;
        });

        // If no pattern, check if the candle is "Important" (Level 1)
        if (!spokeThisCandle) {
            // summarize(candle) comes from your focus-summary.js
            const candleText = summarize(candle); 
            
            // We only want to narrate "Interesting" candles to avoid a wall of noise
            if (isKeyCandle(candle)) {
                script.push({
                    index: i,
                    type: 'CANDLE',
                    text: candleText
                });
            }
        }
    });

    // 3. OUTRO BEAT
    script.push({
        index: candles.length - 1,
        type: 'OUTRO',
        text: "That's the full sequence. The structure is now clear. What's your move?"
    });

    return script;
}

// Helper to define "Interesting" candles so the narrator isn't annoying
function isKeyCandle(candle) {
    return (
        candle.outside_bar === 1 || 
        candle.engulfing_soft === 1 || 
        candle.failed_breakdown === 1 || 
        candle.failed_breakout === 1 ||
        candle.candle_strength === 'strong'
    );
}

// Helper to give patterns a "Narrative" voice
function getPatternNarrative(p) {
    const length = p.metadata?.absolute_length || p.indices.length;
    const map = {
        "Failed Breakdown": `Notice this Failed Breakdown. Price dipped, but sellers couldn't hold it, creating a trap.`,
        "Failed Breakout": `A Failed Breakout here. Bulls pushed high but got rejected, leaving buyers stranded.`,
        "Momentum Burst": `This is a Momentum Burst. High conviction over ${length} candles showing a clear aggressive move.`,
        "Engulfing Flip": `An Engulfing Flip. The market sentiment just did a 180-degree turn in a single candle.`,
        "Compression": `Volatility is drying up into a ${length} candle compression. The market is coiling.`
    };
    return map[p.label] || `A ${p.label} pattern is forming over ${length} candles.`;
}