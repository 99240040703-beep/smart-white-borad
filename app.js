(() => {
  "use strict";
  const STORAGE_KEY = "smartboard-notes-v1";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const state = { notes: [], selectedImage: "", toastTimer: null, currentView: "overview" };
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
    $("#stat-camera").textContent = "Not connected";
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
    $("#camera-setup-button").addEventListener("click", () => showInfo("ESP32 camera setup", "Planned integration: connect the ESP32-CAM and dashboard through the same Wi-Fi network, expose a capture/upload endpoint, and verify each successful capture before triggering one short buzzer beep. No device is currently connected."));
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