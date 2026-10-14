import type { Tx } from '../api/types';
import type { I18n } from './index';

/** System-created transfers carry the target's name in `desc`; the label before it is translated. */
export function txTitle(t: I18n['t'], tx: Pick<Tx, 'desc' | 'source'>): string {
  return tx.source ? `${t(`source.${tx.source}`)} · ${tx.desc}` : tx.desc;
}
