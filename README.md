# Basketball-Bund.net ICS Kalender Generator

## Einrichtung
1. Team ID in `.github/workflows/update-ics.yml` oder `.env` setzen.
2. Repo auf GitHub hochladen.
3. GitHub Actions erledigen den Rest (Aktualisierung alle 6 Stunden).
4. Öffentliche ICS-URLs:
   - `/ics/team/{teamId}/all.ics`
   - `/ics/team/{teamId}/home.ics`
   - `/ics/team/{teamId}/away.ics`
