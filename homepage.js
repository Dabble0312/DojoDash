document.getElementById("startBtn").addEventListener("click", () => {
    const username = document.getElementById("usernameInput").value.trim();

    if (username.length === 0) {
        alert("Please enter a name");
        return;
    }

    // Save username so the game page can read it
    localStorage.setItem("username", username);

    // Redirect to your game page
    window.location.href = "game.html";
});
