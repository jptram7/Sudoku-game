# Put the Sudoku game on your phone (GitHub Pages)

Same steps as the 2048 game. Do them from inside this `sudoku` folder.

## 1. Create the repo
On github.com: **New repository** → name it `sudoku-game` → **Public** → create (leave it empty).

## 2. Upload from the terminal in VS Code
```
git init
git add .
git commit -m "Sudoku game"
git branch -M main
git remote add origin https://github.com/jptram7/sudoku-game.git
git push -u origin main
```

## 3. Turn on GitHub Pages
Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch **main** / **(root)** → **Save**.
Wait about a minute. Your game will be at:

    https://jptram7.github.io/sudoku-game/

(If you see a 404 at first, wait another minute and refresh.)

## 4. Install it
- **iPhone:** open the link in **Safari** → Share button → **Add to Home Screen**.
- **Android:** open in Chrome → menu (⋮) → **Install app** / **Add to Home screen**.

Open it once while online (it saves itself for offline). After that it works in airplane mode.
Always play from the Home Screen icon: Safari and the icon keep separate saved games and stats.

## 5. Updating later
Change the files, then:
```
git add .
git commit -m "Describe the change"
git push
```
The phone picks up the new version the next time you open the game with internet (iPhone sometimes needs it closed and opened twice).
You do not need to change any version number. Only if you add a NEW file, add its path to the `FILES` list in `sw.js`.
