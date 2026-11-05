import { Link } from '@tanstack/react-router';
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import { RankingAmbient, universeStyle } from './ranking-ambient';
import { rankingKind, rankingKinds, type RankedProgram, type RankingKind } from '@/lib/origin-top-ten';

/** The ranking reveals itself by pages of five columns × four rows. */
const PAGE_SIZE = 20;
const COLUMNS = 5;
type Filter = 'all' | RankingKind;
const pad = (value: number) => String(value).padStart(2, '0');

/** « Voir le classement complet »: every ranked program, filterable by family, the backdrop following the poster under the pointer. */
export function RankingPage({ ranking }: { ranking: RankedProgram[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [hot, setHot] = useState(0);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [batchStart, setBatchStart] = useState(0);
  const [wave, setWave] = useState(0);

  const list = useMemo(() => (filter === 'all' ? ranking : ranking.filter(program => rankingKind(program.category) === filter)), [filter, ranking]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: ranking.length };
    ranking.forEach(program => { const kind = rankingKind(program.category); result[kind] = (result[kind] ?? 0) + 1; });
    return result;
  }, [ranking]);
  const visible = list.slice(0, shown);
  const lit = visible[Math.min(hot, visible.length - 1)] ?? ranking[0];
  if (!lit) return null;
  const column = Math.min(hot, visible.length - 1) % COLUMNS;
  const style = universeStyle(lit, 56 + (column + .5) * ((1328 - 4 * 20) / COLUMNS + 20)) as CSSProperties;
  const choose = (next: Filter) => { setFilter(next); setHot(0); setShown(PAGE_SIZE); setBatchStart(0); setWave(value => value + 1); };

  return <main className="rk-page tt-page" style={style}>
    <RankingAmbient program={lit} />
    <div className="rk-inner">
      <Link to="/" hash="top-10" className="rk-back"><ArrowLeft aria-hidden="true" />Retour au Top 10</Link>
      <header className="rk-head">
        <p className="tt-eyebrow">CETTE SEMAINE</p>
        <h1 className="rk-title">Classement complet</h1>
        <p className="rk-sub">Tous les contenus de la plateforme, classés selon leur audience. Survolez une affiche pour retrouver son univers.</p>
      </header>

      <div className="rk-filters" role="group" aria-label="Filtrer par type">
        <button type="button" className="rk-chip" aria-pressed={filter === 'all'} onClick={() => choose('all')}>Tout<small>{counts['all']}</small></button>
        {rankingKinds.filter(kind => counts[kind.id]).map(kind => <button key={kind.id} type="button" className="rk-chip" aria-pressed={filter === kind.id} onClick={() => choose(kind.id)}>{kind.label}<small>{counts[kind.id]}</small></button>)}
      </div>

      <div className="rk-grid" key={wave}>
        {visible.map((program, index) => <Link key={program.id} to="/production/$slug" params={{ slug: program.id }} search={{}}
          className={`rk-card ${index === hot ? 'is-hot' : ''}`} style={{ ['--i' as string]: index >= batchStart ? index - batchStart : index } as CSSProperties}
          onPointerEnter={() => setHot(index)} onFocus={() => setHot(index)} aria-label={`Numéro ${program.rank} : ${program.title}`}>
          <img className="rk-im" src={program.poster} alt={program.imageAlt} width={384} height={640} loading="lazy" draggable={false} />
          <span className="rk-shade" aria-hidden="true" />
          <span className="rk-num" aria-hidden="true">{pad(program.rank)}</span>
          <span className="rk-cap">
            <span className="rk-cat">{program.category}</span>
            <span className="rk-name">{program.title}</span>
            <span className="rk-play" aria-hidden="true"><span><Play fill="currentColor" /></span>Regarder</span>
          </span>
        </Link>)}
      </div>

      <footer className="rk-more">
        <span className="rk-bar" aria-hidden="true"><i style={{ width: `${(visible.length / Math.max(1, list.length)) * 100}%` }} /></span>
        <p><strong>{visible.length}</strong> sur {list.length} contenus</p>
        {shown < list.length && <button type="button" className="rk-load" onClick={() => { setBatchStart(shown); setShown(value => Math.min(list.length, value + PAGE_SIZE)); }}>Afficher plus</button>}
      </footer>
    </div>
  </main>;
}
