# FCG Frankfurt Dashboard

Produktive Adresse: <https://fcg-dashboard-web-production.up.railway.app>

Das Dashboard ist eine passwortgeschützte Web-App für die Bereiche Allgemein, Mitarbeiterteam und Leitungsteam. Zahlen können direkt gepflegt oder über die bereitgestellte Excel-Vorlage importiert werden. Die Diagrammart ist im Dashboard auswählbar.

## Betrieb auf Railway

Das private Railway-Projekt **FCG Dashboard** enthält zwei Dienste:

- **FCG Dashboard Web** baut und veröffentlicht automatisch den Branch `main` dieses Repositories.
- **Postgres** speichert Dashboard-Daten, Login-Sperren und gehashte Passwörter auf einem persistenten Volume.

Die Anwendung legt beim Start fehlende Tabellen an. Sicherheitswerte und Datenbank-Zugangsdaten liegen ausschließlich als Railway-Variablen vor und gehören niemals in das Repository.

## Änderungen veröffentlichen

1. Dateien im Branch `main` bearbeiten und committen.
2. Railway startet automatisch einen neuen Build.
3. Im Railway-Projekt unter **Deployments** prüfen, dass der Stand `SUCCESS` erreicht.
4. `https://fcg-dashboard-web-production.up.railway.app/health` muss `{\"ok\":true}` liefern.

Die Bedienoberfläche befindet sich in `client/`, der Server in `server/`. Die Railway-Konfiguration steht in `railway.toml`, das PostgreSQL-Schema in `db/postgres-schema.sql`.

## Passwörter ändern

Passwörter werden über GitHub Actions aktualisiert. Die vollständige Anleitung steht in [PASSWOERTER_AENDERN.md](PASSWOERTER_AENDERN.md).
