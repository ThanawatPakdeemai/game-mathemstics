import { useEffect, useRef, useState } from "react";
import { DIFFICULTIES, gradeTitle } from "../../shared/constants.js";
import {
  countByDifficulty,
  MAX_IMPORT_BYTES,
  QUESTION_SET_TEMPLATE,
  validateQuestionSet,
} from "../../shared/questionSet.js";

/** ดาวน์โหลดข้อมูลเป็นไฟล์ .json */
export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const downloadTemplate = () =>
  downloadJson(QUESTION_SET_TEMPLATE, "mathmotion-ตัวอย่างโจทย์.json");

/** กล่องโต้ตอบแบบ <dialog> (กด Esc หรือคลิกพื้นหลังเพื่อปิด) */
function Modal({ open, onClose, title, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-body">
        <header className="modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="ปิด"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * นำเข้าชุดโจทย์จากไฟล์ .json: เลือกไฟล์ → ตรวจสอบ → ดูสรุป → ยืนยัน
 * onImport(set) ได้ชุดโจทย์ที่ผ่านการตรวจแล้ว
 */
export function ImportDialog({ open, onClose, onImport }) {
  const [result, setResult] = useState(null); // { fileName, ok, errors, set }
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setResult(null);
  }, [open]);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setResult({ fileName: file.name, ok: false, errors: ["ไฟล์ใหญ่เกิน 1 MB"] });
      return;
    }
    try {
      const data = JSON.parse(await readFile(file));
      setResult({
        fileName: file.name,
        ...validateQuestionSet(data, { custom: true }),
      });
    } catch {
      setResult({
        fileName: file.name,
        ok: false,
        errors: ["อ่านไฟล์ไม่ได้ ไฟล์ต้องเป็น JSON ที่ถูกต้อง"],
      });
    }
  };

  const reset = () => {
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const counts = result?.ok ? countByDifficulty(result.set.questions) : null;

  return (
    <Modal open={open} onClose={onClose} title="นำเข้าโจทย์ของฉัน">
      {!result && (
        <>
          <label
            className={`dropzone ${dragging ? "is-dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <span className="dropzone-icon" aria-hidden="true">
              ⇪
            </span>
            <strong>ลากไฟล์ .json มาวาง หรือกดเพื่อเลือกไฟล์</strong>
            <span className="muted small">ไฟล์เดียว · ขนาดไม่เกิน 1 MB</span>
          </label>
          <div className="info-row">
            <span>ยังไม่มีไฟล์? ดาวน์โหลดไฟล์ตัวอย่าง แล้วแก้ไขโจทย์ในไฟล์ได้เลย</span>
            <button
              type="button"
              className="link-btn"
              onClick={downloadTemplate}
            >
              ไฟล์ตัวอย่าง.json
            </button>
          </div>
        </>
      )}

      {result && !result.ok && (
        <>
          <div className="import-error" role="alert">
            <strong>นำเข้าไม่ได้ · พบข้อผิดพลาด {result.errors.length} จุด</strong>
            <span className="muted small">{result.fileName}</span>
            <ul>
              {result.errors.slice(0, 8).map((err) => (
                <li key={err}>{err}</li>
              ))}
              {result.errors.length > 8 && (
                <li>… และอีก {result.errors.length - 8} จุด</li>
              )}
            </ul>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={reset}>
              เลือกไฟล์ใหม่
            </button>
          </div>
        </>
      )}

      {result?.ok && (
        <>
          <p className="import-ok">✓ ไฟล์ถูกต้อง พร้อมใช้งาน</p>
          <div className="import-summary">
            <div>
              <h3>{result.set.title}</h3>
              <p className="muted small">
                {gradeTitle(result.set.grade)} · {result.set.questions.length}{" "}
                ข้อ
                {result.set.author && ` · โดย ${result.set.author}`}
              </p>
            </div>
            <div className="diff-counts">
              {DIFFICULTIES.map((d) => (
                <div key={d.id} className={`diff-count badge-${d.id}`}>
                  {d.label}
                  <strong>{counts[d.id]}</strong>
                </div>
              ))}
            </div>
            <ol className="sample-list">
              {result.set.questions.slice(0, 2).map((q) => (
                <li key={q.id}>{q.question}</li>
              ))}
            </ol>
            {result.set.questions.length > 2 && (
              <p className="muted small">
                … และอีก {result.set.questions.length - 2} ข้อ
              </p>
            )}
          </div>
          <p className="temp-note">
            ชุดนี้ใช้ได้เฉพาะห้องที่กำลังสร้าง เมื่อจบเกมระบบจะลบทิ้ง ไม่เก็บไว้บนเซิร์ฟเวอร์
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={reset}>
              เลือกไฟล์อื่น
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onImport({ ...result.set, fileName: result.fileName });
                onClose();
              }}
            >
              ใช้ชุดโจทย์นี้
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** ปุ่ม "สร้างโจทย์ของฉัน" — ฟอร์มยังไม่พร้อม แนะนำให้ใช้ไฟล์ตัวอย่างไปก่อน */
export function CreateComingSoonDialog({ open, onClose, onOpenImport }) {
  return (
    <Modal open={open} onClose={onClose} title="สร้างโจทย์ของฉัน">
      <p className="coming-soon">
        <span className="badge badge-medium">เร็ว ๆ นี้</span>
        ฟอร์มสร้างโจทย์กำลังพัฒนา ระหว่างนี้ดาวน์โหลดไฟล์ตัวอย่าง แก้โจทย์ในไฟล์ แล้วกด
        “นำเข้าโจทย์ (.json)”
      </p>
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={downloadTemplate}
        >
          ดาวน์โหลดไฟล์ตัวอย่าง
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onClose();
            onOpenImport();
          }}
        >
          นำเข้าโจทย์ (.json)
        </button>
      </div>
    </Modal>
  );
}
