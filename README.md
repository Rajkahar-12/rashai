# RashAI

Files: index.html, privacy.html, server.js, package.json

Run locally
  export ANTHROPIC_API_KEY=your_key_here    (Windows PowerShell: $env:ANTHROPIC_API_KEY="your_key_here")
  npm start     then open http://localhost:3000

Deploy (Render/Railway/Fly): push to GitHub, create a Node web service,
start command "npm start", add ANTHROPIC_API_KEY as an environment variable.
NEVER commit your key to GitHub.
