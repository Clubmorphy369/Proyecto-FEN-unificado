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
            // Al cambiar a la pestaña PDF, actualizar vista previa
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

    let autoFens = [];
    let autoData = [];

    autoProcessBtn.addEventListener('click', async function() {
        const files = autoFileInput.files;
        if (!files.length) {
            window.showNotification('Selecciona al menos un archivo.', true);
            return;
        }
        const formData = new FormData();
        for (const f of files) formData.append('files', f);
        formData.append('pages', autoPages.value);

        autoStatus.textContent = 'Procesando...';
        autoProcessBtn.disabled = true;

        try {
            const resp = await fetch('/upload', { method: 'POST', body: formData });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Error en el servidor');

            autoData = data.results || [];
            autoFens = autoData.filter(r => r.fen).map(r => r.fen);

            if (autoData.length === 0) {
                autoResults.innerHTML = '<p>No se obtuvieron resultados.</p>';
            } else {
                let html = `<table>
                    <thead><tr>
                        <th>Archivo</th><th>Página</th><th>FEN</th><th>Miniatura</th>
                    </tr></thead><tbody>`;
                for (const item of autoData) {
                    const fen = item.fen || 'Error';
                    const isError = !item.fen;
                    const thumb = item.thumbnail ? `<img src="data:image/jpeg;base64,${item.thumbnail}" class="thumbnail-img">` : '-';
                    html += `<tr>
                        <td>${item.original_filename || item.file}</td>
                        <td>${item.page || '-'}</td>
                        <td class="${isError ? 'error' : 'success'} fen-cell">${fen}</td>
                        <td>${thumb}</td>
                    </tr>`;
                }
                html += '</tbody></table>';
                autoResults.innerHTML = html;
            }

            autoExportPgnBtn.disabled = autoFens.length === 0;
            autoStatus.textContent = `Procesado ${autoData.length} elementos, ${autoFens.length} FEN obtenidos.`;
        } catch (e) {
            window.showNotification('Error: ' + e.message, true);
            autoStatus.textContent = 'Error';
        } finally {
            autoProcessBtn.disabled = false;
        }
    });

    autoExportPgnBtn.addEventListener('click', async function() {
        if (!autoFens.length) return;
        const studyName = prompt('Nombre del estudio:', 'Mi Estudio') || 'Mi Estudio';
        const user = prompt('Tu usuario de Lichess:', 'Anónimo') || 'Anónimo';
        try {
            const resp = await fetch('/export-pgn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fens: autoFens, study_name: studyName, user })
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

    // Exponer variables para otros módulos si es necesario
    window.getAutoFens = () => autoFens;
    window.getAutoData = () => autoData;

})();