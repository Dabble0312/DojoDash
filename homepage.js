// 1. Initialize Supabase 
// Replace these with the actual values from your Supabase Dashboard (Settings > API)
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_KEY = 'your-anon-public-key';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


document.getElementById("startBtn").addEventListener("click", async () => {
    const username = document.getElementById("usernameInput").value.trim();

    // Standard check to ensure a name exists
    if (username.length === 0) {
        alert("Please enter a name");
        return;
    }

    try {
        // 2. THE SILENT UPGRADE: Create an Anonymous Session
        // This gives the user a unique ID without requiring a password.
        const { data, error } = await supabase.auth.signInAnonymously();
        
        if (error) throw error;

        // 3. Save Identity to LocalStorage
        // We save the username for the UI and the UUID for the database records.
        localStorage.setItem("username", username);
        localStorage.setItem("supabase_user_id", data.user.id);

        console.log("Cloud Session Active:", data.user.id);

        // 4. Redirect to the game
        window.location.href = "game.html";

    } catch (err) {
        // FAIL-SAFE: If the database is down or there's no internet, 
        // we still let them play "Local Mode" so the game doesn't break.
        console.warn("Database connection failed. Starting in Local Mode.", err.message);
        localStorage.setItem("username", username);
        window.location.href = "game.html";
    }
});