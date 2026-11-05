import { Fragment } from 'react';

/** Heading revealed word by word as it scrolls into view; `breakAfter` adds a line break after that word on phones. */
export function RevealWords({ text, breakAfter }: { text: string; breakAfter?: number }) {
  return <>{text.split(' ').map((word, index) => <Fragment key={`${word}-${index}`}>{index > 0 && ' '}<span className="im-word"><span style={{ ['--k' as string]: index }}>{word}</span></span>{index === breakAfter && <br className="mobile-break" />}</Fragment>)}</>;
}
