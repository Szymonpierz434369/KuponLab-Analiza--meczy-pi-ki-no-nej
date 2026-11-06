'use client';

import { useEffect, useRef, useState } from 'react';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

// Prosty renderer: akapity, listy "- ", **pogrubienia**, nagłówki "#"
function Rich({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={key + i}>{part.slice(2, -2)}</strong> : <span key={key + i}>{part}</span>,
    );
  const flush = () => {
    if (list.length) {
      const items = list;
      blocks.push(
        <ul key={'u' + blocks.length}>
          {items.map((li, i) => (
            <li key={i}>{inline(li, 'l' + i)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-*•]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*•]\s+/, ''));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (/^#{1,4}\s/.test(line)) {
      blocks.push(<p key={'h' + blocks.length}><strong>{line.replace(/^#+\s/, '')}</strong></p>);
    } else {
      blocks.push(<p key={'p' + blocks.length}>{inline(line, 'p' + blocks.length)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

export default function AiChat({
  mode,
  context,
  suggestions,
  intro,
}: {
  mode: 'match' | 'coupon';
  context: () => unknown;
  suggestions: string[];
  intro: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, context: context(), messages: history }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        setMsgs([...history, { role: 'assistant', content: err || 'Asystent nie odpowiedział.' }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...history, { role: 'assistant', content: acc }]);
      }
    } catch (e) {
      setMsgs([...history, { role: 'assistant', content: `Błąd połączenia: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <p className="muted small" style={{ margin: 0 }}>{intro}</p>
      {msgs.length > 0 && (
        <div className="msgs" ref={box}>
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' && !m.content ? <span className="muted">Analizuję dane…</span> : <Rich text={m.content} />}
            </div>
          ))}
        </div>
      )}
      <div className="chips">
        {suggestions.map((s) => (
          <button key={s} type="button" className="btn small" disabled={busy} onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          id={`ai-input-${mode}`}
          value={input}
          placeholder={mode === 'match' ? 'Zapytaj o ten mecz, np. czy warto grać rożne?' : 'Np. zbuduj kupon z 3 zdarzeń na kurs około 2,5'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className="btn primary" disabled={busy || !input.trim()}>
          Wyślij
        </button>
      </form>
    </div>
  );
}
