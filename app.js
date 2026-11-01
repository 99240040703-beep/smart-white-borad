(() => {
  "use strict";
  const STORAGE_KEY = "smartboard-notes-v1";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const state = { notes: [], selectedImage: "", toastTimer: null, currentView: "overview", cameraStream: null, cameraKind: "", handModel: null, gestureStarted: 0, lastGestureCapture: 0, gestureLoop: false, gestureBusy: false };
  const esc = (value = "") => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const fmtDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
  };
  const shortDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
  };
  const readNotes = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      state.notes = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(state.notes)) state.notes = [];
    } catch (error) {
      state.notes = [];
      toast("Your browser could not read the saved notes.");
    }
  };
  const persistNotes = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
      return true;
    } catch (error) {
      toast("Browser storage is full. Download existing notes and try a smaller image.");
      return false;
    }
  };
  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove("show"), 3200);
  }
  function setView(view) {
    state.currentView = view;
    ["overview", "library", "capture"].forEach(name => {
      $("#" + name + "-view").classList.toggle("hidden", name !== view);
    });
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    $("#breadcrumb-current").textContent = view === "overview" ? "Overview" : view === "library" ? "Notes library" : "Capture board";
    $("#sidebar").classList.remove("menu-open");
    document.body.classList.remove("menu-open");
    if (view === "library") renderLibrary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function noteCard(note) {
    const title = esc(note.title || "Untitled class note");
    const subject = esc(note.subject || "Class notes");
    const description = esc(note.description || "No description added");
    return `<article class="note-card">
      <div class="note-image" data-preview="${esc(note.id)}" role="button" tabindex="0" aria-label="Preview ${title}">
        ${note.image ? `<img src="${note.image}" alt="${title}" loading="lazy">` : '<div class="note-image-placeholder">▤</div>'}
        <span class="note-tag">${subject}</span>
      </div>
      <div class="note-card-content"><h3 title="${title}">${title}</h3><p title="${description}">${description}</p>
        <div class="note-card-bottom"><span class="note-date">${fmtDate(note.createdAt)}</span>
          <div class="note-actions"><button class="mini-button" data-download="${esc(note.id)}" title="Download image" aria-label="Download ${title}">↓</button><button class="mini-button" data-delete="${esc(note.id)}" title="Delete note" aria-label="Delete ${title}">×</button></div>
        </div>
      </div>
    </article>`;
  }
  function renderDashboard() {
    const sorted = [...state.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $("#stat-total").textContent = String(state.notes.length);
    $("#nav-count").textContent = String(state.notes.length);
    $("#stat-latest").textContent = sorted.length ? shortDate(sorted[0].createdAt) : "Not yet";
    $("#stat-camera").textContent = state.cameraKind ? "Connected" : "Not connected";
    $("#recent-grid").innerHTML = sorted.slice(0, 3).map(noteCard).join("");
    $("#overview-empty").classList.toggle("hidden", sorted.length > 0);
    $("#recent-grid").classList.toggle("hidden", sorted.length === 0);
    renderLibrary();
  }
  function renderLibrary() {
    const query = ($("#search-input")?.value || "").trim().toLowerCase();
    const sort = $("#sort-select")?.value || "newest";
    const notes = state.notes.filter(note => [note.title, note.subject, note.description].some(value => String(value || "").toLowerCase().includes(query)));
    notes.sort((a, b) => sort === "oldest" ? new Date(a.createdAt) - new Date(b.createdAt) : sort === "az" ? String(a.title).localeCompare(String(b.title)) : new Date(b.createdAt) - new Date(a.createdAt));
    $("#library-grid").innerHTML = notes.map(noteCard).join("");
    $("#library-empty").classList.toggle("hidden", notes.length > 0);
    $("#library-grid").classList.toggle("hidden", notes.length === 0);
  }

  function setCameraStatus(message, connected = false) {
    $("#camera-state").textContent = message;
    $("#camera-device-dot").style.background = connected ? "#32bd83" : "#f2a93b";
    $("#camera-connection-text").textContent = message;
    $("#device-status").textContent = connected ? "Camera connected" : "Camera offline";
    $("#device-description").textContent = connected ? "Live camera preview is active." : "Connect your ESP32-CAM or device camera.";
    $("#stat-camera").textContent = connected ? "Connected" : "Not connected";
  }
  function currentCameraSource() {
    return state.cameraKind === "esp32" ? $("#esp32-stream") : $("#camera-video");
  }
  function showCameraSource(kind) {
    $("#camera-placeholder").classList.add("hidden");
    $("#camera-video").classList.toggle("hidden", kind !== "webcam");
    $("#esp32-stream").classList.toggle("hidden", kind !== "esp32");
    $("#capture-live").disabled = false;
    $("#stop-camera").disabled = false;
  }
  async function startWebcam() {
    try {
      stopCamera(false);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS or localhost in a modern browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      state.cameraStream = stream;
      const video = $("#camera-video");
      video.srcObject = stream;
      await video.play();
      state.cameraKind = "webcam";
      showCameraSource("webcam");
      setCameraStatus("Device camera connected", true);
      startGestureDetection();
      toast("Camera started. Three-finger capture is active.");
    } catch (error) {
      setCameraStatus("Camera unavailable");
      toast(error.message || "Could not start the camera. Check browser camera permission.");
    }
  }
  function connectEsp32() {
    const url = $("#esp32-url").value.trim();
    if (!url) { toast("Enter the ESP32-CAM stream URL first."); return; }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Use an HTTP or HTTPS camera URL.");
      stopCamera(false);
      const image = $("#esp32-stream");
      image.crossOrigin = "anonymous";
      image.onload = () => {
        state.cameraKind = "esp32";
        showCameraSource("esp32");
        setCameraStatus("ESP32-CAM connected", true);
        startGestureDetection();
        toast("ESP32-CAM stream connected. Gesture capture is active.");
      };
      image.onerror = () => {
        setCameraStatus("Stream connection failed");
        toast("Cannot load ESP32 stream. Check the IP, Wi-Fi, and HTTPS mixed-content restrictions.");
      };
      image.src = parsed.href + (parsed.href.includes("?") ? "&" : "?") + "t=" + Date.now();
    } catch (error) {
      toast(error.message || "Invalid camera URL.");
    }
  }
  function stopCamera(showMessage = true) {
    state.gestureLoop = false;
    state.gestureStarted = 0;
    if (state.cameraStream) state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
    const video = $("#camera-video");
    if (video) { video.pause(); video.srcObject = null; }
    const image = $("#esp32-stream");
    if (image) image.removeAttribute("src");
    state.cameraKind = "";
    if ($("#camera-video")) $("#camera-video").classList.add("hidden");
    if ($("#esp32-stream")) $("#esp32-stream").classList.add("hidden");
    if ($("#camera-placeholder")) $("#camera-placeholder").classList.remove("hidden");
    if ($("#capture-live")) $("#capture-live").disabled = true;
    if ($("#stop-camera")) $("#stop-camera").disabled = true;
    if ($("#camera-state")) setCameraStatus("Camera stopped");
    if (showMessage) toast("Camera stopped.");
  }
  function fingerCountIsThree(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;
    const index = landmarks[8].y < landmarks[6].y;
    const middle = landmarks[12].y < landmarks[10].y;
    const ring = landmarks[16].y < landmarks[14].y;
    const pinky = landmarks[20].y < landmarks[18].y;
    return index && middle && ring && !pinky;
  }
  function startGestureDetection() {
    if (!window.Hands) {
      toast("Gesture model is still loading. Refresh the page if it does not start.");
      return;
    }
    if (!state.handModel) {
      state.handModel = new Hands({ locateFile: file => "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/" + file });
      state.handModel.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });
      state.handModel.onResults(results => {
        const landmarks = results.multiHandLandmarks?.[0];
        if (fingerCountIsThree(landmarks)) {
          if (!state.gestureStarted) state.gestureStarted = Date.now();
          const held = Date.now() - state.gestureStarted;
          $("#gesture-overlay").textContent = held > 850 ? "Three fingers detected — capturing…" : "Hold three fingers…";
          if (held > 850 && Date.now() - state.lastGestureCapture > 5000) {
            state.lastGestureCapture = Date.now();
            state.gestureStarted = 0;
            captureLiveFrame("Three-finger capture");
          }
        } else {
          state.gestureStarted = 0;
          $("#gesture-overlay").textContent = "Show and hold 3 fingers to capture";
        }
      });
    }
    state.gestureLoop = true;
    runGestureLoop();
  }
  async function runGestureLoop() {
    if (!state.gestureLoop || state.gestureBusy) return;
    const source = currentCameraSource();
    const ready = state.cameraKind === "webcam" ? source?.readyState >= 2 : source?.complete && source?.naturalWidth > 0;
    if (!ready) { requestAnimationFrame(runGestureLoop); return; }
    state.gestureBusy = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      await state.handModel.send({ image: canvas });
    } catch (error) {
      // A cross-origin ESP32 stream without CORS permission can be displayed but not analyzed.
      if (state.cameraKind === "esp32") {
        $("#gesture-overlay").textContent = "Stream visible; enable CORS on ESP32 for gesture detection";
      }
    } finally {
      state.gestureBusy = false;
      if (state.gestureLoop) setTimeout(runGestureLoop, 120);
    }
  }
  function captureLiveFrame(reason = "Manual camera capture") {
    const source = currentCameraSource();
    const width = state.cameraKind === "webcam" ? source.videoWidth : source.naturalWidth;
    const height = state.cameraKind === "webcam" ? source.videoHeight : source.naturalHeight;
    if (!width || !height) { toast("No camera frame is ready yet."); return; }
    const scale = Math.min(1, 1600 / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    try {
      canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
      state.selectedImage = canvas.toDataURL("image/jpeg", 0.86);
      $("#image-preview").src = state.selectedImage;
      $("#preview-caption").textContent = reason + " · " + canvas.width + " × " + canvas.height;
      $("#upload-zone").classList.add("hidden");
      $("#image-preview-wrap").classList.remove("hidden");
      if (!$("#note-title").value.trim()) $("#note-title").value = "Whiteboard capture — " + fmtDate(new Date());
      $("#save-note").disabled = false;
      $("#gesture-overlay").textContent = reason + " ready to save";
      toast(reason + " completed. Click Save class note to add it to your library.");
    } catch (error) {
      toast("The stream cannot be captured from this page. Check ESP32 CORS and HTTPS restrictions.");
    }
  }
  function resetForm() {
    state.selectedImage = "";
    $("#image-input").value = "";
    $("#image-preview").removeAttribute("src");
    $("#image-preview-wrap").classList.add("hidden");
    $("#upload-zone").classList.remove("hidden");
    $("#note-subject").value = "";
    $("#note-title").value = "";
    $("#note-description").value = "";
    $("#save-note").disabled = true;
  }
  function useImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Choose an image file such as JPG or PNG."); return; }
    if (file.size > 8 * 1024 * 1024) { toast("Please choose an image smaller than 8 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      state.selectedImage = String(reader.result || "");
      if (!state.selectedImage.startsWith("data:image/")) { toast("Could not read this image. Try another file."); return; }
      $("#image-preview").src = state.selectedImage;
      $("#preview-caption").textContent = file.name + " · " + (file.size / 1024 / 1024).toFixed(2) + " MB";
      $("#upload-zone").classList.add("hidden");
      $("#image-preview-wrap").classList.remove("hidden");
      if (!$("#note-title").value.trim()) $("#note-title").value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      $("#save-note").disabled = false;
    };
    reader.onerror = () => toast("Unable to open that image. Please try again.");
    reader.readAsDataURL(file);
  }
  function saveNote() {
    if (!state.selectedImage) { toast("Choose a board image first."); return; }
    const note = {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      title: $("#note-title").value.trim() || "Class note — " + fmtDate(new Date()),
      subject: $("#note-subject").value.trim() || "Class notes",
      description: $("#note-description").value.trim(),
      createdAt: new Date().toISOString(),
      image: state.selectedImage
    };
    state.notes.unshift(note);
    if (!persistNotes()) { state.notes.shift(); return; }
    resetForm();
    renderDashboard();
    setView("library");
    toast("Class note saved on this device.");
  }
  function downloadNote(id) {
    const note = state.notes.find(item => item.id === id);
    if (!note) return;
    const extension = note.image.match(/^data:image\/([a-zA-Z0-9+.-]+)/)?.[1] || "jpg";
    const safeTitle = (note.title || "class-note").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70) || "class-note";
    const link = document.createElement("a");
    link.href = note.image;
    link.download = safeTitle + "." + (extension === "jpeg" ? "jpg" : extension);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("Downloading note image.");
  }
  function openPreview(id) {
    const note = state.notes.find(item => item.id === id);
    if (!note) return;
    $("#modal-title").textContent = note.title || "Class note";
    $("#modal-icon").textContent = "▤";
    $("#modal-body").innerHTML = `<img class="modal-image" src="${note.image}" alt="${esc(note.title)}"><div class="modal-meta"><strong>${esc(note.subject || "Class notes")}</strong><br>${fmtDate(note.createdAt)}</div><p class="modal-description">${esc(note.description || "No description added.")}</p>`;
    $("#modal-actions").innerHTML = '<button class="secondary-button" id="modal-close-action">Close</button><button class="primary-button" id="modal-download">↓ Download image</button>';
    $("#modal-backdrop").classList.remove("hidden");
    $("#modal-download").addEventListener("click", () => downloadNote(id));
    $("#modal-close-action").addEventListener("click", closeModal);
  }
  function closeModal() { $("#modal-backdrop").classList.add("hidden"); }
  function confirmDelete(id) {
    const note = state.notes.find(item => item.id === id);
    if (!note) return;
    $("#modal-title").textContent = "Delete this note?";
    $("#modal-icon").textContent = "×";
    $("#modal-body").innerHTML = `<p class="modal-description">“${esc(note.title)}” will be removed from this browser. Download a copy first if you want to keep it.</p>`;
    $("#modal-actions").innerHTML = '<button class="secondary-button" id="cancel-delete">Keep note</button><button class="primary-button" id="confirm-delete" style="background:#dc4c5b">Delete note</button>';
    $("#modal-backdrop").classList.remove("hidden");
    $("#cancel-delete").addEventListener("click", closeModal);
    $("#confirm-delete").addEventListener("click", () => {
      state.notes = state.notes.filter(item => item.id !== id);
      persistNotes();
      closeModal();
      renderDashboard();
      toast("Note deleted.");
    });
  }
  function showInfo(title, message) {
    $("#modal-title").textContent = title;
    $("#modal-icon").textContent = "i";
    $("#modal-body").innerHTML = '<p class="modal-description">' + esc(message) + '</p>';
    $("#modal-actions").innerHTML = '<button class="primary-button" id="info-close">Got it</button>';
    $("#modal-backdrop").classList.remove("hidden");
    $("#info-close").addEventListener("click", closeModal);
  }
  function bindEvents() {
    $$(".nav-item").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
    $$("[data-go-capture]").forEach(button => button.addEventListener("click", () => setView("capture")));
    $$("[data-go-library]").forEach(button => button.addEventListener("click", () => setView("library")));
    $("#menu-button").addEventListener("click", () => { $("#sidebar").classList.toggle("menu-open"); document.body.classList.toggle("menu-open"); });
    $("#help-button").addEventListener("click", () => showInfo("Welcome to SmartBoard", "Use Capture board to upload a whiteboard photo and save it to your notes library. This first version stores images in your browser. ESP32-CAM live capture, three-finger recognition, remote storage, and buzzer control are hardware-integration steps that are not connected yet."));
    $("#device-info").addEventListener("click", () => showInfo("Camera connection", "The dashboard UI is ready for integration, but it does not yet communicate with the ESP32 DevKit or ESP32-CAM. The next stage will define a camera endpoint and secure upload flow. Until then, use Capture board to add photos manually."));
    $("#camera-setup-button").addEventListener("click", () => showInfo("ESP32 camera setup", "Enter the ESP32-CAM stream address ending in /stream. Example: http://192.168.1.100/stream. The dashboard is HTTPS, so some browsers block insecure HTTP camera streams; if that happens, we will need an HTTPS relay. Three-finger detection also requires CORS headers on the ESP32 stream."));
    $("#start-webcam").addEventListener("click", startWebcam);
    $("#connect-esp32").addEventListener("click", connectEsp32);
    $("#capture-live").addEventListener("click", () => captureLiveFrame("Manual camera capture"));
    $("#stop-camera").addEventListener("click", () => stopCamera(true));
    window.addEventListener("beforeunload", () => stopCamera(false));
    $("#image-input").addEventListener("change", event => useImage(event.target.files?.[0]));
    $("#browse-button").addEventListener("click", () => $("#image-input").click());
    $("#upload-zone").addEventListener("click", event => { if (!event.target.closest("button")) $("#image-input").click(); });
    $("#upload-zone").addEventListener("dragover", event => { event.preventDefault(); $("#upload-zone").classList.add("dragover"); });
    $("#upload-zone").addEventListener("dragleave", () => $("#upload-zone").classList.remove("dragover"));
    $("#upload-zone").addEventListener("drop", event => { event.preventDefault(); $("#upload-zone").classList.remove("dragover"); useImage(event.dataTransfer.files?.[0]); });
    $("#remove-image").addEventListener("click", () => { state.selectedImage = ""; $("#image-input").value = ""; $("#image-preview-wrap").classList.add("hidden"); $("#upload-zone").classList.remove("hidden"); $("#save-note").disabled = true; });
    $("#save-note").addEventListener("click", saveNote);
    $("#reset-form").addEventListener("click", resetForm);
    $("#search-input").addEventListener("input", renderLibrary);
    $("#sort-select").addEventListener("change", renderLibrary);
    $("#clear-search").addEventListener("click", () => { $("#search-input").value = ""; renderLibrary(); });
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-backdrop").addEventListener("click", event => { if (event.target === $("#modal-backdrop")) closeModal(); });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { closeModal(); $("#sidebar").classList.remove("menu-open"); document.body.classList.remove("menu-open"); }
      const preview = event.target.closest?.("[data-preview]");
      if (preview && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openPreview(preview.dataset.preview); }
    });
    document.addEventListener("click", event => {
      const preview = event.target.closest("[data-preview]");
      const download = event.target.closest("[data-download]");
      const remove = event.target.closest("[data-delete]");
      if (preview) openPreview(preview.dataset.preview);
      if (download) { event.stopPropagation(); downloadNote(download.dataset.download); }
      if (remove) { event.stopPropagation(); confirmDelete(remove.dataset.delete); }
    });
  }
  readNotes();
  bindEvents();
  renderDashboard();
})();