import { useEffect, useState } from 'react';
import { getForms } from '../services/api';

export function useForms() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = () => {
    setLoading(true);
    setError('');
    return getForms().then(setForms).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);
  return { forms, loading, error, reload };
}
