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

// Imagen por defecto (Placeholder gris minimalista como el de tu imagen)
const DEFAULT_COVER = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23e2e8f0'><rect width='100' height='100'/></svg>";

// Variables de estado
let flatPlaylist = []; // Lista plana para reproducción secuencial
let currentTrackIndex = 0;

// Utilidad para formatear segundos a MM:SS
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// SOLUCIÓN ARTISTA/CARÁTULA: Extrae metadatos ID3 usando jsmediatags
// Esta función lee los metadatos REALES que están dentro del archivo MP3.
function extractMetadata(fileUrl) {
  return new Promise((resolve) => {
    // Si no cargaste jsmediatags vía CDN en index.html, esto fallará
    if (!window.jsmediatags) {
      console.warn("jsmediatags no está cargado");
      return resolve(null);
    }

    window.jsmediatags.read(fileUrl, {
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
          title: title, // Título real ID3
          artist: artist, // Artista real ID3
          coverUrl: coverUrl // Carátula real ID3
        });
      },
      onError: (error) => {
        // Si no hay metadatos ID3, resolvemos con null para usar valores por defecto
        resolve(null);
      }
    });
  });
}

// Carga y reproduce una pista por su índice
async function loadTrack(index) {
  if (flatPlaylist.length === 0) return;
  currentTrackIndex = index;
  const track = flatPlaylist[index];

  // Limpiar carátula y textos anteriores para evitar el "parpadeo" del anterior
  trackCover.src = DEFAULT_COVER; 
  trackTitle.textContent = track.fileName; // Usamos el nombre del archivo temporalmente
  trackArtist.textContent = `Cargando artista... • ${track.albumFolderName}`;

  // Cargar el audio
  audio.src = track.url;
  
  // SOLUCIÓN: Extraer metadatos reales ID3
  const meta = await extractMetadata(track.url);
  
  if (meta) {
    trackTitle.textContent = meta.title || track.fileName;
    // Si hay artista real en el ID3, lo usamos
    trackArtist.textContent = `${meta.artist || 'Artista desconocido'} • ${track.albumFolderName}`;
    trackCover.src = meta.coverUrl;
  } else {
    // Si falla, usamos el nombre del archivo como artista para no dejar el "Cargando..."
    trackArtist.textContent = `${track.fileName} • ${track.albumFolderName}`;
  }

  updateSelectionUI();
}

// Resalta la canción actual en la biblioteca
function updateSelectionUI() {
  document.querySelectorAll('.track-item').forEach((el) => {
    const idx = parseInt(el.getAttribute('data-index'), 10);
    el.classList.toggle('active', idx === currentTrackIndex);
  });
}

// Reproducir/Pausar
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

// Renderiza el árbol de la biblioteca agrupado por carpetas (álbumes)
function renderLibraryTree(groupedTracks) {
  treeContainer.innerHTML = '';
  flatPlaylist = []; // Resetear la lista plana
  let globalIndex = 0;

  for (const [albumName, tracks] of Object.entries(groupedTracks)) {
    const group = document.createElement('div');
    group.className = 'album-group';

    const header = document.createElement('div');
    header.className = 'album-title';
    header.textContent = albumName; // Nombre de la carpeta como nombre de álbum
    group.appendChild(header);

    tracks.forEach((track) => {
      // Añadir a la lista plana para navegación sig/ant
      flatPlaylist.push(track);
      const currentIndex = globalIndex;

      const trackEl = document.createElement('div');
      trackEl.className = 'track-item';
      trackEl.setAttribute('data-index', currentIndex);
      trackEl.textContent = track.fileName; // Usamos el nombre del archivo en la lista

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

// Carga automática desde la API de GitHub
async function loadFromGitHubAPI() {
  treeContainer.innerHTML = '<p class="empty-msg">Sincronizando con GitHub...</p>';

  try {
    // 1. Obtener carpetas dentro de /songs
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/songs?ref=${BRANCH}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo acceder a la carpeta /songs');
    
    const contents = await res.json();
    const albumFolders = contents.filter(item => item.type === 'dir');
    const groupedTracks = {};

    // 2. Recorrer cada carpeta de álbum
    for (const album of albumFolders) {
      const albumRes = await fetch(album.url);
      const albumContents = await albumRes.json();
      
      // Filtrar archivos de audio
      const tracks = albumContents
        .filter(f => f.type === 'file' && /\.(mp3|m4a|wav)$/i.test(f.name))
        .map(f => ({
          fileName: f.name.replace(/\.[^/.]+$/, ''), // Nombre de archivo sin extensión
          albumFolderName: album.name, // Nombre de la carpeta contenedora
          // URL final servida por GitHub Pages
          url: `songs/${encodeURIComponent(album.name)}/${encodeURIComponent(f.name)}`
        }));

      if (tracks.length > 0) {
        groupedTracks[album.name] = tracks;
      }
    }

    renderLibraryTree(groupedTracks);
    if (flatPlaylist.length > 0) {
      loadTrack(0); // Carga la primera canción (sin reproducir)
    } else {
      treeContainer.innerHTML = '<p class="empty-msg">No se encontraron archivos de audio en /songs.</p>';
    }
  } catch (error) {
    console.error(error);
    treeContainer.innerHTML = '<p class="empty-msg">Error al sincronizar.<br>Verifica la config en app.js.</p>';
  }
}

// Event Listeners para controles
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

// Eventos de Audio (Tiempo y Progreso)
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const progressPercent = (audio.currentTime / audio.duration) * 100;
  seekBar.value = progressPercent;
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', () => {
  nextBtn.click(); // Autoreproducción siguiente
});

// Interacciones con barras
seekBar.addEventListener('input', () => {
  if (!audio.duration) return;
  audio.currentTime = (seekBar.value / 100) * audio.duration;
});

volumeBar.addEventListener('input', (e) => {
  audio.volume = e.target.value;
});

// Iniciar al cargar el DOM
document.addEventListener('DOMContentLoaded', loadFromGitHubAPI);