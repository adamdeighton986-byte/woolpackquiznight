# The Big British Lock Inn Quiz

Complete single-venue pub quiz. Upload all root files and the `public` folder to your existing GitHub repository. Render will redeploy automatically. Keep your existing `ADMIN_KEY` environment variable.

- 30 main questions per game, 15 seconds each, 4-second answer reveal, 20-second breaks.
- 2,000 general knowledge questions in `questions.json`.
- 100 chronological ordering questions in `history_order.json`. Two appear at main questions 5 and 25, rotating across games.
- Fastest Finger First introduction screens before main questions 10, 20, 30 (5 seconds each). First correct team earns 150 points; later correct teams 50; wrong 0. Winning team name is announced during reveal.
- After question 15: Higher or Lower intro screen (6 seconds), then up to 8 rounds (8 seconds each) with numbers from 1 to 10. Correct guess +20, incorrect or unanswered means out, identical numbers end the minigame for all. Completing all eight successfully gives +50. Each number is drawn independently, so matches are possible.
- Green answer reveal, correct-answer confetti, hidden scores, automatic winners ceremony.

The game data is saved to `data.json` locally. Free Render services may lose local saved data on restart/redeploy, including question rotation history and scores. For guaranteed persistence, use a persistent disk or database.

**Important:** Reset the quiz after deploying the new version. Test with two phones and the TV screen before a live event.

## History ordering update
Questions 5 and 25 now have 35 seconds (15 seconds plus 20 extra). Players tap the four event buttons in chronological order; all four taps submit one answer. Correct complete order earns 100 points; other orders earn zero. The TV displays the four events and reveals their correct sequence. The 100-question rotation remains intact.
