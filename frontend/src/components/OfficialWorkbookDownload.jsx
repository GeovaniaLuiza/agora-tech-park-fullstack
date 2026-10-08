import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { downloadOfficialIndicatorWorkbook, getOfficialWorkbookStatus } from '../services/api.js';
import ExportDialog from './IndicatorExportDialog.jsx';

export default function OfficialWorkbookDownload({ centerId, year }) {
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const open = async () => {
    setBusy(true); setError('');
    try {
      const status = await getOfficialWorkbookStatus(centerId, year);
      if (active.current) setDialog({ status, strategy: 'CANCEL' });
    } catch (reason) { if (active.current) setError(reason.message); }
    finally { if (active.current) setBusy(false); }
  };
  const generate = async () => {
    setBusy(true); setError('');
    try {
      const { blob, filename } = await downloadOfficialIndicatorWorkbook({ centerId, year: Number(year), strategy: dialog.strategy });
      if (!active.current) return;
      const url = URL.createObjectURL(blob);
      try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); }
      finally { URL.revokeObjectURL(url); }
      setDialog(null);
    } catch (reason) { if (active.current) setError(reason.message); }
    finally { if (active.current) setBusy(false); }
  };
  return <><button className="button secondary" onClick={open} disabled={busy}><Download />{busy ? 'Gerando...' : 'Baixar XLSX'}</button>{error && !dialog && <div className="error" role="alert">{error}</div>}<ExportDialog state={dialog} setState={setDialog} onGenerate={generate} generating={busy} error={error} /></>;
}
