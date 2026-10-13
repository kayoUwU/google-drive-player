
/* exported:
gapiLoaded 
gisLoaded
handleAuthClick
handleSignoutClick
clearStorage
playPrevious
playNext
pickTracks
syncCurrentPlaylistToDrive
pickFolder
playPlayList
pickDrivePlaylist
pickTracks
*/

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email";

const API_KEY = config.API_KEY;
const CLIENT_ID = config.CLIENT_ID;
const APP_ID = config.APP_ID;

let tokenClient;
let accessToken = null; //gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
let pickerInited = false;
let gisInited = false;

let isFetchRecursively = true;
let cacheEnabled = true;
let selectedPlaylist = "";
let tracksList = [];
let currentTrackIndex = 0;

const CACHE_NAME = "gdrive-audio-cache-v1";
const STORAGE_PLAYLIST_NAME = "drive_playlists";
const STORAGE_USEREMAIL_NAME = "google_user_email";

const authorizeBtn = document.getElementById("authorize_button");
const signoutBtn = document.getElementById("signout_button");
const authDiv = document.getElementById("auth_div");

const player = document.getElementById("audio_player");
const playerControl = document.getElementById("player_controls");
const listTitle = document.getElementById("list_title");
const nowPlaying = document.getElementById("now_playing");
const playlistSelector = document.getElementById("playlist_selector");
const addTracksBtn = document.getElementById("add_tracks_btn");
const syncTracksBtn = document.getElementById("sync_btn");
const newPlaylistName = document.getElementById("new_playlist_name");


function init() {
  console.log("init");
  authorizeBtn.style.visibility = "hidden";
  signoutBtn.style.visibility = "hidden";
  authDiv.style.display = "none";
}
init();

/**
 * Callback after api.js is loaded.
 */
function gapiLoaded() {
  gapi.load("client:picker", initializePicker);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
async function initializePicker() {
  await gapi.client.load(
    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
  );
  pickerInited = true;
  maybeEnableButtons();
}

/**
 * Callback after Google Identity Services are loaded.
 */
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: "", // defined later
    error_callback: (error) => {
      // Captures prompt='none' execution failures and user cancellation
      console.error("Auth error_callback: ", error);
      signout();
      alert("Authorization error. Please sign in again.");
    }
  });
  gisInited = true;
  maybeEnableButtons();
}

/**
 * Enables user interaction after all libraries are loaded.
 */
function maybeEnableButtons() {
  console.log("pickerInited && gisInited", pickerInited && gisInited);
  if (pickerInited && gisInited) {
    document.getElementById("authorize_button").style.visibility =
      "visible";
  }
}

async function fetchUserEmail(accessToken) {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const userInfo = await response.json();
  console.log("userInfo", userInfo); // The user's email address
  return userInfo.email;
}

async function authCallback(response, savedEmail) {
  if (response.error !== undefined) {
    throw response;
  }
  accessToken = response.access_token;
  signoutBtn.style.visibility = "visible";
  authorizeBtn.innerText = "Refresh";
  authDiv.style.display = "block";

  if (!savedEmail) {
    // save email for token login_hint
    const email = await fetchUserEmail(accessToken);
    if (email) {
      localStorage.setItem(STORAGE_USEREMAIL_NAME, email);
      console.log("email", email);
    }
  }
  //user can select another email,  use fetchUserEmail everytime if need to get the lastest email

  updatePlaylistDropdown();
}

async function auth(callback) {
  const savedEmail = localStorage.getItem(STORAGE_USEREMAIL_NAME);

  tokenClient.callback = async (response) => {
    try {
      await authCallback(response, savedEmail);
    } catch (error) {
      console.error("Auth error: ", error);
      signout();
      alert("Authorization error. Please sign in again.");
    }
    if (callback !== undefined) {
      await callback();
    }
  };

  //cant use prompt: "none", error.type === 'popup_closed', browser blowck the popup

  // refresh token silently. if fails, call error_callback
  // Skip display of account chooser and consent dialog for an existing session.
  // tokenClient.requestAccessToken({ prompt: "none" });


  if (savedEmail) {
    //skip popup completely if user is  pre-authorized
    tokenClient.requestAccessToken({
      prompt: '',
      login_hint: savedEmail,
    });
  } else {
    // Prompt the user to select a Google Account and ask for consent to share their data
    // when establishing a new session.
    tokenClient.requestAccessToken({ prompt: "consent" });
  }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick() {
  auth(undefined);
}

function clearPlayerSong() {
  if (player) {
    player.pause();          // 1. Stop active playback
    player.src = "";         // 2. Empty out the source string
    player.load();           // 3. Force the browser to reset the player UI
  }
  nowPlaying.innerHTML = "";
  listTitle.innerHTML = "";

  selectedPlaylist = "";
  tracksList = [];
  currentTrackIndex = 0;
  loadPlaylistTracks();

}

/**
 *  Sign out the user upon button click.
 */
function signout() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
    accessToken = null;
  }
  authorizeBtn.innerText = "Authorize";
  signoutBtn.style.visibility = "hidden";
  authDiv.style.display = "none";

  localStorage.removeItem(STORAGE_USEREMAIL_NAME);
  clearStorage();
}

function handleSignoutClick() {
  const isSignoutConfrim = confirm("signout?");
  if(isSignoutConfrim)signout();
}

function clearStorage() {
  clearPlayerSong();

  localStorage.removeItem(STORAGE_PLAYLIST_NAME);
  caches.delete(CACHE_NAME);

  savedPlaylists = {};

  updatePlaylistDropdown();
}

/**
 * audio player
 */

function playPrevious() {
  if (tracksList.length === 0) return;

  // Wrap around to the end of the tracksList if clicking "back" on the first track
  if (currentTrackIndex === 0) {
    currentTrackIndex = tracksList.length - 1;
  } else {
    currentTrackIndex--;
  }

  playTrack(tracksList[currentTrackIndex]);
}

function playNext() {
  if (tracksList.length === 0) return;

  // Wrap around to the beginning of the tracksList if clicking "forward" on the last track
  if (currentTrackIndex === tracksList.length - 1) {
    currentTrackIndex = 0;
  } else {
    currentTrackIndex++;
  }

  playTrack(tracksList[currentTrackIndex]);
}

function playSelectedTrack(key) {
  if (currentTrackIndex !== key) {
    currentTrackIndex = key;
    playTrack(tracksList[currentTrackIndex]);
  }
}

async function getTrackFromCache(file) {
  let audioBlob = undefined;
  try {
    if (cacheEnabled) {
      // Open the browser's persistent cache storage
      const cache = await caches.open(CACHE_NAME);

      // Check if we already downloaded this specific file ID before
      const cachedResponse = await cache.match(file.id);

      if (cachedResponse) {
        console.log(
          `🎯 Cache Hit! Loading "${file.name}" from local storage (0MB Data used).`,
        );
        audioBlob = await cachedResponse.blob();
      } else {
        console.log(
          `❌ Cache Miss. Downloading file "${file.name}" from Google Drive...`,
        );
      }
    }
  } catch (error) {
    console.error("Error from getting track from cache:", error);
  } finally {
    return audioBlob;
  }
}


async function getTrackFromDrive(file) {
  let audioBlob = undefined;

  // cant use gapi.client.drive.files.get for getting binary blob
  // const res = await gapi.client.drive.files.get({
  //   fileId: file.id,
  //   fields: "*",
  // });
  // console.log(res);
  // console.log(`Drive API response for document: \n${JSON.stringify(res.result, null, 2)}\n`);

  try {
    // getting binary blob: https://developers.google.com/workspace/drive/api/guides/manage-downloads#downloading_a_file
    const googleApiUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
    console.log("Playing: " + file.name, "url", googleApiUrl);

    // Fetch the audio data with your Access Token
    const response = await fetch(googleApiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch audio: ${response.status} ${response.statusText}`,
      );
    }

    // Convert the stream response into a binary Blob
    if (cacheEnabled) {
      //clone the response because it can only be read once
      // Save the uncompressed bytes into the local browser cache using the unique fileId as the key
      const cache = await caches.open(CACHE_NAME);
      await cache.put(file.id, response.clone());
      console.log(
        `Successfully saved "${file.name}" to local cache for future playbacks.`,
      );

    }
    audioBlob = await response.blob();
  } catch (error) {
    console.error("Error from getting track from drive:", error);

    //accessToken = null; // Clear out the bad credential state

    const userWantsToRefresh = confirm(
      "Your access token has expired. Would you like to refresh your session to pull files?",
    );

    if (userWantsToRefresh) {
      handleAuthClick();
    }
  } finally {
    return audioBlob;
  }
}

async function playTrack(file) {
  if (playerControl.disabled) {
    return;
  }
  playerControl.disabled = true;

  try {
    let audioBlob = await getTrackFromCache(file);


    if (audioBlob === undefined) {
      audioBlob = await getTrackFromDrive(file);
    }

    if (audioBlob === undefined) {
      throw new Error(
        `Failed to play the track`,
      );
    }

    // Create a temporary, local URL pointing to that Blob
    const blobUrl = URL.createObjectURL(audioBlob);

    // Pass the local URL to the new Audio object
    nowPlaying.innerText = `Now playing: ${file.name}`;

    // Clear any previous track configurations
    player.innerHTML = "";

    // Create a new source element dynamically
    const sourceElement = document.createElement("source");
    sourceElement.src = blobUrl;

    // load the correct codec in player
    // Force the browser to read the container correctly using Google's metadata
    sourceElement.type = file.mimeType;

    player.appendChild(sourceElement);

    // Re-verify and refresh the browser's decoding pipelines
    player.load();

    player
      .play()
      .catch((err) => console.log("Playback decoding error:", err));

    // Clean up blob URL memory when the song switches or ends
    player.onended = () => {
      URL.revokeObjectURL(blobUrl);
      playNext(); // This handler now gets priority wake-up signals via MediaSession
    };

    // Tell the Phone's Lock Screen what is playing
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: file.name,
        artist: "Google Drive Player",
        album: "My Folder Playlist",
      });

      // Link the lock screen hardware buttons to your index functions
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        playPrevious(); // Triggers your back index function from the lock screen
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        playNext(); // Triggers your forward index function from the lock screen
      });
    }


    // // or just auto Play the audio in backgroud without player control
    // const audio = new Audio(blobUrl);
    // await audio.play();
    // console.log("Audio is playing successfully!");
    // // Clean up memory after the audio finishes playing
    // audio.onended = () => {
    //   URL.revokeObjectURL(blobUrl);
    // };

  } catch (error) {
    console.error("Error playing audio:", error);
  } finally {
    playerControl.disabled = false;
  }

}

/**
 * Play tracks from drive folders
 */

/**
 * Recursive Scan from provided folder to sub folder
 */
async function fetchFolderRecursively(folder) {
  const folderId = folder.id;
  try {
    // Query Google Drive for BOTH audio tracks AND child folders strictly inside THIS folder level
    const response = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType = 'video/webm' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`,
      fields: "files(id, name, mimeType)",
      orderBy: "name",
    });

    const items = response.result.files || [];
    console.log(`Drive API response for folder ${folder.name}: \n${JSON.stringify(response.result, null, 2)}\n`);
    for (const item of items) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        // Found a nested subfolder inside the chosen directory -> Crawl deeper
        console.log(`📁 Diving into subfolder: ${item.name}`);
        await fetchFolderRecursively(item);
      } else {
        // Found a playable audio track -> Add it to our isolated playlist
        tracksList.push(item);
      }
    }
  } catch (error) {
    console.error(`Failed reading folder section ${folderId}:`, error);
  }
}

async function fetchFolderTracks(folderId, folderName) {
  var query = `'${folderId}' in parents and (mimeType contains 'audio/' or mimeType = 'video/webm') and trashed = false`;
  await gapi.client.drive.files
    .list({
      q: query,
      fields: "files(id, name, webContentLink, mimeType)",
      orderBy: "name", // Keeps the tracksList sorted alphabetically
    })
    .then(function (response) {
      tracksList = response.result.files;

      if (tracksList && tracksList.length > 0) {
        console.log(`Drive API response for folder ${folderName}: \n${JSON.stringify(response.result, null, 2)}\n`);
        // Play the first track or create a tracksList loop
        playTrack(tracksList[currentTrackIndex]);
      } else {
        alert("No audio files found in this folder!");
      }
    });
}

async function folderPickerCallback(data) {
  if (
    data[google.picker.Response.ACTION] == google.picker.Action.PICKED
  ) {
    playlistSelector.value = "";
    listTitle.textContent = `Live Folder: ${data.docs[0].name}`;
    currentTrackIndex = 0;
    tracksList = [];
    if (isFetchRecursively) {
      await fetchFolderRecursively(data.docs[0]).then(() => {
        if (tracksList && tracksList.length > 0) {
          addTracksBtn.disabled = true;
          addTracksBtn.style.display = "none";
          syncTracksBtn.disabled = true;
          syncTracksBtn.style.display = "none";
          selectedPlaylist = "";
          loadPlaylistTracks(tracksList);
          // Play the first track or create a tracksList loop
          playTrack(tracksList[currentTrackIndex]);
        } else {
          alert("No audio files found in this folder!");
        }
      });
    } else {
      await fetchFolderTracks(data.docs[0].id, data.docs[0].name);
    }
  }
}

function showFolderPicker() {
  if (pickerInited && gisInited && accessToken) {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setMimeTypes("application/vnd.google-apps.folder")
      .setSelectFolderEnabled(true);
    const picker = new google.picker.PickerBuilder()
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setOAuthToken(accessToken)
      .setSelectableMimeTypes("application/vnd.google-apps.folder")
      .addView(view)
      .setCallback(folderPickerCallback)
      // for browser cors: Explicitly tell Google your exact web origin
      .setOrigin(window.location.protocol + "//" + window.location.host)
      .build();
    picker.setVisible(true);
  }
}
async function pickFolder() {
  await auth(showFolderPicker);
}

// --- PLAYLIST MANAGEMENT ---
// Local copy of playlist
// save the playlist back to Google Drive when sync
let savedPlaylists = JSON.parse(
  localStorage.getItem(STORAGE_PLAYLIST_NAME) || "{}",
);

// Populate the Selector
function updatePlaylistDropdown() {
  const select = playlistSelector;
  // Clear the existing dropdown contents completely
  select.innerHTML = "";

  // Create and configure the initial structural placeholder option
  const initialOption = document.createElement("option");
  initialOption.value = "";
  initialOption.textContent = "-- Choose a Playlist --";
  initialOption.disabled = true; // Prevents the user from re-selecting the placeholder once a playlist is open
  initialOption.selected = true; // Sets it as the active default visibility option on page load

  // Append the placeholder option first
  select.appendChild(initialOption);

  Object.keys(savedPlaylists).forEach((name) => {
    let opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

async function pickTracks(mode) {
  const callback = () => {
    openPlaylistTrackPicker(mode);
  }
  await auth(callback);
}

/**
 *  Create and render a Google Picker object for choosing tracks.
 */
function openPlaylistTrackPicker(mode) {
  let playlistName = '';
  if (mode === "append"
  ) {
    if (!selectedPlaylist) {
      alert("Please select a playlist first.");
      return;
    }
    playlistName = selectedPlaylist;
  }
  if (
    mode === "create"

  ) {
    if (!newPlaylistName.value.trim()) {
      alert("Please type a playlist name first.");
      return;
    }
    playlistName = newPlaylistName.value.trim();
  }



  if (pickerInited && gisInited && accessToken) {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes(
      "audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,'video/webm'",
    );

    const callback = (data) => {
      playlistTrackPickerCallback(playlistName, mode, data);
    }

    const picker = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setOAuthToken(accessToken)
      .addView(view)
      .addView(new google.picker.DocsUploadView())
      .setCallback(callback)
      //for cors: Explicitly tell Google your exact web origin
      .setOrigin(window.location.protocol + "//" + window.location.host)
      .build();
    picker.setVisible(true);
  }
}

// save selected files to playlist
function playlistTrackPickerCallback(playlistName, pickerMode, data) {
  if (data[google.picker.Response.ACTION] != google.picker.Action.PICKED)
    return;
  const docs = data[google.picker.Response.DOCUMENTS];

  const selectedTracks = docs.map((doc) => ({
    id: doc[google.picker.Document.ID],
    name: doc[google.picker.Document.NAME],
    mimeType: doc[google.picker.Document.MIME_TYPE],
  }));

  console.log(
    playlistName,
    " playlistTrackPickerCallback selectedTracks:",
    selectedTracks,
  );

  if (pickerMode === "create") {
    savedPlaylists[playlistName] = {
      driveFileId: null,
      tracks: selectedTracks,
    };
    localStorage.setItem(
      STORAGE_PLAYLIST_NAME,
      JSON.stringify(savedPlaylists),
    );
    newPlaylistName.value = "";
    updatePlaylistDropdown();
    playlistSelector.value = playlistName; // Auto-select new list
    loadPlaylistTracks(selectedTracks);
  } else if (pickerMode === "append") {
    // Append without structural duplicates
    let isChanged = false;
    selectedTracks.forEach((track) => {
      const exists = savedPlaylists[playlistName].tracks.some(
        (t) => t.id === track.id,
      );
      if (!exists) {
        savedPlaylists[playlistName].tracks.push(track);
        isChanged = true;
      }
    });
    if (isChanged) {
      localStorage.setItem(
        STORAGE_PLAYLIST_NAME,
        JSON.stringify(savedPlaylists),
      );
      loadPlaylistTracks(savedPlaylists[playlistName].tracks);
    }
  }
}

// Utility deletion trigger directly embedded inside tracks interface
function removeTrack(playlistName, index) {
  if (!savedPlaylists[playlistName] || savedPlaylists[playlistName].tracks.length <= index) {
    return;
  }

  const isRemoveConfrim = confirm("remove track?");

  if (isRemoveConfrim) {
    savedPlaylists[playlistName].tracks.splice(index, 1);
    if (savedPlaylists[playlistName].tracks.length <= currentTrackIndex) {
      currentTrackIndex = 0;
    }
    localStorage.setItem(
      STORAGE_PLAYLIST_NAME,
      JSON.stringify(savedPlaylists),
    );
    loadPlaylistTracks(savedPlaylists[playlistName].tracks); // Instantly refresh layout views
  }
}

function playPlayList() {
  if (selectedPlaylist === playlistSelector.value) {
    return;
  }
  selectedPlaylist = playlistSelector.value;

  if (!selectedPlaylist) {
    addTracksBtn.disabled = true;
    addTracksBtn.style.display = "none";
    syncTracksBtn.disabled = true;
    syncTracksBtn.style.display = "none";
    return;
  }
  loadPlaylistTracks(savedPlaylists[selectedPlaylist].tracks);
  addTracksBtn.disabled = false;
  addTracksBtn.style.display = "block";
  syncTracksBtn.disabled = false;
  syncTracksBtn.style.display = "block";

  listTitle.textContent = `Live Playlist: ${playlistSelector.value}`;

  currentTrackIndex = 0;
  tracksList = savedPlaylists[selectedPlaylist].tracks;
  console.log("Ready to fetch IDs: ", tracksList);

  if (tracksList && tracksList.length > 0) {
    // Play the first track or create a tracksList loop
    playTrack(tracksList[currentTrackIndex]);
  } else {
    alert("No audio files found in this folder!");
  }
}

// Renders the selected playlist tracks to the UI and extracts file IDs
function loadPlaylistTracks(tracks) {
  const listEl = document.getElementById("active_track_list");
  const emptyEl = document.getElementById("playlist_empty");

  // Clear out any previously displayed tracks in the UI
  listEl.innerHTML = "";

  // If the user selected the blank placeholder option ("-- Choose a Playlist --")
  if (!tracks) {
    emptyEl.style.display = "block";
    listEl.style.display = "none";
    return;
  }

  // A valid playlist is selected; reveal actions and hide the empty notification
  emptyEl.style.display = "none";
  listEl.style.display = "block"; // Unhide the scroll container box

  // Case A: The playlist exists, but has 0 files inside it
  if (tracks.length === 0) {
    listEl.innerHTML =
      '<div class="empty-state">No songs in this playlist yet. Click "Add Tracks" to pick some!</div>';
  }
  // Case B: The playlist has tracks. Build the interactive UI elements
  else {
    tracks.forEach((track, index) => {
      const li = document.createElement("li");
      li.className = "track-item";
      li.onclick = () => playSelectedTrack(index);

      let innerHtml = '';

      // Build out the text wrappers and inject an inline trash icon tied to this track's specific index
      innerHtml = `
                <div class="track-name">${track.name}</div>
                <div class="track-info">
                    <span class="track-meta">
                        <span class="badge">${track.mimeType}</span> 
                        ID: ${track.id}
                    </span>
            `;
      if (selectedPlaylist) {
        innerHtml += `<button class="track-delete" onclick="removeTrack('${selectedPlaylist}', ${index})" title="Remove track">🗑️</button>`;
      }
      innerHtml += '</div>';
      li.innerHTML = innerHtml;
      listEl.appendChild(li);
    });
  }
}

//------------- backup playlist
/**
 * Downloads a playlist json layout profile by its file ID and restores it to active memory.
 * @param {string} driveFileId - The unique file ID of the JSON layout inside Google Drive.
 */
async function loadPlaylistFromDrive(driveFileId) {
  if (!accessToken) {
    alert("Authorization required before loading files.");
    return;
  }

  try {
    // Fetch raw media content by appending ?alt=media parameter to your standard asset ID
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok)
      throw new Error("Could not parse file data stream.");

    const downloadedPlaylist = await response.json();
    console.log("Drive Load Success:", downloadedPlaylist);

    //TODO check if the json is playlist

    // Map data back into your global local state engine memory hook
    const name = downloadedPlaylist.playlist_name;
    savedPlaylists[name] = {
      driveFileId: driveFileId, // Preserves file link structure
      tracks: downloadedPlaylist.tracks,
    };

    localStorage.setItem(
      STORAGE_PLAYLIST_NAME,
      JSON.stringify(savedPlaylists),
    );

    // Update dropdown
    if (!savedPlaylists[name]) {
      updatePlaylistDropdown();
    }

    if (selectedPlaylist === name) {
      playlistSelector.value = name;
      loadPlaylistTracks(savedPlaylists[name].tracks);
    }
  } catch (error) {
    console.error("Failed to parse file from Drive destination:", error);
    alert("Could not load selected configuration.");
  }
}

function pickDrivePlaylist() {
  auth(openDrivePlaylistJsonPicker);
}

// Opens a Picker that filters specifically for your saved configuration files
function openDrivePlaylistJsonPicker() {
  if (pickerInited && gisInited && accessToken) {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes("application/json");

    const picker = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback((data) => {
        if (
          data[google.picker.Response.ACTION] == google.picker.Action.PICKED
        ) {
          const doc = data[google.picker.Response.DOCUMENTS][0];
          loadPlaylistFromDrive(doc[google.picker.Document.ID]);
        }
      })
      // for browser cors: Explicitly tell Google your exact web origin
      .setOrigin(window.location.protocol + "//" + window.location.host)
      .build();
    picker.setVisible(true);
  }
}

async function syncCurrentPlaylistToDrive() {
  if (!selectedPlaylist || !savedPlaylists[selectedPlaylist]) return;

  syncTracksBtn.innerText = "Syncing...";
  syncTracksBtn.disabled = true;

  const playlistObj = savedPlaylists[selectedPlaylist];
  const fileId = playlistObj.driveFileId;

  const payload = {
    playlist_name: selectedPlaylist,
    tracks: playlistObj.tracks,
    last_updated: new Date().toISOString(),
  };

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  try {
    let url =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    let method = "POST";

    const metadata = { mimeType: "application/json" };
    if (!fileId) {
      // First time syncing: define the filename
      metadata.name = `${selectedPlaylist}.json`;
    } else {
      // Updating an existing file: change endpoint and method
      url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
      method = "PATCH";
    }

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      JSON.stringify(payload) +
      close_delim;

    const response = await fetch(url, {
      method: method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) throw new Error(await response.text());

    const result = await response.json();

    // Save the Drive File ID if this was a fresh creation
    if (!fileId) {
      savedPlaylists[selectedPlaylist].driveFileId = result.id;
      localStorage.setItem(
        STORAGE_PLAYLIST_NAME,
        JSON.stringify(savedPlaylists),
      );
    }

    alert(`"${selectedPlaylist}" successfully synced to Google Drive!`);
  } catch (error) {
    console.error("Sync failed:", error);
    alert("Syncing failed. Check network headers or console logs.");
  } finally {
    syncTracksBtn.innerText = "☁️ Sync to Drive";
    syncTracksBtn.disabled = false;
  }
}
