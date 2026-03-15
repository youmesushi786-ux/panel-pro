import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { StickerSheet, StickerLabel } from '../types';

interface Props {
  stickers: StickerSheet | null | undefined;
  projectName?: string;
}

function buildQrValue(label: StickerLabel, projectName?: string) {
  return JSON.stringify({
    serial_no: label.serial_no,
    panel_label: label.panel_label,
    width_mm: label.width_mm,
    length_mm: label.length_mm,
    piece_no: label.quantity_index,
    board_number: label.board_number,
    core_type: label.core_type,
    thickness_mm: label.thickness_mm,
    company: label.company,
    colour: label.colour,
    edges: label.edges,
    grain_alignment: label.grain_alignment,
    project_name: projectName || null,
  });
}

export function StickerPrint({ stickers, projectName }: Props) {
  if (!stickers || !stickers.labels?.length) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <section className="sticker-section">
      <div className="sticker-toolbar no-print">
        <div>
          <h2>Printable Sticker Labels</h2>
          <p className="sticker-subtitle">Total labels: {stickers.total_labels}</p>
        </div>

        <button onClick={handlePrint} className="print-btn">
          Print / Save PDF
        </button>
      </div>

      <div className="sticker-grid">
        {stickers.labels.map((label) => (
          <div className="sticker-card" key={label.serial_no}>
            <div className="sticker-header">
              <div className="sticker-brand">
                {label.logo_url ? (
                  <img
                    src={label.logo_url}
                    alt={label.company_name || 'Logo'}
                    className="sticker-logo"
                  />
                ) : (
                  <div className="sticker-logo placeholder">LOGO</div>
                )}

                <div>
                  <div className="sticker-company">
                    {label.company_name || label.company || 'PanelPro'}
                  </div>
                  {projectName ? (
                    <div className="sticker-project">{projectName}</div>
                  ) : null}
                </div>
              </div>

              <div className="sticker-serial">{label.serial_no}</div>
            </div>

            <div className="sticker-main">
              <div className="sticker-content">
                <div className="sticker-title">{label.panel_label}</div>

                <div className="sticker-body">
                  <div><strong>Size:</strong> {label.width_mm} × {label.length_mm} mm</div>
                  <div><strong>Piece:</strong> #{label.quantity_index}</div>
                  <div><strong>Board:</strong> {label.board_number ?? '-'}</div>
                  <div><strong>Material:</strong> {label.core_type?.toUpperCase() || '-'}</div>
                  <div><strong>Thickness:</strong> {label.thickness_mm ?? '-'} mm</div>
                  <div><strong>Company:</strong> {label.company || '-'}</div>
                  <div><strong>Colour:</strong> {label.colour || '-'}</div>
                  <div><strong>Edges:</strong> {label.edges}</div>
                  <div><strong>Grain:</strong> {label.grain_alignment || 'none'}</div>
                </div>
              </div>

              <div className="sticker-qr">
                <QRCodeSVG
                  value={buildQrValue(label, projectName)}
                  size={86}
                  level="M"
                  includeMargin
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
