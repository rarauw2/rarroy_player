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
const folderInput = document.getElementById('folder-input');
const treeContainer = document.getElementById('tree-container');
const GITHUB_USER = 'rarauw2';
const GITHUB_REPO = 'rarroy_player';
const BRANCH = 'main'; 

const DEFAULT_COVER = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23e2e8f0'><rect width='100' height='100'/></svg>";

let flatPlaylist = [];
let currentTrackIndex = 0;

function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// Extrae metadatos ID3 usando jsmediatags
function extractMetadata(file) {
  return new Promise((resolve) => {
    if (!window.jsmediatags) {
      return resolve({ title: file.name.replace(/\.[^/.]+$/, ''), artist: 'Desconocido', coverUrl: DEFAULT_COVER });
    }

    window.jsmediatags.read(file, {
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
          title: title || file.name.replace(/\.[^/.]+$/, ''),
          artist: artist || 'Artista desconocido',
          coverUrl
        });
      },
      onError: () => {
        resolve({
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Artista desconocido',
          coverUrl: DEFAULT_COVER
        });
      }
    });
  });
}

async function loadTrack(index) {
  if (flatPlaylist.length === 0) return;
  currentTrackIndex = index;
  const item = flatPlaylist[index];

  if (audio.src.startsWith('blob:')) {
    URL.revokeObjectURL(audio.src);
  }

  // Si es un File cargado desde la carpeta
  if (item.file) {
    audio.src = URL.createObjectURL(item.file);
    const meta = await extractMetadata(item.file);
    trackTitle.textContent = meta.title;
    trackArtist.textContent = `${meta.artist} • ${item.album}`;
    trackCover.src = meta.coverUrl;
  } 
  // Si es una ruta estática en songs/
  else if (item.url) {
    audio.src = item.url;
    trackTitle.textContent = item.title;
    trackArtist.textContent = `${item.artist || 'Desconocido'} • ${item.album}`;
    trackCover.src = item.cover || DEFAULT_COVER;
  }

  updateSelectionUI();
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

// Renderiza la estructura agrupada por carpetas (álbumes)
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
      trackEl.textContent = track.name || track.title;

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

// Carga mediante selección de carpeta completa (webkitdirectory)
folderInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
  if (files.length === 0) return;

  const grouped = {};

  files.forEach(file => {
    // webkitRelativePath devuelve ej: "canciones/Album1/pista.mp3"
    const parts = file.webkitRelativePath.split('/');
    const album = parts.length > 2 ? parts[parts.length - 2] : 'Canciones sueltas';

    if (!grouped[album]) grouped[album] = [];
    grouped[album].push({
      name: file.name.replace(/\.[^/.]+$/, ''),
      file: file,
      album: album
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

async function loadFromGitHubAPI() {
  const treeContainer = document.getElementById('tree-container');
  treeContainer.innerHTML = '<p class="empty-msg">Cargando biblioteca desde GitHub...</p>';

  try {
    // 1. Obtener la lista de carpetas dentro de /songs
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/songs?ref=${BRANCH}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo acceder a la carpeta songs en GitHub');
    
    const contents = await res.json();
    const albumFolders = contents.filter(item => item.type === 'dir');
    const groupedTracks = {};

    // 2. Recorrer cada carpeta de álbum y obtener sus canciones
    for (const album of albumFolders) {
      const albumRes = await fetch(album.url);
      const albumContents = await albumRes.json();
      
      // Filtrar archivos de audio (.mp3, .m4a, .wav, .ogg, .flac)
      const tracks = albumContents
        .filter(f => f.type === 'file' && /\.(mp3|m4a|wav|ogg|flac)$/i.test(f.name))
        .map(f => ({
          title: f.name.replace(/\.[^/.]+$/, ''),
          album: album.name,
          artist: 'Cargando artista...',
          // Usar la ruta relativa servida por GitHub Pages
          url: `songs/${encodeURIComponent(album.name)}/${encodeURIComponent(f.name)}`
        }));

      if (tracks.length > 0) {
        groupedTracks[album.name] = tracks;
      }
    }

    // 3. Renderizar la biblioteca y cargar la primera pista
    renderLibraryTree(groupedTracks);
    if (flatPlaylist.length > 0) {
      loadTrack(0);
    }
  } catch (error) {
    console.error(error);
    treeContainer.innerHTML = '<p class="empty-msg">Error al sincronizar con GitHub.</p>';
  }
}

// Iniciar al cargar la web
document.addEventListener('DOMContentLoaded', loadFromGitHubAPI);