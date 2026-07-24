// ============================================
// MÓDULO 3: GENERAR PDF
// ============================================
(function() {
    'use strict';

    const pdfHeader = document.getElementById('pdfHeader');
    const pdfFooter = document.getElementById('pdfFooter');
    const pdfGenerateBtn = document.getElementById('pdfGenerateBtn');
    const pdfStatus = document.getElementById('pdfStatus');
    const pdfPreview = document.getElementById('pdfPreview');

    // Función para actualizar la vista previa (se llama desde otros módulos)
    window.updatePdfPreview = function() {
        pdfPreview.innerHTML = '';
        const boards = window.cropBoards || [];
        if (!boards.length) {
            pdfPreview.innerHTML = '<p style="text-align:center; color:#999;">No hay tableros en la galería. Recorta algunos en la pestaña "Recorte manual".</p>';
            return;
        }
        const itemsPerPage = 6;
        const pageCount = Math.ceil(boards.length / itemsPerPage);
        const headerText = pdfHeader.value;
        const footerText = pdfFooter.value;

        for (let p = 0; p < pageCount; p++) {
            const page = document.createElement('div');
            page.className = 'page';
            if (headerText) {
                const hdr = document.createElement('div');
                hdr.className = 'page-header';
                hdr.textContent = headerText;
                page.appendChild(hdr);
            }
            const content = document.createElement('div');
            content.className = 'page-content';
            for (let i = 0; i < itemsPerPage; i++) {
                const idx = p * itemsPerPage + i;
                const cell = document.createElement('div');
                cell.className = 'page-cell';
                const num = document.createElement('div');
                num.textContent = idx+1;
                num.style.fontWeight = 'bold';
                num.style.marginBottom = '2px';
                cell.appendChild(num);
                if (idx < boards.length) {
                    const img = document.createElement('img');
                    img.src = boards[idx].dataUrl;
                    cell.appendChild(img);
                    const lines = document.createElement('div');
                    lines.className = 'answer-lines';
                    for (let j = 0; j < 3; j++) {
                        const line = document.createElement('div');
                        line.className = 'line';
                        lines.appendChild(line);
                    }
                    cell.appendChild(lines);
                }
                content.appendChild(cell);
            }
            page.appendChild(content);
            if (footerText) {
                const ft = document.createElement('div');
                ft.className = 'page-footer';
                const pageNum = document.createElement('span');
                pageNum.textContent = `Página ${p+1}`;
                ft.appendChild(pageNum);
                const ftText = document.createElement('span');
                ftText.textContent = footerText;
                ft.appendChild(ftText);
                page.appendChild(ft);
            }
            pdfPreview.appendChild(page);
        }
    };

    pdfGenerateBtn.addEventListener('click', function() {
        const boards = window.cropBoards || [];
        if (!boards.length) {
            window.showNotification('No hay tableros para generar PDF', true);
            return;
        }
        pdfStatus.textContent = 'Generando PDF...';
        pdfGenerateBtn.disabled = true;
        setTimeout(() => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'mm', 'a4');
                const itemsPerPage = 6;
                const pageCount = Math.ceil(boards.length / itemsPerPage);
                const imgW = 58.5;
                const imgH = 58.5;
                const positions = [
                    { x: 27, y: 40 }, { x: 122, y: 40 },
                    { x: 27, y: 120 }, { x: 122, y: 120 },
                    { x: 27, y: 200 }, { x: 122, y: 200 }
                ];
                const headerText = pdfHeader.value;
                const footerText = pdfFooter.value;

                for (let i = 0; i < boards.length; i++) {
                    const pageIndex = Math.floor(i / itemsPerPage);
                    const posIndex = i % itemsPerPage;
                    if (posIndex === 0 && i > 0) doc.addPage();
                    if (headerText) {
                        doc.setFontSize(12);
                        doc.text(headerText, 105, 20, { align: 'center' });
                    }
                    const cx = positions[posIndex].x + (imgW / 2);
                    const numY = positions[posIndex].y - 2.5;
                    doc.setFontSize(12);
                    doc.text(`${i+1}`, cx, numY, { align: 'center' });
                    doc.addImage(
                        boards[i].dataUrl,
                        'JPEG',
                        positions[posIndex].x,
                        positions[posIndex].y,
                        imgW,
                        imgH
                    );
                    const lineY = positions[posIndex].y + imgH + 6;
                    for (let j = 0; j < 3; j++) {
                        doc.line(
                            positions[posIndex].x,
                            lineY + (j * 4),
                            positions[posIndex].x + imgW,
                            lineY + (j * 4)
                        );
                    }
                    if (footerText) {
                        doc.setFontSize(10);
                        doc.text(footerText, 105, 287, { align: 'center' });
                    }
                }
                doc.save('ejercicios_ajedrez.pdf');
                pdfStatus.textContent = 'PDF generado y descargado';
                window.showNotification('PDF listo');
            } catch (e) {
                pdfStatus.textContent = 'Error: ' + e.message;
                window.showNotification('Error al generar PDF', true);
            } finally {
                pdfGenerateBtn.disabled = false;
            }
        }, 200);
    });

    // Actualizar vista previa cuando cambian header/footer
    pdfHeader.addEventListener('input', window.updatePdfPreview);
    pdfFooter.addEventListener('input', window.updatePdfPreview);

    // Inicializar vista previa al cargar
    setTimeout(window.updatePdfPreview, 500);
})();