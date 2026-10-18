# SmartBoard — Classroom Notes Dashboard

A free, responsive dashboard prototype for a smart whiteboard project using an **ESP32 DevKit**, **ESP32-CAM**, and a buzzer.

## Current dashboard features

- Responsive overview with note counts and latest saved note.
- Notes library with search and sorting.
- Upload a whiteboard photo from a computer or phone.
- Add subject, title, and description to each note.
- Preview, download, and delete saved photos.
- Browser-local persistence using `localStorage`.
- Capture workflow and device-connection status placeholders.
- No framework, build step, API key, or paid service required.

## Run locally

1. Download or clone this repository.
2. Open `index.html` in a modern browser, or use the **Live Server** extension in VS Code.
3. Select **Capture board**, choose an image, add a title, and click **Save class note**.

Everything in this prototype is free. The Google Fonts import is optional; system fonts are used as fallbacks.

## Publish free with GitHub Pages

1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select branch `main` and folder `/ (root)`, then save.
4. Wait for deployment. The site URL will be shown on the Pages settings screen.

The site is static and can also be hosted on any static web host.

## Important: hardware is not connected yet

This repository currently contains the **dashboard UI and browser-side note library only**. It does not yet connect to the ESP32-CAM, detect three fingers, control the buzzer, or upload to a remote database. Camera and gesture status labels are honest placeholders, not live device readings.

### Planned hardware integration

1. Configure the ESP32-CAM to capture a JPEG image and provide a capture/upload endpoint over the local Wi-Fi network.
2. Define a small authenticated API contract between the dashboard and device.
3. Add three-finger recognition after choosing a feasible inference location (ESP32-CAM, or a computer/server if the model is too large).
4. Trigger the buzzer **once per successfully confirmed capture**, with debounce/cooldown to prevent repeated photos while the gesture remains visible.
5. Add a backend and remote storage only if notes must be accessible across devices or when the local computer is offline.

Do not expose an unauthenticated camera endpoint to the public internet. For remote access, use an authenticated backend rather than forwarding the ESP32 directly.

## Storage notes

Saved images are stored in the browser's local storage for this prototype. Browser storage is limited and is not a backup; clearing site data can delete notes. Download important images. A later version should use IndexedDB for larger local collections or a backend/object store for remote access.

## Project files

- `index.html` — dashboard structure and screens
- `styles.css` — responsive visual design
- `app.js` — upload, local note library, search, preview, download, and delete behavior

## License

Released under the MIT License. See `LICENSE`.
