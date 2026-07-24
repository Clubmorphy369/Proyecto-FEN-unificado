// ============================================
// MÓDULO PRINCIPAL: PESTAÑAS, EXTRACCIÓN AUTOMÁTICA, EXPORTACIÓN PGN
// ============================================
(function() {
    'use strict';

    // ---------- UTILIDAD GLOBAL ----------
    window.showNotification = function(msg, isError = false) {
        const el = document.getElementById('notification');
        if (!el) return;
        el.textContent = msg;
        el.className = 'notification' + (isError ? ' error' : '');
        el.classList.add('show');
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => el.classList.remove('show'), 3000);
    };

    // ---------- PESTAÑAS ----------
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(this.dataset.tab).classList.add('active');
            if (this.dataset.tab === 'tab-pdf' && window.updatePdfPreview) {
                window.updatePdfPreview();
            }
        });
    });

    // ============================================
    // MÓDULO 1: EXTRACCIÓN AUTOMÁTICA
    // ============================================
    const autoFileInput = document.getElementById('autoFileInput');
    const autoPages = document.getElementById('autoPages');
    const autoProcessBtn = document.getElementById('autoProcessBtn');
    const autoExportPgnBtn = document.getElementById('autoExportPgnBtn');
    const autoStatus = document.getElementById('autoStatus');
    const autoResults = document.getElementById('autoResults');
    const processGalleryBtn = document.getElementById('processGalleryBtn');

    // Almacén de datos (acumulativo)
    let autoData = [];
    let autoFens = new Set(); // Usamos Set para deduplicación eficiente

    // ---------- FUNCIÓN PARA AÑADIR RESULTADOS (CON DEDUPLICACIÓN) ----------
    function addResultsToAutoData(newResults) {
        if (!newResults || !newResults.length) return;
        let addedCount = 0;
        for (const item of newResults) {
            const fen = item.fen || null;
            // Si tiene FEN y no está en el Set, lo añadimos
            if (fen && !autoFens.has(fen)) {
                autoFens.add(fen);
                autoData.push(item);
                addedCount++;
            }
            // Si no tiene FEN, lo añadimos igual (para mostrar errores)
            else if (!fen) {
                // Solo añadir si no es un duplicado de un error previo
                // Para simplificar, añadimos todos los errores (no se deduplican)
                autoData.push(item);
                addedCount++;
            }
        }
        renderAutoResults();
        return addedCount;
    }

    // ---------- FUNCIÓN PARA RENDERIZAR LA TABLA (CON BOTÓN ✂️) ----------
    function renderAutoResults() {
        if (!autoData || autoData.length === 0) {
            autoResults.innerHTML = '<p>No hay resultados. Sube imágenes o procesa recortes desde la galería.</p>';
            updateExportButtonState();
            return;
        }

        let html = `<table>
            <thead><tr>
                <th>Archivo</th>
                <th>Página</th>
                <th>FEN</th>
                <th>Miniatura</th>
                <th style="width:60px;">Acción</th>
            </tr></thead><tbody>`;

        for (let i = 0; i < autoData.length; i++) {
            const item = autoData[i];
            const fen = item.fen || 'Error';
            const isError = !item.fen;
            const thumb = item.thumbnail ? `<img src="data:image/jpeg;base64,${item.thumbnail}" class="thumbnail-img">` : '-';
            // Generar un ID único para la fila
            const rowId = `auto-row-${i}`;
            html += `<tr id="${rowId}" data-index="${i}">
                <td>${item.original_filename || item.file}</td>
                <td>${item.page || '-'}</td>
                <td class="${isError ? 'error' : 'success'} fen-cell">${fen}</td>
                <td>${thumb}</td>
                <td style="text-align:center;">
                    ${!isError ? `<button class="btn-copy-fen" data-fen="${fen}" data-index="${i}" title="Copiar FEN y eliminar fila" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem;">✂️</button>` : '-'}
                </td>
            </tr>`;
        }

        html += '</tbody></table>';
        autoResults.innerHTML = html;

        // ---------- EVENTOS PARA LOS BOTONES ✂️ ----------
        document.querySelectorAll('.btn-copy-fen').forEach(btn => {
            btn.addEventListener('click', function() {
                const fen = this.getAttribute('data-fen');
                const index = parseInt(this.getAttribute('data-index'));
                if (!fen || isNaN(index)) return;

                // Copiar al portapapeles
                navigator.clipboard.writeText(fen).then(() => {
                    // Eliminar la fila del DOM y del array autoData
                    const row = document.getElementById(`auto-row-${index}`);
                    if (row) {
                        row.style.transition = 'all 0.3s';
                        row.style.opacity = '0';
                        setTimeout(() => {
                            // Eliminar del array autoData
                            autoData.splice(index, 1);
                            // Reconstruir la tabla (actualizar índices)
                            renderAutoResults();
                            updateExportButtonState();
                        }, 300);
                    }
                    window.showNotification('FEN copiado y eliminado');
                }).catch(err => {
                    window.showNotification('Error al copiar: ' + err.message, true);
                });
            });
        });

        updateExportButtonState();
    }

    // ---------- ACTUALIZAR ESTADO DEL BOTÓN EXPORTAR ----------
    function updateExportButtonState() {
        const hasFens = autoData.some(item => item.fen);
        autoExportPgnBtn.disabled = !hasFens;
    }

    // ---------- OBTENER LISTA DE FEN PARA EXPORTAR ----------
    function getFensForExport() {
        return autoData.filter(item => item.fen).map(item => item.fen);
    }

    // ---------- PROCESAR ARCHIVOS SUBIDOS DIRECTAMENTE ----------
    autoProcessBtn.addEventListener('click', async function() {
        const files = autoFileInput.files;
        if (!files.length) {
            window.showNotification('Selecciona al menos un archivo.', true);
            return;
        }
        const formData = new FormData();
        for (const f of files) formData.append('files', f);
        formData.append('pages', autoPages.value);

        autoStatus.textContent = 'Procesando archivos...';
        autoProcessBtn.disabled = true;

        try {
            const resp = await fetch('/upload', { method: 'POST', body: formData });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Error en el servidor');

            const newResults = data.results || [];
            const added = addResultsToAutoData(newResults);
            autoStatus.textContent = `Se añadieron ${added} nuevos elementos. Total: ${autoData.length} elementos.`;
        } catch (e) {
            window.showNotification('Error: ' + e.message, true);
            autoStatus.textContent = 'Error';
        } finally {
            autoProcessBtn.disabled = false;
        }
    });

    // ---------- PROCESAR RECORTES DESDE LA GALERÍA (PESTAÑA 2) ----------
    processGalleryBtn.addEventListener('click', async function() {
        const boards = window.cropBoards || [];
        if (!boards.length) {
            window.showNotification('No hay recortes en la galería.', true);
            return;
        }

        autoStatus.textContent = `Procesando ${boards.length} recortes desde la galería...`;
        processGalleryBtn.disabled = true;

        const newResults = [];
        for (let i = 0; i < boards.length; i++) {
            const board = boards[i];
            try {
                let imageData = board.dataUrl;
                if (imageData.startsWith('data:image')) {
                    imageData = imageData.split(',')[1];
                }
                const resp = await fetch('/upload-crop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: imageData })
                });
                const data = await resp.json();
                if (data.success) {
                    newResults.push({
                        original_filename: `Recorte ${i+1}`,
                        file: `recorte_${i+1}`,
                        fen: data.fen,
                        thumbnail: data.thumbnail,
                        error: null
                    });
                } else {
                    newResults.push({
                        original_filename: `Recorte ${i+1}`,
                        file: `recorte_${i+1}`,
                        fen: null,
                        thumbnail: null,
                        error: data.error || 'Error al procesar'
                    });
                }
            } catch (e) {
                newResults.push({
                    original_filename: `Recorte ${i+1}`,
                    file: `recorte_${i+1}`,
                    fen: null,
                    thumbnail: null,
                    error: 'Error de red: ' + e.message
                });
            }
        }

        const added = addResultsToAutoData(newResults);
        autoStatus.textContent = `Procesados ${boards.length} recortes. Añadidos ${added} nuevos FEN. Total: ${autoData.length} elementos.`;
        processGalleryBtn.disabled = false;
    });

    // ---------- EXPORTAR PGN ----------
    autoExportPgnBtn.addEventListener('click', async function() {
        const fens = getFensForExport();
        if (!fens.length) {
            window.showNotification('No hay FEN válidos para exportar.', true);
            return;
        }
        const studyName = prompt('Nombre del estudio:', 'Mi Estudio') || 'Mi Estudio';
        const user = prompt('Tu usuario de Lichess:', 'Anónimo') || 'Anónimo';
        try {
            const resp = await fetch('/export-pgn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fens: fens, study_name: studyName, user: user })
            });
            if (!resp.ok) throw new Error('Error al exportar');
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'fen_study.pgn';
            a.click();
            URL.revokeObjectURL(url);
            window.showNotification('PGN descargado');
        } catch (e) {
            window.showNotification('Error: ' + e.message, true);
        }
    });

    // ---------- EXPONER FUNCIONES PARA OTROS MÓDULOS ----------
    window.getAutoFens = getFensForExport;
    window.getAutoData = () => autoData;
    window.clearAutoData = () => {
        autoData = [];
        autoFens = new Set();
        renderAutoResults();
        updateExportButtonState();
    };

    // Inicializar
    renderAutoResults();

})();
