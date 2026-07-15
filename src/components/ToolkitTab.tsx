import React, { useState } from 'react';
import { 
  Merge, Scissors, Crop, Trash2, Plus, 
  ArrowLeft, FileText, ChevronUp, ChevronDown, CheckSquare, Square
} from 'lucide-react';
import { translations } from '../utils/localization';
import type { Locale } from '../utils/localization';
import { mergePdfs, splitPdf, cropPdf } from '../utils/pdfEngine';

interface ToolkitTabProps {
  locale: Locale;
  currentFile: ArrayBuffer | null;
  currentFileName?: string;
  pageCount: number;
  onSaveFile: (buffer: Uint8Array, fileName: string) => void;
}

type ActiveTool = 'none' | 'merge' | 'split' | 'crop' | 'rotate';

export const ToolkitTab: React.FC<ToolkitTabProps> = ({
  locale,
  currentFile,
  pageCount,
  onSaveFile,
}) => {
  const t = translations[locale];
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');

  // Merge tool state
  const [mergeFiles, setMergeFiles] = useState<{ id: string; name: string; buffer: ArrayBuffer }[]>([]);
  
  // Split tool state
  const [splitRanges, setSplitRanges] = useState('1');
  const [selectedSplitPages, setSelectedSplitPages] = useState<Set<number>>(new Set());

  // Crop tool state
  const [cropMargins, setCropMargins] = useState({ top: 50, right: 50, bottom: 50, left: 50 });
  const [cropPageRange, setCropPageRange] = useState('');

  // Merge Handlers
  const handleMergeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          setMergeFiles((prev) => [
            ...prev,
            { id: Math.random().toString(), name: file.name, buffer: reader.result as ArrayBuffer }
          ]);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleMoveFile = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= mergeFiles.length) return;
    const list = [...mergeFiles];
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    setMergeFiles(list);
  };

  const handleRemoveMergeFile = (id: string) => {
    setMergeFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const executeMerge = async () => {
    if (mergeFiles.length < 2) {
      alert(locale === 'th' ? 'กรุณาอัปโหลดอย่างน้อย 2 ไฟล์เพื่อรวม' : 'Please upload at least 2 files to merge.');
      return;
    }
    try {
      const mergedBytes = await mergePdfs(mergeFiles.map((f) => f.buffer));
      onSaveFile(mergedBytes, 'merged_document.pdf');
      alert(locale === 'th' ? 'รวมไฟล์สำเร็จ!' : 'Merge successful!');
      setActiveTool('none');
      setMergeFiles([]);
    } catch (e) {
      console.error(e);
      alert('Merge failed: ' + String(e));
    }
  };

  // Split Handlers
  const executeSplit = async () => {
    if (!currentFile) {
      alert(locale === 'th' ? 'กรุณาเปิดไฟล์ก่อนทำการแยก' : 'Please load a PDF file first.');
      return;
    }
    try {
      let ranges = splitRanges;
      if (selectedSplitPages.size > 0) {
        // Visual extract mode
        const sortedPages = Array.from(selectedSplitPages).sort((a, b) => a - b);
        // Convert to ranges e.g. "1-2, 4"
        const chunks: string[] = [];
        let start = sortedPages[0];
        let prev = sortedPages[0];
        for (let i = 1; i < sortedPages.length; i++) {
          const curr = sortedPages[i];
          if (curr === prev + 1) {
            prev = curr;
          } else {
            chunks.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
            start = curr;
            prev = curr;
          }
        }
        chunks.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
        ranges = chunks.join(', ');
      }

      const splitResults = await splitPdf(currentFile, ranges);
      splitResults.forEach((bytes, idx) => {
        onSaveFile(bytes, `split_part_${idx + 1}.pdf`);
      });
      alert(locale === 'th' ? `แยกไฟล์สำเร็จ! (${splitResults.length} ไฟล์)` : `Split successful! Created ${splitResults.length} files.`);
      setActiveTool('none');
      setSelectedSplitPages(new Set());
    } catch (e) {
      console.error(e);
      alert('Split failed: ' + String(e));
    }
  };

  // Crop Handlers
  const executeCrop = async () => {
    if (!currentFile) return;
    try {
      const croppedBytes = await cropPdf(currentFile, cropMargins, cropPageRange);
      onSaveFile(croppedBytes, 'cropped_document.pdf');
      alert(locale === 'th' ? 'ครอบตัดสำเร็จ!' : 'Crop successful!');
      setActiveTool('none');
    } catch (e) {
      console.error(e);
      alert('Crop failed: ' + String(e));
    }
  };

  return (
    <>
      {activeTool === 'none' && (
        <div className="ribbon-shelf">
          <div className="tool-group">
            <div className="tool-buttons-row">
              <button className="ribbon-tool-btn" onClick={() => setActiveTool('merge')}>
                <Merge />
                <span>{t.toolkit.merge.title}</span>
              </button>
              
              <button 
                className="ribbon-tool-btn" 
                onClick={() => {
                  if (!currentFile) {
                    alert(locale === 'th' ? 'กรุณาเปิดไฟล์ก่อน' : 'Please open a PDF file first');
                    return;
                  }
                  setActiveTool('split');
                }}
              >
                <Scissors />
                <span>{t.toolkit.split.title}</span>
              </button>

              <button 
                className="ribbon-tool-btn"
                onClick={() => {
                  if (!currentFile) {
                    alert(locale === 'th' ? 'กรุณาเปิดไฟล์ก่อน' : 'Please open a PDF file first');
                    return;
                  }
                  setActiveTool('crop');
                }}
              >
                <Crop />
                <span>{t.toolkit.crop.title}</span>
              </button>
            </div>
            <span className="tool-group-label">PDF Toolkit</span>
          </div>
        </div>
      )}

      {/* 1. Merge PDF Overlay Workspace */}
      {activeTool === 'merge' && (
        <div className="tool-workspace-overlay">
          <div className="tool-workspace-header">
            <h2 className="tool-workspace-title">
              <Merge size={22} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              {t.toolkit.merge.title}
            </h2>
            <button className="btn-secondary" onClick={() => setActiveTool('none')}>
              <ArrowLeft size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              {t.common.cancel}
            </button>
          </div>
          
          <div className="tool-workspace-body">
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t.toolkit.merge.desc}
            </p>

            <div style={{ display: 'flex', gap: '16px', margin: '12px 0' }}>
              <label className="btn-primary" style={{ cursor: 'pointer' }}>
                <Plus size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                {locale === 'th' ? 'เพิ่มไฟล์ PDF' : 'Add PDF Files'}
                <input 
                  type="file" 
                  multiple 
                  accept=".pdf" 
                  onChange={handleMergeUpload} 
                  style={{ display: 'none' }} 
                />
              </label>
              <button 
                className="btn-primary" 
                onClick={executeMerge} 
                disabled={mergeFiles.length < 2}
                style={{ opacity: mergeFiles.length < 2 ? 0.6 : 1 }}
              >
                {t.toolkit.merge.btn}
              </button>
            </div>

            <div className="merge-file-list">
              {mergeFiles.length === 0 ? (
                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                  <FileText size={48} style={{ marginBottom: '12px' }} />
                  <span>{locale === 'th' ? 'ยังไม่ได้เลือกไฟล์สำหรับรวม' : 'No files added for merging yet.'}</span>
                </div>
              ) : (
                mergeFiles.map((file, idx) => (
                  <div className="merge-file-card" key={file.id}>
                    <button className="remove-card-btn" onClick={() => handleRemoveMergeFile(file.id)}>
                      <Trash2 size={16} />
                    </button>
                    <FileText size={36} color="var(--brand-primary)" />
                    <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      #{idx + 1}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '10px' }}
                        onClick={() => handleMoveFile(idx, 'up')}
                        disabled={idx === 0}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '10px' }}
                        onClick={() => handleMoveFile(idx, 'down')}
                        disabled={idx === mergeFiles.length - 1}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Split PDF Overlay Workspace */}
      {activeTool === 'split' && (
        <div className="tool-workspace-overlay">
          <div className="tool-workspace-header">
            <h2 className="tool-workspace-title">
              <Scissors size={22} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              {t.toolkit.split.title}
            </h2>
            <button className="btn-secondary" onClick={() => setActiveTool('none')}>
              <ArrowLeft size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              {t.common.cancel}
            </button>
          </div>
          
          <div className="tool-workspace-body">
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t.toolkit.split.desc}
            </p>

            <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="inspector-group">
                <label className="inspector-label">
                  {locale === 'th' ? 'ระบุช่วงหน้าเอกสารที่ต้องการแยก (เช่น 1-2, 3-5):' : 'Enter page ranges to split (e.g., 1-2, 3-5):'}
                </label>
                <input 
                  type="text" 
                  className="text-input" 
                  value={splitRanges} 
                  onChange={(e) => setSplitRanges(e.target.value)} 
                  disabled={selectedSplitPages.size > 0}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="btn-primary" onClick={executeSplit}>
                  {t.toolkit.split.btn}
                </button>
              </div>
            </div>

            {/* Visual Extract Mode */}
            <div style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
                {locale === 'th' ? 'หรือคลิกเลือกหน้าเพื่อแยกดึงหน้า (แบบภาพ):' : 'Or select pages visually to extract:'}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                {Array.from({ length: pageCount }, (_, index) => {
                  const isSelected = selectedSplitPages.has(index);
                  return (
                    <div 
                      key={index} 
                      onClick={() => {
                        const newSet = new Set(selectedSplitPages);
                        if (newSet.has(index)) {
                          newSet.delete(index);
                        } else {
                          newSet.add(index);
                        }
                        setSelectedSplitPages(newSet);
                      }}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isSelected ? 'oklch(from var(--brand-primary) l c h / 0.1)' : 'var(--bg-secondary)',
                        border: isSelected ? '2px solid var(--brand-primary)' : '2px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        width: '78px'
                      }}
                    >
                      {isSelected ? <CheckSquare size={16} color="var(--brand-primary)" /> : <Square size={16} color="var(--text-tertiary)" />}
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>{t.common.page} {index + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Crop PDF Overlay Workspace */}
      {activeTool === 'crop' && (
        <div className="tool-workspace-overlay">
          <div className="tool-workspace-header">
            <h2 className="tool-workspace-title">
              <Crop size={22} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              {t.toolkit.crop.title}
            </h2>
            <button className="btn-secondary" onClick={() => setActiveTool('none')}>
              <ArrowLeft size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              {t.common.cancel}
            </button>
          </div>

          <div className="tool-workspace-body">
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t.toolkit.crop.desc}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700 }}>{locale === 'th' ? 'การตั้งค่าระยะขอบครอบตัด (หน่วย: Points)' : 'Crop Margin Settings (in points)'}</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="inspector-group">
                    <label className="inspector-label">{locale === 'th' ? 'ขอบบน (Top)' : 'Top Margin'}</label>
                    <input 
                      type="number" 
                      className="number-input" 
                      value={cropMargins.top} 
                      onChange={(e) => setCropMargins({ ...cropMargins, top: parseInt(e.target.value) || 0 })} 
                    />
                  </div>
                  <div className="inspector-group">
                    <label className="inspector-label">{locale === 'th' ? 'ขอบขวา (Right)' : 'Right Margin'}</label>
                    <input 
                      type="number" 
                      className="number-input" 
                      value={cropMargins.right} 
                      onChange={(e) => setCropMargins({ ...cropMargins, right: parseInt(e.target.value) || 0 })} 
                    />
                  </div>
                  <div className="inspector-group">
                    <label className="inspector-label">{locale === 'th' ? 'ขอบล่าง (Bottom)' : 'Bottom Margin'}</label>
                    <input 
                      type="number" 
                      className="number-input" 
                      value={cropMargins.bottom} 
                      onChange={(e) => setCropMargins({ ...cropMargins, bottom: parseInt(e.target.value) || 0 })} 
                    />
                  </div>
                  <div className="inspector-group">
                    <label className="inspector-label">{locale === 'th' ? 'ขอบซ้าย (Left)' : 'Left Margin'}</label>
                    <input 
                      type="number" 
                      className="number-input" 
                      value={cropMargins.left} 
                      onChange={(e) => setCropMargins({ ...cropMargins, left: parseInt(e.target.value) || 0 })} 
                    />
                  </div>
                </div>

                <div className="inspector-group">
                  <label className="inspector-label">{locale === 'th' ? 'ระบุช่วงหน้าที่จะครอบตัด (ปล่อยว่างถ้าต้องการครอบทุกหน้า)' : 'Target Page Range (empty for all pages)'}</label>
                  <input 
                    type="text" 
                    className="text-input" 
                    placeholder="e.g. 1, 3-5" 
                    value={cropPageRange} 
                    onChange={(e) => setCropPageRange(e.target.value)} 
                  />
                </div>

                <button className="btn-primary" onClick={executeCrop} style={{ marginTop: '8px' }}>
                  {t.toolkit.crop.btn}
                </button>
              </div>

              {/* Crop Preview Visual Mockup */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--border-color)' }}>
                <div style={{
                  width: '180px',
                  height: '240px',
                  background: 'white',
                  border: '1px solid var(--text-tertiary)',
                  boxShadow: 'var(--shadow-sm)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {/* Outer margin visual overlays */}
                  <div style={{
                    position: 'absolute',
                    top: `${cropMargins.top / 4}px`,
                    right: `${cropMargins.right / 4}px`,
                    bottom: `${cropMargins.bottom / 4}px`,
                    left: `${cropMargins.left / 4}px`,
                    border: '1px dashed var(--brand-primary)',
                    background: 'oklch(from var(--brand-primary) l c h / 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    color: 'var(--brand-primary)',
                    fontWeight: 600,
                    inset: `${cropMargins.top / 4}px ${cropMargins.right / 4}px ${cropMargins.bottom / 4}px ${cropMargins.left / 4}px`
                  }}>
                    {locale === 'th' ? 'ขอบเขตที่จะครอบตัด' : 'Cropped Area'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
