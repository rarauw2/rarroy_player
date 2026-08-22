const GITHUB_USER = 'rarauw2'; 
const GITHUB_REPO = 'rarroy_player';
const BRANCH = 'main'; 

// Elementos del DOM
const audio = document.getElementById('audio-engine');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const seekBar = document.getElementById('seek-bar');
const volumeBar = document.getElementById('volume-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const trackTitle = document.getElementById('track-title');
const trackArtist = document.getElementById('track-artist');
const trackCover = document.getElementById('track-cover');
const treeContainer = document.getElementById('tree-container');
const folderInput = document.getElementById('folder-input');

const DEFAULT_COVER = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23e2e8f0'><rect width='100' height='100'/></svg>";

let flatPlaylist = [];
let currentTrackIndex = 0;

function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// Extrae metadatos ID3 pasando un Blob descargado para evitar fallos de rango HTTP
async function extractMetadata(source) {
  return new Promise(async (resolve) => {
    if (!window.jsmediatags) {
      return resolve(null);
    }

    let targetFile = source;

    // Si viene como URL string, lo convertimos a Blob
    if (typeof source === 'string') {
      try {
        const res = await fetch(source);
        if (!res.ok) throw new Error('Fetch falló');
        targetFile = await res.blob();
      } catch (err) {
        return resolve(null);
      }
    }

    window.jsmediatags.read(targetFile, {
      onSuccess: (tag) => {
        const { title, artist, picture } = tag.tags;
        let coverUrl = DEFAULT_COVER;

        if (picture) {
          const byteArray = new Uint8Array(picture.data);
          let binary = '';
          for (let i = 0; i < byteArray.byteLength; i++) {
            binary += String.fromCharCode(byteArray[i]);
          }
          const base64String = window.btoa(binary);
          coverUrl = `data:${picture.format};base64,${base64String}`;
        }

        resolve({
          title: title,
          artist: artist,
          coverUrl: coverUrl
        });
      },
      onError: () => resolve(null)
    });
  });
}

// Carga de pista
async function loadTrack(index) {
  if (flatPlaylist.length === 0) return;
  currentTrackIndex = index;
  const track = flatPlaylist[index];

  // Limpiar carátula y poner nombre del archivo
  trackCover.src = DEFAULT_COVER;
  trackTitle.textContent = track.fileName;
  trackArtist.textContent = track.albumFolderName;

  if (audio.src && audio.src.startsWith('blob:')) {
    URL.revokeObjectURL(audio.src);
  }

  const source = track.file || track.url;
  audio.src = track.file ? URL.createObjectURL(track.file) : track.url;

  updateSelectionUI();

  // Extraer metadatos ID3 en segundo plano
  const meta = await extractMetadata(source);
  if (meta && currentTrackIndex === index) {
    if (meta.title) trackTitle.textContent = meta.title;
    if (meta.artist) trackArtist.textContent = `${meta.artist} • ${track.albumFolderName}`;
    trackCover.src = meta.coverUrl;
  }
}

function updateSelectionUI() {
  document.querySelectorAll('.track-item').forEach((el) => {
    const idx = parseInt(el.getAttribute('data-index'), 10);
    el.classList.toggle('active', idx === currentTrackIndex);
  });
}

function togglePlay() {
  if (flatPlaylist.length === 0) return;
  if (audio.paused) {
    audio.play();
    playBtn.textContent = '⏸';
  } else {
    audio.pause();
    playBtn.textContent = '▶';
  }
}

function renderLibraryTree(groupedTracks) {
  treeContainer.innerHTML = '';
  flatPlaylist = [];
  let globalIndex = 0;

  for (const [albumName, tracks] of Object.entries(groupedTracks)) {
    const group = document.createElement('div');
    group.className = 'album-group';

    const header = document.createElement('div');
    header.className = 'album-title';
    header.textContent = `📁 ${albumName}`;
    group.appendChild(header);

    tracks.forEach((track) => {
      flatPlaylist.push(track);
      const currentIndex = globalIndex;

      const trackEl = document.createElement('div');
      trackEl.className = 'track-item';
      trackEl.setAttribute('data-index', currentIndex);
      trackEl.textContent = track.fileName;

      trackEl.addEventListener('click', () => {
        loadTrack(currentIndex);
        audio.play();
        playBtn.textContent = '⏸';
      });

      group.appendChild(trackEl);
      globalIndex++;
    });

    treeContainer.appendChild(group);
  }
}

// Carga desde GitHub API
async function loadFromGitHubAPI() {
  treeContainer.innerHTML = '<p class="empty-msg">Sincronizando canciones...</p>';

  try {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/songs?ref=${BRANCH}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al conectar con la API de GitHub');
    
    const contents = await res.json();
    const albumFolders = contents.filter(item => item.type === 'dir');
    const groupedTracks = {};

    for (const album of albumFolders) {
      const albumRes = await fetch(album.url);
      const albumContents = await albumRes.json();
      
      const tracks = albumContents
        .filter(f => f.type === 'file' && /\.(mp3|m4a|wav|ogg|flac)$/i.test(f.name))
        .map(f => ({
          fileName: f.name.replace(/\.[^/.]+$/, ''),
          albumFolderName: album.name,
          url: `songs/${encodeURIComponent(album.name)}/${encodeURIComponent(f.name)}`
        }));

      if (tracks.length > 0) {
        groupedTracks[album.name] = tracks;
      }
    }

    renderLibraryTree(groupedTracks);
    if (flatPlaylist.length > 0) {
      loadTrack(0);
    } else {
      treeContainer.innerHTML = '<p class="empty-msg">No se encontraron audios en /songs.</p>';
    }
  } catch (error) {
    console.error(error);
    treeContainer.innerHTML = '<p class="empty-msg">Usa el botón "Cargar carpeta".</p>';
  }
}

// Carga manual local alternativa
folderInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
  if (files.length === 0) return;

  const grouped = {};
  files.forEach(file => {
    const parts = file.webkitRelativePath.split('/');
    const album = parts.length > 2 ? parts[parts.length - 2] : 'Canciones sueltas';

    if (!grouped[album]) grouped[album] = [];
    grouped[album].push({
      fileName: file.name.replace(/\.[^/.]+$/, ''),
      albumFolderName: album,
      file: file
    });
  });

  renderLibraryTree(grouped);
  loadTrack(0);
});

// Controles y eventos
playBtn.addEventListener('click', togglePlay);

nextBtn.addEventListener('click', () => {
  if (flatPlaylist.length === 0) return;
  const nextIdx = (currentTrackIndex + 1) % flatPlaylist.length;
  loadTrack(nextIdx);
  audio.play();
  playBtn.textContent = '⏸';
});

prevBtn.addEventListener('click', () => {
  if (flatPlaylist.length === 0) return;
  const prevIdx = (currentTrackIndex - 1 + flatPlaylist.length) % flatPlaylist.length;
  loadTrack(prevIdx);
  audio.play();
  playBtn.textContent = '⏸';
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  seekBar.value = (audio.currentTime / audio.duration) * 100;
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', () => nextBtn.click());

seekBar.addEventListener('input', () => {
  if (!audio.duration) return;
  audio.currentTime = (seekBar.value / 100) * audio.duration;
});

volumeBar.addEventListener('input', (e) => {
  audio.volume = e.target.value;
});

// Gestión de Tema Claro / Oscuro con persistencia
const themeCheckbox = document.getElementById('theme-checkbox');

// Comprobar preferencia guardada previamente
const savedTheme = localStorage.getItem('app-theme');
if (savedTheme === 'dark') {
  document.body.classList.add('dark-mode');
  themeCheckbox.checked = true;
}

// Cambiar tema y guardar preferencia
themeCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('app-theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('app-theme', 'light');
  }
});

// Atajos de teclado globales

window.addEventListener('keydown', (e) => {
  if(['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;

  switch(e.code) {
    case 'Space':
      e.preventDefault(); // Evita el scroll al presionar espacio, ya que es su comportamiento por defecto en una página web
      togglePlay();
      break;
    
    case 'ArrowRight':
      e.preventDefault();
      if(audio.duration) { // 
        audio.currentTime = Math.min(audio.currentTime + 5, audio.duration);
      }
      break;
    
    case 'ArrowLeft':
      e.preventDefault();
        audio.currentTime = Math.max(audio.currentTime - 5, 0);
      break;

    case 'ArrowUp':
      e.preventDefault();
      audio.volume = Math.min(audio.volume + 0.05, 1);
      volumeBar.value = audio.volume;
      break;
    
    case 'ArrowDown':
      e.preventDefault();
      audio.volume = Math.max(audio.volume - 0.05, 0);
      volumeBar.value = audio.volume;
      break;
  }
});

document.addEventListener('DOMContentLoaded', loadFromGitHubAPI);