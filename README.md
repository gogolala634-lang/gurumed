# MedGURU

**Offline medical study. Import your ZIP packs. Just study.**
Made by **Dr Sarwar Alam**. No accounts · no tracking · no internet permission.

Works with MingMing-format packs: **qbanks**, **flashcards**, and **article libraries**
(`Docs` + `TOC`). Your existing ZIPs import unchanged.

## Get the APK (no tools to install)

1. Create a new GitHub repo named `medguru`.
2. Add the 19 project files (Add file → Create new file, or the direct `/new/main` URL).
3. Open the **Actions** tab → “Build MedGURU APK” runs automatically (~10 min first time).
4. When it finishes: **Artifacts → MedGURU-APK** → download → unzip → install the `.apk`
   on your Android phone (allow “install unknown apps” once).
5. In the app: **Packs → Import ZIP** → pick your pack → study.

Three sample packs (qbank, cards, guide) are included on first launch so you can try
every feature immediately. Delete them anytime.

## Share with friends

- Send them the APK file directly, **or**
- GitHub → **Releases → Draft a new release** → tag `v1.0.0` → Publish.
  The workflow attaches the APK to the release automatically.

## Updates that install over the old version (recommended, one-time)

The first build generates a signing key and uploads it as the artifact
**`medguru-signing-key`**. To keep the same signature on every build:

1. Download that artifact (it contains `medguru.keystore`).
2. Encode it: `base64 -w0 medguru.keystore`
3. Repo **Settings → Secrets and variables → Actions** → add:
   - `KEYSTORE_BASE64` = the output
   - `STORE_PASSWORD` = `medguru`
   - `KEY_PASSWORD` = `medguru`

Without these secrets every build uses a fresh key, and friends must uninstall before
installing a newer build. With them, updates install normally.

## Privacy

The Android manifest has **no INTERNET permission** (removed at build time).
All progress lives in a private on-device SQLite file. Deleting a pack keeps your
progress; re-importing the same pack restores it.
