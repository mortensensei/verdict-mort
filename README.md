# Verdict

A personal iPhone web app for practicing decision-making with random yes/no questions.

- **Quick-fire:** you answer against a countdown timer (2–10 s, set in Settings). Running out of time counts as a timeout.
- **Reflect:** there's no timer, and you can add an optional note on why you answered as you did.
- **Endless sessions:** tap **End** whenever you want to stop and see a summary.
- **Revisits:** questions you answered at least a week ago come back now and then (off, 1 in 10 or 1 in 5), and the app flags any where your answer changed.
- **Stats:** your yes rate by category, median decision time, timeouts, changed minds, your toughest calls and recent answers with notes.
- **Your data:** everything stays on your phone. Use **Settings → Export backup** now and then.

## Put it on your iPhone (GitHub Pages, free, about 10 minutes)

1. Sign in at https://github.com (or make a free account).
2. Click **+ → New repository**. Name it `verdict` and set it to **Public**, since free Pages needs a public repo. Nobody will find it unless you share the link. Click **Create repository**.
3. On the new repo page, click **uploading an existing file**. Drag in **everything in this folder** (including the `icons` folder), then click **Commit changes**.
4. Go to **Settings → Pages**. Under *Branch*, choose `main` and `/ (root)`, then click **Save**.
5. Wait about a minute. Your app will be at `https://<your-username>.github.io/verdict/`.
6. On your iPhone, open that link **in Safari**, then tap **Share → Add to Home Screen**.
7. Open Verdict from the home screen icon. It runs full-screen and works offline from then on.

## Updating the app

- Edit files here, for example to add questions to `questions.js`, and upload the changed files to the repo again.
- If the update doesn't show up on your phone, open `sw.js` and change `verdict-v1` to `verdict-v2` (and so on), then upload it again. Opening the app twice while online picks up the change.

## Adding questions

Open `questions.js` and add lines inside any category, or add a new category. Each question is a quoted string ending with a comma. If you edit a question's wording, it counts as a new question in your history.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Look and feel (calm, minimal; follows light/dark mode) |
| `app.js` | All app logic |
| `questions.js` | The question bank (300 questions, 12 categories) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Home-screen install and offline support |
