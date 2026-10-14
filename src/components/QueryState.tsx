import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';

export function QueryState<T>({ q, children, empty, isEmpty }: {
  q: UseQueryResult<T>; children: (data: T) => ReactNode; empty?: ReactNode; isEmpty?: (d: T) => boolean;
}) {
  const { t } = useI18n();
  if (q.isPending) return <div className="empty" role="status">{t('common.loading')}</div>;
  if (q.isError) {
    return (
      <div className="empty" role="alert">
        {errorMessage(q.error, t)}
        <button type="button" className="btn btn-2" onClick={() => void q.refetch()}>{t('common.retry')}</button>
      </div>
    );
  }
  if (isEmpty?.(q.data) && empty) return <div className="empty">{empty}</div>;
  return <>{children(q.data)}</>;
}
