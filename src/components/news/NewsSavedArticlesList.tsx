"use client";

import type { ReadingListEntry } from "../../lib/news/readingList";
import type { NewsArticle } from "../../lib/news/types";

interface Props {
  entries: readonly ReadingListEntry[];
  onOpen: (article: NewsArticle) => void;
  onRemove: (id: string) => void;
  warning: string | null;
}

export default function NewsSavedArticlesList({ entries, onOpen, onRemove, warning }: Props) {
  return (
    <div data-news-saved-surface={true}>
      {warning ? <div className="si-news-reading-list-warning" role="status">{warning}</div> : null}
      {entries.length === 0 ? <div className="si-news-empty">No saved articles</div> : (
        <ul className="si-news-saved-articles" aria-label="Saved articles">
          {entries.map(entry => {
            const label = entry.article?.headline ?? entry.id;
            return (
              <li key={entry.id} className="si-news-bookmark-row">
                {entry.article ? (
                  <button type="button" className="si-news-bookmark-title" aria-label={`Open saved article: ${label}`}
                    onClick={() => onOpen(entry.article!)} title={label}>{label}</button>
                ) : <span className="si-news-bookmark-title">Unavailable — {label}</span>}
                <button type="button" className="si-news-bookmark-remove" aria-label={`Remove saved article: ${label}`}
                  onClick={() => onRemove(entry.id)} title="Remove">x</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
