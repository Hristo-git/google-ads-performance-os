
import { getKeywordDataFromWindsor, getGranularQSDataFromWindsor } from "../lib/windsor";

// Mock environment
process.env.WINDSOR_API_KEY = "2a712b2c4f4202baa905770d40ff6ab748aa";
const API_KEY = process.env.WINDSOR_API_KEY;

async function debugLogic() {
    console.log("--- Debugging Library Logic (Round 2) ---");

    // Test 1: Keywords
    try {
        console.log("Testing getKeywordDataFromWindsor...");
        const kwData = await getKeywordDataFromWindsor(API_KEY, "last_7d");
        console.log(`✅ Keywords fetched: ${kwData.length}`);
    } catch (e) {
        console.error("❌ Keywords Fetch Failed:", e);
    }

    // Test 2: Granular QS
    try {
        console.log("Testing getGranularQSDataFromWindsor...");
        const qsData = await getGranularQSDataFromWindsor(API_KEY, "last_7d");
        console.log(`✅ Granular fetched: ${qsData.length}`);
    } catch (e) {
        console.error("❌ Granular Fetch Failed:", e);
    }
}

debugLogic();
