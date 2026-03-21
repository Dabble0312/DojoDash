// supabase client is declared in supabase.js — loaded before this file in index.html
 
document.getElementById("startBtn").addEventListener("click", async () => {
    const username = document.getElementById("usernameInput").value.trim();
 
    if (username.length === 0) {
        alert("Please enter a name");
        return;
    }
 
    try {
        // Create an anonymous session — gives the user a unique ID without a password
        const { data, error } = await supabase.auth.signInAnonymously();
 
        if (error) throw error;
 
        localStorage.setItem("username", username);
        localStorage.setItem("supabase_user_id", data.user.id);
 
        console.log("Cloud Session Active:", data.user.id);
 
        window.location.href = "game.html";
 
    } catch (err) {
        // Fail-safe: if DB is unreachable, still let them play
        console.warn("Database connection failed. Starting in Local Mode.", err.message);
        localStorage.setItem("username", username);
        window.location.href = "game.html";
    }
});