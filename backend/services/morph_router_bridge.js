/**
 * Morph Router Bridge — Node.js script called from Python.
 * Uses the official Morph SDK to classify query difficulty.
 * Usage: node morph_router_bridge.js "your query here"
 * Output: JSON { difficulty: "easy"|"medium"|"hard"|"needs_info" }
 */

async function main() {
    const query = process.argv[2];
    if (!query) {
        console.log(JSON.stringify({ difficulty: "medium", error: "no_query" }));
        process.exit(0);
    }

    try {
        // Dynamic import for ESM module
        const { MorphClient } = await import('@morphllm/morphsdk');
        const morph = new MorphClient({
            apiKey: process.env.MORPH_API_KEY
        });

        const result = await morph.routers.raw.classify({
            input: query
        });

        console.log(JSON.stringify({
            difficulty: result.difficulty
        }));
    } catch (err) {
        console.log(JSON.stringify({
            difficulty: "medium",
            error: err.message
        }));
    }
}

main();
