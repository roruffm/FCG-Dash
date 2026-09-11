# Dashboard-Passwörter über GitHub ändern

Die Passwörter werden nicht im öffentlichen Quellcode gespeichert. GitHub hält sie als verschlüsselte Repository-Secrets und überträgt sie ausschließlich bei einem manuell gestarteten, autorisierten Workflow an das Dashboard.

## Einmalige Einrichtung

1. Im Repository `roruffm/FCG-Dash` **Settings** öffnen.
2. Unter **Security → Secrets and variables → Actions** den Bereich **Repository secrets** öffnen.
3. Mit **New repository secret** diese drei Secrets anlegen:
   - `FCG_LEADERSHIP_PASSWORD`
   - `FCG_STAFF_PASSWORD`
   - `FCG_GENERAL_PASSWORD`
4. Für jedes Secret ein eigenes Passwort mit 12 bis 256 Zeichen eintragen.
5. Zusätzlich unter **Settings → Environments** ein Environment mit dem Namen `production` anlegen.
6. Dort unter **Deployment protection rules** nach Möglichkeit einen oder mehrere erforderliche Prüfer festlegen. So kann eine Passwortänderung erst nach Freigabe ausgeführt werden.

## Passwort später ändern

1. **Settings → Secrets and variables → Actions** öffnen.
2. Das gewünschte Secret mit **Update** ersetzen. GitHub zeigt vorhandene Secret-Werte aus Sicherheitsgründen nicht wieder an.
3. Falls nicht alle drei Secrets eingerichtet sind, die fehlenden ergänzen.
4. Zum Reiter **Actions** wechseln.
5. Den Workflow **Dashboard-Passwörter aktualisieren** öffnen.
6. **Run workflow**, Branch `main`, anschließend erneut **Run workflow** wählen.
7. Falls ein Prüfer eingerichtet ist, muss dieser die Ausführung bestätigen.
8. Nach der grünen Erfolgsmeldung gelten die neuen Passwörter für neue Anmeldungen.

## Sicherheitsregeln

- Niemals Passwörter in Dateien, Issues, Pull Requests, Commit-Nachrichten oder Workflow-Eingabefelder schreiben.
- Nur die GitHub-Repository-Secrets unter **Secrets and variables → Actions** verwenden.
- Für Leitungsteam, Mitarbeiterteam und allgemeinen Bereich unterschiedliche Passwörter verwenden.
- Mindestens 12 Zeichen verwenden; besser sind lange, zufällige Passphrasen.
- Bestehende Dashboard-Sitzungen bleiben nach einer Passwortänderung höchstens acht Stunden aktiv.

Der Workflow verwendet einen kurzlebigen GitHub-OIDC-Nachweis. Die Website akzeptiert ausschließlich manuelle Läufe dieses Workflows aus dem Repository `roruffm/FCG-Dash`, vom Branch `main` und aus dem Environment `production`.
