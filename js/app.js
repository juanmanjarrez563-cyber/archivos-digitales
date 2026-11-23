// ==========================================
// 1. CONFIGURACIÓN Y CONEXIÓN A SUPABASE
// ==========================================
const SUPABASE_URL = 'https://lswvaxuhwwtyjfmihcia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzd3ZheHVod3d0eWpmbWloY2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NDg1NjYsImV4cCI6MjExMTAyNDU2Nn0.mWQwEIQbnFYsUAg4CZaXCtSjNzv9kUD_IHI80A0m-8Y';
const TABLA_USUARIO = 'juan'; // Cambia por el nombre de tu tabla en Supabase
const BUCKET_STORAGE = 'archivos_digitales';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let sesionActual = null;
let listaDocumentos = [];
let carpetaSeleccionada = 'TODAS';

// Referencias del DOM
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');
const userEmailDisplay = document.getElementById('user-email-display');
const btnLogout = document.getElementById('btn-logout');

const docForm = document.getElementById('doc-form');
const editIdInput = document.getElementById('edit-id');
const tituloInput = document.getElementById('titulo-archivo');
const tipoSelect = document.getElementById('tipo-documento');
const carpetaSelect = document.getElementById('carpeta-destino');
const fileInputGroup = document.getElementById('file-input-group');
const archivoInput = document.getElementById('archivo-file');
const btnSave = document.getElementById('btn-save');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const formTitle = document.getElementById('form-title');
const statusMsg = document.getElementById('status-msg');

const docsTbody = document.getElementById('docs-tbody');
const searchInput = document.getElementById('search-input');
const folderItems = document.querySelectorAll('#folder-list li');
const currentFolderTitle = document.getElementById('current-folder-title');
const btnTodos = document.getElementById('btn-todos');

// ==========================================
// 2. MANEJO DE SESIONES (AUTH)
// ==========================================
async function iniciarSesion(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw new Error(error.message);
  return data.session;
}

async function cerrarSesion() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw new Error(error.message);
}

async function verificarSesionActiva() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

// Protección de sesión al cargar la aplicación
async function inicializarApp() {
  try {
    sesionActual = await verificarSesionActiva();
    actualizarInterfazSesion(sesionActual);
  } catch (err) {
    console.error('Error al verificar sesión:', err);
  }
}

function actualizarInterfazSesion(session) {
  if (session) {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    userEmailDisplay.textContent = session.user.email;
    cargarDocumentos();
  } else {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
    docsTbody.innerHTML = '';
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    sesionActual = await iniciarSesion(email, password);
    loginForm.reset();
    actualizarInterfazSesion(sesionActual);
  } catch (err) {
    authError.textContent = `Error de acceso: ${err.message}`;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await cerrarSesion();
    sesionActual = null;
    actualizarInterfazSesion(null);
  } catch (err) {
    alert(`No se pudo cerrar sesión: ${err.message}`);
  }
});

// ==========================================
// 3. PETICIONES A BASE DE DATOS Y STORAGE
// ==========================================

// LEER (SELECT) registros de la tabla
async function cargarDocumentos() {
  try {
    const { data, error } = await supabaseClient
      .from(TABLA_USUARIO)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    listaDocumentos = data || [];
    renderizarTabla();
  } catch (err) {
    mostrarMensaje(`Error al cargar documentos: ${err.message}`, true);
  }
}

// GUARDAR (Storage + INSERT) o EDITAR (UPDATE)
docForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sesionActual) return;

  const idEdicion = editIdInput.value;
  const titulo = tituloInput.value.trim();
  const tipo = tipoSelect.value;
  const carpeta = carpetaSelect.value;

  try {
    btnSave.disabled = true;
    mostrarMensaje('Procesando petición...', false);

    if (idEdicion) {
      // Actualizar datos en la tabla
      const { error } = await supabaseClient
        .from(TABLA_USUARIO)
        .update({
          titulo_archivo: titulo,
          tipo_documento: tipo,
          carpeta: carpeta
        })
        .eq('id', idEdicion);

      if (error) throw error;
      mostrarMensaje('Registro actualizado correctamente.', false);
      cancelarModoEdicion();
    } else {
      // Subir archivo físico al Storage
      const archivo = archivoInput.files[0];
      if (!archivo) throw new Error('Selecciona un archivo válido.');

      const rutaUnica = `${sesionActual.user.id}/${Date.now()}_${archivo.name}`;

      const { error: uploadError } = await supabaseClient.storage
        .from(BUCKET_STORAGE)
        .upload(rutaUnica, archivo);

      if (uploadError) throw uploadError;

      // Obtener enlace público del archivo
      const { data: urlData } = supabaseClient.storage
        .from(BUCKET_STORAGE)
        .getPublicUrl(rutaUnica);

      // Insertar registro en la tabla
      const { error: insertError } = await supabaseClient
        .from(TABLA_USUARIO)
        .insert([{
          user_id: sesionActual.user.id,
          titulo_archivo: titulo,
          tipo_documento: tipo,
          carpeta: carpeta,
          url_archivo: urlData.publicUrl,
          ruta_storage: rutaUnica
        }]);

      if (insertError) throw insertError;
      mostrarMensaje('Archivo guardado exitosamente.', false);
      docForm.reset();
    }

    await cargarDocumentos();
  } catch (err) {
    mostrarMensaje(`Error en la operación: ${err.message}`, true);
  } finally {
    btnSave.disabled = false;
  }
});

// ==========================================
// 4. INTERFAZ, BUSCADOR Y BOTONES DE ACCIÓN
// ==========================================
function renderizarTabla() {
  const textoBusqueda = searchInput.value.toLowerCase().trim();

  const filtrados = listaDocumentos.filter((doc) => {
    const coincideCarpeta = carpetaSeleccionada === 'TODAS' || doc.carpeta === carpetaSeleccionada;
    const coincideTexto =
      doc.titulo_archivo.toLowerCase().includes(textoBusqueda) ||
      doc.tipo_documento.toLowerCase().includes(textoBusqueda);
    return coincideCarpeta && coincideTexto;
  });

  docsTbody.innerHTML = '';

  if (filtrados.length === 0) {
    docsTbody.innerHTML = '<tr><td colspan="5">No se encontraron archivos en esta vista.</td></tr>';
    return;
  }

  filtrados.forEach((doc) => {
    const tr = document.createElement('tr');
    const fecha = new Date(doc.created_at).toLocaleDateString('es-MX');

    tr.innerHTML = `
      <td><strong>${doc.titulo_archivo}</strong></td>
      <td>${doc.tipo_documento}</td>
      <td>${doc.carpeta}</td>
      <td>${fecha}</td>
      <td class="actions-cell">
        <a href="${doc.url_archivo}" target="_blank" class="btn-view">Visualizar</a>
        <button type="button" class="btn-edit" data-id="${doc.id}">Editar</button>
        <button type="button" class="btn-danger" data-id="${doc.id}" data-ruta="${doc.ruta_storage}">Eliminar</button>
      </td>
    `;
    docsTbody.appendChild(tr);
  });
}

// Eventos para Editar y Eliminar en la tabla
docsTbody.addEventListener('click', async (e) => {
  const target = e.target;

  // Botón Editar
  if (target.classList.contains('btn-edit')) {
    const doc = listaDocumentos.find((item) => item.id === target.dataset.id);
    if (!doc) return;

    editIdInput.value = doc.id;
    tituloInput.value = doc.titulo_archivo;
    tipoSelect.value = doc.tipo_documento;
    carpetaSelect.value = doc.carpeta;

    archivoInput.required = false;
    fileInputGroup.classList.add('hidden');
    formTitle.textContent = 'Editar Información del Documento';
    btnSave.textContent = 'Actualizar Cambios';
    btnCancelEdit.classList.remove('hidden');
  }

  // Botón Eliminar (Storage + Tabla)
  if (target.classList.contains('btn-danger')) {
    const confirmar = confirm('¿Seguro que deseas eliminar este documento?');
    if (!confirmar) return;

    try {
      const id = target.dataset.id;
      const rutaStorage = target.dataset.ruta;

      const { error: storageError } = await supabaseClient.storage
        .from(BUCKET_STORAGE)
        .remove([rutaStorage]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabaseClient
        .from(TABLA_USUARIO)
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      mostrarMensaje('Documento eliminado correctamente.', false);
      await cargarDocumentos();
    } catch (err) {
      mostrarMensaje(`Error al eliminar: ${err.message}`, true);
    }
  }
});

function cancelarModoEdicion() {
  editIdInput.value = '';
  docForm.reset();
  archivoInput.required = true;
  fileInputGroup.classList.remove('hidden');
  formTitle.textContent = 'Subir Nuevo Documento o Foto';
  btnSave.textContent = 'Guardar Archivo';
  btnCancelEdit.classList.add('hidden');
}

btnCancelEdit.addEventListener('click', cancelarModoEdicion);

// Filtros de la barra lateral y buscador
folderItems.forEach((item) => {
  item.addEventListener('click', () => {
    folderItems.forEach((li) => li.classList.remove('active'));
    item.classList.add('active');
    carpetaSeleccionada = item.dataset.folder;
    currentFolderTitle.textContent = carpetaSeleccionada === 'TODAS' ? 'Todos los archivos' : carpetaSeleccionada;
    renderizarTabla();
  });
});

btnTodos.addEventListener('click', () => {
  folderItems[0].click();
});

searchInput.addEventListener('input', renderizarTabla);

function mostrarMensaje(texto, esError) {
  statusMsg.textContent = texto;
  statusMsg.style.color = esError ? '#dc2626' : '#059669';
}

// Iniciar aplicación verificando sesión
inicializarApp();
