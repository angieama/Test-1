'use client';
import { memo } from 'react';
import { Check, CheckCheck, Clock3, LockKeyhole } from 'lucide-react';
import { money, type Payment } from '../lib/payment-model';
type Props = { payment: Payment; tone: number; age: string; canClaim: boolean; online: boolean; onClaim: (payment: Payment) => void };
export default memo(function PaymentRow({ payment: p, tone, age, canClaim, online, onClaim }: Props) {
  return <article className={`payment-row ${p.claimed_at ? 'is-confirmed' : ''}`}>
    <div className={`avatar customer-avatar tone-${tone}`}>{p.name.split(' ').map(name => name[0]).slice(0, 2).join('')}</div>
    <div className="payment-info">
      <div className="customer-line"><h3>{p.name}</h3>{!!p.claimed_at && <span className="locked-tag"><LockKeyhole size={10}/>Locked</span>}</div>
      <p className="receipt-code">{p.receipt}<span>·</span>{p.phone}</p>
      <div className="payment-meta"><Clock3 size={11}/><time dateTime={new Date(p.received_at).toISOString()}>{age}</time>{p.claimed_at && <span className="claimed-label" title={p.claimed_for ?? ''}>For {p.claimed_for}</span>}</div>
    </div>
    <div className="payment-right"><strong><span>KSh </span>{money(p.amount)}</strong>{p.claimed_at
      ? <span className="confirmed-state"><CheckCheck size={14}/>Confirmed</span>
      : canClaim ? <button className="tick-button" disabled={!online} onClick={() => onClaim(p)}><Check size={15}/>Tick off</button>
      : <span className="pending-state">Unconfirmed</span>}
    </div>
  </article>;
});
