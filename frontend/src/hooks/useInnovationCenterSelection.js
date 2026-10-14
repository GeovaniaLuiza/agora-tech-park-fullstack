import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { selectInnovationCenterId } from '../utils/innovationCenters.js';

export function useInnovationCenterSelection(centers, previousId = '') {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [selectedId, setSelectedId] = useState('');
  const centerId = selectInnovationCenterId(centers, params.get('centerId'), location.state?.centerId, selectedId, previousId);
  const setCenterId = (id, searchParams = params) => {
    setSelectedId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set('centerId', id);
    else next.delete('centerId');
    setParams(next);
  };
  return [centerId, setCenterId];
}
