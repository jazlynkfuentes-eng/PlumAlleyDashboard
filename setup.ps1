# One-time setup for Portfolio Intel (Windows)
# Run from the project folder:  .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "Portfolio Intel — setup" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example — edit INGEST_SECRET before connecting n8n." -ForegroundColor Yellow
} else {
  Write-Host ".env already exists — keeping your settings." -ForegroundColor Gray
}

Write-Host "Installing dependencies..."
npm install

Write-Host "Setting up database..."
npx prisma db push
npm run db:seed

Write-Host "Building app..."
npm run build

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "=== n8n connection ===" -ForegroundColor Cyan
Write-Host "  URL:    http://localhost:3000/api/updates/linkedin"
Write-Host "  Method: POST"
Write-Host "  Header: Authorization: Bearer <INGEST_SECRET from .env>"
Write-Host ""
Write-Host "Start the app:  npm start"
Write-Host "Or dev mode:    npm run dev"
Write-Host "Test endpoint:  npm run test:linkedin-endpoint"
